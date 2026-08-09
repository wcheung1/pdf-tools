/* =====================================================================
   s2t-core.js — PDF 內文「簡體 → 繁體」就地轉換引擎（100% 前端）
   ---------------------------------------------------------------------
   原理：
     1. 用 pdf-lib 打開 PDF，逐頁攞 content stream（連 Form XObject）。
     2. 自己 tokenize content stream，搵出所有顯示文字嘅 operator
        （Tj / TJ / ' / "），再用該字型嘅 ToUnicode CMap 反查每個
        glyph code 對應嘅 Unicode。
     3. 用 OpenCC 資料做「簡→繁」轉換（詞組優先、長度守恆）。
     4. 只有需要改變嘅字，先至用你提供嘅繁體字型重新輸出；
        其餘所有 bytes（圖片、線條、顏色、位置、拼音、無變化嘅字）
        全部逐 byte 原樣 copy。
     5. 用 TJ 數值補償新舊字寬差異 → 後面嘅字絕對唔會走位。

   依賴：window.PDFLib、window.fontkit、window.S2T_DICT
   ===================================================================== */
(function (root) {
"use strict";

/* ---------- 0. 位元組小工具 ---------- */
const WSSET = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIM = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);
const isWS = c => WSSET.has(c);
const isDelim = c => DELIM.has(c);
const isReg = c => !isWS(c) && !isDelim(c);

function bytesToLatin1(u8, s, e) {
  let out = "";
  const CH = 8192;
  for (let i = s; i < e; i += CH) {
    out += String.fromCharCode.apply(null, u8.subarray(i, Math.min(e, i + CH)));
  }
  return out;
}
function latin1ToBytes(str) {
  const u8 = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) u8[i] = str.charCodeAt(i) & 0xff;
  return u8;
}
function fmtNum(n) {
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 1e4) / 1e4);
}
/* 去走 subset 前綴：ABCDEF+FZSSJW--GB1-0 → FZSSJW--GB1-0 */
function familyOf(baseFont) {
  return String(baseFont || "").replace(/^[A-Z]{6}\+/, "");
}

/* ---------- 1. Content stream tokenizer ---------- */
function tokenize(u8) {
  const toks = [];
  const n = u8.length;
  let i = 0;
  while (i < n) {
    const c = u8[i];
    if (isWS(c)) { i++; continue; }
    if (c === 0x25) { while (i < n && u8[i] !== 0x0a && u8[i] !== 0x0d) i++; continue; }
    const s = i;
    if (c === 0x2f) {
      i++;
      while (i < n && isReg(u8[i])) i++;
      toks.push({ t: "name", s, e: i, v: bytesToLatin1(u8, s + 1, i) });
      continue;
    }
    if (c === 0x28) {
      i++;
      let depth = 1;
      const bytes = [];
      while (i < n && depth > 0) {
        const b = u8[i];
        if (b === 0x5c) {
          i++;
          if (i >= n) break;
          const e2 = u8[i];
          if (e2 >= 0x30 && e2 <= 0x37) {
            let oct = "", k = 0;
            while (k < 3 && i < n && u8[i] >= 0x30 && u8[i] <= 0x37) { oct += String.fromCharCode(u8[i]); i++; k++; }
            bytes.push(parseInt(oct, 8) & 0xff);
            continue;
          }
          const map = { 0x6e: 10, 0x72: 13, 0x74: 9, 0x62: 8, 0x66: 12 };
          if (map[e2] !== undefined) bytes.push(map[e2]);
          else if (e2 === 0x0a) { /* 續行 */ }
          else if (e2 === 0x0d) { if (u8[i + 1] === 0x0a) i++; }
          else bytes.push(e2);
          i++;
          continue;
        }
        if (b === 0x28) depth++;
        else if (b === 0x29) { depth--; if (depth === 0) { i++; break; } }
        if (depth > 0) bytes.push(b);
        i++;
      }
      toks.push({ t: "str", s, e: i, v: Uint8Array.from(bytes) });
      continue;
    }
    if (c === 0x3c && u8[i + 1] === 0x3c) { toks.push({ t: "dictOpen", s, e: i + 2 }); i += 2; continue; }
    if (c === 0x3e && u8[i + 1] === 0x3e) { toks.push({ t: "dictClose", s, e: i + 2 }); i += 2; continue; }
    if (c === 0x3c) {
      i++;
      let hx = "";
      while (i < n && u8[i] !== 0x3e) {
        const ch = String.fromCharCode(u8[i]);
        if (/[0-9a-fA-F]/.test(ch)) hx += ch;
        i++;
      }
      i++;
      if (hx.length & 1) hx += "0";
      const bytes = new Uint8Array(hx.length / 2);
      for (let k = 0; k < bytes.length; k++) bytes[k] = parseInt(hx.substr(k * 2, 2), 16);
      toks.push({ t: "hex", s, e: i, v: bytes });
      continue;
    }
    if (c === 0x5b) { toks.push({ t: "arrOpen", s, e: i + 1 }); i++; continue; }
    if (c === 0x5d) { toks.push({ t: "arrClose", s, e: i + 1 }); i++; continue; }
    if (c === 0x7b || c === 0x7d) { i++; continue; }
    i++;
    while (i < n && isReg(u8[i])) i++;
    const raw = bytesToLatin1(u8, s, i);
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(raw)) { toks.push({ t: "num", s, e: i, v: parseFloat(raw) }); continue; }
    if (raw === "BI") {
      // inline image：跳到 EI 為止，中間嘅二進位資料唔可以當 token 解
      let j = i;
      while (j < n - 1 && !(u8[j] === 0x49 && u8[j + 1] === 0x44 &&
             (j === 0 || isWS(u8[j - 1]) || isDelim(u8[j - 1])))) j++;
      j += 2;
      if (j < n && isWS(u8[j])) j++;
      while (j < n - 1) {
        if (u8[j] === 0x45 && u8[j + 1] === 0x49 && isWS(u8[j - 1]) &&
            (j + 2 >= n || isWS(u8[j + 2]) || isDelim(u8[j + 2]))) { j += 2; break; }
        j++;
      }
      toks.push({ t: "inlineImage", s, e: Math.min(j, n) });
      i = Math.min(j, n);
      continue;
    }
    toks.push({ t: "op", s, e: i, v: raw });
  }
  return toks;
}

/* ---------- 2. ToUnicode CMap ---------- */
function parseToUnicode(text) {
  const map = new Map();
  let codeBytes = 2;
  let m;

  const csr = /begincodespacerange([\s\S]*?)endcodespacerange/g;
  while ((m = csr.exec(text))) {
    const hexes = m[1].match(/<([0-9a-fA-F]+)>/g);
    if (hexes && hexes.length) codeBytes = Math.max(1, Math.round(hexes[0].replace(/[<>]/g, "").length / 2));
  }

  const utf16beToStr = h => {
    let s = "";
    for (let i = 0; i + 4 <= h.length; i += 4) s += String.fromCharCode(parseInt(h.substr(i, 4), 16));
    return s;
  };

  const bfc = /beginbfchar([\s\S]*?)endbfchar/g;
  while ((m = bfc.exec(text))) {
    const re = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g;
    let p;
    while ((p = re.exec(m[1]))) map.set(parseInt(p[1], 16), utf16beToStr(p[2]));
  }

  const bfr = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((m = bfr.exec(text))) {
    const re = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(?:<([0-9a-fA-F]*)>|\[([\s\S]*?)\])/g;
    let p;
    while ((p = re.exec(m[1]))) {
      const lo = parseInt(p[1], 16), hi = parseInt(p[2], 16);
      if (p[3] !== undefined) {
        const base = p[3];
        const head = base.slice(0, -4);
        const tail = parseInt(base.slice(-4), 16);
        for (let c = lo; c <= hi && c - lo < 65536; c++) {
          map.set(c, utf16beToStr(head + (tail + (c - lo)).toString(16).padStart(4, "0")));
        }
      } else if (p[4] !== undefined) {
        const items = p[4].match(/<([0-9a-fA-F]*)>/g) || [];
        for (let k = 0; k < items.length && lo + k <= hi; k++) {
          map.set(lo + k, utf16beToStr(items[k].replace(/[<>]/g, "")));
        }
      }
    }
  }
  return { map, codeBytes };
}

/* 安全 lookup：唔存在／型別唔啱就返回 null，唔會 throw */
function look(P, dict, name, Type) {
  if (!dict || !dict.lookupMaybe) return null;
  try {
    const v = Type ? dict.lookupMaybe(P.PDFName.of(name), Type) : dict.lookup(P.PDFName.of(name));
    return v === undefined ? null : v;
  } catch (e) { return null; }
}


/* ---------- 2b. 冇 ToUnicode 時嘅解碼 fallback ----------
   有啲中文 PDF（尤其大陸教科書）嘅字型冇 ToUnicode 對照表。
   兩條後路：
     ① 字型係 Adobe-GB1 排序 → CID 本身就係標準編號，
        用 Adobe 官方 UniGB-UCS2-H 反查（lib/s2t-cid-gb1.js）。
     ② 字型程式（FontFile2）自己有 cmap 表 → 用 fontkit 讀返
        Unicode→GID，反轉就得 GID→Unicode（CIDToGIDMap 係 Identity
        嘅話 CID 就係 GID）。                                        */
let _gb1Map = null;
function gb1CidToUnicode() {
  if (_gb1Map) return _gb1Map;
  const raw = root.S2T_CID_GB1;
  if (!raw) return null;
  const m = new Map();
  for (const seg of raw.split(";")) {
    const p = seg.split(",");
    if (p.length !== 3) continue;
    const cid = parseInt(p[0], 16), uni = parseInt(p[1], 16), n = parseInt(p[2], 16);
    for (let k = 0; k < n; k++) m.set(cid + k, uni + k);
  }
  _gb1Map = m;
  return m;
}

function buildFallbackToUnicode(P, ctx, dict, info) {
  // ① Adobe-GB1
  if (info.ordering === "GB1") {
    const g = gb1CidToUnicode();
    if (g) {
      const m = new Map();
      for (const [cid, uni] of g) m.set(cid, String.fromCharCode(uni));
      info.toUniSource = "Adobe-GB1 CID 表";
      return m;
    }
    info.needGB1 = true;
  }
  // ② 由嵌入嘅字型程式自己個 cmap 反查
  if (!root.fontkit) return null;
  try {
    const desc = look(P, dict, "FontDescriptor", P.PDFDict) ||
      (() => {
        const d = look(P, dict, "DescendantFonts", P.PDFArray);
        if (!d || !d.size()) return null;
        const d0 = ctx.lookup(d.get(0), P.PDFDict);
        return d0 ? look(P, d0, "FontDescriptor", P.PDFDict) : null;
      })();
    if (!desc) return null;
    let fileRef = desc.get(P.PDFName.of("FontFile2")) || desc.get(P.PDFName.of("FontFile3"));
    if (!fileRef) return null;
    const st = ctx.lookup(fileRef);
    const bytes = st instanceof P.PDFRawStream ? P.decodePDFRawStream(st).decode() : null;
    if (!bytes) return null;
    const f = root.fontkit.create(bytes.slice(0));
    if (!f || !f.characterSet) return null;
    const m = new Map();
    for (const cp of f.characterSet) {
      try {
        const g = f.glyphForCodePoint(cp);
        if (g && g.id && !m.has(g.id)) m.set(g.id, String.fromCodePoint(cp));
      } catch (e) { /* skip */ }
    }
    if (m.size) { info.toUniSource = "字型自帶 cmap"; return m; }
  } catch (e) { /* 解唔到就算 */ }
  return null;
}

/* ---------- 3. 讀 PDF 字型 ---------- */
async function readFontInfo(P, ctx, ref) {
  const dict = ctx.lookup(ref, P.PDFDict);
  if (!dict) return null;
  const nameOf = o => (o && o.asString ? o.asString().replace(/^\//, "") : "");
  const info = {
    baseFont: nameOf(look(P, dict, "BaseFont")) || "(unknown)",
    subtype: nameOf(look(P, dict, "Subtype")),
    codeBytes: 1, toUni: new Map(), widths: new Map(), dw: 0, hasToUnicode: false,
  };
  info.family = familyOf(info.baseFont);

  if (info.subtype === "Type0") {
    info.codeBytes = 2;
    info.dw = 1000;
    info.encoding = nameOf(look(P, dict, "Encoding"));
    const desc = look(P, dict, "DescendantFonts", P.PDFArray);
    if (desc && desc.size() > 0) {
      const d0 = ctx.lookup(desc.get(0), P.PDFDict);
      if (d0) {
        const csi = look(P, d0, "CIDSystemInfo", P.PDFDict);
        if (csi) {
          const ord = look(P, csi, "Ordering");
          if (ord && ord.asString) info.ordering = ord.asString().replace(/^\(|\)$/g, "");
          else if (ord && ord.decodeText) info.ordering = ord.decodeText();
        }
        const dw = look(P, d0, "DW");
        if (dw && dw.asNumber) info.dw = dw.asNumber();
        const W = look(P, d0, "W", P.PDFArray);
        if (W) {
          let i = 0;
          while (i < W.size()) {
            const a = ctx.lookup(W.get(i));
            const b = ctx.lookup(W.get(i + 1));
            if (!a || !b) break;
            if (b instanceof P.PDFArray) {
              const start = a.asNumber();
              for (let k = 0; k < b.size(); k++) {
                const w = ctx.lookup(b.get(k));
                if (w && w.asNumber) info.widths.set(start + k, w.asNumber());
              }
              i += 2;
            } else if (b.asNumber) {
              const c1 = a.asNumber(), c2 = b.asNumber();
              const w = ctx.lookup(W.get(i + 2));
              const wv = w && w.asNumber ? w.asNumber() : info.dw;
              for (let c = c1; c <= c2 && c - c1 < 65536; c++) info.widths.set(c, wv);
              i += 3;
            } else break;
          }
        }
      }
    }
  } else {
    const fc = look(P, dict, "FirstChar");
    const widths = look(P, dict, "Widths", P.PDFArray);
    if (fc && widths && fc.asNumber) {
      const first = fc.asNumber();
      for (let k = 0; k < widths.size(); k++) {
        const w = ctx.lookup(widths.get(k));
        if (w && w.asNumber) info.widths.set(first + k, w.asNumber());
      }
    }
  }

  const tu = dict.get(P.PDFName.of("ToUnicode"));
  if (tu) {
    try {
      const st = ctx.lookup(tu);
      let bytes = null;
      if (st instanceof P.PDFRawStream) bytes = P.decodePDFRawStream(st).decode();
      else if (st && st.getContents) bytes = st.getContents();
      if (bytes) {
        const parsed = parseToUnicode(bytesToLatin1(bytes, 0, bytes.length));
        info.toUni = parsed.map;
        if (info.subtype === "Type0") info.codeBytes = parsed.codeBytes || 2;
        info.hasToUnicode = info.toUni.size > 0;
      }
    } catch (e) { /* 解唔到就當冇 */ }
  }
  if (!info.hasToUnicode) {
    const fb = buildFallbackToUnicode(P, ctx, dict, info);
    if (fb && fb.size) { info.toUni = fb; info.hasToUnicode = true; info.fallback = true; }
  }
  info.widthOf = code => (info.widths.has(code) ? info.widths.get(code) : info.dw);
  return info;
}

/* ---------- 4. 簡→繁（長度守恆） ---------- */
const CJK_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
const PUNCT_RE = /[\u3000-\u303F\uFE10-\uFE1F\uFE30-\uFE4F\uFF00-\uFFEF]/;
const isCJK = ch => CJK_RE.test(ch);
const isCJKPunct = ch => PUNCT_RE.test(ch);

/**
 * @param {string[]} chars   原文漢字（逐個）
 * @param {Object}   dict    S2T_DICT
 * @param {Map}      overrides 人手指定（簡→繁）
 * @param {string}   variant "hk" | "tw" | "raw"
 *   OpenCC 原始 s2t 表用嘅係舊異體字（例如 为→爲、里→裏），
 *   所以要再過一層港／台標準字形表。變體修正只會套用喺
 *   「已經轉換咗」嘅字，原本就係繁體嘅字一律唔郁。
 */
function convertSequence(chars, dict, overrides, variant, phrases) {
  const s = chars.join("");
  const out = new Array(chars.length);
  const fixed = new Array(chars.length).fill(false);   // 用家指定嘅，唔再套變體修正
  const PH = dict.p, CH = dict.c, maxp = dict.maxp || 8;
  const VM = (variant && dict[variant]) || null;
  const CUS = phrases instanceof Map ? phrases : null;
  let cusMax = 0;
  if (CUS) for (const k of CUS.keys()) cusMax = Math.max(cusMax, k.length);

  let i = 0;
  while (i < s.length) {
    // ① 自訂詞組（最高優先，長嘅先試）
    let hit = false;
    if (CUS && cusMax > 1) {
      for (let L = Math.min(cusMax, s.length - i); L >= 2; L--) {
        const t = CUS.get(s.substr(i, L));
        if (t && t.length === L) {
          for (let k = 0; k < L; k++) { out[i + k] = t[k]; fixed[i + k] = true; }
          i += L; hit = true; break;
        }
      }
    }
    if (hit) continue;

    // ② 自訂單字
    if (overrides && overrides.has(s[i])) { out[i] = overrides.get(s[i]); fixed[i] = true; i++; continue; }

    // ③ 內建詞組表（OpenCC STPhrases）
    for (let L = Math.min(maxp, s.length - i); L >= 2; L--) {
      const t = PH[s.substr(i, L)];
      if (t && t.length === L) {
        let blocked = false;
        for (let k = 0; k < L; k++) {
          if (overrides && overrides.has(s[i + k])) blocked = true;
          if (CUS && cusMax > 1) for (let L2 = 2; L2 <= Math.min(cusMax, s.length - i - k); L2++) {
            if (CUS.has(s.substr(i + k, L2))) blocked = true;
          }
        }
        if (!blocked) {
          for (let k = 0; k < L; k++) out[i + k] = t[k];
          i += L; hit = true; break;
        }
      }
    }
    if (hit) continue;

    // ④ 內建單字表（OpenCC STCharacters）
    const one = CH[s[i]];
    out[i] = one && one.length === 1 ? one : s[i];
    i++;
  }

  // ⑤ 港／台標準字形修正：只套喺「有改動、而且唔係用家指定」嘅字
  if (VM) {
    for (let k = 0; k < out.length; k++) {
      if (!fixed[k] && out[k] !== s[k] && VM[out[k]]) out[k] = VM[out[k]];
    }
  }
  return out;
}

/* ---------- 5. 掃描一條 content stream ---------- */
function scanStream(u8, fontInfos) {
  const toks = tokenize(u8);
  const shows = [];
  const units = [];
  let curFontKey = null, curFontSize = null;
  const stack = [];
  let operands = [];
  const missingToUni = new Set();

  for (let ti = 0; ti < toks.length; ti++) {
    const tk = toks[ti];
    if (tk.t !== "op") { operands.push(tk); continue; }
    const op = tk.v;

    if (op === "Tf") {
      const nm = [...operands].reverse().find(o => o.t === "name");
      const sz = [...operands].reverse().find(o => o.t === "num");
      if (nm) curFontKey = nm.v;
      if (sz) curFontSize = sz.v;
      operands = [];
      continue;
    }
    if (op === "q") { stack.push([curFontKey, curFontSize]); operands = []; continue; }
    if (op === "Q") { const s = stack.pop(); if (s) { curFontKey = s[0]; curFontSize = s[1]; } operands = []; continue; }

    if (op === "Tj" || op === "TJ" || op === "'" || op === '"') {
      const fi = curFontKey ? fontInfos.get(curFontKey) : null;
      if (fi && fi.hasToUnicode && operands.length && curFontSize != null) {
        const rec = {
          start: operands[0].s, end: tk.e, op, fontKey: curFontKey,
          fontSize: curFontSize, fi, items: [], pre: "",
        };
        // ' 同 " 有額外副作用，要喺取代文字入面重現返
        if (op === "'") rec.pre = "T* ";
        if (op === '"') {
          const nums = operands.filter(o => o.t === "num");
          const aw = nums[0] ? fmtNum(nums[0].v) : "0";
          const ac = nums[1] ? fmtNum(nums[1].v) : "0";
          rec.pre = aw + " Tw " + ac + " Tc T* ";
        }
        for (const o of operands) {
          if (o.t === "str" || o.t === "hex") {
            const cb = fi.codeBytes;
            for (let i = 0; i + cb <= o.v.length; i += cb) {
              let code = 0;
              for (let k = 0; k < cb; k++) code = (code << 8) | o.v[i + k];
              const u = fi.toUni.get(code);
              const ch = u && u.length === 1 ? u : null;
              const item = { kind: "glyph", code, cb, ch, to: null };
              rec.items.push(item);
              if (ch && isCJK(ch)) units.push({ rec, item, ch, han: true });
              else if (ch && isCJKPunct(ch)) units.push({ rec, item, ch, han: false });
            }
          } else if (o.t === "num" && op === "TJ") {
            rec.items.push({ kind: "num", v: o.v });
          }
        }
        if (rec.items.length) shows.push(rec);
      } else if (fi && !fi.hasToUnicode) {
        missingToUni.add(fi.baseFont);
      }
      operands = [];
      continue;
    }
    operands = [];
  }
  return { units, shows, missingToUni };
}

/* ---------- 6. 產生取代文字 ---------- */
function hexOfCode(code, cb) {
  let h = "";
  for (let k = cb - 1; k >= 0; k--) h += ((code >> (8 * k)) & 0xff).toString(16).toUpperCase().padStart(2, "0");
  return h;
}

function buildReplacement(rec) {
  // 將 items 分段：連續「原字型」／「新字型」為一段
  const runs = [];
  let cur = null;
  for (const it of rec.items) {
    if (it.kind === "num") {
      if (!cur) { cur = { mode: "old", res: null, items: [] }; runs.push(cur); }
      cur.items.push(it);
      continue;
    }
    const mode = it.to ? "new" : "old";
    const res = it.to ? it.to.res : null;
    if (!cur || cur.mode !== mode || cur.res !== res) {
      cur = { mode, res, items: [] };
      runs.push(cur);
    }
    cur.items.push(it);
  }

  const size = fmtNum(rec.fontSize);
  let out = rec.pre;
  let curRes = null;   // null = 原字型
  for (const run of runs) {
    const want = run.mode === "new" ? run.res : null;
    if (want !== curRes) {
      out += "/" + (want || rec.fontKey) + " " + size + " Tf ";
      curRes = want;
    }
    let arr = "[";
    for (const it of run.items) {
      if (it.kind === "num") { arr += " " + fmtNum(it.v) + " "; continue; }
      if (it.to) {
        arr += "<" + it.to.hex + ">";
        if (Math.abs(it.to.adjust) >= 0.5) arr += " " + fmtNum(Math.round(it.to.adjust * 10) / 10) + " ";
      } else {
        arr += "<" + hexOfCode(it.code, it.cb) + ">";
      }
    }
    arr += "]TJ ";
    out += arr;
  }
  if (curRes !== null) out += "/" + rec.fontKey + " " + size + " Tf";
  return out;
}

/* ---------- 7. Resources / Form XObject ---------- */
function getResources(P, ctx, node) {
  let n = node;
  for (let i = 0; i < 32 && n; i++) {
    const r = look(P, n, "Resources", P.PDFDict);
    if (r) return r;
    n = look(P, n, "Parent", P.PDFDict);
  }
  return null;
}

function collectFormXObjects(P, ctx, res, seen, out, depth) {
  if (!res || depth > 5) return;
  const xo = look(P, res, "XObject", P.PDFDict);
  if (!xo) return;
  for (const [, val] of xo.entries()) {
    const tag = val && val.toString ? val.toString() : "";
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    let st = null;
    try { st = ctx.lookup(val); } catch (e) { continue; }
    if (!st || !st.dict) continue;
    const sub = look(P, st.dict, "Subtype");
    if (!sub || !sub.asString || sub.asString() !== "/Form") continue;
    const inner = look(P, st.dict, "Resources", P.PDFDict);
    out.push({ kind: "form", stream: st, ref: val, res: inner });
    collectFormXObjects(P, ctx, inner, seen, out, depth + 1);
  }
}

/* ---------- 8. fontkit 子集化修正 ----------
   fontkit 嘅 short-format `loca` 表係「offset ÷ 2」咁存，
   所以每個 glyph 資料嘅長度必須係雙數；但 fontkit 冇為單數長度嘅
   glyph 補位 → 之後全部 offset 錯晒，大部分字變空白。
   （子集大過 64KB 會自動轉 long format，所以有時又「啱」，好誤導。）
   呢度喺 prototype 補返一個 byte 就解決。                              */
let _fkPatched = false;
function patchFontkitSubset(fontkitLib, fontBytes) {
  if (_fkPatched) return true;
  try {
    const f = fontkitLib.create(fontBytes.slice(0));
    if (!f || typeof f.createSubset !== "function") return false;
    const subset = f.createSubset();
    const proto = Object.getPrototypeOf(subset);
    if (!proto || typeof proto._addGlyph !== "function") return false;
    if (proto.__s2tPatched) { _fkPatched = true; return true; }
    const orig = proto._addGlyph;
    proto._addGlyph = function (gid) {
      const r = orig.call(this, gid);
      const arr = this.glyf;
      const last = arr[arr.length - 1];
      if (last && (last.length & 1)) {
        const C = last.constructor;
        let padded;
        if (C && typeof C.concat === "function" && typeof C.alloc === "function") {
          padded = C.concat([last, C.alloc(1)]);
        } else if (C && typeof C.alloc === "function") {
          padded = C.alloc(last.length + 1); padded.set(last);
        } else {
          padded = new Uint8Array(last.length + 1); padded.set(last);
        }
        arr[arr.length - 1] = padded;
        this.offset += 1;
      }
      return r;
    };
    proto.__s2tPatched = true;
    _fkPatched = true;
    return true;
  } catch (e) {
    console.warn("[S2T] fontkit subset patch 失敗", e);
    return false;
  }
}

function fontFlavour(bytes) {
  if (!bytes || bytes.length < 4) return "unknown";
  const tag = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (tag === "OTTO") return "otf";            // CFF outline
  if (tag === "ttcf") return "ttc";
  if (tag === "true" || tag === "\x00\x01\x00\x00") return "ttf";
  return "unknown";
}

/* ---------- 9. 主函式 ---------- */
/**
 * @param {ArrayBuffer} arrayBuffer 原 PDF
 * @param {Object} opts
 *   fonts        : [{ id, name, bytes }]   繁體替換字型
 *   fontAssign   : { [family]: fontId }    每隻原字型用邊隻替換字型
 *   defaultFontId: string
 *   overrides    : Map<簡,繁>              人手指定
 *   variant      : "hk"|"tw"|"raw"        標準字形（預設 hk）
 *   phrases      : Map<簡詞,繁詞>          自訂詞組優先表（最高優先）
 *   redraw       : "changed"|"all"        "all" = 連唔使改嘅漢字都用新字型重繪
 *   redrawPunct  : bool                   統一字型時連全形標點都重繪
 *   subset       : bool                    子集化（TTF 建議 true）
 *   dryRun       : bool                    只分析唔改嘢
 *   onProgress   : (msg, pct) => {}
 */
async function convert(arrayBuffer, opts) {
  opts = opts || {};
  const P = root.PDFLib;
  const D = root.S2T_DICT;
  if (!P) throw new Error("未載入 pdf-lib");
  if (!D) throw new Error("未載入 lib/s2t-dict.js（簡繁對照表）");
  const onProgress = opts.onProgress || (() => {});
  const dryRun = !!opts.dryRun;
  const variant = opts.variant || "hk";   // hk / tw / raw
  const redrawAll = opts.redraw === "all";     // 統一字型：連唔使改嘅漢字都重繪
  const redrawPunct = redrawAll && !!opts.redrawPunct;

  const doc = await P.PDFDocument.load(arrayBuffer, { ignoreEncryption: true, updateMetadata: false });
  const ctx = doc.context;

  const embedded = new Map();
  let subsetUsed = false;
  if (!dryRun) {
    if (!opts.fonts || !opts.fonts.length) throw new Error("未提供繁體字型");
    if (!root.fontkit) throw new Error("fontkit 未載入");
    doc.registerFontkit(root.fontkit);
    for (const f of opts.fonts) {
      const flav = fontFlavour(f.bytes);
      // CFF/OTF 嘅子集化 fontkit 一樣有 bug，而且修唔到 → 強制完整嵌入
      let useSubset = opts.subset !== false && flav === "ttf";
      if (useSubset) useSubset = patchFontkitSubset(root.fontkit, f.bytes);
      if (useSubset) subsetUsed = true;
      const pf = await doc.embedFont(f.bytes.slice(0), { subset: useSubset });
      let fk = null;
      try { fk = pf.embedder && pf.embedder.font ? pf.embedder.font : null; } catch (e) {}
      embedded.set(f.id, {
        id: f.id, name: f.name, pdfFont: pf, fk,
        resName: "S2Tf" + String(f.id).replace(/[^A-Za-z0-9]/g, ""),
        flavour: flav, subset: useSubset,
      });
    }
  }

  const stats = {
    totalCJK: 0, changed: 0, redrawn: 0, pagesTouched: 0, recovered: new Map(), needGB1: false,
    noGlyph: new Map(), missingToUni: new Set(),
    pairs: new Map(), families: new Map(), neededChars: new Set(),
    subsetUsed,
  };

  const pickFont = family => {
    if (!embedded.size) return null;
    const id = (opts.fontAssign && opts.fontAssign[family]) || opts.defaultFontId;
    return embedded.get(id) || embedded.values().next().value;
  };

  const hasGlyph = (target, ch) => {
    if (!target || !target.fk || !target.fk.hasGlyphForCodePoint) return true;
    try { return !!target.fk.hasGlyphForCodePoint(ch.codePointAt(0)); } catch (e) { return true; }
  };

  const pages = doc.getPages();
  for (let pi = 0; pi < pages.length; pi++) {
    onProgress(`${dryRun ? "分析" : "轉換"}第 ${pi + 1} / ${pages.length} 頁…`, pi / pages.length * 0.9);
    const page = pages[pi];
    const pageRes = getResources(P, ctx, page.node);
    const targets = [{ kind: "page", page, res: pageRes }];
    collectFormXObjects(P, ctx, pageRes, new Set(), targets, 0);

    for (const tgt of targets) {
      let bytes = null;
      try {
        if (tgt.kind === "form") {
          bytes = P.decodePDFRawStream(tgt.stream).decode();
        } else {
          const contents = page.node.Contents();
          if (!contents) continue;
          if (contents instanceof P.PDFArray) {
            const chunks = [];
            let total = 0;
            for (let k = 0; k < contents.size(); k++) {
              const st = ctx.lookup(contents.get(k));
              if (!st) continue;
              const b = st instanceof P.PDFRawStream ? P.decodePDFRawStream(st).decode() : st.getContents();
              chunks.push(b); total += b.length + 1;
            }
            bytes = new Uint8Array(total);
            let off = 0;
            for (const c of chunks) { bytes.set(c, off); off += c.length; bytes[off++] = 0x0a; }
          } else {
            const st = ctx.lookup(contents);
            if (!st) continue;
            bytes = st instanceof P.PDFRawStream ? P.decodePDFRawStream(st).decode() : st.getContents();
          }
        }
      } catch (e) { continue; }
      if (!bytes || !bytes.length || !tgt.res) continue;

      const fontsDict = look(P, tgt.res, "Font", P.PDFDict);
      if (!fontsDict) continue;
      const fontInfos = new Map();
      for (const [key, val] of fontsDict.entries()) {
        const nm = key.asString().replace(/^\//, "");
        const fi = await readFontInfo(P, ctx, val);
        if (fi) fontInfos.set(nm, fi);
      }
      if (!fontInfos.size) continue;

      for (const [, fi] of fontInfos) {
        if (fi.fallback) stats.recovered.set(fi.family, fi.toUniSource || "fallback");
        if (fi.needGB1) stats.needGB1 = true;
      }
      const { units, missingToUni } = scanStream(bytes, fontInfos);
      missingToUni.forEach(x => stats.missingToUni.add(familyOf(x)));
      if (!units.length) continue;
      stats.totalCJK += units.filter(u => u.han).length;

      // 只有漢字先參與簡繁轉換；標點淨係喺「統一字型」模式先會重繪
      const hanUnits = units.filter(u => u.han);
      const src = hanUnits.map(u => u.ch);
      const dst = convertSequence(src, D, opts.overrides, variant, opts.phrases);
      const target4 = new Map();
      hanUnits.forEach((u, k) => target4.set(u, dst[k]));

      let touched = 0;
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        const srcCh = u.ch;
        const dstCh = u.han ? target4.get(u) : srcCh;
        const isChange = dstCh !== srcCh;
        if (!isChange) {
          if (!redrawAll) continue;                       // 只轉換模式：唔使改就唔郁
          if (!u.han && !redrawPunct) continue;           // 標點要另外開先重繪
          if (dryRun) { stats.redrawn++; stats.neededChars.add(srcCh); continue; }
        }
        const fam = u.rec.fi.family;
        if (isChange) {
          const fe = stats.families.get(fam) || { changed: 0, total: 0 };
          fe.changed++; stats.families.set(fam, fe);
          stats.pairs.set(srcCh + "→" + dstCh, (stats.pairs.get(srcCh + "→" + dstCh) || 0) + 1);
        }
        stats.neededChars.add(dstCh);

        if (dryRun) { stats.changed++; continue; }

        const target = pickFont(fam);
        if (!target) continue;

        // 字形 fallback：目標字冇字形就試下其他繁體候選（例如 爲 → 為）
        let ch = dstCh;
        if (!hasGlyph(target, ch)) {
          const vm = D[variant] || {};
          const cands = [];
          for (const a of (D.alt && D.alt[srcCh]) || []) { cands.push(a); if (vm[a]) cands.push(vm[a]); }
          if (D.c[srcCh]) cands.push(D.c[srcCh]);
          cands.push(srcCh);   // 最後手段：保留原字，好過變空白
          const found = cands.find(a => a.length === 1 && a !== ch && hasGlyph(target, a));
          if (found) ch = found;
          else {
            if (isChange) stats.noGlyph.set(dstCh, (stats.noGlyph.get(dstCh) || 0) + 1);
            continue;   // 冇字形就保持原樣，唔會變空白
          }
        }

        let hex;
        try { hex = target.pdfFont.encodeText(ch).toString().replace(/[<>]/g, ""); }
        catch (e) { stats.noGlyph.set(ch, (stats.noGlyph.get(ch) || 0) + 1); continue; }

        const origW = u.rec.fi.widthOf(u.item.code);
        let newW = origW;
        try { newW = target.pdfFont.widthOfTextAtSize(ch, 1000); } catch (e) {}
        u.item.to = { ch, hex, adjust: newW - origW, res: target.resName };
        u.rec._dirty = true;
        touched++;
        if (isChange) stats.changed++; else stats.redrawn++;
      }

      // 統計每隻原字型嘅漢字總數（畀 UI 顯示）
      for (const u of hanUnits) {
        const fam = u.rec.fi.family;
        const fe = stats.families.get(fam) || { changed: 0, total: 0 };
        fe.total++; stats.families.set(fam, fe);
      }

      if (dryRun || !touched) continue;

      // 產生 edits（只改動 show operator 嗰段 bytes）
      const edits = [];
      const done = new Set();
      for (const u of units) {
        if (!u.rec._dirty || done.has(u.rec)) continue;
        done.add(u.rec);
        edits.push({ start: u.rec.start, end: u.rec.end, text: buildReplacement(u.rec) });
      }
      edits.sort((a, b) => a.start - b.start);

      let outStr = "", cursor = 0;
      for (const ed of edits) {
        if (ed.start < cursor) continue;
        outStr += bytesToLatin1(bytes, cursor, ed.start);
        outStr += ed.text;
        cursor = ed.end;
      }
      outStr += bytesToLatin1(bytes, cursor, bytes.length);
      const newBytes = latin1ToBytes(outStr);

      const newStream = ctx.flateStream(newBytes);
      if (tgt.kind === "form") {
        for (const [k, v] of tgt.stream.dict.entries()) {
          const kn = k.asString();
          if (kn === "/Length" || kn === "/Filter" || kn === "/DecodeParms") continue;
          newStream.dict.set(k, v);
        }
        ctx.assign(tgt.ref, newStream);
      } else {
        page.node.set(P.PDFName.of("Contents"), ctx.register(newStream));
      }

      // 將替換字型加入呢個 resources
      let fdict = look(P, tgt.res, "Font", P.PDFDict);
      if (!fdict) { fdict = ctx.obj({}); tgt.res.set(P.PDFName.of("Font"), fdict); }
      for (const [, ent] of embedded) {
        const key = P.PDFName.of(ent.resName);
        if (!fdict.get(key)) fdict.set(key, ent.pdfFont.ref);
      }
      stats.pagesTouched++;
    }
  }

  if (dryRun) return { bytes: null, stats };
  onProgress("儲存中…", 0.95);
  const outBytes = await doc.save({ useObjectStreams: false });
  return { bytes: outBytes, stats };
}

root.S2T = {
  convert, convertSequence, tokenize, parseToUnicode,
  isCJK, familyOf, fontFlavour, patchFontkitSubset,
};

})(typeof window !== "undefined" ? window : globalThis);
