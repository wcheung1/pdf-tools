var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn2, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn2 && (res = (0, fn2[__getOwnPropNames(fn2)[0]])(fn2 = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// node_modules/ppu-paddle-ocr/core/recognition/ctc.js
var ctc_exports = {};
__export(ctc_exports, {
  BLANK_INDEX: () => BLANK_INDEX,
  MIN_CROP_WIDTH: () => MIN_CROP_WIDTH,
  UNK_TOKEN: () => UNK_TOKEN,
  ctcGreedyDecode: () => ctcGreedyDecode,
  decodeLogitsRow: () => decodeLogitsRow,
  decodeResults: () => decodeResults,
  injectGapSpaces: () => injectGapSpaces,
  refineDecodedChars: () => refineDecodedChars
});
function charClass(char) {
  if (/\p{L}/u.test(char)) return 0;
  if (/\p{N}/u.test(char)) return 1;
  return 2;
}
function injectGapSpaces(chars, positions) {
  if (chars.length < 4) return;
  let deltas = [];
  for (let i = 1; i < positions.length; i++) {
    deltas.push((positions[i] ?? 0) - (positions[i - 1] ?? 0));
  }
  let sorted = [...deltas].sort((a, b) => a - b);
  let median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  if (median <= 0) return;
  let quantum = sorted.find((d) => d > 0) ?? 0;
  if (quantum <= 0) return;
  for (let i = chars.length - 1; i >= 1; i--) {
    let prev = positions[i - 1] ?? 0;
    let curr = positions[i] ?? 0;
    let k = charClass(chars[i] ?? "") === charClass(chars[i - 1] ?? "") ? GAP_QUANTA_SAME_CLASS : GAP_QUANTA_CROSS_CLASS;
    if (curr - prev > median + k * quantum && chars[i] !== " " && chars[i - 1] !== " " && chars[i] !== chars[i - 1]) {
      chars.splice(i, 0, " ");
      positions.splice(i, 0, (prev + curr) / 2);
    }
  }
}
function refineDecodedChars(chars, positions) {
  for (let i = chars.length - 1; i >= 1; i--) {
    if (chars[i] === " " && chars[i - 1] === " ") {
      chars.splice(i, 1);
      positions.splice(i, 1);
    }
  }
  if (CJK_PATTERN.test(chars.join(""))) return;
  for (let i = 0; i < chars.length; i++) {
    let code = chars[i]?.codePointAt(0) ?? 0;
    if (code >= 65281 && code <= 65374) {
      chars[i] = String.fromCodePoint(code - FULLWIDTH_OFFSET);
    } else if (code === 12288) {
      chars[i] = " ";
    }
  }
}
function ctcGreedyDecode(logits, sequenceLength, numClasses, charDict, spaceRecovery = false) {
  let dictLen = charDict.length;
  let lastDictIndex = dictLen - 1;
  let emitted = [];
  let lastCharIndex = -1;
  let confidenceSum = 0;
  let confidenceCount = 0;
  let positions = [];
  for (let t = 0; t < sequenceLength; t++) {
    let base = t * numClasses;
    let maxProb = logits[base] ?? -1 / 0;
    let maxIndex = 0;
    for (let c = 1; c < numClasses; c++) {
      let prob = logits[base + c] ?? -1 / 0;
      if (prob > maxProb) {
        maxProb = prob;
        maxIndex = c;
      }
    }
    if (maxIndex === BLANK_INDEX || maxIndex === lastCharIndex) {
      lastCharIndex = maxIndex;
      continue;
    }
    if (maxIndex >= 0 && maxIndex < dictLen) {
      if (spaceRecovery && maxIndex !== lastDictIndex && (logits[base + lastDictIndex] ?? 0) > 1e-3 && emitted[emitted.length - 1] !== " ") {
        emitted.push(" ");
        positions.push((t + 0.5) / sequenceLength);
      }
      let char = charDict[maxIndex] ?? "";
      if (maxIndex === lastDictIndex) {
        if (char !== UNK_TOKEN) {
          emitted.push(" ");
          confidenceSum += maxProb;
          confidenceCount++;
          positions.push((t + 0.5) / sequenceLength);
        }
      } else {
        emitted.push(char);
        confidenceSum += maxProb;
        confidenceCount++;
        positions.push((t + 0.5) / sequenceLength);
      }
    }
    lastCharIndex = maxIndex;
  }
  injectGapSpaces(emitted, positions);
  refineDecodedChars(emitted, positions);
  let confidence = confidenceCount > 0 ? confidenceSum / confidenceCount : 0;
  return { text: emitted.join(""), confidence, positions };
}
function decodeResults(outputTensor, charactersDictionary, numClassesFromShape, verbose = false, spaceRecovery = false) {
  let outputData = outputTensor.data;
  let outputShape = outputTensor.dims;
  let sequenceLength = outputShape[1];
  let numClasses = outputShape[2] ?? numClassesFromShape;
  if (!charactersDictionary) {
    return { text: "", confidence: 0, positions: [] };
  }
  let dict = charactersDictionary;
  if (charactersDictionary.length === numClasses - 1) {
    dict = ["", ...charactersDictionary];
  } else if (numClasses !== charactersDictionary.length && verbose) {
    console.warn(`Warning: Model output classes (${numClasses}) does not match dictionary length (${charactersDictionary.length}).
 Consider using our model & dictionary catalogue at https://github.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models.`);
  }
  return ctcGreedyDecode(outputData, sequenceLength, numClasses, dict, spaceRecovery);
}
function decodeLogitsRow(rowData, sequenceLength, numClasses, charactersDictionary, spaceRecovery = false) {
  let dict = charactersDictionary;
  if (charactersDictionary.length === numClasses - 1) {
    dict = ["", ...charactersDictionary];
  }
  return ctcGreedyDecode(rowData, sequenceLength, numClasses, dict, spaceRecovery);
}
var BLANK_INDEX, UNK_TOKEN, MIN_CROP_WIDTH, GAP_QUANTA_CROSS_CLASS, GAP_QUANTA_SAME_CLASS, FULLWIDTH_OFFSET, CJK_PATTERN;
var init_ctc = __esm({
  "node_modules/ppu-paddle-ocr/core/recognition/ctc.js"() {
    BLANK_INDEX = 0;
    UNK_TOKEN = "<unk>";
    MIN_CROP_WIDTH = 8;
    GAP_QUANTA_CROSS_CLASS = 1.5;
    GAP_QUANTA_SAME_CLASS = 2.5;
    FULLWIDTH_OFFSET = 65248;
    CJK_PATTERN = /[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/;
  }
});

// node_modules/ppu-paddle-ocr/core/recognition/image-tensor.js
var image_tensor_exports = {};
__export(image_tensor_exports, {
  createImageTensor: () => createImageTensor,
  createImageTensorFromCanvas: () => createImageTensorFromCanvas,
  preprocessImage: () => preprocessImage
});
async function preprocessImage(cropCanvas, targetHeight, imageProcessor, createCanvasProcessor) {
  let originalWidth = cropCanvas.width;
  let originalHeight = cropCanvas.height;
  if (originalHeight === 0 || originalWidth === 0) {
    throw new Error(`Crop dimensions are zero: ${originalWidth}x${originalHeight}`);
  }
  let aspectRatio = originalWidth / originalHeight;
  let resizedWidth = Math.max(MIN_CROP_WIDTH, Math.round(targetHeight * aspectRatio));
  if (imageProcessor) {
    let imgProcessor = new imageProcessor.ImageProcessor(cropCanvas);
    try {
      imgProcessor.resize({ width: resizedWidth, height: targetHeight });
      let imageTensor2 = createImageTensorFromCanvas(imgProcessor.toCanvas(), resizedWidth, targetHeight);
      return { imageTensor: imageTensor2, tensorWidth: resizedWidth, tensorHeight: targetHeight };
    } finally {
      imgProcessor.destroy();
    }
  }
  let processor = createCanvasProcessor(cropCanvas).resize({ width: resizedWidth, height: targetHeight });
  let imageTensor = createImageTensor(processor, resizedWidth, targetHeight);
  return { imageTensor, tensorWidth: resizedWidth, tensorHeight: targetHeight };
}
function createImageTensor(processor, width, height) {
  let canvas = processor.toCanvas();
  return createImageTensorFromCanvas(canvas, width, height);
}
function createImageTensorFromCanvas(canvas, width, height) {
  let ctx = canvas.getContext("2d");
  let imageData = ctx.getImageData(0, 0, width, height);
  let pixelData = imageData.data;
  let channelSize = height * width;
  let imageTensor = new Float32Array(3 * channelSize);
  let INV_127_5 = 1 / 127.5;
  for (let i = 0, p = 0; i < channelSize; i++, p += 4) {
    imageTensor[i] = (pixelData[p] ?? 0) * INV_127_5 - 1;
  }
  imageTensor.copyWithin(channelSize, 0, channelSize);
  imageTensor.copyWithin(channelSize * 2, 0, channelSize);
  return imageTensor;
}
var init_image_tensor = __esm({
  "node_modules/ppu-paddle-ocr/core/recognition/image-tensor.js"() {
    init_ctc();
  }
});

// node_modules/onnxruntime-web/dist/ort.wasm.bundle.min.mjs
var ort_wasm_bundle_min_exports = {};
__export(ort_wasm_bundle_min_exports, {
  InferenceSession: () => ts,
  TRACE: () => xr,
  TRACE_EVENT_BEGIN: () => De,
  TRACE_EVENT_END: () => Ue,
  TRACE_FUNC_BEGIN: () => _e,
  TRACE_FUNC_END: () => Pe,
  Tensor: () => de,
  default: () => au,
  env: () => Y,
  registerBackend: () => qe
});
var Jt = Object.defineProperty;
var Xa = Object.getOwnPropertyDescriptor;
var Qa = Object.getOwnPropertyNames;
var Za = Object.prototype.hasOwnProperty;
var qt = ((n) => typeof __require < "u" ? __require : typeof Proxy < "u" ? new Proxy(n, { get: (t, a) => (typeof __require < "u" ? __require : t)[a] }) : n)(function(n) {
  if (typeof __require < "u") return __require.apply(this, arguments);
  throw Error('Dynamic require of "' + n + '" is not supported');
});
var F = (n, t) => () => (n && (t = n(n = 0)), t);
var ut = (n, t) => {
  for (var a in t) Jt(n, a, { get: t[a], enumerable: true });
};
var Ka = (n, t, a, u) => {
  if (t && typeof t == "object" || typeof t == "function") for (let o of Qa(t)) !Za.call(n, o) && o !== a && Jt(n, o, { get: () => t[o], enumerable: !(u = Xa(t, o)) || u.enumerable });
  return n;
};
var Xt = (n) => Ka(Jt({}, "__esModule", { value: true }), n);
var ft;
var Be;
var qe;
var es;
var dr;
var Qt = F(() => {
  "use strict";
  ft = /* @__PURE__ */ new Map(), Be = [], qe = (n, t, a) => {
    if (t && typeof t.init == "function" && typeof t.createInferenceSessionHandler == "function") {
      let u = ft.get(n);
      if (u === void 0) ft.set(n, { backend: t, priority: a });
      else {
        if (u.priority > a) return;
        if (u.priority === a && u.backend !== t) throw new Error(`cannot register backend "${n}" using priority ${a}`);
      }
      if (a >= 0) {
        let o = Be.indexOf(n);
        o !== -1 && Be.splice(o, 1);
        for (let d = 0; d < Be.length; d++) if (ft.get(Be[d]).priority <= a) {
          Be.splice(d, 0, n);
          return;
        }
        Be.push(n);
      }
      return;
    }
    throw new TypeError("not a valid backend");
  }, es = async (n) => {
    let t = ft.get(n);
    if (!t) return "backend not found.";
    if (t.initialized) return t.backend;
    if (t.aborted) return t.error;
    {
      let a = !!t.initPromise;
      try {
        return a || (t.initPromise = t.backend.init(n)), await t.initPromise, t.initialized = true, t.backend;
      } catch (u) {
        return a || (t.error = `${u}`, t.aborted = true), t.error;
      } finally {
        delete t.initPromise;
      }
    }
  }, dr = async (n) => {
    let t = n.executionProviders || [], a = t.map((m) => typeof m == "string" ? m : m.name), u = a.length === 0 ? Be : a, o, d = [], c = /* @__PURE__ */ new Set();
    for (let m of u) {
      let h = await es(m);
      typeof h == "string" ? d.push({ name: m, err: h }) : (o || (o = h), o === h && c.add(m));
    }
    if (!o) throw new Error(`no available backend found. ERR: ${d.map((m) => `[${m.name}] ${m.err}`).join(", ")}`);
    for (let { name: m, err: h } of d) a.includes(m) && console.warn(`removing requested execution provider "${m}" from session options because it is not available: ${h}`);
    let l = t.filter((m) => c.has(typeof m == "string" ? m : m.name));
    return [o, new Proxy(n, { get: (m, h) => h === "executionProviders" ? l : Reflect.get(m, h) })];
  };
});
var pr = F(() => {
  "use strict";
  Qt();
});
var mr;
var hr = F(() => {
  "use strict";
  mr = "1.27.0";
});
var wr;
var J;
var Zt = F(() => {
  "use strict";
  hr();
  wr = "warning", J = { wasm: {}, webgl: {}, webgpu: {}, versions: { common: mr }, set logLevel(n) {
    if (n !== void 0) {
      if (typeof n != "string" || ["verbose", "info", "warning", "error", "fatal"].indexOf(n) === -1) throw new Error(`Unsupported logging level: ${n}`);
      wr = n;
    }
  }, get logLevel() {
    return wr;
  } };
  Object.defineProperty(J, "logLevel", { enumerable: true });
});
var Y;
var br = F(() => {
  "use strict";
  Zt();
  Y = J;
});
var yr;
var gr;
var Er = F(() => {
  "use strict";
  yr = (n, t) => {
    let a = typeof document < "u" ? document.createElement("canvas") : new OffscreenCanvas(1, 1);
    a.width = n.dims[3], a.height = n.dims[2];
    let u = a.getContext("2d");
    if (u != null) {
      let o, d;
      t?.tensorLayout !== void 0 && t.tensorLayout === "NHWC" ? (o = n.dims[2], d = n.dims[3]) : (o = n.dims[3], d = n.dims[2]);
      let c = t?.format !== void 0 ? t.format : "RGB", l = t?.norm, m, h;
      l === void 0 || l.mean === void 0 ? m = [255, 255, 255, 255] : typeof l.mean == "number" ? m = [l.mean, l.mean, l.mean, l.mean] : (m = [l.mean[0], l.mean[1], l.mean[2], 0], l.mean[3] !== void 0 && (m[3] = l.mean[3])), l === void 0 || l.bias === void 0 ? h = [0, 0, 0, 0] : typeof l.bias == "number" ? h = [l.bias, l.bias, l.bias, l.bias] : (h = [l.bias[0], l.bias[1], l.bias[2], 0], l.bias[3] !== void 0 && (h[3] = l.bias[3]));
      let g = d * o, b = 0, y = g, T = g * 2, I = -1;
      c === "RGBA" ? (b = 0, y = g, T = g * 2, I = g * 3) : c === "RGB" ? (b = 0, y = g, T = g * 2) : c === "RBG" && (b = 0, T = g, y = g * 2);
      for (let D = 0; D < d; D++) for (let z = 0; z < o; z++) {
        let v = (n.data[b++] - h[0]) * m[0], O = (n.data[y++] - h[1]) * m[1], N = (n.data[T++] - h[2]) * m[2], _ = I === -1 ? 255 : (n.data[I++] - h[3]) * m[3];
        u.fillStyle = "rgba(" + v + "," + O + "," + N + "," + _ + ")", u.fillRect(z, D, 1, 1);
      }
      if ("toDataURL" in a) return a.toDataURL();
      throw new Error("toDataURL is not supported");
    } else throw new Error("Can not access image data");
  }, gr = (n, t) => {
    let a = typeof document < "u" ? document.createElement("canvas").getContext("2d") : new OffscreenCanvas(1, 1).getContext("2d"), u;
    if (a != null) {
      let o, d, c;
      t?.tensorLayout !== void 0 && t.tensorLayout === "NHWC" ? (o = n.dims[2], d = n.dims[1], c = n.dims[3]) : (o = n.dims[3], d = n.dims[2], c = n.dims[1]);
      let l = t !== void 0 && t.format !== void 0 ? t.format : "RGB", m = t?.norm, h, g;
      m === void 0 || m.mean === void 0 ? h = [255, 255, 255, 255] : typeof m.mean == "number" ? h = [m.mean, m.mean, m.mean, m.mean] : (h = [m.mean[0], m.mean[1], m.mean[2], 255], m.mean[3] !== void 0 && (h[3] = m.mean[3])), m === void 0 || m.bias === void 0 ? g = [0, 0, 0, 0] : typeof m.bias == "number" ? g = [m.bias, m.bias, m.bias, m.bias] : (g = [m.bias[0], m.bias[1], m.bias[2], 0], m.bias[3] !== void 0 && (g[3] = m.bias[3]));
      let b = d * o;
      if (t !== void 0 && (t.format !== void 0 && c === 4 && t.format !== "RGBA" || c === 3 && t.format !== "RGB" && t.format !== "BGR")) throw new Error("Tensor format doesn't match input tensor dims");
      let y = 4, T = 0, I = 1, D = 2, z = 3, v = 0, O = b, N = b * 2, _ = -1;
      l === "RGBA" ? (v = 0, O = b, N = b * 2, _ = b * 3) : l === "RGB" ? (v = 0, O = b, N = b * 2) : l === "RBG" && (v = 0, N = b, O = b * 2), u = a.createImageData(o, d);
      for (let k = 0; k < d * o; T += y, I += y, D += y, z += y, k++) u.data[T] = (n.data[v++] - g[0]) * h[0], u.data[I] = (n.data[O++] - g[1]) * h[1], u.data[D] = (n.data[N++] - g[2]) * h[2], u.data[z] = _ === -1 ? 255 : (n.data[_++] - g[3]) * h[3];
    } else throw new Error("Can not access image data");
    return u;
  };
});
var Kt;
var Tr;
var Sr;
var vr;
var Or;
var Ar;
var Ir = F(() => {
  "use strict";
  ct();
  Kt = (n, t) => {
    if (n === void 0) throw new Error("Image buffer must be defined");
    if (t.height === void 0 || t.width === void 0) throw new Error("Image height and width must be defined");
    if (t.tensorLayout === "NHWC") throw new Error("NHWC Tensor layout is not supported yet");
    let { height: a, width: u } = t, o = t.norm ?? { mean: 255, bias: 0 }, d, c;
    typeof o.mean == "number" ? d = [o.mean, o.mean, o.mean, o.mean] : d = [o.mean[0], o.mean[1], o.mean[2], o.mean[3] ?? 255], typeof o.bias == "number" ? c = [o.bias, o.bias, o.bias, o.bias] : c = [o.bias[0], o.bias[1], o.bias[2], o.bias[3] ?? 0];
    let l = t.format !== void 0 ? t.format : "RGBA", m = t.tensorFormat !== void 0 && t.tensorFormat !== void 0 ? t.tensorFormat : "RGB", h = a * u, g = m === "RGBA" ? new Float32Array(h * 4) : new Float32Array(h * 3), b = 4, y = 0, T = 1, I = 2, D = 3, z = 0, v = h, O = h * 2, N = -1;
    l === "RGB" && (b = 3, y = 0, T = 1, I = 2, D = -1), m === "RGBA" ? N = h * 3 : m === "RBG" ? (z = 0, O = h, v = h * 2) : m === "BGR" && (O = 0, v = h, z = h * 2);
    for (let k = 0; k < h; k++, y += b, I += b, T += b, D += b) g[z++] = (n[y] + c[0]) / d[0], g[v++] = (n[T] + c[1]) / d[1], g[O++] = (n[I] + c[2]) / d[2], N !== -1 && D !== -1 && (g[N++] = (n[D] + c[3]) / d[3]);
    return m === "RGBA" ? new Q("float32", g, [1, 4, a, u]) : new Q("float32", g, [1, 3, a, u]);
  }, Tr = async (n, t) => {
    let a = typeof HTMLImageElement < "u" && n instanceof HTMLImageElement, u = typeof ImageData < "u" && n instanceof ImageData, o = typeof ImageBitmap < "u" && n instanceof ImageBitmap, d = typeof n == "string", c, l = t ?? {}, m = () => {
      if (typeof document < "u") return document.createElement("canvas");
      if (typeof OffscreenCanvas < "u") return new OffscreenCanvas(1, 1);
      throw new Error("Canvas is not supported");
    }, h = (g) => typeof HTMLCanvasElement < "u" && g instanceof HTMLCanvasElement || g instanceof OffscreenCanvas ? g.getContext("2d") : null;
    if (a) {
      let g = m();
      g.width = n.width, g.height = n.height;
      let b = h(g);
      if (b != null) {
        let y = n.height, T = n.width;
        if (t !== void 0 && t.resizedHeight !== void 0 && t.resizedWidth !== void 0 && (y = t.resizedHeight, T = t.resizedWidth), t !== void 0) {
          if (l = t, t.tensorFormat !== void 0) throw new Error("Image input config format must be RGBA for HTMLImageElement");
          l.tensorFormat = "RGBA", l.height = y, l.width = T;
        } else l.tensorFormat = "RGBA", l.height = y, l.width = T;
        b.drawImage(n, 0, 0), c = b.getImageData(0, 0, T, y).data;
      } else throw new Error("Can not access image data");
    } else if (u) {
      let g, b;
      if (t !== void 0 && t.resizedWidth !== void 0 && t.resizedHeight !== void 0 ? (g = t.resizedHeight, b = t.resizedWidth) : (g = n.height, b = n.width), t !== void 0 && (l = t), l.format = "RGBA", l.height = g, l.width = b, t !== void 0) {
        let y = m();
        y.width = b, y.height = g;
        let T = h(y);
        if (T != null) T.putImageData(n, 0, 0), c = T.getImageData(0, 0, b, g).data;
        else throw new Error("Can not access image data");
      } else c = n.data;
    } else if (o) {
      if (t === void 0) throw new Error("Please provide image config with format for Imagebitmap");
      let g = m();
      g.width = n.width, g.height = n.height;
      let b = h(g);
      if (b != null) {
        let y = n.height, T = n.width;
        return b.drawImage(n, 0, 0, T, y), c = b.getImageData(0, 0, T, y).data, l.height = y, l.width = T, Kt(c, l);
      } else throw new Error("Can not access image data");
    } else {
      if (d) return new Promise((g, b) => {
        let y = m(), T = h(y);
        if (!n || !T) return b();
        let I = new Image();
        I.crossOrigin = "Anonymous", I.src = n, I.onload = () => {
          y.width = I.width, y.height = I.height, T.drawImage(I, 0, 0, y.width, y.height);
          let D = T.getImageData(0, 0, y.width, y.height);
          l.height = y.height, l.width = y.width, g(Kt(D.data, l));
        };
      });
      throw new Error("Input data provided is not supported - aborted tensor creation");
    }
    if (c !== void 0) return Kt(c, l);
    throw new Error("Input data provided is not supported - aborted tensor creation");
  }, Sr = (n, t) => {
    let { width: a, height: u, download: o, dispose: d } = t, c = [1, u, a, 4];
    return new Q({ location: "texture", type: "float32", texture: n, dims: c, download: o, dispose: d });
  }, vr = (n, t) => {
    let { dataType: a, dims: u, download: o, dispose: d } = t;
    return new Q({ location: "gpu-buffer", type: a ?? "float32", gpuBuffer: n, dims: u, download: o, dispose: d });
  }, Or = (n, t) => {
    let { dataType: a, dims: u, download: o, dispose: d } = t;
    return new Q({ location: "ml-tensor", type: a ?? "float32", mlTensor: n, dims: u, download: o, dispose: d });
  }, Ar = (n, t, a) => new Q({ location: "cpu-pinned", type: n, data: t, dims: a ?? [t.length] });
});
var Le;
var Xe;
var Br;
var Lr;
var _r = F(() => {
  "use strict";
  Le = /* @__PURE__ */ new Map([["float32", Float32Array], ["uint8", Uint8Array], ["int8", Int8Array], ["uint16", Uint16Array], ["int16", Int16Array], ["int32", Int32Array], ["bool", Uint8Array], ["float64", Float64Array], ["uint32", Uint32Array], ["int4", Uint8Array], ["uint4", Uint8Array]]), Xe = /* @__PURE__ */ new Map([[Float32Array, "float32"], [Uint8Array, "uint8"], [Int8Array, "int8"], [Uint16Array, "uint16"], [Int16Array, "int16"], [Int32Array, "int32"], [Float64Array, "float64"], [Uint32Array, "uint32"]]), Br = false, Lr = () => {
    if (!Br) {
      Br = true;
      let n = typeof BigInt64Array < "u" && BigInt64Array.from, t = typeof BigUint64Array < "u" && BigUint64Array.from, a = globalThis.Float16Array, u = typeof a < "u" && a.from;
      n && (Le.set("int64", BigInt64Array), Xe.set(BigInt64Array, "int64")), t && (Le.set("uint64", BigUint64Array), Xe.set(BigUint64Array, "uint64")), u ? (Le.set("float16", a), Xe.set(a, "float16")) : Le.set("float16", Uint16Array);
    }
  };
});
var Pr;
var Dr;
var Ur = F(() => {
  "use strict";
  ct();
  Pr = (n) => {
    let t = 1;
    for (let a = 0; a < n.length; a++) {
      let u = n[a];
      if (typeof u != "number" || !Number.isSafeInteger(u)) throw new TypeError(`dims[${a}] must be an integer, got: ${u}`);
      if (u < 0) throw new RangeError(`dims[${a}] must be a non-negative integer, got: ${u}`);
      t *= u;
    }
    return t;
  }, Dr = (n, t) => {
    switch (n.location) {
      case "cpu":
        return new Q(n.type, n.data, t);
      case "cpu-pinned":
        return new Q({ location: "cpu-pinned", data: n.data, type: n.type, dims: t });
      case "texture":
        return new Q({ location: "texture", texture: n.texture, type: n.type, dims: t });
      case "gpu-buffer":
        return new Q({ location: "gpu-buffer", gpuBuffer: n.gpuBuffer, type: n.type, dims: t });
      case "ml-tensor":
        return new Q({ location: "ml-tensor", mlTensor: n.mlTensor, type: n.type, dims: t });
      default:
        throw new Error(`tensorReshape: tensor location ${n.location} is not supported`);
    }
  };
});
var Q;
var ct = F(() => {
  "use strict";
  Er();
  Ir();
  _r();
  Ur();
  Q = class {
    constructor(t, a, u) {
      Lr();
      let o, d;
      if (typeof t == "object" && "location" in t) switch (this.dataLocation = t.location, o = t.type, d = t.dims, t.location) {
        case "cpu-pinned": {
          let l = Le.get(o);
          if (!l) throw new TypeError(`unsupported type "${o}" to create tensor from pinned buffer`);
          if (!(t.data instanceof l)) throw new TypeError(`buffer should be of type ${l.name}`);
          this.cpuData = t.data;
          break;
        }
        case "texture": {
          if (o !== "float32") throw new TypeError(`unsupported type "${o}" to create tensor from texture`);
          this.gpuTextureData = t.texture, this.downloader = t.download, this.disposer = t.dispose;
          break;
        }
        case "gpu-buffer": {
          if (o !== "float32" && o !== "float16" && o !== "int32" && o !== "int64" && o !== "uint32" && o !== "uint8" && o !== "bool" && o !== "uint4" && o !== "int4") throw new TypeError(`unsupported type "${o}" to create tensor from gpu buffer`);
          this.gpuBufferData = t.gpuBuffer, this.downloader = t.download, this.disposer = t.dispose;
          break;
        }
        case "ml-tensor": {
          if (o !== "float32" && o !== "float16" && o !== "int32" && o !== "int64" && o !== "uint32" && o !== "uint64" && o !== "int8" && o !== "uint8" && o !== "bool" && o !== "uint4" && o !== "int4") throw new TypeError(`unsupported type "${o}" to create tensor from MLTensor`);
          this.mlTensorData = t.mlTensor, this.downloader = t.download, this.disposer = t.dispose;
          break;
        }
        default:
          throw new Error(`Tensor constructor: unsupported location '${this.dataLocation}'`);
      }
      else {
        let l, m;
        if (typeof t == "string") if (o = t, m = u, t === "string") {
          if (!Array.isArray(a)) throw new TypeError("A string tensor's data must be a string array.");
          l = a;
        } else {
          let h = Le.get(t);
          if (h === void 0) throw new TypeError(`Unsupported tensor type: ${t}.`);
          if (Array.isArray(a)) {
            if (t === "float16" && h === Uint16Array || t === "uint4" || t === "int4") throw new TypeError(`Creating a ${t} tensor from number array is not supported. Please use ${h.name} as data.`);
            t === "uint64" || t === "int64" ? l = h.from(a, BigInt) : l = h.from(a);
          } else if (a instanceof h) l = a;
          else if (a instanceof Uint8ClampedArray) if (t === "uint8") l = Uint8Array.from(a);
          else throw new TypeError("A Uint8ClampedArray tensor's data must be type of uint8");
          else if (t === "float16" && a instanceof Uint16Array && h !== Uint16Array) l = new globalThis.Float16Array(a.buffer, a.byteOffset, a.length);
          else throw new TypeError(`A ${o} tensor's data must be type of ${h}`);
        }
        else if (m = a, Array.isArray(t)) {
          if (t.length === 0) throw new TypeError("Tensor type cannot be inferred from an empty array.");
          let h = typeof t[0];
          if (h === "string") o = "string", l = t;
          else if (h === "boolean") o = "bool", l = Uint8Array.from(t);
          else throw new TypeError(`Invalid element type of data array: ${h}.`);
        } else if (t instanceof Uint8ClampedArray) o = "uint8", l = Uint8Array.from(t);
        else {
          let h = Xe.get(t.constructor);
          if (h === void 0) throw new TypeError(`Unsupported type for tensor data: ${t.constructor}.`);
          o = h, l = t;
        }
        if (m === void 0) m = [l.length];
        else if (!Array.isArray(m)) throw new TypeError("A tensor's dims must be a number array");
        d = m, this.cpuData = l, this.dataLocation = "cpu";
      }
      let c = Pr(d);
      if (this.cpuData && c !== this.cpuData.length && !((o === "uint4" || o === "int4") && Math.ceil(c / 2) === this.cpuData.length)) throw new Error(`Tensor's size(${c}) does not match data length(${this.cpuData.length}).`);
      this.type = o, this.dims = d, this.size = c;
    }
    static async fromImage(t, a) {
      return Tr(t, a);
    }
    static fromTexture(t, a) {
      return Sr(t, a);
    }
    static fromGpuBuffer(t, a) {
      return vr(t, a);
    }
    static fromMLTensor(t, a) {
      return Or(t, a);
    }
    static fromPinnedBuffer(t, a, u) {
      return Ar(t, a, u);
    }
    toDataURL(t) {
      return yr(this, t);
    }
    toImageData(t) {
      return gr(this, t);
    }
    get data() {
      if (this.ensureValid(), !this.cpuData) throw new Error("The data is not on CPU. Use `getData()` to download GPU data to CPU, or use `texture` or `gpuBuffer` property to access the GPU data directly.");
      return this.cpuData;
    }
    get location() {
      return this.dataLocation;
    }
    get texture() {
      if (this.ensureValid(), !this.gpuTextureData) throw new Error("The data is not stored as a WebGL texture.");
      return this.gpuTextureData;
    }
    get gpuBuffer() {
      if (this.ensureValid(), !this.gpuBufferData) throw new Error("The data is not stored as a WebGPU buffer.");
      return this.gpuBufferData;
    }
    get mlTensor() {
      if (this.ensureValid(), !this.mlTensorData) throw new Error("The data is not stored as a WebNN MLTensor.");
      return this.mlTensorData;
    }
    async getData(t) {
      switch (this.ensureValid(), this.dataLocation) {
        case "cpu":
        case "cpu-pinned":
          return this.data;
        case "texture":
        case "gpu-buffer":
        case "ml-tensor": {
          if (!this.downloader) throw new Error("The current tensor is not created with a specified data downloader.");
          if (this.isDownloading) throw new Error("The current tensor is being downloaded.");
          try {
            this.isDownloading = true;
            let a = await this.downloader();
            return this.downloader = void 0, this.dataLocation = "cpu", this.cpuData = a, t && this.disposer && (this.disposer(), this.disposer = void 0), a;
          } finally {
            this.isDownloading = false;
          }
        }
        default:
          throw new Error(`cannot get data from location: ${this.dataLocation}`);
      }
    }
    dispose() {
      if (this.isDownloading) throw new Error("The current tensor is being downloaded.");
      this.disposer && (this.disposer(), this.disposer = void 0), this.cpuData = void 0, this.gpuTextureData = void 0, this.gpuBufferData = void 0, this.mlTensorData = void 0, this.downloader = void 0, this.isDownloading = void 0, this.dataLocation = "none";
    }
    ensureValid() {
      if (this.dataLocation === "none") throw new Error("The tensor is disposed.");
    }
    reshape(t) {
      if (this.ensureValid(), this.downloader || this.disposer) throw new Error("Cannot reshape a tensor that owns GPU resource.");
      return Dr(this, t);
    }
  };
});
var de;
var en = F(() => {
  "use strict";
  ct();
  de = Q;
});
var xr;
var Cr;
var _e;
var Pe;
var De;
var Ue;
var tn = F(() => {
  "use strict";
  Zt();
  xr = (n, t) => {
    (typeof J.trace > "u" ? !J.wasm.trace : !J.trace) || console.timeStamp(`${n}::ORT::${t}`);
  }, Cr = (n, t) => {
    let a = new Error().stack?.split(/\r\n|\r|\n/g) || [], u = false;
    for (let o = 0; o < a.length; o++) {
      if (u && !a[o].includes("TRACE_FUNC")) {
        let d = `FUNC_${n}::${a[o].trim().split(" ")[1]}`;
        t && (d += `::${t}`), xr("CPU", d);
        return;
      }
      a[o].includes("TRACE_FUNC") && (u = true);
    }
  }, _e = (n) => {
    (typeof J.trace > "u" ? !J.wasm.trace : !J.trace) || Cr("BEGIN", n);
  }, Pe = (n) => {
    (typeof J.trace > "u" ? !J.wasm.trace : !J.trace) || Cr("END", n);
  }, De = (n) => {
    (typeof J.trace > "u" ? !J.wasm.trace : !J.trace) || console.time(`ORT::${n}`);
  }, Ue = (n) => {
    (typeof J.trace > "u" ? !J.wasm.trace : !J.trace) || console.timeEnd(`ORT::${n}`);
  };
});
var lt;
var Mr = F(() => {
  "use strict";
  Qt();
  en();
  tn();
  lt = class n {
    constructor(t) {
      this.handler = t;
    }
    async run(t, a, u) {
      _e(), De("InferenceSession.run");
      let o = {}, d = {};
      if (typeof t != "object" || t === null || t instanceof de || Array.isArray(t)) throw new TypeError("'feeds' must be an object that use input names as keys and OnnxValue as corresponding values.");
      let c = true;
      if (typeof a == "object") {
        if (a === null) throw new TypeError("Unexpected argument[1]: cannot be null.");
        if (a instanceof de) throw new TypeError("'fetches' cannot be a Tensor");
        if (Array.isArray(a)) {
          if (a.length === 0) throw new TypeError("'fetches' cannot be an empty array.");
          c = false;
          for (let h of a) {
            if (typeof h != "string") throw new TypeError("'fetches' must be a string array or an object.");
            if (this.outputNames.indexOf(h) === -1) throw new RangeError(`'fetches' contains invalid output name: ${h}.`);
            o[h] = null;
          }
          if (typeof u == "object" && u !== null) d = u;
          else if (typeof u < "u") throw new TypeError("'options' must be an object.");
        } else {
          let h = false, g = Object.getOwnPropertyNames(a);
          for (let b of this.outputNames) if (g.indexOf(b) !== -1) {
            let y = a[b];
            (y === null || y instanceof de) && (h = true, c = false, o[b] = y);
          }
          if (h) {
            if (typeof u == "object" && u !== null) d = u;
            else if (typeof u < "u") throw new TypeError("'options' must be an object.");
          } else d = a;
        }
      } else if (typeof a < "u") throw new TypeError("Unexpected argument[1]: must be 'fetches' or 'options'.");
      for (let h of this.inputNames) if (typeof t[h] > "u") throw new Error(`input '${h}' is missing in 'feeds'.`);
      if (c) for (let h of this.outputNames) o[h] = null;
      let l = await this.handler.run(t, o, d), m = {};
      for (let h in l) if (Object.hasOwnProperty.call(l, h)) {
        let g = l[h];
        g instanceof de ? m[h] = g : m[h] = new de(g.type, g.data, g.dims);
      }
      return Ue("InferenceSession.run"), Pe(), m;
    }
    async release() {
      return this.handler.dispose();
    }
    static async create(t, a, u, o) {
      _e(), De("InferenceSession.create");
      let d, c = {};
      if (typeof t == "string") {
        if (d = t, typeof a == "object" && a !== null) c = a;
        else if (typeof a < "u") throw new TypeError("'options' must be an object.");
      } else if (t instanceof Uint8Array) {
        if (d = t, typeof a == "object" && a !== null) c = a;
        else if (typeof a < "u") throw new TypeError("'options' must be an object.");
      } else if (t instanceof ArrayBuffer || typeof SharedArrayBuffer < "u" && t instanceof SharedArrayBuffer) {
        let g = t, b = 0, y = t.byteLength;
        if (typeof a == "object" && a !== null) c = a;
        else if (typeof a == "number") {
          if (b = a, !Number.isSafeInteger(b)) throw new RangeError("'byteOffset' must be an integer.");
          if (b < 0 || b >= g.byteLength) throw new RangeError(`'byteOffset' is out of range [0, ${g.byteLength}).`);
          if (y = t.byteLength - b, typeof u == "number") {
            if (y = u, !Number.isSafeInteger(y)) throw new RangeError("'byteLength' must be an integer.");
            if (y <= 0 || b + y > g.byteLength) throw new RangeError(`'byteLength' is out of range (0, ${g.byteLength - b}].`);
            if (typeof o == "object" && o !== null) c = o;
            else if (typeof o < "u") throw new TypeError("'options' must be an object.");
          } else if (typeof u < "u") throw new TypeError("'byteLength' must be a number.");
        } else if (typeof a < "u") throw new TypeError("'options' must be an object.");
        d = new Uint8Array(g, b, y);
      } else throw new TypeError("Unexpected argument[0]: must be 'path' or 'buffer'.");
      let [l, m] = await dr(c), h = await l.createInferenceSessionHandler(d, m);
      return Ue("InferenceSession.create"), Pe(), new n(h);
    }
    startProfiling() {
      this.handler.startProfiling();
    }
    endProfiling() {
      this.handler.endProfiling();
    }
    get inputNames() {
      return this.handler.inputNames;
    }
    get outputNames() {
      return this.handler.outputNames;
    }
    get inputMetadata() {
      return this.handler.inputMetadata;
    }
    get outputMetadata() {
      return this.handler.outputMetadata;
    }
  };
});
var ts;
var Rr = F(() => {
  "use strict";
  Mr();
  ts = lt;
});
var Nr = F(() => {
  "use strict";
});
var Fr = F(() => {
  "use strict";
});
var kr = F(() => {
  "use strict";
});
var Wr = F(() => {
  "use strict";
});
var nn = {};
ut(nn, { InferenceSession: () => ts, TRACE: () => xr, TRACE_EVENT_BEGIN: () => De, TRACE_EVENT_END: () => Ue, TRACE_FUNC_BEGIN: () => _e, TRACE_FUNC_END: () => Pe, Tensor: () => de, env: () => Y, registerBackend: () => qe });
var Te = F(() => {
  "use strict";
  pr();
  br();
  Rr();
  en();
  Nr();
  Fr();
  tn();
  kr();
  Wr();
});
var dt = F(() => {
  "use strict";
});
var Hr = {};
ut(Hr, { default: () => ns });
var $r;
var zr;
var ns;
var jr = F(() => {
  "use strict";
  rn();
  xe();
  pt();
  $r = "ort-wasm-proxy-worker", zr = globalThis.self?.name === $r;
  zr && (self.onmessage = (n) => {
    let { type: t, in: a } = n.data;
    try {
      switch (t) {
        case "init-wasm":
          mt(a.wasm).then(() => {
            ht(a).then(() => {
              postMessage({ type: t });
            }, (u) => {
              postMessage({ type: t, err: u });
            });
          }, (u) => {
            postMessage({ type: t, err: u });
          });
          break;
        case "init-ep": {
          let { epName: u, env: o } = a;
          wt(o, u).then(() => {
            postMessage({ type: t });
          }, (d) => {
            postMessage({ type: t, err: d });
          });
          break;
        }
        case "copy-from": {
          let { buffer: u } = a, o = Qe(u);
          postMessage({ type: t, out: o });
          break;
        }
        case "create": {
          let { model: u, options: o } = a;
          bt(u, o).then((d) => {
            postMessage({ type: t, out: d });
          }, (d) => {
            postMessage({ type: t, err: d });
          });
          break;
        }
        case "release":
          yt(a), postMessage({ type: t });
          break;
        case "run": {
          let { sessionId: u, inputIndices: o, inputs: d, outputIndices: c, options: l } = a;
          gt(u, o, d, c, new Array(c.length).fill(null), l).then((m) => {
            m.some((h) => h[3] !== "cpu") ? postMessage({ type: t, err: "Proxy does not support non-cpu tensor location." }) : postMessage({ type: t, out: m }, Tt([...d, ...m]));
          }, (m) => {
            postMessage({ type: t, err: m });
          });
          break;
        }
        case "end-profiling":
          Et(a), postMessage({ type: t });
          break;
        default:
      }
    } catch (u) {
      postMessage({ type: t, err: u });
    }
  });
  ns = zr ? null : (n) => new Worker(n ?? oe, { type: "module", name: $r });
});
var Yr = {};
ut(Yr, { default: () => rs });
async function Vr(n = {}) {
  var t = n, a = !!globalThis.window, u = !!globalThis.WorkerGlobalScope, o = u && self.name?.startsWith("em-pthread");
  t.mountExternalData = (e, r) => {
    e.startsWith("./") && (e = e.substring(2)), (t.Rb || (t.Rb = /* @__PURE__ */ new Map())).set(e, r);
  }, t.unmountExternalData = () => {
    delete t.Rb;
  }, globalThis.SharedArrayBuffer ?? new WebAssembly.Memory({ initial: 0, maximum: 0, shared: true }).buffer.constructor;
  var d, c, l = (e, r) => {
    throw r;
  }, m = import.meta.url, h = "";
  if (a || u) {
    try {
      h = new URL(".", m).href;
    } catch {
    }
    u && (c = (e) => {
      var r = new XMLHttpRequest();
      return r.open("GET", e, false), r.responseType = "arraybuffer", r.send(null), new Uint8Array(r.response);
    }), d = async (e) => {
      if (k(e)) return new Promise((i, s) => {
        var f = new XMLHttpRequest();
        f.open("GET", e, true), f.responseType = "arraybuffer", f.onload = () => {
          f.status == 200 || f.status == 0 && f.response ? i(f.response) : s(f.status);
        }, f.onerror = s, f.send(null);
      });
      var r = await fetch(e, { credentials: "same-origin" });
      if (r.ok) return r.arrayBuffer();
      throw Error(r.status + " : " + r.url);
    };
  }
  var g, b, y, T, I, D, z = console.log.bind(console), v = console.error.bind(console), O = z, N = v, _ = false, k = (e) => e.startsWith("file://");
  function w() {
    ge.buffer != j.buffer && ee();
  }
  if (o) {
    let e = function(r) {
      try {
        var i = r.data, s = i.Pb;
        if (s === "load") {
          let f = [];
          self.onmessage = (p) => f.push(p), D = () => {
            postMessage({ Pb: "loaded" });
            for (let p of f) e(p);
            self.onmessage = e;
          };
          for (let p of i.Zb) t[p] && !t[p].proxy || (t[p] = (...E) => {
            postMessage({ Pb: "callHandler", Yb: p, args: E });
          }, p == "print" && (O = t[p]), p == "printErr" && (N = t[p]));
          ge = i.dc, ee(), b = i.ec, Ut(), it();
        } else if (s === "run") {
          (function(f) {
            var p = (w(), W)[f + 52 >>> 2 >>> 0];
            f = (w(), W)[f + 56 >>> 2 >>> 0], sr(p, p - f), P(p);
          })(i.Ob), zt(i.Ob, 0, 0, 1, 0, 0), wn(), Nt(i.Ob), Z ||= true;
          try {
            Ao(i.bc, i.Tb);
          } catch (f) {
            if (f != "unwind") throw f;
          }
        } else i.target !== "setimmediate" && (s === "checkMailbox" ? Z && rt() : s && (N(`worker: received unknown command ${s}`), N(i)));
      } catch (f) {
        throw tr(), f;
      }
    };
    var Ss = e, Z = false;
    self.onunhandledrejection = (r) => {
      throw r.reason || r;
    }, self.onmessage = e;
  }
  var j, ne, pe, B, W, re, me, A, K, je = false;
  function ee() {
    var e = ge.buffer;
    t.HEAP8 = j = new Int8Array(e), pe = new Int16Array(e), t.HEAPU8 = ne = new Uint8Array(e), new Uint16Array(e), t.HEAP32 = B = new Int32Array(e), t.HEAPU32 = W = new Uint32Array(e), re = new Float32Array(e), me = new Float64Array(e), A = new BigInt64Array(e), new BigUint64Array(e);
  }
  function he() {
    je = true, o ? D() : Ee.Ta();
  }
  function H(e) {
    throw N(e = "Aborted(" + e + ")"), _ = true, e = new WebAssembly.RuntimeError(e + ". Build with -sASSERTIONS for more info."), I?.(e), e;
  }
  function q() {
    return { a: { R: fa, f: Io, w: Bo, e: Lo, k: _o, g: Po, S: Do, b: Uo, G: xo, ta: vn, j: Co, L: In, Ja: Bn, pa: Ln, ra: _n, Ka: Pn, Ha: Dn, Aa: Un, Ga: xn, Y: Cn, qa: Mn, na: Rn, Ia: Nn, oa: Fn, Pa: Mo, Da: Ro, la: Fo, ua: ko, ia: Wo, T: Go, Ca: Nt, Ma: $o, xa: zo, ya: Ho, za: jo, va: $n, wa: zn, ja: Hn, Ra: Yo, Oa: Xo, V: Qo, U: Zo, Na: Jo, F: Ko, La: ea, ma: ta, u: Vo, H: na, Q: at, ka: oa, aa: ra, Sa: aa, Ea: Yn, Fa: Jn, sa: ye, I: qn, X: Xn, Ba: Qn, W: Zn, _: ja, M: Wa, $: Ha, N: ka, v: Pa, d: pa, m: la, n: ca, q: va, ba: Ra, x: Ba, o: wa, O: Na, D: Ga, J: Ma, ca: Ca, da: xa, A: Oa, P: Ua, ea: Da, z: La, E: Fa, c: da, r: ha, i: ma, Z: Va, l: ya, p: ga, s: ba, t: Ea, y: Aa, fa: _a, B: $a, K: Ia, C: za, ga: Sa, ha: Ta, h: ia, a: ge, Qa: V } };
  }
  async function Ut() {
    function e(s, f) {
      return Ee = s.exports, Ee = (function() {
        var p = Ee, E = (x) => () => x() >>> 0, S = (x) => (R) => x(R) >>> 0;
        return (p = Object.assign({}, p)).sb = E(p.sb), p.ub = S(p.ub), p.Ib = S(p.Ib), p.Jb = E(p.Jb), p.Nb = S(p.Nb), p;
      })(), mn.push(Ee.vb), s = Ee, t._OrtInit = s.Ua, t._OrtGetLastError = s.Va, t._OrtCreateSessionOptions = s.Wa, t._OrtAppendExecutionProvider = s.Xa, t._OrtAddFreeDimensionOverride = s.Ya, t._OrtAddSessionConfigEntry = s.Za, t._OrtReleaseSessionOptions = s._a, t._OrtCreateSession = s.$a, t._OrtReleaseSession = s.ab, t._OrtGetInputOutputCount = s.bb, t._OrtGetInputOutputMetadata = s.cb, t._OrtFree = s.db, t._OrtCreateTensor = s.eb, t._OrtGetTensorData = s.fb, t._OrtReleaseTensor = s.gb, t._OrtCreateRunOptions = s.hb, t._OrtAddRunConfigEntry = s.ib, t._OrtReleaseRunOptions = s.jb, t._OrtCreateBinding = s.kb, t._OrtBindInput = s.lb, t._OrtBindOutput = s.mb, t._OrtClearBoundOutputs = s.nb, t._OrtReleaseBinding = s.ob, t._OrtRunWithBinding = s.pb, t._OrtRun = s.qb, t._OrtEndProfiling = s.rb, st = s.sb, Kn = t._free = s.tb, er = t._malloc = s.ub, zt = s.xb, tr = s.yb, nr = s.zb, rr = s.Ab, Ht = s.Bb, or = s.Cb, ar = s.Db, C = s.Eb, Je = s.Fb, sr = s.Gb, P = s.Hb, jt = s.Ib, U = s.Jb, ir = s.Kb, Vt = s.Lb, ur = s.Mb, fr = s.Nb, cr = s.wb, b = f, Ee;
    }
    var r, i = q();
    return t.instantiateWasm ? new Promise((s) => {
      t.instantiateWasm(i, (f, p) => {
        s(e(f, p));
      });
    }) : o ? e(new WebAssembly.Instance(b, q()), b) : (K ??= t.locateFile ? t.locateFile ? t.locateFile("ort-wasm-simd-threaded.wasm", h) : h + "ort-wasm-simd-threaded.wasm" : new URL("ort-wasm-simd-threaded.wasm", import.meta.url).href, r = await (async function(s) {
      var f = K;
      if (!g && !k(f)) try {
        var p = fetch(f, { credentials: "same-origin" });
        return await WebAssembly.instantiateStreaming(p, s);
      } catch (E) {
        N(`wasm streaming compile failed: ${E}`), N("falling back to ArrayBuffer instantiation");
      }
      return (async function(E, S) {
        try {
          var x = await (async function(R) {
            if (!g) try {
              var X = await d(R);
              return new Uint8Array(X);
            } catch {
            }
            if (R == K && g) R = new Uint8Array(g);
            else {
              if (!c) throw "both async and sync fetching of the wasm failed";
              R = c(R);
            }
            return R;
          })(E);
          return await WebAssembly.instantiate(x, S);
        } catch (R) {
          N(`failed to asynchronously prepare wasm: ${R}`), H(R);
        }
      })(f, s);
    })(i), e(r.instance, r.module));
  }
  class Se {
    name = "ExitStatus";
    constructor(r) {
      this.message = `Program terminated with exit(${r})`, this.status = r;
    }
  }
  var ve = (e) => {
    e.terminate(), e.onmessage = () => {
    };
  }, Ve = [], Re = 0, te = null, ue = (e) => {
    ce.length == 0 && (yn(), bn(ce[0]));
    var r = ce.pop();
    if (!r) return 6;
    Ne.push(r), Oe[e.Ob] = r, r.Ob = e.Ob;
    var i = { Pb: "run", bc: e.ac, Tb: e.Tb, Ob: e.Ob };
    return r.postMessage(i, e.Xb), 0;
  }, se = 0, L = (e, r, ...i) => {
    var s, f = 16 * i.length, p = U(), E = jt(f), S = E >>> 3;
    for (s of i) typeof s == "bigint" ? ((w(), A)[S++ >>> 0] = 1n, (w(), A)[S++ >>> 0] = s) : ((w(), A)[S++ >>> 0] = 0n, (w(), me)[S++ >>> 0] = s);
    return e = nr(e, 0, f, E, r), P(p), e;
  };
  function V(e) {
    if (o) return L(0, 1, e);
    if (y = e, !(0 < se)) {
      for (var r of Ne) ve(r);
      for (r of ce) ve(r);
      ce = [], Ne = [], Oe = {}, _ = true;
    }
    l(0, new Se(e));
  }
  function fe(e) {
    if (o) return L(1, 0, e);
    ye(e);
  }
  var ye = (e) => {
    if (y = e, o) throw fe(e), "unwind";
    V(e);
  }, ce = [], Ne = [], mn = [], Oe = {}, hn = (e) => {
    var r = e.Ob;
    delete Oe[r], ce.push(e), Ne.splice(Ne.indexOf(e), 1), e.Ob = 0, rr(r);
  };
  function wn() {
    mn.forEach((e) => e());
  }
  var bn = (e) => new Promise((r) => {
    e.onmessage = (f) => {
      var p = f.data;
      if (f = p.Pb, p.Sb && p.Sb != st()) {
        var E = Oe[p.Sb];
        E ? E.postMessage(p, p.Xb) : N(`Internal error! Worker sent a message "${f}" to target pthread ${p.Sb}, but that thread no longer exists!`);
      } else f === "checkMailbox" ? rt() : f === "spawnThread" ? ue(p) : f === "cleanupThread" ? Rt(() => {
        hn(Oe[p.cc]);
      }) : f === "loaded" ? (e.loaded = true, r(e)) : p.target === "setimmediate" ? e.postMessage(p) : f === "uncaughtException" ? e.onerror(p.error) : f === "callHandler" ? t[p.Yb](...p.args) : f && N(`worker sent an unknown command ${f}`);
    }, e.onerror = (f) => {
      throw N(`worker sent an error! ${f.filename}:${f.lineno}: ${f.message}`), f;
    };
    var i, s = [];
    for (i of []) t.propertyIsEnumerable(i) && s.push(i);
    e.postMessage({ Pb: "load", Zb: s, dc: ge, ec: b });
  });
  function yn() {
    var e = new Worker((() => {
      let r = URL;
      return import.meta.url > "file:" && import.meta.url < "file;" ? new r("ort.wasm.bundle.min.mjs", import.meta.url) : new URL(import.meta.url);
    })(), { type: "module", workerData: "em-pthread", name: "em-pthread" });
    ce.push(e);
  }
  var ge, gn = [], M = (e) => {
    var r = gn[e];
    return r || (gn[e] = r = cr.get(e)), r;
  }, Ao = (e, r) => {
    se = 0, e = M(e)(r), 0 < se ? y = e : Ht(e);
  }, tt = [], nt = 0;
  function Io(e) {
    var r = new xt(e >>>= 0);
    return (w(), j)[r.Qb + 12 >>> 0] == 0 && (En(r, true), nt--), Tn(r, false), tt.push(r), fr(e);
  }
  var Fe = 0, Bo = () => {
    C(0, 0);
    var e = tt.pop();
    ir(e.Ub), Fe = 0;
  };
  function En(e, r) {
    r = r ? 1 : 0, (w(), j)[e.Qb + 12 >>> 0] = r;
  }
  function Tn(e, r) {
    r = r ? 1 : 0, (w(), j)[e.Qb + 13 >>> 0] = r;
  }
  class xt {
    constructor(r) {
      this.Ub = r, this.Qb = r - 24;
    }
  }
  var Ct = (e) => {
    var r = Fe;
    if (!r) return Je(0), 0;
    var i = new xt(r);
    (w(), W)[i.Qb + 16 >>> 2 >>> 0] = r;
    var s = (w(), W)[i.Qb + 4 >>> 2 >>> 0];
    if (!s) return Je(0), r;
    for (var f of e) {
      if (f === 0 || f === s) break;
      if (ur(f, s, i.Qb + 16)) return Je(f), r;
    }
    return Je(s), r;
  };
  function Lo() {
    return Ct([]);
  }
  function _o(e) {
    return Ct([e >>> 0]);
  }
  function Po(e, r, i, s) {
    return Ct([e >>> 0, r >>> 0, i >>> 0, s >>> 0]);
  }
  var Do = () => {
    var e = tt.pop();
    e || H("no exception to throw");
    var r = e.Ub;
    throw (w(), j)[e.Qb + 13 >>> 0] == 0 && (tt.push(e), Tn(e, true), En(e, false), nt++), Vt(r), Fe = r;
  };
  function Uo(e, r, i) {
    var s = new xt(e >>>= 0);
    throw r >>>= 0, i >>>= 0, (w(), W)[s.Qb + 16 >>> 2 >>> 0] = 0, (w(), W)[s.Qb + 4 >>> 2 >>> 0] = r, (w(), W)[s.Qb + 8 >>> 2 >>> 0] = i, Vt(e), nt++, Fe = e;
  }
  var xo = () => nt;
  function Sn(e, r, i, s) {
    return o ? L(2, 1, e, r, i, s) : vn(e, r, i, s);
  }
  function vn(e, r, i, s) {
    if (e >>>= 0, r >>>= 0, i >>>= 0, s >>>= 0, !globalThis.SharedArrayBuffer) return 6;
    var f = [];
    return o && f.length === 0 ? Sn(e, r, i, s) : (e = { ac: i, Ob: e, Tb: s, Xb: f }, o ? (e.Pb = "spawnThread", postMessage(e, f), 0) : ue(e));
  }
  function Co(e) {
    throw Fe ||= e >>> 0, Fe;
  }
  var On = globalThis.TextDecoder && new TextDecoder(), An = (e, r = 0, i, s) => {
    var f = r >>>= 0;
    if (i = f + i, s) s = i;
    else {
      for (; e[f] && !(f >= i); ) ++f;
      s = f;
    }
    if (16 < s - r && e.buffer && On) return On.decode(e.buffer instanceof ArrayBuffer ? e.subarray(r, s) : e.slice(r, s));
    for (f = ""; r < s; ) if (128 & (i = e[r++])) {
      var p = 63 & e[r++];
      if ((224 & i) == 192) f += String.fromCharCode((31 & i) << 6 | p);
      else {
        var E = 63 & e[r++];
        65536 > (i = (240 & i) == 224 ? (15 & i) << 12 | p << 6 | E : (7 & i) << 18 | p << 12 | E << 6 | 63 & e[r++]) ? f += String.fromCharCode(i) : (i -= 65536, f += String.fromCharCode(55296 | i >> 10, 56320 | 1023 & i));
      }
    } else f += String.fromCharCode(i);
    return f;
  }, Mt = (e, r, i) => (e >>>= 0) ? An((w(), ne), e, r, i) : "";
  function In(e, r, i) {
    return o ? L(3, 1, e, r, i) : 0;
  }
  function Bn(e, r) {
    if (o) return L(4, 1, e, r);
  }
  function Ln(e, r) {
    if (o) return L(5, 1, e, r);
  }
  function _n(e, r, i) {
    if (o) return L(6, 1, e, r, i);
  }
  function Pn(e, r, i) {
    return o ? L(7, 1, e, r, i) : 0;
  }
  function Dn(e, r) {
    if (o) return L(8, 1, e, r);
  }
  function Un(e, r, i) {
    if (o) return L(9, 1, e, r, i);
  }
  function xn(e, r, i, s) {
    if (o) return L(10, 1, e, r, i, s);
  }
  function Cn(e, r, i, s) {
    if (o) return L(11, 1, e, r, i, s);
  }
  function Mn(e, r, i, s) {
    if (o) return L(12, 1, e, r, i, s);
  }
  function Rn(e) {
    if (o) return L(13, 1, e);
  }
  function Nn(e, r) {
    if (o) return L(14, 1, e, r);
  }
  function Fn(e, r, i) {
    if (o) return L(15, 1, e, r, i);
  }
  var Mo = () => H("");
  function Ro(e) {
    zt(e >>> 0, !u, 1, !a, 131072, false), wn();
  }
  var Rt = (e) => {
    if (!_) try {
      if (e(), !(0 < se)) try {
        o ? st() && Ht(y) : ye(y);
      } catch (r) {
        r instanceof Se || r == "unwind" || l(0, r);
      }
    } catch (r) {
      r instanceof Se || r == "unwind" || l(0, r);
    }
  }, No = !Atomics.waitAsync || globalThis.navigator?.userAgent && 91 > Number((navigator.userAgent.match(/Chrom(e|ium)\/([0-9]+)\./) || [])[2]);
  function Nt(e) {
    e >>>= 0, No || (Atomics.waitAsync((w(), B), e >>> 2, e).value.then(rt), e += 128, Atomics.store((w(), B), e >>> 2, 1));
  }
  var rt = () => Rt(() => {
    var e = st();
    e && (Nt(e), ar());
  });
  function Fo(e, r) {
    (e >>>= 0) == r >>> 0 ? setTimeout(rt) : o ? postMessage({ Sb: e, Pb: "checkMailbox" }) : (e = Oe[e]) && e.postMessage({ Pb: "checkMailbox" });
  }
  var Ft = [];
  function ko(e, r, i, s, f) {
    for (r >>>= 0, f >>>= 0, Ft.length = 0, i = f >>> 3, s = f + s >>> 3; i < s; ) {
      var p;
      p = (w(), A)[i++ >>> 0] ? (w(), A)[i++ >>> 0] : (w(), me)[i++ >>> 0], Ft.push(p);
    }
    return (r ? lr[r] : ua[e])(...Ft);
  }
  var Wo = () => {
    se = 0;
  };
  function Go(e) {
    e >>>= 0, o ? postMessage({ Pb: "cleanupThread", cc: e }) : hn(Oe[e]);
  }
  function $o(e) {
  }
  function zo(e, r) {
    e = -9007199254740992 > e || 9007199254740992 < e ? NaN : Number(e), r >>>= 0, e = new Date(1e3 * e), (w(), B)[r >>> 2 >>> 0] = e.getUTCSeconds(), (w(), B)[r + 4 >>> 2 >>> 0] = e.getUTCMinutes(), (w(), B)[r + 8 >>> 2 >>> 0] = e.getUTCHours(), (w(), B)[r + 12 >>> 2 >>> 0] = e.getUTCDate(), (w(), B)[r + 16 >>> 2 >>> 0] = e.getUTCMonth(), (w(), B)[r + 20 >>> 2 >>> 0] = e.getUTCFullYear() - 1900, (w(), B)[r + 24 >>> 2 >>> 0] = e.getUTCDay(), e = (e.getTime() - Date.UTC(e.getUTCFullYear(), 0, 1, 0, 0, 0, 0)) / 864e5 | 0, (w(), B)[r + 28 >>> 2 >>> 0] = e;
  }
  var kn = (e) => e % 4 == 0 && (e % 100 != 0 || e % 400 == 0), Wn = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335], Gn = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  function Ho(e, r) {
    e = -9007199254740992 > e || 9007199254740992 < e ? NaN : Number(e), r >>>= 0, e = new Date(1e3 * e), (w(), B)[r >>> 2 >>> 0] = e.getSeconds(), (w(), B)[r + 4 >>> 2 >>> 0] = e.getMinutes(), (w(), B)[r + 8 >>> 2 >>> 0] = e.getHours(), (w(), B)[r + 12 >>> 2 >>> 0] = e.getDate(), (w(), B)[r + 16 >>> 2 >>> 0] = e.getMonth(), (w(), B)[r + 20 >>> 2 >>> 0] = e.getFullYear() - 1900, (w(), B)[r + 24 >>> 2 >>> 0] = e.getDay();
    var i = (kn(e.getFullYear()) ? Wn : Gn)[e.getMonth()] + e.getDate() - 1 | 0;
    (w(), B)[r + 28 >>> 2 >>> 0] = i, (w(), B)[r + 36 >>> 2 >>> 0] = -60 * e.getTimezoneOffset(), i = new Date(e.getFullYear(), 6, 1).getTimezoneOffset();
    var s = new Date(e.getFullYear(), 0, 1).getTimezoneOffset();
    e = 0 | (i != s && e.getTimezoneOffset() == Math.min(s, i)), (w(), B)[r + 32 >>> 2 >>> 0] = e;
  }
  function jo(e) {
    e >>>= 0;
    var r = new Date((w(), B)[e + 20 >>> 2 >>> 0] + 1900, (w(), B)[e + 16 >>> 2 >>> 0], (w(), B)[e + 12 >>> 2 >>> 0], (w(), B)[e + 8 >>> 2 >>> 0], (w(), B)[e + 4 >>> 2 >>> 0], (w(), B)[e >>> 2 >>> 0], 0), i = (w(), B)[e + 32 >>> 2 >>> 0], s = r.getTimezoneOffset(), f = new Date(r.getFullYear(), 6, 1).getTimezoneOffset(), p = new Date(r.getFullYear(), 0, 1).getTimezoneOffset(), E = Math.min(p, f);
    return 0 > i ? (w(), B)[e + 32 >>> 2 >>> 0] = +(f != p && E == s) : 0 < i != (E == s) && (f = Math.max(p, f), r.setTime(r.getTime() + 6e4 * ((0 < i ? E : f) - s))), (w(), B)[e + 24 >>> 2 >>> 0] = r.getDay(), i = (kn(r.getFullYear()) ? Wn : Gn)[r.getMonth()] + r.getDate() - 1 | 0, (w(), B)[e + 28 >>> 2 >>> 0] = i, (w(), B)[e >>> 2 >>> 0] = r.getSeconds(), (w(), B)[e + 4 >>> 2 >>> 0] = r.getMinutes(), (w(), B)[e + 8 >>> 2 >>> 0] = r.getHours(), (w(), B)[e + 12 >>> 2 >>> 0] = r.getDate(), (w(), B)[e + 16 >>> 2 >>> 0] = r.getMonth(), (w(), B)[e + 20 >>> 2 >>> 0] = r.getYear(), e = r.getTime(), BigInt(isNaN(e) ? -1 : e / 1e3);
  }
  function $n(e, r, i, s, f, p, E) {
    return o ? L(16, 1, e, r, i, s, f, p, E) : -52;
  }
  function zn(e, r, i, s, f, p) {
    if (o) return L(17, 1, e, r, i, s, f, p);
  }
  var Ye = {}, Vo = () => performance.timeOrigin + performance.now();
  function Hn(e, r) {
    if (o) return L(18, 1, e, r);
    if (Ye[e] && (clearTimeout(Ye[e].id), delete Ye[e]), !r) return 0;
    var i = setTimeout(() => {
      delete Ye[e], Rt(() => or(e, performance.timeOrigin + performance.now()));
    }, r);
    return Ye[e] = { id: i, jc: r }, 0;
  }
  var Ae = (e, r, i) => {
    var s = (w(), ne);
    if (r >>>= 0, 0 < i) {
      var f = r;
      i = r + i - 1;
      for (var p = 0; p < e.length; ++p) {
        var E = e.codePointAt(p);
        if (127 >= E) {
          if (r >= i) break;
          s[r++ >>> 0] = E;
        } else if (2047 >= E) {
          if (r + 1 >= i) break;
          s[r++ >>> 0] = 192 | E >> 6, s[r++ >>> 0] = 128 | 63 & E;
        } else if (65535 >= E) {
          if (r + 2 >= i) break;
          s[r++ >>> 0] = 224 | E >> 12, s[r++ >>> 0] = 128 | E >> 6 & 63, s[r++ >>> 0] = 128 | 63 & E;
        } else {
          if (r + 3 >= i) break;
          s[r++ >>> 0] = 240 | E >> 18, s[r++ >>> 0] = 128 | E >> 12 & 63, s[r++ >>> 0] = 128 | E >> 6 & 63, s[r++ >>> 0] = 128 | 63 & E, p++;
        }
      }
      s[r >>> 0] = 0, e = r - f;
    } else e = 0;
    return e;
  };
  function Yo(e, r, i, s) {
    e >>>= 0, r >>>= 0, i >>>= 0, s >>>= 0;
    var f = (/* @__PURE__ */ new Date()).getFullYear(), p = new Date(f, 0, 1).getTimezoneOffset();
    f = new Date(f, 6, 1).getTimezoneOffset();
    var E = Math.max(p, f);
    (w(), W)[e >>> 2 >>> 0] = 60 * E, (w(), B)[r >>> 2 >>> 0] = +(p != f), e = (r = (S) => {
      var x = Math.abs(S);
      return `UTC${0 <= S ? "-" : "+"}${String(Math.floor(x / 60)).padStart(2, "0")}${String(x % 60).padStart(2, "0")}`;
    })(p), r = r(f), f < p ? (Ae(e, i, 17), Ae(r, s, 17)) : (Ae(e, s, 17), Ae(r, i, 17));
  }
  var Jo = () => Date.now(), qo = 1;
  function Xo(e, r, i) {
    if (i >>>= 0, !(0 <= e && 3 >= e)) return 28;
    if (e === 0) e = Date.now();
    else {
      if (!qo) return 52;
      e = performance.timeOrigin + performance.now();
    }
    return e = Math.round(1e6 * e), (w(), A)[i >>> 3 >>> 0] = BigInt(e), 0;
  }
  var kt = [];
  function Qo(e, r, i) {
    e >>>= 0, r >>>= 0, i >>>= 0, kt.length = 0;
    for (var s; s = (w(), ne)[r++ >>> 0]; ) {
      var f = s != 105;
      i += (f &= s != 112) && i % 8 ? 4 : 0, kt.push(s == 112 ? (w(), W)[i >>> 2 >>> 0] : s == 106 ? (w(), A)[i >>> 3 >>> 0] : s == 105 ? (w(), B)[i >>> 2 >>> 0] : (w(), me)[i >>> 3 >>> 0]), i += f ? 8 : 4;
    }
    return lr[e](...kt);
  }
  var Zo = () => {
  };
  function Ko(e, r) {
    return N(Mt(e >>> 0, r >>> 0));
  }
  var ea = () => {
    throw se += 1, "unwind";
  };
  function ta() {
    return 4294901760;
  }
  var na = () => navigator.hardwareConcurrency, Ie = {}, Wt = (e) => {
    for (var r = 0, i = 0; i < e.length; ++i) {
      var s = e.charCodeAt(i);
      127 >= s ? r++ : 2047 >= s ? r += 2 : 55296 <= s && 57343 >= s ? (r += 4, ++i) : r += 3;
    }
    return r;
  }, ot = (e) => {
    var r;
    return (r = /\bwasm-function\[\d+\]:(0x[0-9a-f]+)/.exec(e)) ? +r[1] : (r = /:(\d+):\d+(?:\)|$)/.exec(e)) ? 2147483648 | +r[1] : 0;
  }, jn = (e) => {
    for (var r of e) (e = ot(r)) && (Ie[e] = r);
  };
  function ra() {
    var e = Error().stack.toString().split(`
`);
    return e[0] == "Error" && e.shift(), jn(e), Ie.Vb = ot(e[3]), Ie.$b = e, Ie.Vb;
  }
  function at(e) {
    if (!(e = Ie[e >>> 0])) return 0;
    var r;
    if (r = /^\s+at .*\.wasm\.(.*) \(.*\)$/.exec(e)) e = r[1];
    else if (r = /^\s+at (.*) \(.*\)$/.exec(e)) e = r[1];
    else {
      if (!(r = /^(.+?)@/.exec(e))) return 0;
      e = r[1];
    }
    Kn(at.Wb ?? 0), r = Wt(e) + 1;
    var i = er(r);
    return i && Ae(e, i, r), at.Wb = i, at.Wb;
  }
  function oa(e) {
    e >>>= 0;
    var r = (w(), ne).length;
    if (e <= r || 4294901760 < e) return false;
    for (var i = 1; 4 >= i; i *= 2) {
      var s = r * (1 + 0.2 / i);
      s = Math.min(s, e + 100663296);
      e: {
        s = (Math.min(4294901760, 65536 * Math.ceil(Math.max(e, s) / 65536)) - ge.buffer.byteLength + 65535) / 65536 | 0;
        try {
          ge.grow(s), ee();
          var f = 1;
          break e;
        } catch {
        }
        f = void 0;
      }
      if (f) return true;
    }
    return false;
  }
  function aa(e, r, i) {
    if (e >>>= 0, r >>>= 0, Ie.Vb == e) var s = Ie.$b;
    else (s = Error().stack.toString().split(`
`))[0] == "Error" && s.shift(), jn(s);
    for (var f = 3; s[f] && ot(s[f]) != e; ) ++f;
    for (e = 0; e < i && s[e + f]; ++e) (w(), B)[r + 4 * e >>> 2 >>> 0] = ot(s[e + f]);
    return e;
  }
  var Gt, $t = {}, Vn = () => {
    if (!Gt) {
      var e, r = { USER: "web_user", LOGNAME: "web_user", PATH: "/", PWD: "/", HOME: "/home/web_user", LANG: (globalThis.navigator?.language ?? "C").replace("-", "_") + ".UTF-8", _: "./this.program" };
      for (e in $t) $t[e] === void 0 ? delete r[e] : r[e] = $t[e];
      var i = [];
      for (e in r) i.push(`${e}=${r[e]}`);
      Gt = i;
    }
    return Gt;
  };
  function Yn(e, r) {
    if (o) return L(19, 1, e, r);
    e >>>= 0, r >>>= 0;
    var i, s = 0, f = 0;
    for (i of Vn()) {
      var p = r + s;
      (w(), W)[e + f >>> 2 >>> 0] = p, s += Ae(i, p, 1 / 0) + 1, f += 4;
    }
    return 0;
  }
  function Jn(e, r) {
    if (o) return L(20, 1, e, r);
    e >>>= 0, r >>>= 0;
    var i = Vn();
    for (var s of ((w(), W)[e >>> 2 >>> 0] = i.length, e = 0, i)) e += Wt(s) + 1;
    return (w(), W)[r >>> 2 >>> 0] = e, 0;
  }
  function qn(e) {
    return o ? L(21, 1, e) : 52;
  }
  function Xn(e, r, i, s) {
    return o ? L(22, 1, e, r, i, s) : 52;
  }
  function Qn(e, r, i, s) {
    return o ? L(23, 1, e, r, i, s) : 70;
  }
  var sa = [null, [], []];
  function Zn(e, r, i, s) {
    if (o) return L(24, 1, e, r, i, s);
    r >>>= 0, i >>>= 0, s >>>= 0;
    for (var f = 0, p = 0; p < i; p++) {
      var E = (w(), W)[r >>> 2 >>> 0], S = (w(), W)[r + 4 >>> 2 >>> 0];
      r += 8;
      for (var x = 0; x < S; x++) {
        var R = e, X = (w(), ne)[E + x >>> 0], le = sa[R];
        X === 0 || X === 10 ? ((R === 1 ? O : N)(An(le)), le.length = 0) : le.push(X);
      }
      f += S;
    }
    return (w(), W)[s >>> 2 >>> 0] = f, 0;
  }
  function ia(e) {
    return e >>> 0;
  }
  o || (function() {
    for (var e = t.numThreads - 1; e--; ) yn();
    Ve.push(async () => {
      var r = (async function() {
        if (!o) return Promise.all(ce.map(bn));
      })();
      Re++, await r, --Re == 0 && te && (r = te, te = null, r());
    });
  })(), o || (ge = new WebAssembly.Memory({ initial: 256, maximum: 65536, shared: true }), ee()), t.wasmBinary && (g = t.wasmBinary), t.stackSave = () => U(), t.stackRestore = (e) => P(e), t.stackAlloc = (e) => jt(e), t.setValue = function(e, r, i = "i8") {
    switch (i.endsWith("*") && (i = "*"), i) {
      case "i1":
      case "i8":
        (w(), j)[e >>> 0] = r;
        break;
      case "i16":
        (w(), pe)[e >>> 1 >>> 0] = r;
        break;
      case "i32":
        (w(), B)[e >>> 2 >>> 0] = r;
        break;
      case "i64":
        (w(), A)[e >>> 3 >>> 0] = BigInt(r);
        break;
      case "float":
        (w(), re)[e >>> 2 >>> 0] = r;
        break;
      case "double":
        (w(), me)[e >>> 3 >>> 0] = r;
        break;
      case "*":
        (w(), W)[e >>> 2 >>> 0] = r;
        break;
      default:
        H(`invalid type for setValue: ${i}`);
    }
  }, t.getValue = function(e, r = "i8") {
    switch (r.endsWith("*") && (r = "*"), r) {
      case "i1":
      case "i8":
        return (w(), j)[e >>> 0];
      case "i16":
        return (w(), pe)[e >>> 1 >>> 0];
      case "i32":
        return (w(), B)[e >>> 2 >>> 0];
      case "i64":
        return (w(), A)[e >>> 3 >>> 0];
      case "float":
        return (w(), re)[e >>> 2 >>> 0];
      case "double":
        return (w(), me)[e >>> 3 >>> 0];
      case "*":
        return (w(), W)[e >>> 2 >>> 0];
      default:
        H(`invalid type for getValue: ${r}`);
    }
  }, t.UTF8ToString = Mt, t.stringToUTF8 = Ae, t.lengthBytesUTF8 = Wt;
  var st, Kn, er, zt, tr, nr, rr, Ht, or, ar, C, Je, sr, P, jt, U, ir, Vt, ur, fr, cr, Ee, ua = [V, fe, Sn, In, Bn, Ln, _n, Pn, Dn, Un, xn, Cn, Mn, Rn, Nn, Fn, $n, zn, Hn, Yn, Jn, qn, Xn, Qn, Zn], lr = { 960468: (e, r, i, s, f) => {
    if (t === void 0 || !t.Rb) return 1;
    if ((e = Mt(Number(e >>> 0))).startsWith("./") && (e = e.substring(2)), !(e = t.Rb.get(e))) return 2;
    if (r = Number(r >>> 0), i = Number(i >>> 0), s = Number(s >>> 0), r + i > e.byteLength) return 3;
    try {
      let p = e.subarray(r, r + i);
      switch (f) {
        case 0:
          (w(), ne).set(p, s >>> 0);
          break;
        case 1:
          t.fc ? t.fc(s, p) : t.ic(s, p);
          break;
        default:
          return 4;
      }
      return 0;
    } catch {
      return 4;
    }
  }, 961292: () => typeof wasmOffsetConverter < "u" };
  function fa() {
    return typeof wasmOffsetConverter < "u";
  }
  function ca(e, r, i, s) {
    var f = U();
    try {
      return M(e)(r, i, s);
    } catch (p) {
      if (P(f), p !== p + 0) throw p;
      C(1, 0);
    }
  }
  function la(e, r, i) {
    var s = U();
    try {
      return M(e)(r, i);
    } catch (f) {
      if (P(s), f !== f + 0) throw f;
      C(1, 0);
    }
  }
  function da(e) {
    var r = U();
    try {
      M(e)();
    } catch (i) {
      if (P(r), i !== i + 0) throw i;
      C(1, 0);
    }
  }
  function pa(e, r) {
    var i = U();
    try {
      return M(e)(r);
    } catch (s) {
      if (P(i), s !== s + 0) throw s;
      C(1, 0);
    }
  }
  function ma(e, r, i) {
    var s = U();
    try {
      M(e)(r, i);
    } catch (f) {
      if (P(s), f !== f + 0) throw f;
      C(1, 0);
    }
  }
  function ha(e, r) {
    var i = U();
    try {
      M(e)(r);
    } catch (s) {
      if (P(i), s !== s + 0) throw s;
      C(1, 0);
    }
  }
  function wa(e, r, i, s, f, p, E) {
    var S = U();
    try {
      return M(e)(r, i, s, f, p, E);
    } catch (x) {
      if (P(S), x !== x + 0) throw x;
      C(1, 0);
    }
  }
  function ba(e, r, i, s, f, p) {
    var E = U();
    try {
      M(e)(r, i, s, f, p);
    } catch (S) {
      if (P(E), S !== S + 0) throw S;
      C(1, 0);
    }
  }
  function ya(e, r, i, s) {
    var f = U();
    try {
      M(e)(r, i, s);
    } catch (p) {
      if (P(f), p !== p + 0) throw p;
      C(1, 0);
    }
  }
  function ga(e, r, i, s, f) {
    var p = U();
    try {
      M(e)(r, i, s, f);
    } catch (E) {
      if (P(p), E !== E + 0) throw E;
      C(1, 0);
    }
  }
  function Ea(e, r, i, s, f, p, E) {
    var S = U();
    try {
      M(e)(r, i, s, f, p, E);
    } catch (x) {
      if (P(S), x !== x + 0) throw x;
      C(1, 0);
    }
  }
  function Ta(e, r, i, s, f, p, E) {
    var S = U();
    try {
      M(e)(r, i, s, f, p, E);
    } catch (x) {
      if (P(S), x !== x + 0) throw x;
      C(1, 0);
    }
  }
  function Sa(e, r, i, s, f, p, E, S) {
    var x = U();
    try {
      M(e)(r, i, s, f, p, E, S);
    } catch (R) {
      if (P(x), R !== R + 0) throw R;
      C(1, 0);
    }
  }
  function va(e, r, i, s, f) {
    var p = U();
    try {
      return M(e)(r, i, s, f);
    } catch (E) {
      if (P(p), E !== E + 0) throw E;
      C(1, 0);
    }
  }
  function Oa(e, r, i) {
    var s = U();
    try {
      return M(e)(r, i);
    } catch (f) {
      if (P(s), f !== f + 0) throw f;
      C(1, 0);
    }
  }
  function Aa(e, r, i, s, f, p, E, S) {
    var x = U();
    try {
      M(e)(r, i, s, f, p, E, S);
    } catch (R) {
      if (P(x), R !== R + 0) throw R;
      C(1, 0);
    }
  }
  function Ia(e, r, i, s, f, p, E, S, x, R, X, le) {
    var we = U();
    try {
      M(e)(r, i, s, f, p, E, S, x, R, X, le);
    } catch (be) {
      if (P(we), be !== be + 0) throw be;
      C(1, 0);
    }
  }
  function Ba(e, r, i, s, f, p) {
    var E = U();
    try {
      return M(e)(r, i, s, f, p);
    } catch (S) {
      if (P(E), S !== S + 0) throw S;
      C(1, 0);
    }
  }
  function La(e, r, i) {
    var s = U();
    try {
      return M(e)(r, i);
    } catch (f) {
      if (P(s), f !== f + 0) throw f;
      return C(1, 0), 0n;
    }
  }
  function _a(e, r, i, s, f, p, E, S, x) {
    var R = U();
    try {
      M(e)(r, i, s, f, p, E, S, x);
    } catch (X) {
      if (P(R), X !== X + 0) throw X;
      C(1, 0);
    }
  }
  function Pa(e) {
    var r = U();
    try {
      return M(e)();
    } catch (i) {
      if (P(r), i !== i + 0) throw i;
      C(1, 0);
    }
  }
  function Da(e, r) {
    var i = U();
    try {
      return M(e)(r);
    } catch (s) {
      if (P(i), s !== s + 0) throw s;
      return C(1, 0), 0n;
    }
  }
  function Ua(e) {
    var r = U();
    try {
      return M(e)();
    } catch (i) {
      if (P(r), i !== i + 0) throw i;
      return C(1, 0), 0n;
    }
  }
  function xa(e, r, i, s) {
    var f = U();
    try {
      return M(e)(r, i, s);
    } catch (p) {
      if (P(f), p !== p + 0) throw p;
      C(1, 0);
    }
  }
  function Ca(e, r, i, s, f) {
    var p = U();
    try {
      return M(e)(r, i, s, f);
    } catch (E) {
      if (P(p), E !== E + 0) throw E;
      C(1, 0);
    }
  }
  function Ma(e, r, i, s, f, p) {
    var E = U();
    try {
      return M(e)(r, i, s, f, p);
    } catch (S) {
      if (P(E), S !== S + 0) throw S;
      C(1, 0);
    }
  }
  function Ra(e, r, i, s, f, p) {
    var E = U();
    try {
      return M(e)(r, i, s, f, p);
    } catch (S) {
      if (P(E), S !== S + 0) throw S;
      C(1, 0);
    }
  }
  function Na(e, r, i, s, f, p, E, S) {
    var x = U();
    try {
      return M(e)(r, i, s, f, p, E, S);
    } catch (R) {
      if (P(x), R !== R + 0) throw R;
      C(1, 0);
    }
  }
  function Fa(e, r, i, s, f) {
    var p = U();
    try {
      return M(e)(r, i, s, f);
    } catch (E) {
      if (P(p), E !== E + 0) throw E;
      return C(1, 0), 0n;
    }
  }
  function ka(e, r, i, s) {
    var f = U();
    try {
      return M(e)(r, i, s);
    } catch (p) {
      if (P(f), p !== p + 0) throw p;
      C(1, 0);
    }
  }
  function Wa(e, r, i, s) {
    var f = U();
    try {
      return M(e)(r, i, s);
    } catch (p) {
      if (P(f), p !== p + 0) throw p;
      C(1, 0);
    }
  }
  function Ga(e, r, i, s, f, p, E, S, x, R, X, le) {
    var we = U();
    try {
      return M(e)(r, i, s, f, p, E, S, x, R, X, le);
    } catch (be) {
      if (P(we), be !== be + 0) throw be;
      C(1, 0);
    }
  }
  function $a(e, r, i, s, f, p, E, S, x, R, X) {
    var le = U();
    try {
      M(e)(r, i, s, f, p, E, S, x, R, X);
    } catch (we) {
      if (P(le), we !== we + 0) throw we;
      C(1, 0);
    }
  }
  function za(e, r, i, s, f, p, E, S, x, R, X, le, we, be, Ya, Ja) {
    var qa = U();
    try {
      M(e)(r, i, s, f, p, E, S, x, R, X, le, we, be, Ya, Ja);
    } catch (Yt) {
      if (P(qa), Yt !== Yt + 0) throw Yt;
      C(1, 0);
    }
  }
  function Ha(e, r, i) {
    var s = U();
    try {
      return M(e)(r, i);
    } catch (f) {
      if (P(s), f !== f + 0) throw f;
      C(1, 0);
    }
  }
  function ja(e, r, i) {
    var s = U();
    try {
      return M(e)(r, i);
    } catch (f) {
      if (P(s), f !== f + 0) throw f;
      C(1, 0);
    }
  }
  function Va(e, r, i, s) {
    var f = U();
    try {
      M(e)(r, i, s);
    } catch (p) {
      if (P(f), p !== p + 0) throw p;
      C(1, 0);
    }
  }
  function it() {
    if (0 < Re) te = it;
    else if (o) T?.(t), he();
    else {
      for (var e = Ve; 0 < e.length; ) e.shift()(t);
      0 < Re ? te = it : (t.calledRun = true, _ || (he(), T?.(t)));
    }
  }
  return o || (Ee = await Ut(), it()), t.PTR_SIZE = 4, je ? t : new Promise((e, r) => {
    T = e, I = r;
  });
}
var rs;
var os;
var Jr = F(() => {
  "use strict";
  rs = Vr, os = globalThis.self?.name?.startsWith("em-pthread");
  os && Vr();
});
var Qr;
var an;
var as;
var oe;
var Zr;
var on;
var ss;
var is;
var Kr;
var us;
var qr;
var eo;
var Xr;
var to;
var pt = F(() => {
  "use strict";
  dt();
  Qr = typeof location > "u" ? void 0 : location.origin, an = import.meta.url > "file:" && import.meta.url < "file;", as = () => {
    if (true) {
      if (an) {
        let n = URL;
        return new URL(new n("ort.wasm.bundle.min.mjs", import.meta.url).href, Qr).href;
      }
      return import.meta.url;
    }
  }, oe = as(), Zr = () => {
    if (oe && !oe.startsWith("blob:")) return oe.substring(0, oe.lastIndexOf("/") + 1);
  }, on = (n, t) => {
    try {
      let a = t ?? oe;
      return (a ? new URL(n, a) : new URL(n)).origin === Qr;
    } catch {
      return false;
    }
  }, ss = (n, t) => {
    let a = t ?? oe;
    try {
      return (a ? new URL(n, a) : new URL(n)).href;
    } catch {
      return;
    }
  }, is = (n, t) => `${t ?? "./"}${n}`, Kr = async (n) => {
    let a = await (await fetch(n, { credentials: "same-origin" })).blob();
    return URL.createObjectURL(a);
  }, us = async (n) => (await import(
    /*webpackIgnore:true*/
    /*@vite-ignore*/
    n
  )).default, qr = (jr(), Xt(Hr)).default, eo = async () => {
    if (!oe) throw new Error("Failed to load proxy worker: cannot determine the script source URL.");
    if (on(oe)) return [void 0, qr()];
    let n = await Kr(oe);
    return [n, qr(n)];
  }, Xr = (Jr(), Xt(Yr)).default, to = async (n, t, a, u) => {
    let o = Xr && !(n || t);
    if (o) if (oe) o = on(oe) || u && !a;
    else if (u && !a) o = true;
    else throw new Error("cannot determine the script source URL.");
    if (o) return [void 0, Xr];
    {
      let d = "ort-wasm-simd-threaded.mjs", c = n ?? ss(d, t), l = a && c && !on(c, t), m = l ? await Kr(c) : c ?? is(d, t);
      return [l ? m : void 0, await us(m)];
    }
  };
});
var sn;
var un;
var St;
var no;
var fs;
var cs;
var ls;
var mt;
var $;
var xe = F(() => {
  "use strict";
  pt();
  un = false, St = false, no = false, fs = () => {
    if (typeof SharedArrayBuffer > "u") return false;
    try {
      return typeof MessageChannel < "u" && new MessageChannel().port1.postMessage(new SharedArrayBuffer(1)), WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 5, 4, 1, 3, 1, 1, 10, 11, 1, 9, 0, 65, 0, 254, 16, 2, 0, 26, 11]));
    } catch {
      return false;
    }
  }, cs = () => {
    try {
      return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 10, 30, 1, 28, 0, 65, 0, 253, 15, 253, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 253, 186, 1, 26, 11]));
    } catch {
      return false;
    }
  }, ls = () => {
    try {
      return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 19, 1, 17, 0, 65, 1, 253, 15, 65, 2, 253, 15, 65, 3, 253, 15, 253, 147, 2, 11]));
    } catch {
      return false;
    }
  }, mt = async (n) => {
    if (un) return Promise.resolve();
    if (St) throw new Error("multiple calls to 'initializeWebAssembly()' detected.");
    if (no) throw new Error("previous call to 'initializeWebAssembly()' failed.");
    St = true;
    let t = n.initTimeout, a = n.numThreads;
    if (n.simd !== false) {
      if (n.simd === "relaxed") {
        if (!ls()) throw new Error("Relaxed WebAssembly SIMD is not supported in the current environment.");
      } else if (!cs()) throw new Error("WebAssembly SIMD is not supported in the current environment.");
    }
    let u = fs();
    a > 1 && !u && (typeof self < "u" && !self.crossOriginIsolated && console.warn("env.wasm.numThreads is set to " + a + ", but this will not work unless you enable crossOriginIsolated mode. See https://web.dev/cross-origin-isolation-guide/ for more info."), console.warn("WebAssembly multi-threading is not supported in the current environment. Falling back to single-threading."), n.numThreads = a = 1);
    let o = n.wasmPaths, d = typeof o == "string" ? o : void 0, c = o?.mjs, l = c?.href ?? c, m = o?.wasm, h = m?.href ?? m, g = n.wasmBinary, [b, y] = await to(l, d, a > 1, !!g || !!h), T = false, I = [];
    if (t > 0 && I.push(new Promise((D) => {
      setTimeout(() => {
        T = true, D();
      }, t);
    })), I.push(new Promise((D, z) => {
      let v = { numThreads: a };
      if (g) v.wasmBinary = g, v.locateFile = (O) => O;
      else if (h || d) v.locateFile = (O) => h ?? d + O;
      else if (l && l.indexOf("blob:") !== 0) v.locateFile = (O) => new URL(O, l).href;
      else if (b) {
        let O = Zr();
        O && (v.locateFile = (N) => O + N);
      }
      y(v).then((O) => {
        St = false, un = true, sn = O, D(), b && URL.revokeObjectURL(b);
      }, (O) => {
        St = false, no = true, z(O);
      });
    })), await Promise.race(I), T) throw new Error(`WebAssembly backend initializing failed due to timeout: ${t}ms`);
  }, $ = () => {
    if (un && sn) return sn;
    throw new Error("WebAssembly is not initialized yet.");
  };
});
var ae;
var Ze;
var G;
var vt = F(() => {
  "use strict";
  xe();
  ae = (n, t) => {
    let a = $(), u = a.lengthBytesUTF8(n) + 1, o = a._malloc(u);
    return a.stringToUTF8(n, o, u), t.push(o), o;
  }, Ze = (n, t, a, u) => {
    if (typeof n == "object" && n !== null) {
      if (a.has(n)) throw new Error("Circular reference in options");
      a.add(n);
    }
    Object.entries(n).forEach(([o, d]) => {
      let c = t ? t + o : o;
      if (typeof d == "object") Ze(d, c + ".", a, u);
      else if (typeof d == "string" || typeof d == "number") u(c, d.toString());
      else if (typeof d == "boolean") u(c, d ? "1" : "0");
      else throw new Error(`Can't handle extra config type: ${typeof d}`);
    });
  }, G = (n) => {
    let t = $(), a = t.stackSave();
    try {
      let u = t.PTR_SIZE, o = t.stackAlloc(2 * u);
      t._OrtGetLastError(o, o + u);
      let d = Number(t.getValue(o, u === 4 ? "i32" : "i64")), c = t.getValue(o + u, "*"), l = c ? t.UTF8ToString(c) : "";
      throw new Error(`${n} ERROR_CODE: ${d}, ERROR_MESSAGE: ${l}`);
    } finally {
      t.stackRestore(a);
    }
  };
});
var ro;
var oo = F(() => {
  "use strict";
  xe();
  vt();
  ro = (n) => {
    let t = $(), a = 0, u = [], o = n || {};
    try {
      if (n?.logSeverityLevel === void 0) o.logSeverityLevel = 2;
      else if (typeof n.logSeverityLevel != "number" || !Number.isInteger(n.logSeverityLevel) || n.logSeverityLevel < 0 || n.logSeverityLevel > 4) throw new Error(`log severity level is not valid: ${n.logSeverityLevel}`);
      if (n?.logVerbosityLevel === void 0) o.logVerbosityLevel = 0;
      else if (typeof n.logVerbosityLevel != "number" || !Number.isInteger(n.logVerbosityLevel)) throw new Error(`log verbosity level is not valid: ${n.logVerbosityLevel}`);
      n?.terminate === void 0 && (o.terminate = false);
      let d = 0;
      return n?.tag !== void 0 && (d = ae(n.tag, u)), a = t._OrtCreateRunOptions(o.logSeverityLevel, o.logVerbosityLevel, !!o.terminate, d), a === 0 && G("Can't create run options."), n?.extra !== void 0 && Ze(n.extra, "", /* @__PURE__ */ new WeakSet(), (c, l) => {
        let m = ae(c, u), h = ae(l, u);
        t._OrtAddRunConfigEntry(a, m, h) !== 0 && G(`Can't set a run config entry: ${c} - ${l}.`);
      }), [a, u];
    } catch (d) {
      throw a !== 0 && t._OrtReleaseRunOptions(a), u.forEach((c) => t._free(c)), d;
    }
  };
});
var ds;
var ps;
var ms;
var ke;
var hs;
var ao;
var so = F(() => {
  "use strict";
  xe();
  vt();
  ds = (n) => {
    switch (n) {
      case "disabled":
        return 0;
      case "basic":
        return 1;
      case "extended":
        return 2;
      case "layout":
        return 3;
      case "all":
        return 99;
      default:
        throw new Error(`unsupported graph optimization level: ${n}`);
    }
  }, ps = (n) => {
    switch (n) {
      case "sequential":
        return 0;
      case "parallel":
        return 1;
      default:
        throw new Error(`unsupported execution mode: ${n}`);
    }
  }, ms = (n) => {
    n.extra || (n.extra = {}), n.extra.session || (n.extra.session = {});
    let t = n.extra.session;
    t.use_ort_model_bytes_directly || (t.use_ort_model_bytes_directly = "1"), n.executionProviders && n.executionProviders.some((a) => (typeof a == "string" ? a : a.name) === "webgpu") && (n.enableMemPattern = false);
  }, ke = (n, t, a, u) => {
    let o = ae(t, u), d = ae(a, u);
    $()._OrtAddSessionConfigEntry(n, o, d) !== 0 && G(`Can't set a session config entry: ${t} - ${a}.`);
  }, hs = async (n, t, a) => {
    let u = t.executionProviders;
    for (let o of u) {
      let d = typeof o == "string" ? o : o.name, c = [];
      switch (d) {
        case "webnn":
          if (d = "WEBNN", ke(n, "session.disable_quant_qdq", "1", a), ke(n, "session.disable_qdq_constant_folding", "1", a), typeof o != "string") {
            let y = o?.deviceType;
            y && ke(n, "deviceType", y, a);
          }
          break;
        case "webgpu":
          if (d = "JS", typeof o != "string") {
            let b = o;
            if (b?.preferredLayout) {
              if (b.preferredLayout !== "NCHW" && b.preferredLayout !== "NHWC") throw new Error(`preferredLayout must be either 'NCHW' or 'NHWC': ${b.preferredLayout}`);
              ke(n, "preferredLayout", b.preferredLayout, a);
            }
          }
          break;
        case "wasm":
        case "cpu":
          continue;
        default:
          throw new Error(`not supported execution provider: ${d}`);
      }
      let l = ae(d, a), m = c.length, h = 0, g = 0;
      if (m > 0) {
        h = $()._malloc(m * $().PTR_SIZE), a.push(h), g = $()._malloc(m * $().PTR_SIZE), a.push(g);
        for (let b = 0; b < m; b++) $().setValue(h + b * $().PTR_SIZE, c[b][0], "*"), $().setValue(g + b * $().PTR_SIZE, c[b][1], "*");
      }
      await $()._OrtAppendExecutionProvider(n, l, h, g, m) !== 0 && G(`Can't append execution provider: ${d}.`);
    }
  }, ao = async (n) => {
    let t = $(), a = 0, u = [], o = n || {};
    ms(o);
    try {
      let d = ds(o.graphOptimizationLevel ?? "all"), c = ps(o.executionMode ?? "sequential"), l = typeof o.logId == "string" ? ae(o.logId, u) : 0, m = o.logSeverityLevel ?? 2;
      if (!Number.isInteger(m) || m < 0 || m > 4) throw new Error(`log severity level is not valid: ${m}`);
      let h = o.logVerbosityLevel ?? 0;
      if (!Number.isInteger(h) || h < 0 || h > 4) throw new Error(`log verbosity level is not valid: ${h}`);
      let g = typeof o.optimizedModelFilePath == "string" ? ae(o.optimizedModelFilePath, u) : 0;
      if (a = t._OrtCreateSessionOptions(d, !!o.enableCpuMemArena, !!o.enableMemPattern, c, !!o.enableProfiling, 0, l, m, h, g), a === 0 && G("Can't create session options."), o.executionProviders && await hs(a, o, u), o.enableGraphCapture !== void 0) {
        if (typeof o.enableGraphCapture != "boolean") throw new Error(`enableGraphCapture must be a boolean value: ${o.enableGraphCapture}`);
        ke(a, "enableGraphCapture", o.enableGraphCapture.toString(), u);
      }
      if (o.freeDimensionOverrides) for (let [b, y] of Object.entries(o.freeDimensionOverrides)) {
        if (typeof b != "string") throw new Error(`free dimension override name must be a string: ${b}`);
        if (typeof y != "number" || !Number.isInteger(y) || y < 0) throw new Error(`free dimension override value must be a non-negative integer: ${y}`);
        let T = ae(b, u);
        t._OrtAddFreeDimensionOverride(a, T, y) !== 0 && G(`Can't set a free dimension override: ${b} - ${y}.`);
      }
      return o.extra !== void 0 && Ze(o.extra, "", /* @__PURE__ */ new WeakSet(), (b, y) => {
        ke(a, b, y, u);
      }), [a, u];
    } catch (d) {
      throw a !== 0 && t._OrtReleaseSessionOptions(a) !== 0 && G("Can't release session options."), u.forEach((c) => t._free(c)), d;
    }
  };
});
var We;
var Ot;
var Ge;
var io;
var uo;
var At;
var It;
var fo;
var fn = F(() => {
  "use strict";
  We = (n) => {
    switch (n) {
      case "int8":
        return 3;
      case "uint8":
        return 2;
      case "bool":
        return 9;
      case "int16":
        return 5;
      case "uint16":
        return 4;
      case "int32":
        return 6;
      case "uint32":
        return 12;
      case "float16":
        return 10;
      case "float32":
        return 1;
      case "float64":
        return 11;
      case "string":
        return 8;
      case "int64":
        return 7;
      case "uint64":
        return 13;
      case "int4":
        return 22;
      case "uint4":
        return 21;
      default:
        throw new Error(`unsupported data type: ${n}`);
    }
  }, Ot = (n) => {
    switch (n) {
      case 3:
        return "int8";
      case 2:
        return "uint8";
      case 9:
        return "bool";
      case 5:
        return "int16";
      case 4:
        return "uint16";
      case 6:
        return "int32";
      case 12:
        return "uint32";
      case 10:
        return "float16";
      case 1:
        return "float32";
      case 11:
        return "float64";
      case 8:
        return "string";
      case 7:
        return "int64";
      case 13:
        return "uint64";
      case 22:
        return "int4";
      case 21:
        return "uint4";
      default:
        throw new Error(`unsupported data type: ${n}`);
    }
  }, Ge = (n, t) => {
    let a = [-1, 4, 1, 1, 2, 2, 4, 8, -1, 1, 2, 8, 4, 8, -1, -1, -1, -1, -1, -1, -1, 0.5, 0.5][n], u = typeof t == "number" ? t : t.reduce((o, d) => o * d, 1);
    return a > 0 ? Math.ceil(u * a) : void 0;
  }, io = (n) => {
    switch (n) {
      case "float16":
        return typeof Float16Array < "u" ? Float16Array : Uint16Array;
      case "float32":
        return Float32Array;
      case "uint8":
        return Uint8Array;
      case "int8":
        return Int8Array;
      case "uint16":
        return Uint16Array;
      case "int16":
        return Int16Array;
      case "int32":
        return Int32Array;
      case "bool":
        return Uint8Array;
      case "float64":
        return Float64Array;
      case "uint32":
        return Uint32Array;
      case "int64":
        return BigInt64Array;
      case "uint64":
        return BigUint64Array;
      default:
        throw new Error(`unsupported type: ${n}`);
    }
  }, uo = (n) => {
    switch (n) {
      case "verbose":
        return 0;
      case "info":
        return 1;
      case "warning":
        return 2;
      case "error":
        return 3;
      case "fatal":
        return 4;
      default:
        throw new Error(`unsupported logging level: ${n}`);
    }
  }, At = (n) => n === "float32" || n === "float16" || n === "int32" || n === "int64" || n === "uint32" || n === "uint8" || n === "bool" || n === "uint4" || n === "int4", It = (n) => n === "float32" || n === "float16" || n === "int32" || n === "int64" || n === "uint32" || n === "uint64" || n === "int8" || n === "uint8" || n === "bool" || n === "uint4" || n === "int4", fo = (n) => {
    switch (n) {
      case "none":
        return 0;
      case "cpu":
        return 1;
      case "cpu-pinned":
        return 2;
      case "texture":
        return 3;
      case "gpu-buffer":
        return 4;
      case "ml-tensor":
        return 5;
      default:
        throw new Error(`unsupported data location: ${n}`);
    }
  };
});
var Ke;
var cn = F(() => {
  "use strict";
  dt();
  Ke = async (n) => {
    if (typeof n == "string") if (false) try {
      let { readFile: t } = qt("node:fs/promises");
      return new Uint8Array(await t(n));
    } catch (t) {
      if (t.code === "ERR_FS_FILE_TOO_LARGE") {
        let { createReadStream: a } = qt("node:fs"), u = a(n), o = [];
        for await (let d of u) o.push(d);
        return new Uint8Array(Buffer.concat(o));
      }
      throw t;
    }
    else {
      let t = await fetch(n);
      if (!t.ok) throw new Error(`failed to load external data file: ${n}`);
      let a = t.headers.get("Content-Length"), u = a ? parseInt(a, 10) : 0;
      if (u < 1073741824) return new Uint8Array(await t.arrayBuffer());
      {
        if (!t.body) throw new Error(`failed to load external data file: ${n}, no response body.`);
        let o = t.body.getReader(), d;
        try {
          d = new ArrayBuffer(u);
        } catch (l) {
          if (l instanceof RangeError) {
            let m = Math.ceil(u / 65536);
            d = new WebAssembly.Memory({ initial: m, maximum: m }).buffer;
          } else throw l;
        }
        let c = 0;
        for (; ; ) {
          let { done: l, value: m } = await o.read();
          if (l) break;
          let h = m.byteLength;
          new Uint8Array(d, c, h).set(m), c += h;
        }
        return new Uint8Array(d, 0, u);
      }
    }
    else return n instanceof Blob ? new Uint8Array(await n.arrayBuffer()) : n instanceof Uint8Array ? n : new Uint8Array(n);
  };
});
var ws;
var ht;
var wt;
var $e;
var bs;
var co;
var Qe;
var bt;
var yt;
var lo;
var gt;
var Et;
var Tt;
var rn = F(() => {
  "use strict";
  Te();
  oo();
  so();
  fn();
  xe();
  vt();
  cn();
  ws = (n, t) => {
    $()._OrtInit(n, t) !== 0 && G("Can't initialize onnxruntime.");
  }, ht = async (n) => {
    ws(n.wasm.numThreads, uo(n.logLevel));
  }, wt = async (n, t) => {
    $().asyncInit?.();
    let a = n.webgpu.adapter;
    if (t === "webgpu") {
      if (typeof navigator > "u" || !navigator.gpu) throw new Error("WebGPU is not supported in current environment");
      if (a) {
        if (typeof a.limits != "object" || typeof a.features != "object" || typeof a.requestDevice != "function") throw new Error("Invalid GPU adapter set in `env.webgpu.adapter`. It must be a GPUAdapter object.");
      } else {
        let u = n.webgpu.powerPreference;
        if (u !== void 0 && u !== "low-power" && u !== "high-performance") throw new Error(`Invalid powerPreference setting: "${u}"`);
        let o = n.webgpu.forceFallbackAdapter;
        if (o !== void 0 && typeof o != "boolean") throw new Error(`Invalid forceFallbackAdapter setting: "${o}"`);
        if (a = await navigator.gpu.requestAdapter({ powerPreference: u, forceFallbackAdapter: o }), !a) throw new Error('Failed to get GPU adapter. You may need to enable flag "--enable-unsafe-webgpu" if you are using Chrome.');
      }
    }
    if (t === "webnn" && (typeof navigator > "u" || !navigator.ml)) throw new Error("WebNN is not supported in current environment");
  }, $e = /* @__PURE__ */ new Map(), bs = (n) => {
    let t = $(), a = t.stackSave();
    try {
      let u = t.PTR_SIZE, o = t.stackAlloc(2 * u);
      t._OrtGetInputOutputCount(n, o, o + u) !== 0 && G("Can't get session input/output count.");
      let c = u === 4 ? "i32" : "i64";
      return [Number(t.getValue(o, c)), Number(t.getValue(o + u, c))];
    } finally {
      t.stackRestore(a);
    }
  }, co = (n, t) => {
    let a = $(), u = a.stackSave(), o = 0;
    try {
      let d = a.PTR_SIZE, c = a.stackAlloc(2 * d);
      a._OrtGetInputOutputMetadata(n, t, c, c + d) !== 0 && G("Can't get session input/output metadata.");
      let m = Number(a.getValue(c, "*"));
      o = Number(a.getValue(c + d, "*"));
      let h = a.HEAP32[o / 4];
      if (h === 0) return [m, 0];
      let g = a.HEAPU32[o / 4 + 1], b = [];
      for (let y = 0; y < g; y++) {
        let T = Number(a.getValue(o + 8 + y * d, "*"));
        b.push(T !== 0 ? a.UTF8ToString(T) : Number(a.getValue(o + 8 + (y + g) * d, "*")));
      }
      return [m, h, b];
    } finally {
      a.stackRestore(u), o !== 0 && a._OrtFree(o);
    }
  }, Qe = (n) => {
    let t = $(), a = t._malloc(n.byteLength);
    if (a === 0) throw new Error(`Can't create a session. failed to allocate a buffer of size ${n.byteLength}.`);
    return t.HEAPU8.set(n, a), [a, n.byteLength];
  }, bt = async (n, t) => {
    let a, u, o = $();
    Array.isArray(n) ? [a, u] = n : n.buffer === o.HEAPU8.buffer ? [a, u] = [n.byteOffset, n.byteLength] : [a, u] = Qe(n);
    let d = 0, c = 0, l = 0, m = [], h = [], g = [];
    try {
      if ([c, m] = await ao(t), t?.externalData && o.mountExternalData) {
        let _ = [];
        for (let k of t.externalData) {
          let w = typeof k == "string" ? k : k.path;
          _.push(Ke(typeof k == "string" ? k : k.data).then((Z) => {
            o.mountExternalData(w, Z);
          }));
        }
        await Promise.all(_);
      }
      for (let _ of t?.executionProviders ?? []) if ((typeof _ == "string" ? _ : _.name) === "webnn") {
        if (o.shouldTransferToMLTensor = false, typeof _ != "string") {
          let w = _, Z = w?.context, j = w?.gpuDevice, ne = w?.deviceType, pe = w?.powerPreference;
          Z ? o.currentContext = Z : j ? o.currentContext = await o.webnnCreateMLContext(j) : o.currentContext = await o.webnnCreateMLContext({ deviceType: ne, powerPreference: pe });
        } else o.currentContext = await o.webnnCreateMLContext();
        break;
      }
      d = await o._OrtCreateSession(a, u, c), o.webgpuOnCreateSession?.(d), d === 0 && G("Can't create a session."), o.jsepOnCreateSession?.(), o.currentContext && (o.webnnRegisterMLContext(d, o.currentContext), o.currentContext = void 0, o.shouldTransferToMLTensor = true);
      let [b, y] = bs(d), T = !!t?.enableGraphCapture, I = [], D = [], z = [], v = [], O = [];
      for (let _ = 0; _ < b; _++) {
        let [k, w, Z] = co(d, _);
        k === 0 && G("Can't get an input name."), h.push(k);
        let j = o.UTF8ToString(k);
        I.push(j), z.push(w === 0 ? { name: j, isTensor: false } : { name: j, isTensor: true, type: Ot(w), shape: Z });
      }
      for (let _ = 0; _ < y; _++) {
        let [k, w, Z] = co(d, _ + b);
        k === 0 && G("Can't get an output name."), g.push(k);
        let j = o.UTF8ToString(k);
        D.push(j), v.push(w === 0 ? { name: j, isTensor: false } : { name: j, isTensor: true, type: Ot(w), shape: Z });
      }
      return $e.set(d, [d, h, g, null, T, false]), [d, I, D, z, v];
    } catch (b) {
      throw h.forEach((y) => o._OrtFree(y)), g.forEach((y) => o._OrtFree(y)), l !== 0 && o._OrtReleaseBinding(l) !== 0 && G("Can't release IO binding."), d !== 0 && o._OrtReleaseSession(d) !== 0 && G("Can't release session."), b;
    } finally {
      o._free(a), c !== 0 && o._OrtReleaseSessionOptions(c) !== 0 && G("Can't release session options."), m.forEach((b) => o._free(b)), o.unmountExternalData?.();
    }
  }, yt = (n) => {
    let t = $(), a = $e.get(n);
    if (!a) throw new Error(`cannot release session. invalid session id: ${n}`);
    let [u, o, d, c, l] = a;
    c && (l && t._OrtClearBoundOutputs(c.handle) !== 0 && G("Can't clear bound outputs."), t._OrtReleaseBinding(c.handle) !== 0 && G("Can't release IO binding.")), t.jsepOnReleaseSession?.(n), t.webnnOnReleaseSession?.(n), t.webgpuOnReleaseSession?.(n), o.forEach((m) => t._OrtFree(m)), d.forEach((m) => t._OrtFree(m)), t._OrtReleaseSession(u) !== 0 && G("Can't release session."), $e.delete(n);
  }, lo = async (n, t, a, u, o, d, c = false) => {
    if (!n) {
      t.push(0);
      return;
    }
    let l = $(), m = l.PTR_SIZE, h = n[0], g = n[1], b = n[3], y = b, T, I;
    if (h === "string" && (b === "gpu-buffer" || b === "ml-tensor")) throw new Error("String tensor is not supported on GPU.");
    if (c && b !== "gpu-buffer") throw new Error(`External buffer must be provided for input/output index ${d} when enableGraphCapture is true.`);
    if (b === "gpu-buffer") {
      let v = n[2].gpuBuffer;
      I = Ge(We(h), g);
      {
        let O = l.jsepRegisterBuffer;
        if (!O) throw new Error('Tensor location "gpu-buffer" is not supported without using WebGPU.');
        T = O(u, d, v, I);
      }
    } else if (b === "ml-tensor") {
      let v = n[2].mlTensor;
      I = Ge(We(h), g);
      let O = l.webnnRegisterMLTensor;
      if (!O) throw new Error('Tensor location "ml-tensor" is not supported without using WebNN.');
      T = O(u, v, We(h), g);
    } else {
      let v = n[2];
      if (Array.isArray(v)) {
        I = m * v.length, T = l._malloc(I), a.push(T);
        for (let O = 0; O < v.length; O++) {
          if (typeof v[O] != "string") throw new TypeError(`tensor data at index ${O} is not a string`);
          l.setValue(T + O * m, ae(v[O], a), "*");
        }
      } else {
        let O = l.webnnIsGraphInput, N = l.webnnIsGraphOutput;
        if (h !== "string" && O && N) {
          let _ = l.UTF8ToString(o);
          if (O(u, _) || N(u, _)) {
            let k = We(h);
            I = Ge(k, g), y = "ml-tensor";
            let w = l.webnnCreateTemporaryTensor, Z = l.webnnUploadTensor;
            if (!w || !Z) throw new Error('Tensor location "ml-tensor" is not supported without using WebNN.');
            let j = await w(u, k, g);
            Z(j, new Uint8Array(v.buffer, v.byteOffset, v.byteLength)), T = j;
          } else I = v.byteLength, T = l._malloc(I), a.push(T), l.HEAPU8.set(new Uint8Array(v.buffer, v.byteOffset, I), T);
        } else I = v.byteLength, T = l._malloc(I), a.push(T), l.HEAPU8.set(new Uint8Array(v.buffer, v.byteOffset, I), T);
      }
    }
    let D = l.stackSave(), z = l.stackAlloc(4 * g.length);
    try {
      g.forEach((O, N) => l.setValue(z + N * m, O, m === 4 ? "i32" : "i64"));
      let v = l._OrtCreateTensor(We(h), T, I, z, g.length, fo(y));
      v === 0 && G(`Can't create tensor for input/output. session=${u}, index=${d}.`), t.push(v);
    } finally {
      l.stackRestore(D);
    }
  }, gt = async (n, t, a, u, o, d) => {
    let c = $(), l = c.PTR_SIZE, m = $e.get(n);
    if (!m) throw new Error(`cannot run inference. invalid session id: ${n}`);
    let h = m[0], g = m[1], b = m[2], y = m[3], T = m[4], I = m[5], D = t.length, z = u.length, v = 0, O = [], N = [], _ = [], k = [], w = [], Z = c.stackSave(), j = c.stackAlloc(D * l), ne = c.stackAlloc(D * l), pe = c.stackAlloc(z * l), B = c.stackAlloc(z * l);
    try {
      [v, O] = ro(d), De("wasm prepareInputOutputTensor");
      for (let A = 0; A < D; A++) await lo(a[A], N, k, n, g[t[A]], t[A], T);
      for (let A = 0; A < z; A++) await lo(o[A], _, k, n, b[u[A]], D + u[A], T);
      Ue("wasm prepareInputOutputTensor");
      for (let A = 0; A < D; A++) c.setValue(j + A * l, N[A], "*"), c.setValue(ne + A * l, g[t[A]], "*");
      for (let A = 0; A < z; A++) c.setValue(pe + A * l, _[A], "*"), c.setValue(B + A * l, b[u[A]], "*");
      c.jsepOnRunStart?.(h), c.webnnOnRunStart?.(h);
      let W;
      W = await c._OrtRun(h, ne, j, D, B, z, pe, v), W !== 0 && G("failed to call OrtRun().");
      let re = [], me = [];
      De("wasm ProcessOutputTensor");
      for (let A = 0; A < z; A++) {
        let K = Number(c.getValue(pe + A * l, "*"));
        if (K === _[A] || w.includes(_[A])) {
          re.push(o[A]), K !== _[A] && c._OrtReleaseTensor(K) !== 0 && G("Can't release tensor.");
          continue;
        }
        let je = c.stackSave(), ee = c.stackAlloc(4 * l), he = false, H, q = 0;
        try {
          c._OrtGetTensorData(K, ee, ee + l, ee + 2 * l, ee + 3 * l) !== 0 && G(`Can't access output tensor data on index ${A}.`);
          let Se = l === 4 ? "i32" : "i64", ve = Number(c.getValue(ee, Se));
          q = c.getValue(ee + l, "*");
          let Ve = c.getValue(ee + l * 2, "*"), Re = Number(c.getValue(ee + l * 3, Se)), te = [];
          for (let L = 0; L < Re; L++) te.push(Number(c.getValue(Ve + L * l, Se)));
          c._OrtFree(Ve) !== 0 && G("Can't free memory for tensor dims.");
          let ue = te.reduce((L, V) => L * V, 1);
          H = Ot(ve);
          let se = y?.outputPreferredLocations[u[A]];
          if (H === "string") {
            if (se === "gpu-buffer" || se === "ml-tensor") throw new Error("String tensor is not supported on GPU.");
            let L = [];
            for (let V = 0; V < ue; V++) {
              let fe = c.getValue(q + V * l, "*"), ye = c.getValue(q + (V + 1) * l, "*"), ce = V === ue - 1 ? void 0 : ye - fe;
              L.push(c.UTF8ToString(fe, ce));
            }
            re.push([H, te, L, "cpu"]);
          } else if (se === "gpu-buffer" && ue > 0) {
            let L = c.jsepGetBuffer;
            if (!L) throw new Error('preferredLocation "gpu-buffer" is not supported without using WebGPU.');
            let V = L(q), fe = Ge(ve, ue);
            if (fe === void 0 || !At(H)) throw new Error(`Unsupported data type: ${H}`);
            he = true, re.push([H, te, { gpuBuffer: V, download: c.jsepCreateDownloader(V, fe, H), dispose: () => {
              c._OrtReleaseTensor(K) !== 0 && G("Can't release tensor.");
            } }, "gpu-buffer"]);
          } else if (se === "ml-tensor" && ue > 0) {
            let L = c.webnnEnsureTensor, V = c.webnnIsGraphInputOutputTypeSupported;
            if (!L || !V) throw new Error('preferredLocation "ml-tensor" is not supported without using WebNN.');
            if (Ge(ve, ue) === void 0 || !It(H)) throw new Error(`Unsupported data type: ${H}`);
            if (!V(n, H, false)) throw new Error(`preferredLocation "ml-tensor" for ${H} output is not supported by current WebNN Context.`);
            let ye = await L(n, q, ve, te, false);
            he = true, re.push([H, te, { mlTensor: ye, download: c.webnnCreateMLTensorDownloader(q, H), dispose: () => {
              c.webnnReleaseTensorId(q), c._OrtReleaseTensor(K);
            } }, "ml-tensor"]);
          } else if (se === "ml-tensor-cpu-output" && ue > 0) {
            let L = c.webnnCreateMLTensorDownloader(q, H)(), V = re.length;
            he = true, me.push((async () => {
              let fe = [V, await L];
              return c.webnnReleaseTensorId(q), c._OrtReleaseTensor(K), fe;
            })()), re.push([H, te, [], "cpu"]);
          } else {
            let L = io(H), V = new L(ue);
            new Uint8Array(V.buffer, V.byteOffset, V.byteLength).set(c.HEAPU8.subarray(q, q + V.byteLength)), re.push([H, te, V, "cpu"]);
          }
        } finally {
          c.stackRestore(je), H === "string" && q && c._free(q), he || c._OrtReleaseTensor(K);
        }
      }
      y && !T && (c._OrtClearBoundOutputs(y.handle) !== 0 && G("Can't clear bound outputs."), $e.set(n, [h, g, b, y, T, false]));
      for (let [A, K] of await Promise.all(me)) re[A][2] = K;
      return Ue("wasm ProcessOutputTensor"), re;
    } finally {
      c.webnnOnRunEnd?.(h), c.stackRestore(Z), N.forEach((W) => c._OrtReleaseTensor(W)), _.forEach((W) => c._OrtReleaseTensor(W)), k.forEach((W) => c._free(W)), v !== 0 && c._OrtReleaseRunOptions(v), O.forEach((W) => c._free(W));
    }
  }, Et = (n) => {
    let t = $(), a = $e.get(n);
    if (!a) throw new Error("invalid session id");
    let u = a[0], o = t._OrtEndProfiling(u);
    o === 0 && G("Can't get an profile file name."), t._OrtFree(o);
  }, Tt = (n) => {
    let t = [];
    for (let a of n) {
      let u = a[2];
      !Array.isArray(u) && "buffer" in u && t.push(u.buffer);
    }
    return t;
  };
});
var Me;
var ie;
var et;
var Lt;
var _t;
var Bt;
var ln;
var dn;
var ze;
var He;
var gs;
var po;
var mo;
var ho;
var wo;
var bo;
var yo;
var go;
var pn = F(() => {
  "use strict";
  Te();
  rn();
  xe();
  pt();
  Me = () => !!Y.wasm.proxy && typeof document < "u", et = false, Lt = false, _t = false, dn = /* @__PURE__ */ new Map(), ze = (n, t) => {
    let a = dn.get(n);
    a ? a.push(t) : dn.set(n, [t]);
  }, He = () => {
    if (et || !Lt || _t || !ie) throw new Error("worker not ready");
  }, gs = (n) => {
    switch (n.data.type) {
      case "init-wasm":
        et = false, n.data.err ? (_t = true, ln[1](n.data.err)) : (Lt = true, ln[0]()), Bt && (URL.revokeObjectURL(Bt), Bt = void 0);
        break;
      case "init-ep":
      case "copy-from":
      case "create":
      case "release":
      case "run":
      case "end-profiling": {
        let t = dn.get(n.data.type);
        n.data.err ? t.shift()[1](n.data.err) : t.shift()[0](n.data.out);
        break;
      }
      default:
    }
  }, po = async () => {
    if (!Lt) {
      if (et) throw new Error("multiple calls to 'initWasm()' detected.");
      if (_t) throw new Error("previous call to 'initWasm()' failed.");
      if (et = true, Me()) return new Promise((n, t) => {
        ie?.terminate(), eo().then(([a, u]) => {
          try {
            ie = u, ie.onerror = (d) => t(d), ie.onmessage = gs, ln = [n, t];
            let o = { type: "init-wasm", in: Y };
            !o.in.wasm.wasmPaths && (a || an) && (o.in.wasm.wasmPaths = { wasm: new URL("ort-wasm-simd-threaded.wasm", import.meta.url).href }), ie.postMessage(o), Bt = a;
          } catch (o) {
            t(o);
          }
        }, t);
      });
      try {
        await mt(Y.wasm), await ht(Y), Lt = true;
      } catch (n) {
        throw _t = true, n;
      } finally {
        et = false;
      }
    }
  }, mo = async (n) => {
    if (Me()) return He(), new Promise((t, a) => {
      ze("init-ep", [t, a]);
      let u = { type: "init-ep", in: { epName: n, env: Y } };
      ie.postMessage(u);
    });
    await wt(Y, n);
  }, ho = async (n) => Me() ? (He(), new Promise((t, a) => {
    ze("copy-from", [t, a]);
    let u = { type: "copy-from", in: { buffer: n } };
    ie.postMessage(u, [n.buffer]);
  })) : Qe(n), wo = async (n, t) => {
    if (Me()) {
      if (t?.preferredOutputLocation) throw new Error('session option "preferredOutputLocation" is not supported for proxy.');
      return He(), new Promise((a, u) => {
        ze("create", [a, u]);
        let o = { type: "create", in: { model: n, options: { ...t } } }, d = [];
        n instanceof Uint8Array && d.push(n.buffer), ie.postMessage(o, d);
      });
    } else return bt(n, t);
  }, bo = async (n) => {
    if (Me()) return He(), new Promise((t, a) => {
      ze("release", [t, a]);
      let u = { type: "release", in: n };
      ie.postMessage(u);
    });
    yt(n);
  }, yo = async (n, t, a, u, o, d) => {
    if (Me()) {
      if (a.some((c) => c[3] !== "cpu")) throw new Error("input tensor on GPU is not supported for proxy.");
      if (o.some((c) => c)) throw new Error("pre-allocated output tensor is not supported for proxy.");
      return He(), new Promise((c, l) => {
        ze("run", [c, l]);
        let m = a, h = { type: "run", in: { sessionId: n, inputIndices: t, inputs: m, outputIndices: u, options: d } };
        ie.postMessage(h, Tt(m));
      });
    } else return gt(n, t, a, u, o, d);
  }, go = async (n) => {
    if (Me()) return He(), new Promise((t, a) => {
      ze("end-profiling", [t, a]);
      let u = { type: "end-profiling", in: n };
      ie.postMessage(u);
    });
    Et(n);
  };
});
var Eo;
var Es;
var Pt;
var To = F(() => {
  "use strict";
  Te();
  pn();
  fn();
  dt();
  cn();
  Eo = (n, t) => {
    switch (n.location) {
      case "cpu":
        return [n.type, n.dims, n.data, "cpu"];
      case "gpu-buffer":
        return [n.type, n.dims, { gpuBuffer: n.gpuBuffer }, "gpu-buffer"];
      case "ml-tensor":
        return [n.type, n.dims, { mlTensor: n.mlTensor }, "ml-tensor"];
      default:
        throw new Error(`invalid data location: ${n.location} for ${t()}`);
    }
  }, Es = (n) => {
    switch (n[3]) {
      case "cpu":
        return new de(n[0], n[2], n[1]);
      case "gpu-buffer": {
        let t = n[0];
        if (!At(t)) throw new Error(`not supported data type: ${t} for deserializing GPU tensor`);
        let { gpuBuffer: a, download: u, dispose: o } = n[2];
        return de.fromGpuBuffer(a, { dataType: t, dims: n[1], download: u, dispose: o });
      }
      case "ml-tensor": {
        let t = n[0];
        if (!It(t)) throw new Error(`not supported data type: ${t} for deserializing MLTensor tensor`);
        let { mlTensor: a, download: u, dispose: o } = n[2];
        return de.fromMLTensor(a, { dataType: t, dims: n[1], download: u, dispose: o });
      }
      default:
        throw new Error(`invalid data location: ${n[3]}`);
    }
  }, Pt = class {
    async fetchModelAndCopyToWasmMemory(t) {
      return ho(await Ke(t));
    }
    async loadModel(t, a) {
      _e();
      let u;
      typeof t == "string" ? u = await this.fetchModelAndCopyToWasmMemory(t) : u = t, [this.sessionId, this.inputNames, this.outputNames, this.inputMetadata, this.outputMetadata] = await wo(u, a), Pe();
    }
    async dispose() {
      return bo(this.sessionId);
    }
    async run(t, a, u) {
      _e();
      let o = [], d = [];
      Object.entries(t).forEach((y) => {
        let T = y[0], I = y[1], D = this.inputNames.indexOf(T);
        if (D === -1) throw new Error(`invalid input '${T}'`);
        o.push(I), d.push(D);
      });
      let c = [], l = [];
      Object.entries(a).forEach((y) => {
        let T = y[0], I = y[1], D = this.outputNames.indexOf(T);
        if (D === -1) throw new Error(`invalid output '${T}'`);
        c.push(I), l.push(D);
      });
      let m = o.map((y, T) => Eo(y, () => `input "${this.inputNames[d[T]]}"`)), h = c.map((y, T) => y ? Eo(y, () => `output "${this.outputNames[l[T]]}"`) : null), g = await yo(this.sessionId, d, m, l, h, u), b = {};
      for (let y = 0; y < g.length; y++) b[this.outputNames[l[y]]] = c[y] ?? Es(g[y]);
      return Pe(), b;
    }
    startProfiling() {
    }
    endProfiling() {
      go(this.sessionId);
    }
  };
});
var vo = {};
ut(vo, { OnnxruntimeWebAssemblyBackend: () => Dt, initializeFlags: () => So, wasmBackend: () => Ts });
var So;
var Dt;
var Ts;
var Oo = F(() => {
  "use strict";
  Te();
  pn();
  To();
  So = () => {
    (typeof Y.wasm.initTimeout != "number" || Y.wasm.initTimeout < 0) && (Y.wasm.initTimeout = 0);
    let n = Y.wasm.simd;
    if (typeof n != "boolean" && n !== void 0 && n !== "fixed" && n !== "relaxed" && (console.warn(`Property "env.wasm.simd" is set to unknown value "${n}". Reset it to \`false\` and ignore SIMD feature checking.`), Y.wasm.simd = false), typeof Y.wasm.proxy != "boolean" && (Y.wasm.proxy = false), typeof Y.wasm.trace != "boolean" && (Y.wasm.trace = false), typeof Y.wasm.numThreads != "number" || !Number.isInteger(Y.wasm.numThreads) || Y.wasm.numThreads <= 0) if (typeof self < "u" && !self.crossOriginIsolated) Y.wasm.numThreads = 1;
    else {
      let t = typeof navigator > "u" ? qt("node:os").cpus().length : navigator.hardwareConcurrency;
      Y.wasm.numThreads = Math.min(4, Math.ceil((t || 1) / 2));
    }
  }, Dt = class {
    async init(t) {
      So(), await po(), await mo(t);
    }
    async createInferenceSessionHandler(t, a) {
      let u = new Pt();
      return await u.loadModel(t, a), u;
    }
  }, Ts = new Dt();
});
Te();
Te();
Te();
var Gr = "1.27.0";
var au = nn;
{
  let n = (Oo(), Xt(vo)).wasmBackend;
  qe("cpu", n, 10), qe("wasm", n, 10);
}
Object.defineProperty(Y.versions, "web", { value: Gr, enumerable: true });

// node_modules/ppu-paddle-ocr/model-catalogue.js
var MODEL_BASE_URL = "https://media.githubusercontent.com/media/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/main";
var DICT_BASE_URL = "https://raw.githubusercontent.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/main";
var V6_SMALL_MODEL = { detection: `${MODEL_BASE_URL}/detection/ort/PP-OCRv6_small_det.ort`, recognition: `${MODEL_BASE_URL}/recognition/ort/PP-OCRv6_small_rec.ort`, charactersDictionary: `${DICT_BASE_URL}/recognition/ppocrv6_dict.txt` };
var V6_MEDIUM_MODEL = { detection: `${MODEL_BASE_URL}/detection/ort/PP-OCRv6_medium_det.ort`, recognition: `${MODEL_BASE_URL}/recognition/ort/PP-OCRv6_medium_rec.ort`, charactersDictionary: `${DICT_BASE_URL}/recognition/ppocrv6_dict.txt` };
var V6_TINY_MODEL = { detection: `${MODEL_BASE_URL}/detection/ort/PP-OCRv6_tiny_det.ort`, recognition: `${MODEL_BASE_URL}/recognition/ort/PP-OCRv6_tiny_rec.ort`, charactersDictionary: `${DICT_BASE_URL}/recognition/ppocrv6_tiny_dict.txt` };
var V5_EN_MOBILE_MODEL = { detection: `${MODEL_BASE_URL}/detection/PP-OCRv5_mobile_det_infer.ort`, recognition: `${MODEL_BASE_URL}/recognition/multi/en/v5/en_PP-OCRv5_mobile_rec_infer.ort`, charactersDictionary: `${DICT_BASE_URL}/recognition/multi/en/v5/ppocrv5_en_dict.txt` };
var V5_EN_MOBILE_INT8_MODEL = { detection: `${MODEL_BASE_URL}/detection/PP-OCRv5_mobile_det_infer.ort`, recognition: `${MODEL_BASE_URL}/recognition/multi/en/v5/en_PP-OCRv5_mobile_rec_infer_int8.ort`, charactersDictionary: `${DICT_BASE_URL}/recognition/multi/en/v5/ppocrv5_en_dict.txt` };
var V5_EN_SERVER_MODEL = { detection: `${MODEL_BASE_URL}/detection/PP-OCRv5_server_det_infer.onnx`, recognition: `${MODEL_BASE_URL}/recognition/PP-OCRv5_server_rec_infer.onnx`, charactersDictionary: `${DICT_BASE_URL}/recognition/ppocrv5_dict.txt` };
var V5_MOBILE_MODEL = { detection: `${MODEL_BASE_URL}/detection/PP-OCRv5_mobile_det_infer.onnx`, recognition: `${MODEL_BASE_URL}/recognition/PP-OCRv5_mobile_rec_infer.onnx`, charactersDictionary: `${DICT_BASE_URL}/recognition/ppocrv5_dict.txt` };
var V5_SERVER_MODEL = { detection: `${MODEL_BASE_URL}/detection/PP-OCRv5_server_det_infer.onnx`, recognition: `${MODEL_BASE_URL}/recognition/PP-OCRv5_server_rec_infer.onnx`, charactersDictionary: `${DICT_BASE_URL}/recognition/ppocrv5_dict.txt` };
var V4_EN_MOBILE_MODEL = { detection: `${MODEL_BASE_URL}/detection/PP-OCRv4_mobile_det_infer.onnx`, recognition: `${MODEL_BASE_URL}/recognition/multi/en/v4/en_PP-OCRv4_mobile_rec_infer.onnx`, charactersDictionary: `${DICT_BASE_URL}/recognition/multi/en/v4/en_dict.txt` };
var V4_MOBILE_MODEL = { detection: `${MODEL_BASE_URL}/detection/PP-OCRv4_mobile_det_infer.onnx`, recognition: `${MODEL_BASE_URL}/recognition/PP-OCRv4_mobile_rec_infer.onnx`, charactersDictionary: `${DICT_BASE_URL}/recognition/ppocrv4_dict.txt` };
var V4_SERVER_MODEL = { detection: `${MODEL_BASE_URL}/detection/PP-OCRv4_server_det_infer.onnx`, recognition: `${MODEL_BASE_URL}/recognition/PP-OCRv4_server_rec_infer.onnx`, charactersDictionary: `${DICT_BASE_URL}/recognition/ppocrv4_dict.txt` };
var V4_SERVER_DOC_MODEL = { detection: `${MODEL_BASE_URL}/detection/PP-OCRv4_server_det_infer.onnx`, recognition: `${MODEL_BASE_URL}/recognition/PP-OCRv4_server_rec_doc_infer.onnx`, charactersDictionary: `${DICT_BASE_URL}/recognition/ppocrv4_doc_dict.txt` };
var V3_MOBILE_MODEL = { detection: `${MODEL_BASE_URL}/detection/PP-OCRv5_mobile_det_infer.onnx`, recognition: `${MODEL_BASE_URL}/recognition/PP-OCRv3_mobile_rec_infer.onnx`, charactersDictionary: `${DICT_BASE_URL}/recognition/ppocrv3_dict.txt` };
var V3_JAPANESE_MOBILE_MODEL = { detection: `${MODEL_BASE_URL}/detection/PP-OCRv5_mobile_det_infer.onnx`, recognition: `${MODEL_BASE_URL}/recognition/multi/japan/v3/japan_PP-OCRv3_mobile_rec_infer.onnx`, charactersDictionary: `${DICT_BASE_URL}/recognition/multi/japan/v3/japan_dict.txt` };
var V5_ARABIC_MOBILE_MODEL = { detection: `${MODEL_BASE_URL}/detection/PP-OCRv5_mobile_det_infer.onnx`, recognition: `${MODEL_BASE_URL}/recognition/multi/arabic/v5/arabic_PP-OCRv5_mobile_rec_infer.onnx`, charactersDictionary: `${DICT_BASE_URL}/recognition/multi/arabic/v5/ppocrv5_arabic_dict.txt` };
var V5_CYRILLIC_MOBILE_MODEL = { detection: `${MODEL_BASE_URL}/detection/PP-OCRv5_mobile_det_infer.onnx`, recognition: `${MODEL_BASE_URL}/recognition/multi/cyrillic/v5/cyrillic_PP-OCRv5_mobile_rec_infer.onnx`, charactersDictionary: `${DICT_BASE_URL}/recognition/multi/cyrillic/v5/ppocrv5_cyrillic_dict.txt` };
var V5_DEVANAGARI_MOBILE_MODEL = { detection: `${MODEL_BASE_URL}/detection/PP-OCRv5_mobile_det_infer.onnx`, recognition: `${MODEL_BASE_URL}/recognition/multi/devanagari/v5/devanagari_PP-OCRv5_mobile_rec_infer.onnx`, charactersDictionary: `${DICT_BASE_URL}/recognition/multi/devanagari/v5/ppocrv5_devanagari_dict.txt` };
var V5_GREEK_MOBILE_MODEL = { detection: `${MODEL_BASE_URL}/detection/PP-OCRv5_mobile_det_infer.onnx`, recognition: `${MODEL_BASE_URL}/recognition/multi/el/v5/el_PP-OCRv5_mobile_rec_infer.onnx`, charactersDictionary: `${DICT_BASE_URL}/recognition/multi/el/v5/ppocrv5_el_dict.txt` };
var V5_ESLAV_MOBILE_MODEL = { detection: `${MODEL_BASE_URL}/detection/PP-OCRv5_mobile_det_infer.onnx`, recognition: `${MODEL_BASE_URL}/recognition/multi/eslav/v5/eslav_PP-OCRv5_mobile_rec_infer.onnx`, charactersDictionary: `${DICT_BASE_URL}/recognition/multi/eslav/v5/ppocrv5_eslav_dict.txt` };
var V5_KOREAN_MOBILE_MODEL = { detection: `${MODEL_BASE_URL}/detection/PP-OCRv5_mobile_det_infer.onnx`, recognition: `${MODEL_BASE_URL}/recognition/multi/korean/v5/korean_PP-OCRv5_mobile_rec_infer.onnx`, charactersDictionary: `${DICT_BASE_URL}/recognition/multi/korean/v5/ppocrv5_korean_dict.txt` };
var V5_LATIN_MOBILE_MODEL = { detection: `${MODEL_BASE_URL}/detection/PP-OCRv5_mobile_det_infer.onnx`, recognition: `${MODEL_BASE_URL}/recognition/multi/latin/v5/latin_PP-OCRv5_mobile_rec_infer.onnx`, charactersDictionary: `${DICT_BASE_URL}/recognition/multi/latin/v5/ppocrv5_latin_dict.txt` };
var V5_TAMIL_MOBILE_MODEL = { detection: `${MODEL_BASE_URL}/detection/PP-OCRv5_mobile_det_infer.onnx`, recognition: `${MODEL_BASE_URL}/recognition/multi/ta/v5/ta_PP-OCRv5_mobile_rec_infer.onnx`, charactersDictionary: `${DICT_BASE_URL}/recognition/multi/ta/v5/ppocrv5_ta_dict.txt` };
var V5_TELUGU_MOBILE_MODEL = { detection: `${MODEL_BASE_URL}/detection/PP-OCRv5_mobile_det_infer.onnx`, recognition: `${MODEL_BASE_URL}/recognition/multi/te/v5/te_PP-OCRv5_mobile_rec_infer.onnx`, charactersDictionary: `${DICT_BASE_URL}/recognition/multi/te/v5/ppocrv5_te_dict.txt` };
var V5_THAI_MOBILE_MODEL = { detection: `${MODEL_BASE_URL}/detection/PP-OCRv5_mobile_det_infer.onnx`, recognition: `${MODEL_BASE_URL}/recognition/multi/th/v5/th_PP-OCRv5_mobile_rec_infer.onnx`, charactersDictionary: `${DICT_BASE_URL}/recognition/multi/th/v5/ppocrv5_th_dict.txt` };
var DEFAULT_MODEL = V6_TINY_MODEL;
var DEFAULT_MODEL_URLS = DEFAULT_MODEL;
var MODEL_PRESETS = { "v6-small": V6_SMALL_MODEL, "v6-medium": V6_MEDIUM_MODEL, "v6-tiny": V6_TINY_MODEL, "v5-en-mobile": V5_EN_MOBILE_MODEL, "v5-en-mobile-int8": V5_EN_MOBILE_INT8_MODEL, "v5-en-server": V5_EN_SERVER_MODEL, "v5-mobile": V5_MOBILE_MODEL, "v5-server": V5_SERVER_MODEL, "v5-arabic-mobile": V5_ARABIC_MOBILE_MODEL, "v5-cyrillic-mobile": V5_CYRILLIC_MOBILE_MODEL, "v5-devanagari-mobile": V5_DEVANAGARI_MOBILE_MODEL, "v5-greek-mobile": V5_GREEK_MOBILE_MODEL, "v5-eslav-mobile": V5_ESLAV_MOBILE_MODEL, "v5-korean-mobile": V5_KOREAN_MOBILE_MODEL, "v5-latin-mobile": V5_LATIN_MOBILE_MODEL, "v5-tamil-mobile": V5_TAMIL_MOBILE_MODEL, "v5-telugu-mobile": V5_TELUGU_MOBILE_MODEL, "v5-thai-mobile": V5_THAI_MOBILE_MODEL, "v4-en-mobile": V4_EN_MOBILE_MODEL, "v4-mobile": V4_MOBILE_MODEL, "v4-server": V4_SERVER_MODEL, "v4-server-doc": V4_SERVER_DOC_MODEL, "v3-mobile": V3_MOBILE_MODEL, "v3-japanese-mobile": V3_JAPANESE_MOBILE_MODEL };

// node_modules/ppu-paddle-ocr/constants.js
var DEFAULT_DEBUGGING_OPTIONS = { verbose: false, debug: false, debugFolder: "out" };
var DEFAULT_DETECTION_OPTIONS = { mean: [0.485, 0.456, 0.406], stdDeviation: [0.229, 0.224, 0.225], maxSideLength: "auto", minimumAreaThreshold: 20, paddingVertical: 0.4, paddingHorizontal: 0.6 };
var DEFAULT_RECOGNITION_OPTIONS = { imageHeight: 48, strategy: "per-line", crossLineWidthFactor: 1, minimumConfidence: 0.5, charactersDictionary: [], maxCropSourceSideLength: 2e3, mainThreadYieldMs: 0, recBatchSize: 6, rotateVerticalCrops: true, spaceRecovery: false };
var DEFAULT_WEB_MAIN_THREAD_YIELD_MS = 10;
var DEFAULT_SESSION_OPTIONS = { executionProviders: ["cpu"], graphOptimizationLevel: "all", enableCpuMemArena: true, enableMemPattern: true, executionMode: "sequential", interOpNumThreads: 0, intraOpNumThreads: 0 };
var DEFAULT_PROCESSING_ENGINE = "opencv";
var DEFAULT_PROCESSING_OPTIONS = { engine: DEFAULT_PROCESSING_ENGINE };
var DEFAULT_PADDLE_OPTIONS = { model: {}, detection: DEFAULT_DETECTION_OPTIONS, recognition: DEFAULT_RECOGNITION_OPTIONS, debugging: DEFAULT_DEBUGGING_OPTIONS, session: DEFAULT_SESSION_OPTIONS, processing: DEFAULT_PROCESSING_OPTIONS };

// node_modules/ppu-paddle-ocr/utils.js
function deepMerge(target, ...sources) {
  if (!sources.length) return target;
  let source = sources.shift();
  if (isObject(target) && isObject(source)) {
    for (let key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        if (key === "__proto__" || key === "constructor" || key === "prototype") {
          continue;
        }
        let sourceValue = source[key];
        let targetValue = target[key];
        if (isObject(sourceValue)) {
          if (!targetValue || !isObject(targetValue)) {
            target[key] = {};
          }
          deepMerge(target[key], sourceValue);
        } else if (sourceValue !== void 0) {
          target[key] = sourceValue;
        }
      }
    }
  }
  return deepMerge(target, ...sources);
}
async function fetchArrayBufferWithRetry(url, options = {}) {
  const { timeoutMs = 3e5, retries = 2 } = options;
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      let response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      return await response.arrayBuffer();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries + 1} attempt(s): ${String(lastError)}`);
}
function parseDictionary(source) {
  let content = typeof source === "string" ? source : new TextDecoder("utf-8").decode(source);
  return content.split(/\r?\n/);
}
function isObject(item) {
  return item !== null && typeof item === "object" && !Array.isArray(item) && !(item instanceof Date) && !(item instanceof RegExp) && !(item instanceof ArrayBuffer) && !ArrayBuffer.isView(item);
}

// node_modules/ppu-paddle-ocr/core/detection/box-geometry.js
function resolveMaxSideLength(maxSideLength, longestSide) {
  if (maxSideLength !== "auto") return maxSideLength;
  return Math.min(1920, Math.max(960, Math.round(longestSide * 0.75 / 32) * 32));
}
function calculateResizeDimensions(originalWidth, originalHeight, maxSideLength) {
  let resizeW = originalWidth;
  let resizeH = originalHeight;
  let ratio = 1;
  if (Math.max(resizeH, resizeW) > maxSideLength) {
    ratio = maxSideLength / (resizeH > resizeW ? resizeH : resizeW);
    resizeW = Math.round(resizeW * ratio);
    resizeH = Math.round(resizeH * ratio);
  }
  return { width: resizeW, height: resizeH, ratio };
}
function applyPaddingToRect(rect, maxWidth, maxHeight, paddingVertical, paddingHorizontal) {
  let verticalPadding = Math.round(rect.height * paddingVertical);
  let horizontalPadding = Math.round(rect.height * paddingHorizontal);
  let x = rect.x - horizontalPadding;
  let y = rect.y - verticalPadding;
  x = Math.max(0, x);
  y = Math.max(0, y);
  let rightEdge = Math.min(maxWidth, rect.x + rect.width + horizontalPadding);
  let bottomEdge = Math.min(maxHeight, rect.y + rect.height + verticalPadding);
  let width = rightEdge - x;
  let height = bottomEdge - y;
  return { x, y, width, height };
}
function convertToOriginalCoordinates(rect, resizeRatio, originalWidth, originalHeight) {
  let scaledX = rect.x / resizeRatio;
  let scaledY = rect.y / resizeRatio;
  let scaledWidth = rect.width / resizeRatio;
  let scaledHeight = rect.height / resizeRatio;
  let x = Math.max(0, Math.round(scaledX));
  let y = Math.max(0, Math.round(scaledY));
  let width = Math.min(originalWidth - x, Math.round(scaledWidth));
  let height = Math.min(originalHeight - y, Math.round(scaledHeight));
  return { x, y, width, height };
}
function extractBoxesFromContours(contours, width, height, resizeRatio, originalWidth, originalHeight, minBoxArea, paddingVertical, paddingHorizontal) {
  let boxes = [];
  contours.iterate((contour) => {
    let rect = contours.getRect(contour);
    if (rect.width * rect.height <= minBoxArea) {
      return;
    }
    let paddedRect = applyPaddingToRect(rect, width, height, paddingVertical, paddingHorizontal);
    let finalBox = convertToOriginalCoordinates(paddedRect, resizeRatio, originalWidth, originalHeight);
    if (finalBox.width > 5 && finalBox.height > 5) {
      boxes.push(finalBox);
    }
  });
  return boxes;
}
function extractBoxesFromRegions(regions, originalWidth, originalHeight) {
  let boxes = [];
  for (let region of regions) {
    const { bbox } = region;
    let box = { x: Math.max(0, bbox.x0), y: Math.max(0, bbox.y0), width: bbox.x1 - bbox.x0, height: bbox.y1 - bbox.y0 };
    if (box.x + box.width > originalWidth) {
      box.width = originalWidth - box.x;
    }
    if (box.y + box.height > originalHeight) {
      box.height = originalHeight - box.y;
    }
    if (box.width > 5 && box.height > 5) {
      boxes.push(box);
    }
  }
  return boxes;
}

// node_modules/ppu-paddle-ocr/core/detection/image-tensor.js
var NUM_CHANNELS = 3;
function imageToTensor(canvas, width, height, mean, stdDeviation) {
  let ctx = canvas.getContext("2d");
  let imageData = ctx.getImageData(0, 0, width, height);
  let rgbaData = imageData.data;
  let channelSize = height * width;
  let tensor = new Float32Array(NUM_CHANNELS * channelSize);
  let meanR = mean[0] ?? 0.485;
  let meanG = mean[1] ?? 0.456;
  let meanB = mean[2] ?? 0.406;
  let stdR = stdDeviation[0] ?? 0.229;
  let stdG = stdDeviation[1] ?? 0.224;
  let stdB = stdDeviation[2] ?? 0.225;
  let scaleR = 1 / (255 * stdR);
  let scaleG = 1 / (255 * stdG);
  let scaleB = 1 / (255 * stdB);
  let shiftR = meanR / stdR;
  let shiftG = meanG / stdG;
  let shiftB = meanB / stdB;
  let gOffset = channelSize;
  let bOffset = channelSize * 2;
  for (let i = 0, rgbaIdx = 0; i < channelSize; i++, rgbaIdx += 4) {
    let r = rgbaData[rgbaIdx];
    let g = rgbaData[rgbaIdx + 1];
    let b = rgbaData[rgbaIdx + 2];
    tensor[i] = r * scaleR - shiftR;
    tensor[gOffset + i] = g * scaleG - shiftG;
    tensor[bOffset + i] = b * scaleB - shiftB;
  }
  return tensor;
}
function tensorToCanvas(tensor, width, height, createCanvas) {
  let canvas = createCanvas(width, height);
  let ctx = canvas.getContext("2d");
  let imageData = ctx.createImageData(width, height);
  let data = imageData.data;
  let totalPixels = width * height;
  for (let i = 0; i < totalPixels; i++) {
    let probability = tensor[i] || 0;
    let grayValue = Math.round(probability * 255);
    let pixelIdx = i * 4;
    data[pixelIdx] = grayValue;
    data[pixelIdx + 1] = grayValue;
    data[pixelIdx + 2] = grayValue;
    data[pixelIdx + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// node_modules/ppu-paddle-ocr/core/base-detection.service.js
var BaseDetectionService = class {
  options;
  debugging;
  session;
  platform;
  engine;
  lastDetectionCanvas = null;
  constructor(platform, session, options = {}, debugging = {}, engine = "opencv") {
    this.platform = platform;
    this.session = session;
    this.options = { ...DEFAULT_DETECTION_OPTIONS, ...options };
    this.debugging = { ...DEFAULT_DEBUGGING_OPTIONS, ...debugging };
    if (engine === "opencv" && !this.platform.imageProcessor) {
      this.engine = "canvas-native";
    } else {
      this.engine = engine;
    }
  }
  log(message) {
    if (this.debugging.verbose) {
      console.log(`[DetectionService] ${message}`);
    }
  }
  async run(image) {
    this.log("Starting text detection process");
    try {
      let canvasToProcess;
      if (this.platform.isCanvas(image)) {
        canvasToProcess = image;
      } else if (this.engine === "opencv" && this.platform.imageProcessor) {
        canvasToProcess = await this.platform.imageProcessor.prepareCanvas(image);
      } else {
        canvasToProcess = await this.platform.canvas.prepareCanvas(image);
      }
      let input = await this.preprocessDetection(canvasToProcess);
      let detection = await this.runInference(input.tensor, input.width, input.height);
      if (!detection) {
        console.error("Text detection failed (output tensor is null)");
        return [];
      }
      let detectedBoxes = this.postprocessDetection(detection, input);
      if (this.debugging.debug && this.debugging.debugFolder && this.lastDetectionCanvas) {
        await this.debugDetectionCanvas(this.lastDetectionCanvas, input.width, input.height);
        await this.debugDetectedBoxes(canvasToProcess, detectedBoxes);
      }
      this.log(`Detected ${detectedBoxes.length} text boxes in image`);
      return detectedBoxes;
    } catch (error) {
      console.error("Error during text detection:", error instanceof Error ? error.message : String(error));
      return [];
    }
  }
  async preprocessDetection(canvas) {
    const { width: originalWidth, height: originalHeight } = canvas;
    let maxSideLength = resolveMaxSideLength(this.options.maxSideLength ?? "auto", Math.max(originalWidth, originalHeight));
    const { width: resizeW, height: resizeH, ratio: resizeRatio } = calculateResizeDimensions(originalWidth, originalHeight, maxSideLength);
    let width = Math.ceil(resizeW / 32) * 32;
    let height = Math.ceil(resizeH / 32) * 32;
    let paddedCanvas = this.platform.createCanvas(width, height);
    let paddedCtx = paddedCanvas.getContext("2d");
    paddedCtx.drawImage(canvas, 0, 0, originalWidth, originalHeight, 0, 0, resizeW, resizeH);
    let mean = this.options.mean ?? [0.485, 0.456, 0.406];
    let stdDeviation = this.options.stdDeviation ?? [0.229, 0.224, 0.225];
    let tensor = imageToTensor(paddedCanvas, width, height, mean, stdDeviation);
    this.log(`Detection preprocessed: original(${originalWidth}x${originalHeight}), model_input(${width}x${height}), resize_ratio: ${resizeRatio.toFixed(4)}, engine: ${this.engine}`);
    return { tensor, width, height, resizeRatio, originalWidth, originalHeight };
  }
  async runInference(tensor, width, height) {
    let inputTensor;
    try {
      this.log("Running detection inference...");
      inputTensor = new this.platform.ort.Tensor("float32", tensor, [1, 3, height, width]);
      let feeds = { x: inputTensor };
      let results = await this.session.run(feeds);
      let outputTensor = results[this.session.outputNames[0] || "sigmoid_0.tmp_0"];
      this.log("Detection inference complete!");
      if (!outputTensor) {
        console.error(`Output tensor ${this.session.outputNames[0]} not found in detection results`);
        return null;
      }
      return outputTensor.data;
    } catch (error) {
      console.error("Error during model inference:", error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      inputTensor?.dispose();
    }
  }
  postprocessDetection(detection, input, minBoxAreaOnPadded = this.options.minimumAreaThreshold ?? 50, paddingVertical = this.options.paddingVertical || 0.4, paddingHorizontal = this.options.paddingHorizontal || 0.6) {
    this.log("Post-processing detection results...");
    const { width, height, resizeRatio, originalWidth, originalHeight } = input;
    let canvas = tensorToCanvas(detection, width, height, this.platform.createCanvas.bind(this.platform));
    this.lastDetectionCanvas = canvas;
    if (this.engine === "opencv" && this.platform.imageProcessor) {
      return this.postprocessWithOpenCV(canvas, width, height, resizeRatio, originalWidth, originalHeight, minBoxAreaOnPadded, paddingVertical, paddingHorizontal);
    }
    return this.postprocessWithCanvasNative(canvas, resizeRatio, originalWidth, originalHeight, minBoxAreaOnPadded, paddingVertical, paddingHorizontal);
  }
  postprocessWithOpenCV(canvas, width, height, resizeRatio, originalWidth, originalHeight, minBoxAreaOnPadded, paddingVertical, paddingHorizontal) {
    let ip = this.platform.imageProcessor;
    let processor = new ip.ImageProcessor(canvas);
    try {
      processor.grayscale().convert({ rtype: ip.cv.CV_8UC1 });
      let contours = new ip.Contours(processor.toMat(), { mode: ip.cv.RETR_LIST, method: ip.cv.CHAIN_APPROX_SIMPLE });
      let boxes = extractBoxesFromContours(contours, width, height, resizeRatio, originalWidth, originalHeight, minBoxAreaOnPadded, paddingVertical, paddingHorizontal);
      contours.destroy();
      this.log(`Found ${boxes.length} potential text boxes (opencv)`);
      return boxes;
    } finally {
      processor.destroy();
    }
  }
  postprocessWithCanvasNative(canvas, resizeRatio, originalWidth, originalHeight, minBoxAreaOnPadded, paddingVertical, paddingHorizontal) {
    let processor = this.platform.canvas.createProcessor(canvas).grayscale().threshold({ thresh: 0 });
    let regions = processor.findRegions({ foreground: "light", minArea: minBoxAreaOnPadded, thresh: 0, padding: { vertical: paddingVertical, horizontal: paddingHorizontal }, scale: 1 / resizeRatio });
    let boxes = extractBoxesFromRegions(regions, originalWidth, originalHeight);
    this.log(`Found ${boxes.length} potential text boxes (canvas-native)`);
    return boxes;
  }
  async debugDetectionCanvas(canvas, _width, _height) {
    let dir = this.debugging.debugFolder ?? "";
    await this.platform.saveDebugImage(canvas, "detection-debug", dir);
    this.log(`Probability map visualized and saved to: ${dir}`);
  }
  async debugDetectedBoxes(image, boxes) {
    let canvas = this.platform.isCanvas(image) ? image : await this.platform.canvas.prepareCanvas(image);
    let ctx = canvas.getContext("2d");
    for (let box of boxes) {
      const { x, y, width, height } = box;
      this.platform.canvas.getToolkit().drawLine({ ctx, x, y, width, height });
    }
    let dir = this.debugging.debugFolder ?? "";
    await this.platform.saveDebugImage(canvas, "boxes-debug", dir);
    this.log(`Boxes visualized and saved to: ${dir}`);
  }
};

// node_modules/ppu-paddle-ocr/core/batch.js
function toAbortError(signal) {
  return signal.reason instanceof Error ? signal.reason : new DOMException("The batch operation was aborted.", "AbortError");
}
function toAsyncIterator(inputs) {
  if (Symbol.asyncIterator in inputs) {
    return inputs[Symbol.asyncIterator]();
  }
  let sync = inputs[Symbol.iterator]();
  return { next: () => Promise.resolve(sync.next()), return: (value) => Promise.resolve(sync.return?.(value) ?? { done: true, value: void 0 }) };
}
async function runPool(inputs, options, task, onSettle) {
  const { settle, signal } = options;
  let concurrency = Math.max(1, Math.floor(options.concurrency));
  if (signal?.aborted) throw toAbortError(signal);
  let nextIndex = 0;
  let done = 0;
  let stopped = false;
  let failed = false;
  let failure;
  let array = Array.isArray(inputs) ? inputs : null;
  let iterator = array ? null : toAsyncIterator(inputs);
  let lock = Promise.resolve();
  let nextItem = async () => {
    let previous = lock;
    let release;
    lock = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await iterator.next();
    } finally {
      release();
    }
  };
  let onAbort = () => {
    stopped = true;
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  let worker = async () => {
    while (!stopped) {
      let item;
      let index;
      if (array) {
        if (nextIndex >= array.length) return;
        index = nextIndex++;
        item = array[index];
      } else {
        let next = await nextItem();
        if (next.done || stopped) return;
        index = nextIndex++;
        item = next.value;
      }
      try {
        let value = await task(item, index);
        if (stopped) return;
        onSettle({ index, status: "fulfilled", value });
      } catch (reason) {
        if (settle) {
          onSettle({ index, status: "rejected", reason });
        } else {
          stopped = true;
          failed = true;
          failure = reason;
          return;
        }
      } finally {
        done++;
        options.onProgress?.(done, options.total);
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  } finally {
    signal?.removeEventListener("abort", onAbort);
    await iterator?.return?.();
  }
  if (signal?.aborted) throw toAbortError(signal);
  if (failed) throw failure;
}
function createAsyncQueue() {
  let items = [];
  let wake = null;
  let closed = false;
  let failure = null;
  let notify = () => {
    let w = wake;
    wake = null;
    w?.();
  };
  return { push(item) {
    items.push(item);
    notify();
  }, close() {
    closed = true;
    notify();
  }, fail(error) {
    failure = { error };
    closed = true;
    notify();
  }, async *drain() {
    while (true) {
      while (items.length > 0) {
        yield items.shift();
      }
      if (failure) throw failure.error;
      if (closed) return;
      await new Promise((resolve) => {
        wake = resolve;
      });
    }
  } };
}

// node_modules/ppu-paddle-ocr/core/detection/crop-boxes.js
async function cropDetectedBoxes(platform, canvas, boxes, options) {
  let toolkit = platform.canvas.getToolkit();
  let crops = [];
  for (const [index, box] of boxes.entries()) {
    let cropCanvas = toolkit.crop({ bbox: { x0: box.x, y0: box.y, x1: box.x + box.width, y1: box.y + box.height }, canvas });
    if (options.saveCropsTo && platform.saveImage) {
      let filename = `crop_${String(index).padStart(3, "0")}.png`;
      await platform.saveImage(cropCanvas, [options.saveCropsTo, filename].join(platform.pathSeparator));
    }
    if (options.crop) {
      crops.push(await canvasToPngBuffer(cropCanvas));
    }
  }
  return crops;
}
async function canvasToPngBuffer(canvas) {
  let c = canvas;
  if (typeof c.toBuffer === "function") {
    let buffer = c.toBuffer("image/png");
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  }
  if (typeof c.convertToBlob === "function") {
    let blob = await c.convertToBlob({ type: "image/png" });
    return blob.arrayBuffer();
  }
  if (typeof c.toBlob === "function") {
    let toBlob = c.toBlob.bind(c);
    let blob = await new Promise((resolve, reject) => toBlob((b) => b ? resolve(b) : reject(new Error("Canvas toBlob() returned null")), "image/png"));
    return blob.arrayBuffer();
  }
  throw new Error("Canvas cannot be encoded to a PNG buffer on this platform");
}

// node_modules/ppu-paddle-ocr/core/recognition/line-grouping.js
function flattenResults(results) {
  if (results.length === 0) {
    return { text: "", results: [], confidence: 0 };
  }
  let text = results.map((r) => r.text).join(" ");
  let avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
  return { text, results, confidence: avgConfidence };
}
function groupResultsByLine(results) {
  if (results.length === 0) {
    return { text: "", lines: [], confidence: 0 };
  }
  let lines = [];
  let currentLine = [];
  let firstResult = results[0];
  if (!firstResult) return { text: "", lines: [], confidence: 0 };
  let currentY = firstResult.box.y;
  let avgHeight = firstResult.box.height;
  for (let result of results) {
    const { box } = result;
    if (Math.abs(box.y - currentY) < avgHeight / 2) {
      currentLine.push(result);
      avgHeight = (avgHeight * (currentLine.length - 1) + box.height) / currentLine.length;
    } else {
      currentLine.sort((a, b) => a.box.x - b.box.x);
      lines.push(currentLine);
      currentLine = [result];
      currentY = box.y;
      avgHeight = box.height;
    }
  }
  if (currentLine.length > 0) {
    currentLine.sort((a, b) => a.box.x - b.box.x);
    lines.push(currentLine);
  }
  let fullText = lines.map((line) => line.map((r) => r.text).join(" ")).join(`
`);
  let totalConfidence = lines.reduce((sum, line) => sum + line.reduce((s, r) => s + r.confidence, 0), 0);
  let totalItems = lines.reduce((sum, line) => sum + line.length, 0);
  return { text: fullText, lines, confidence: totalItems > 0 ? totalConfidence / totalItems : 0 };
}
function groupBoxesIntoLines(boxes) {
  if (boxes.length === 0) return [];
  let sorted = [...boxes].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  let lines = [];
  let firstSorted = sorted[0];
  if (!firstSorted) return [];
  let currentLine = [firstSorted];
  let currentLineHeightSum = firstSorted.box.height;
  let avgHeight = firstSorted.box.height;
  for (let i = 1; i < sorted.length; i++) {
    let current = sorted[i];
    let previous = sorted[i - 1];
    if (!current || !previous) continue;
    let verticalGap = Math.abs(current.box.y - previous.box.y);
    let threshold = avgHeight * 0.5;
    if (verticalGap <= threshold) {
      currentLine.push(current);
      currentLineHeightSum += current.box.height;
      avgHeight = currentLineHeightSum / currentLine.length;
    } else {
      currentLine.sort((a, b) => a.box.x - b.box.x);
      lines.push(currentLine);
      currentLine = [current];
      currentLineHeightSum = current.box.height;
      avgHeight = current.box.height;
    }
  }
  if (currentLine.length > 0) {
    currentLine.sort((a, b) => a.box.x - b.box.x);
    lines.push(currentLine);
  }
  return lines;
}
var MAX_BOX_STRETCH = 4;
var MAX_MERGED_WIDTH = 16384;
function mergeLineCrop(sourceCanvas, lineBoxes, createCanvas, canvasOps) {
  let minX = Math.min(...lineBoxes.map((b) => b.box.x));
  let minY = Math.min(...lineBoxes.map((b) => b.box.y));
  let maxRight = Math.max(...lineBoxes.map((b) => b.box.x + b.box.width));
  let maxBottom = Math.max(...lineBoxes.map((b) => b.box.y + b.box.height));
  let mergedBox = { x: minX, y: minY, width: maxRight - minX, height: maxBottom - minY };
  let commonHeight = maxBottom - minY;
  let gap = Math.max(1, Math.round(commonHeight * 0.4));
  let widths = lineBoxes.map(({ box }) => Math.max(1, Math.round(box.width * Math.min(commonHeight / box.height, MAX_BOX_STRETCH))));
  let totalWidth = widths.reduce((sum, w) => sum + w, 0) + gap * (lineBoxes.length - 1);
  if (totalWidth > MAX_MERGED_WIDTH) {
    let shrink = MAX_MERGED_WIDTH / totalWidth;
    widths = widths.map((w) => Math.max(1, Math.round(w * shrink)));
    gap = Math.max(1, Math.floor(gap * shrink));
  }
  let commonWidth = widths.reduce((sum, w) => sum + w, 0) + gap * (lineBoxes.length - 1);
  let mergedCanvas = createCanvas(commonWidth, commonHeight);
  let ctx = mergedCanvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, commonWidth, commonHeight);
  let offsetX = 0;
  let cropWidths = [];
  for (let i = 0; i < lineBoxes.length; i++) {
    let entry = lineBoxes[i];
    let stretchedWidth = widths[i];
    if (!entry || stretchedWidth === void 0) continue;
    const { box } = entry;
    let cropped = canvasOps.getToolkit().crop({ bbox: { x0: box.x, y0: box.y, x1: box.x + box.width, y1: box.y + box.height }, canvas: sourceCanvas });
    ctx.drawImage(cropped, 0, 0, box.width, box.height, offsetX, 0, stretchedWidth, commonHeight);
    let trailingGap = i < lineBoxes.length - 1 ? gap : 0;
    cropWidths.push(stretchedWidth + trailingGap);
    offsetX += stretchedWidth + trailingGap;
  }
  return { mergedCanvas, mergedBox, cropWidths };
}
function splitTextByPositions(text, positions, segmentWidths) {
  let chars = [...text];
  if (positions.length !== chars.length || segmentWidths.length === 0) {
    return splitBatchTextByWidths(text, segmentWidths);
  }
  let totalWidth = segmentWidths.reduce((a, b) => a + b, 0);
  let result = segmentWidths.map(() => "");
  let seg = 0;
  let segEnd = (segmentWidths[0] ?? 0) / totalWidth;
  for (let i = 0; i < chars.length; i++) {
    let pos = positions[i] ?? 0;
    while (pos >= segEnd && seg < segmentWidths.length - 1) {
      seg++;
      segEnd += (segmentWidths[seg] ?? 0) / totalWidth;
    }
    result[seg] += chars[i] ?? "";
  }
  return result;
}
var CUT_SNAP_RANGE = 4;
function splitBatchTextByWidths(text, cropWidths) {
  if (cropWidths.length === 1) {
    return [text];
  }
  let totalWidth = cropWidths.reduce((a, b) => a + b, 0);
  let chars = [...text];
  let charWidth = chars.length > 0 ? totalWidth / chars.length : 0;
  let result = [];
  let charIdx = 0;
  for (let i = 0; i < cropWidths.length; i++) {
    if (i === cropWidths.length - 1) {
      result.push(chars.slice(charIdx).join(""));
      break;
    }
    let ideal = Math.min(charIdx + Math.round((cropWidths[i] ?? 0) / charWidth), chars.length);
    let cut = ideal;
    let skipSpace = false;
    for (let d = 0; d <= CUT_SNAP_RANGE && !skipSpace; d++) {
      for (let cand of [ideal - d, ideal + d]) {
        let ch = chars[cand];
        if (cand > charIdx && cand < chars.length && ch !== void 0 && /\s/.test(ch)) {
          cut = cand;
          skipSpace = true;
          break;
        }
      }
    }
    result.push(chars.slice(charIdx, cut).join(""));
    charIdx = skipSpace ? cut + 1 : cut;
  }
  return result;
}
function packIntoBatches(items, widthOf, targetWidth, separatorGap) {
  let sorted = [...items].sort((a, b) => widthOf(b) - widthOf(a));
  let batches = [];
  let widths = [];
  for (let item of sorted) {
    let placed = false;
    for (let b = 0; b < batches.length; b++) {
      let batch = batches[b];
      let width = widths[b];
      if (batch === void 0 || width === void 0) continue;
      let gap = separatorGap * batch.length;
      if (width + gap + widthOf(item) <= targetWidth) {
        batch.push(item);
        widths[b] = width + widthOf(item);
        placed = true;
        break;
      }
    }
    if (!placed) {
      batches.push([item]);
      widths.push(widthOf(item));
    }
  }
  return batches;
}

// node_modules/ppu-paddle-ocr/core/image-cache.js
var ImageCache = class {
  cache = /* @__PURE__ */ new Map();
  maxSize;
  constructor(maxSize = 10) {
    this.maxSize = maxSize;
  }
  get(key) {
    let value = this.cache.get(key);
    if (value !== void 0) {
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }
    return;
  }
  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      let firstKey = this.cache.keys().next().value;
      if (firstKey !== void 0) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }
  clear() {
    this.cache.clear();
  }
  static generateKey(imageBuffer) {
    let view = new Uint8Array(imageBuffer);
    let len = Math.min(view.length, 1024);
    let hash = 0;
    for (let i = 0; i < len; i++) {
      hash = (hash << 5) - hash + view[i];
      hash = hash & hash;
    }
    return `${hash}_${view.length}`;
  }
};
var globalImageCache = new ImageCache();

// node_modules/ppu-paddle-ocr/core/base-paddle-ocr.service.js
var BasePaddleOcrService = class {
  options = DEFAULT_PADDLE_OPTIONS;
  detectionSession = null;
  recognitionSession = null;
  detector = null;
  recognitor = null;
  platform;
  constructor(platform, options) {
    this.platform = platform;
    this.options = deepMerge({}, DEFAULT_PADDLE_OPTIONS, options);
    this.options.session = this.options.session || DEFAULT_PADDLE_OPTIONS.session;
  }
  log(message) {
    if (this.options.debugging?.verbose) {
      console.log(`[PaddleOcrService:Base] ${message}`);
    }
  }
  async recognize(image, options) {
    if (!this.detector || !this.recognitor) {
      await this.initSessions();
    }
    try {
      let imageBuffer;
      if (typeof image === "string") {
        if (!image.startsWith("http") && !image.startsWith("/")) {
          throw new Error("Invalid image string format. Must be an HTTP URL, an absolute path, ArrayBuffer, or Canvas");
        }
        imageBuffer = await this.platform.loadResource(image, image);
      } else if (image instanceof ArrayBuffer) {
        imageBuffer = image;
      } else {
        if (typeof image.toBuffer === "function") {
          let canvasWithBuffer = image;
          let buffer = canvasWithBuffer.toBuffer("image/png");
          imageBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        } else {
          let canvasWithCtx = image;
          let ctx = canvasWithCtx.getContext("2d", { willReadFrequently: true });
          let imageData = ctx.getImageData(0, 0, canvasWithCtx.width, canvasWithCtx.height);
          let data = imageData.data;
          imageBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        }
      }
      let cacheKey = ImageCache.generateKey(imageBuffer);
      if (!options?.noCache && !options?.dictionary) {
        let cacheResult = globalImageCache.get(cacheKey);
        if (cacheResult) {
          this.log("Using cached OCR result");
          if (options?.flatten) {
            return { text: cacheResult.text, results: cacheResult.lines ? cacheResult.lines.flat() : cacheResult.results ?? [], confidence: cacheResult.confidence };
          }
          return cacheResult;
        }
      }
      let boxes = [];
      let canvas = typeof image === "string" || image instanceof ArrayBuffer ? await this.platform.canvas.prepareCanvas(imageBuffer) : image;
      boxes = await this.detector.run(canvas);
      if (boxes.length === 0) {
        return options?.flatten ? { text: "", results: [], confidence: 0 } : { text: "", lines: [], confidence: 0 };
      }
      let dict = this.options.recognition?.charactersDictionary;
      if (options?.dictionary) {
        let dictionaryContent = "";
        if (typeof options.dictionary === "string") {
          let dictBuffer = await this.platform.loadResource(options.dictionary, options.dictionary);
          dictionaryContent = new TextDecoder("utf-8").decode(dictBuffer);
        } else {
          dictionaryContent = new TextDecoder("utf-8").decode(options.dictionary);
        }
        dict = parseDictionary(dictionaryContent);
      }
      let strategy = options?.strategy ?? this.options.recognition?.strategy ?? "per-line";
      let results = await this.recognitor.run(canvas, boxes, dict, strategy);
      let groupedResult = groupResultsByLine(results);
      let finalResult = options?.flatten ? flattenResults(results) : groupedResult;
      if (!options?.noCache && !options?.dictionary) {
        globalImageCache.set(cacheKey, finalResult);
      }
      return finalResult;
    } catch (e) {
      let err = e instanceof Error ? e : new Error(String(e));
      console.error("recognize: error", err.message, err.stack);
      throw e;
    }
  }
  async detect(image, options) {
    if (!this.detector) {
      await this.initSessions();
    }
    const { crop, saveCropsTo, ...tuning } = options ?? {};
    let detector = Object.keys(tuning).length > 0 ? new BaseDetectionService(this.platform, this.detectionSession, { ...this.options.detection, ...tuning }, this.options.debugging, this.options.processing?.engine ?? DEFAULT_PROCESSING_ENGINE) : this.detector;
    let canvas;
    if (typeof image === "string") {
      if (!image.startsWith("http") && !image.startsWith("/")) {
        throw new Error("Invalid image string format. Must be an HTTP URL, an absolute path, ArrayBuffer, or Canvas");
      }
      canvas = await this.platform.canvas.prepareCanvas(await this.platform.loadResource(image, image));
    } else if (image instanceof ArrayBuffer) {
      canvas = await this.platform.canvas.prepareCanvas(image);
    } else {
      canvas = image;
    }
    let boxes = (await detector.run(canvas)).filter((box) => box.width > 0 && box.height > 0);
    if (!crop && !saveCropsTo) {
      return { boxes };
    }
    let crops = await cropDetectedBoxes(this.platform, canvas, boxes, { crop, saveCropsTo });
    return crop ? { boxes, crops } : { boxes };
  }
  async batchRecognize(images, options) {
    let settle = options?.settle ?? false;
    let collected = [];
    await runPool(images, { concurrency: this.resolveConcurrency(options?.concurrency), settle, signal: options?.signal, onProgress: options?.onProgress, total: Array.isArray(images) ? images.length : void 0 }, (image) => this.recognize(image, options), (result) => {
      collected[result.index] = result;
    });
    if (settle) return collected;
    return collected.map((item) => item.status === "fulfilled" ? item.value : void 0);
  }
  async *batchRecognizeStream(images, options) {
    let queue = createAsyncQueue();
    let pump = (async () => {
      try {
        await runPool(images, { concurrency: this.resolveConcurrency(options?.concurrency), settle: options?.settle ?? false, signal: options?.signal, onProgress: options?.onProgress, total: Array.isArray(images) ? images.length : void 0 }, (image) => this.recognize(image, options), (result) => queue.push(result));
        queue.close();
      } catch (error) {
        queue.fail(error);
      }
    })();
    yield* queue.drain();
    await pump;
  }
  resolveConcurrency(value) {
    if (typeof value === "number" && value > 0) return Math.floor(value);
    let providers = this.options.session?.executionProviders ?? [];
    let usesAccelerator = providers.some((provider) => {
      let name = (typeof provider === "string" ? provider : provider.name).toLowerCase();
      return name !== "cpu" && name !== "wasm";
    });
    return usesAccelerator ? 1 : 4;
  }
};

// node_modules/ppu-paddle-ocr/core/session-factory.js
var ALWAYS_AVAILABLE_FALLBACKS = /* @__PURE__ */ new Set(["cpu", "wasm"]);
function providerName(provider) {
  return typeof provider === "string" ? provider : provider.name;
}
async function createSessionWithFallback(ort, modelData, sessionOpts, logger, onFallback) {
  let opts = sessionOpts ?? {};
  try {
    return await ort.InferenceSession.create(modelData, opts);
  } catch (err) {
    let providers = opts.executionProviders ?? [];
    let names = providers.map(providerName);
    let alreadySafe = names.every((n) => ALWAYS_AVAILABLE_FALLBACKS.has(n));
    if (alreadySafe || names.length === 0) {
      throw err;
    }
    let fallback = names.find((n) => ALWAYS_AVAILABLE_FALLBACKS.has(n));
    let fallbackName = fallback ?? (names.includes("wasm") ? "wasm" : "cpu");
    let msg = err instanceof Error ? err.message : String(err);
    logger(`executionProviders=${JSON.stringify(names)} failed (${msg}); falling back to ["${fallbackName}"].`);
    let fallbackOpts = { ...opts, executionProviders: [fallbackName] };
    onFallback?.(fallbackOpts);
    return ort.InferenceSession.create(modelData, fallbackOpts);
  }
}

// node_modules/ppu-ocv/canvas-factory.js
var _platform = null;
function setPlatform(platform) {
  _platform = platform;
}
function getPlatform() {
  if (!_platform) {
    throw new Error('No canvas platform registered. Import "ppu-ocv" (Node), "ppu-ocv/web" (browser), "ppu-ocv/canvas" (Node canvas-only), "ppu-ocv/canvas-web" (browser canvas-only), or "ppu-ocv/canvas-mobile" (React Native / Skia) to auto-register.');
  }
  return _platform;
}
function isCanvasLike(value) {
  return typeof value === "object" && value !== null && typeof value.getContext === "function" && typeof value.width === "number" && typeof value.height === "number";
}

// node_modules/ppu-ocv/platform/web.js
var webPlatform = { createCanvas(width, height) {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }
  if (typeof document !== "undefined") {
    let c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    return c;
  }
  throw new Error("No canvas implementation available in this environment.");
}, async loadImage(source) {
  let blob;
  if (source instanceof ArrayBuffer) {
    blob = new Blob([source]);
  } else if (typeof source === "string") {
    let res = await fetch(source);
    blob = await res.blob();
  } else {
    throw new Error("loadImage: unsupported source type");
  }
  let bitmap = await createImageBitmap(blob);
  let canvas = webPlatform.createCanvas(bitmap.width, bitmap.height);
  let ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}, isCanvas(value) {
  if (typeof HTMLCanvasElement !== "undefined" && value instanceof HTMLCanvasElement) {
    return true;
  }
  if (typeof OffscreenCanvas !== "undefined" && value instanceof OffscreenCanvas) {
    return true;
  }
  return false;
} };

// node_modules/ppu-ocv/canvas-toolkit.base.js
var CanvasToolkitBase = class _CanvasToolkitBase {
  static _baseInstance = null;
  step = 0;
  constructor() {
  }
  static getInstance() {
    if (!_CanvasToolkitBase._baseInstance) {
      _CanvasToolkitBase._baseInstance = new _CanvasToolkitBase();
    }
    return _CanvasToolkitBase._baseInstance;
  }
  crop(options) {
    const { bbox, canvas } = options;
    let croppedCanvas = getPlatform().createCanvas(bbox.x1 - bbox.x0, bbox.y1 - bbox.y0);
    let croppedCtx = croppedCanvas.getContext("2d");
    croppedCtx.drawImage(canvas, bbox.x0, bbox.y0, bbox.x1 - bbox.x0, bbox.y1 - bbox.y0, 0, 0, croppedCanvas.width, croppedCanvas.height);
    return croppedCanvas;
  }
  isDirty(options) {
    const { canvas, threshold = 127.5, majorColorThreshold = 0.97 } = options;
    let whiteCount = 0;
    let blackCount = 0;
    let borderlessCanvas = this.crop({ bbox: { x0: canvas.width * 0.1, y0: canvas.height * 0.1, x1: canvas.width * 0.9, y1: canvas.height * 0.9 }, canvas });
    let ctx = borderlessCanvas.getContext("2d");
    let colorData = ctx.getImageData(0, 0, borderlessCanvas.width, borderlessCanvas.height).data;
    for (let i = 0; i < colorData.length; i += 4) {
      let red = colorData[i];
      let green = colorData[i + 1];
      let blue = colorData[i + 2];
      if (red >= threshold && green >= threshold && blue >= threshold) {
        whiteCount++;
      } else {
        blackCount++;
      }
    }
    let majorColorRatio = Math.max(whiteCount, blackCount) / (blackCount + whiteCount);
    return majorColorRatio < majorColorThreshold;
  }
  drawLine(options) {
    const { ctx, x, y, width, height, lineWidth = 2, color = "blue" } = options;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(x, y, width, height);
    ctx.closePath();
  }
  drawContour(options) {
    const { ctx, contour, strokeStyle = "red", lineWidth = 2 } = options;
    let pts = contour.data32S;
    if (pts.length < 4) return;
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(pts[0] ?? 0, pts[1] ?? 0);
    for (let i = 2; i < pts.length; i += 2) {
      ctx.lineTo(pts[i] ?? 0, pts[i + 1] ?? 0);
    }
    ctx.closePath();
    ctx.stroke();
  }
};

// node_modules/ppu-ocv/canvas-io.js
async function bufferToCanvas(file) {
  if (isCanvasLike(file)) return file;
  return getPlatform().loadImage(file);
}
async function canvasToBuffer(canvas) {
  if (canvas instanceof ArrayBuffer) return canvas;
  if (typeof canvas.toBuffer === "function") {
    let buffer = canvas.toBuffer("image/png");
    let arrayBuffer = new ArrayBuffer(buffer.byteLength);
    new Uint8Array(arrayBuffer).set(new Uint8Array(buffer));
    return arrayBuffer;
  }
  let toBlob = canvas.toBlob;
  if (typeof toBlob === "function") {
    let blob = await new Promise((resolve, reject) => {
      toBlob.call(canvas, (b) => b ? resolve(b) : reject(new Error("toBlob returned null")), "image/png");
    });
    return blob.arrayBuffer();
  }
  if (typeof canvas.convertToBlob === "function") {
    let blob = await canvas.convertToBlob({ type: "image/png" });
    return blob.arrayBuffer();
  }
  if (typeof canvas.toDataURL === "function") {
    let dataURL = canvas.toDataURL("image/png");
    let base64Data = dataURL.replace(/^data:image\/png;base64,/, "");
    let binaryString = atob(base64Data);
    let arrayBuffer = new ArrayBuffer(binaryString.length);
    let bytes = new Uint8Array(arrayBuffer);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return arrayBuffer;
  }
  let ctx = canvas.getContext("2d");
  let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let canvasBuffer = new ArrayBuffer(imageData.data.byteLength);
  new Uint8Array(canvasBuffer).set(new Uint8Array(imageData.data.buffer, imageData.data.byteOffset, imageData.data.byteLength));
  return canvasBuffer;
}

// node_modules/ppu-ocv/canvas-regions.js
function detectRegions(data, width, height, options = {}) {
  const { foreground = "light", thresh = 127, minArea = 1, maxArea = 1 / 0, padding, scale = 1 } = options;
  let visited = new Uint8Array(width * height);
  let regions = [];
  let neighbours = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  let isForeground = (pixelIdx) => {
    let r = data[pixelIdx] ?? 0;
    return foreground === "light" ? r > thresh : r <= thresh;
  };
  for (let startY = 0; startY < height; startY++) {
    for (let startX = 0; startX < width; startX++) {
      let startFlat = startY * width + startX;
      if (visited[startFlat]) continue;
      visited[startFlat] = 1;
      if (!isForeground(startFlat * 4)) continue;
      let stack = [startFlat];
      let minX = startX, maxX = startX;
      let minY = startY, maxY = startY;
      let area = 0;
      while (stack.length > 0) {
        let flat = stack.pop();
        if (flat === void 0) break;
        area++;
        let x = flat % width;
        let y = (flat - x) / width;
        if (x < minX) minX = x;
        else if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        else if (y > maxY) maxY = y;
        for (const [dx, dy] of neighbours) {
          let nx = x + dx;
          let ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          let nFlat = ny * width + nx;
          if (visited[nFlat]) continue;
          visited[nFlat] = 1;
          if (isForeground(nFlat * 4)) stack.push(nFlat);
        }
      }
      if (area >= minArea && area <= maxArea) {
        let x0 = minX;
        let y0 = minY;
        let x1 = maxX + 1;
        let y1 = maxY + 1;
        if (padding) {
          let bboxH = y1 - y0;
          let vPad = Math.round(bboxH * (padding.vertical ?? 0));
          let hPad = Math.round(bboxH * (padding.horizontal ?? 0));
          x0 = Math.max(0, x0 - hPad);
          y0 = Math.max(0, y0 - vPad);
          x1 = Math.min(width, x1 + hPad);
          y1 = Math.min(height, y1 + vPad);
        }
        if (scale !== 1) {
          x0 = Math.max(0, Math.round(x0 * scale));
          y0 = Math.max(0, Math.round(y0 * scale));
          x1 = Math.round(x1 * scale);
          y1 = Math.round(y1 * scale);
        }
        regions.push({ bbox: { x0, y0, x1, y1 }, area });
      }
    }
  }
  return regions;
}

// node_modules/ppu-ocv/canvas-processor.js
var CanvasProcessor = class {
  _canvas;
  constructor(source) {
    this._canvas = source;
  }
  get width() {
    return this._canvas.width;
  }
  get height() {
    return this._canvas.height;
  }
  resize(options) {
    const { width, height } = options;
    let dst = getPlatform().createCanvas(width, height);
    dst.getContext("2d").drawImage(this._canvas, 0, 0, width, height);
    this._canvas = dst;
    return this;
  }
  grayscale() {
    const { width, height } = this._canvas;
    let imageData = this._canvas.getContext("2d").getImageData(0, 0, width, height);
    let d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      let luma = Math.round(0.299 * (d[i] ?? 0) + 0.587 * (d[i + 1] ?? 0) + 0.114 * (d[i + 2] ?? 0));
      d[i] = luma;
      d[i + 1] = luma;
      d[i + 2] = luma;
    }
    let dst = getPlatform().createCanvas(width, height);
    dst.getContext("2d").putImageData(imageData, 0, 0);
    this._canvas = dst;
    return this;
  }
  convert(options = {}) {
    const { alpha = 1, beta = 0 } = options;
    if (alpha === 1 && beta === 0) return this;
    const { width, height } = this._canvas;
    let imageData = this._canvas.getContext("2d").getImageData(0, 0, width, height);
    let d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.round((d[i] ?? 0) * alpha + beta);
      d[i + 1] = Math.round((d[i + 1] ?? 0) * alpha + beta);
      d[i + 2] = Math.round((d[i + 2] ?? 0) * alpha + beta);
    }
    let dst = getPlatform().createCanvas(width, height);
    dst.getContext("2d").putImageData(imageData, 0, 0);
    this._canvas = dst;
    return this;
  }
  invert() {
    const { width, height } = this._canvas;
    let imageData = this._canvas.getContext("2d").getImageData(0, 0, width, height);
    let d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 255 - (d[i] ?? 0);
      d[i + 1] = 255 - (d[i + 1] ?? 0);
      d[i + 2] = 255 - (d[i + 2] ?? 0);
    }
    let dst = getPlatform().createCanvas(width, height);
    dst.getContext("2d").putImageData(imageData, 0, 0);
    this._canvas = dst;
    return this;
  }
  threshold(options = {}) {
    const { thresh = 127, maxValue = 255 } = options;
    const { width, height } = this._canvas;
    let imageData = this._canvas.getContext("2d").getImageData(0, 0, width, height);
    let d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      let luma = d[i] === d[i + 1] && d[i + 1] === d[i + 2] ? d[i] ?? 0 : Math.round(0.299 * (d[i] ?? 0) + 0.587 * (d[i + 1] ?? 0) + 0.114 * (d[i + 2] ?? 0));
      let val = luma > thresh ? maxValue : 0;
      d[i] = val;
      d[i + 1] = val;
      d[i + 2] = val;
    }
    let dst = getPlatform().createCanvas(width, height);
    dst.getContext("2d").putImageData(imageData, 0, 0);
    this._canvas = dst;
    return this;
  }
  border(options = {}) {
    const { size = 10, color = "white" } = options;
    const { width, height } = this._canvas;
    let dst = getPlatform().createCanvas(width + size * 2, height + size * 2);
    let ctx = dst.getContext("2d");
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, dst.width, dst.height);
    ctx.drawImage(this._canvas, size, size);
    this._canvas = dst;
    return this;
  }
  rotate(options) {
    const { angle, cx = this._canvas.width / 2, cy = this._canvas.height / 2 } = options;
    if (angle === 0) return this;
    const { width, height } = this._canvas;
    let dst = getPlatform().createCanvas(width, height);
    let ctx = dst.getContext("2d");
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-angle * Math.PI / 180);
    ctx.drawImage(this._canvas, -cx, -cy);
    ctx.restore();
    this._canvas = dst;
    return this;
  }
  findRegions(options = {}) {
    const { width, height } = this._canvas;
    let data = this._canvas.getContext("2d").getImageData(0, 0, width, height).data;
    return detectRegions(data, width, height, options);
  }
  toCanvas() {
    return this._canvas;
  }
  static async prepareCanvas(file) {
    return bufferToCanvas(file);
  }
  static async prepareBuffer(canvas) {
    return canvasToBuffer(canvas);
  }
};

// node_modules/ppu-ocv/index.canvas-web.js
setPlatform(webPlatform);

// node_modules/ppu-paddle-ocr/web/platform.web.js
var WebPlatformProvider = class {
  pathSeparator = "/";
  ort = ort_wasm_bundle_min_exports;
  createCanvas(width, height) {
    let canvas = getPlatform().createCanvas(width, height);
    let getContext = canvas.getContext.bind(canvas);
    getContext("2d", { willReadFrequently: true });
    return canvas;
  }
  isCanvas(image) {
    return !!image && typeof image.getContext === "function";
  }
  async loadResource(source, defaultUrl) {
    if (source instanceof ArrayBuffer) {
      return source;
    }
    let sourceToLoad = typeof source === "string" ? source : defaultUrl;
    let response = await fetch(sourceToLoad);
    if (!response.ok) {
      throw new Error(`Failed to fetch resource from ${sourceToLoad}`);
    }
    return response.arrayBuffer();
  }
  async saveDebugImage(_canvas, _filename, _outputDir) {
    return Promise.resolve();
  }
  canvas = { prepareCanvas: (image) => CanvasProcessor.prepareCanvas(image), createProcessor: (canvas) => new CanvasProcessor(canvas), getToolkit: () => CanvasToolkitBase.getInstance() };
};
function defaultWasmPaths() {
  let version = Y.versions.web ?? Y.versions.common;
  return `https://cdn.jsdelivr.net/npm/onnxruntime-web@${version}/dist/`;
}
function isWebWorker() {
  return typeof globalThis.WorkerGlobalScope === "function";
}
function applyDefaultWasmPaths() {
  let inBrowser = typeof window !== "undefined" || isWebWorker();
  if (!inBrowser || Y.wasm.wasmPaths) return;
  Y.wasm.wasmPaths = defaultWasmPaths();
}
applyDefaultWasmPaths();
async function isWebGpuAvailable() {
  if (typeof navigator === "undefined") return false;
  let nav = navigator;
  if (!nav.gpu || typeof nav.gpu.requestAdapter !== "function") return false;
  try {
    let adapter = await nav.gpu.requestAdapter();
    return adapter !== null && adapter !== void 0;
  } catch {
    return false;
  }
}
async function getDefaultWebExecutionProviders() {
  if (await isWebGpuAvailable()) {
    return ["webgpu", "wasm"];
  }
  return ["wasm"];
}

// node_modules/ppu-paddle-ocr/web/detection.service.web.js
var DetectionService = class extends BaseDetectionService {
  constructor(session, options = {}, debugging = {}) {
    super(new WebPlatformProvider(), session, options, debugging, "canvas-native");
  }
};

// node_modules/ppu-paddle-ocr/core/recognition/batched.js
init_ctc();
init_image_tensor();
async function recognizeCropsBatched(crops, ctx, charactersDictionary) {
  let targetHeight = ctx.options.imageHeight ?? 48;
  let batchSize = Math.max(1, ctx.options.recBatchSize ?? 6);
  let dict = charactersDictionary ?? ctx.options.charactersDictionary ?? [];
  let spaceRecovery = ctx.options.spaceRecovery ?? false;
  let imageProcessor = ctx.engine === "opencv" ? ctx.platform.imageProcessor : void 0;
  let prepped = await Promise.all(crops.map((crop) => preprocessImage(crop, targetHeight, imageProcessor, ctx.platform.canvas.createProcessor.bind(ctx.platform.canvas))));
  let order = prepped.map((_, i) => i).sort((a, b) => {
    let wa = prepped[a]?.tensorWidth ?? 0;
    let wb = prepped[b]?.tensorWidth ?? 0;
    return wa - wb;
  });
  let results = Array.from({ length: crops.length });
  for (let start = 0; start < order.length; start += batchSize) {
    let chunk = order.slice(start, start + batchSize);
    let maxWidth = Math.max(...chunk.map((i) => prepped[i]?.tensorWidth ?? 1));
    let channelSize = targetHeight * maxWidth;
    let stacked = new Float32Array(chunk.length * 3 * channelSize);
    chunk.forEach((cropIndex, row) => {
      let p = prepped[cropIndex];
      if (!p) return;
      let rowBase = row * 3 * channelSize;
      for (let c = 0; c < 3; c++) {
        for (let y = 0; y < targetHeight; y++) {
          let src = (c * targetHeight + y) * p.tensorWidth;
          let dst = rowBase + (c * targetHeight + y) * maxWidth;
          stacked.set(p.imageTensor.subarray(src, src + p.tensorWidth), dst);
          let edge = p.imageTensor[src + p.tensorWidth - 1] ?? 0;
          stacked.fill(edge, dst + p.tensorWidth, dst + maxWidth);
        }
      }
    });
    let inputTensor;
    try {
      inputTensor = new ctx.platform.ort.Tensor("float32", stacked, [chunk.length, 3, targetHeight, maxWidth]);
      let output = await ctx.runInference(inputTensor);
      const [, seqLen, numClasses] = output.dims;
      let data = output.data;
      let rowSize = (seqLen ?? 0) * (numClasses ?? 0);
      chunk.forEach((cropIndex, row) => {
        let widthShare = (prepped[cropIndex]?.tensorWidth ?? maxWidth) / maxWidth;
        let validSeq = Math.max(1, Math.min(seqLen ?? 0, Math.ceil((seqLen ?? 0) * widthShare)));
        results[cropIndex] = decodeLogitsRow(data.subarray(row * rowSize, row * rowSize + validSeq * (numClasses ?? 0)), validSeq, numClasses ?? 0, dict, spaceRecovery);
      });
    } finally {
      inputTensor?.dispose();
    }
  }
  return results;
}
function supportsDynamicBatch(session) {
  let meta = session.inputMetadata;
  let dim = meta?.[0]?.shape?.[0];
  return typeof dim !== "number" || dim < 0;
}

// node_modules/ppu-paddle-ocr/core/recognition/strategies.js
init_ctc();
init_ctc();
init_image_tensor();
function rotateTallCropIfNeeded(crop, ctx) {
  if (!(ctx.options.rotateVerticalCrops ?? true)) return crop;
  if (crop.height / crop.width < 1.5) return crop;
  let rotated = ctx.platform.createCanvas(crop.height, crop.width);
  let c = rotated.getContext("2d");
  c.translate(0, crop.width);
  c.rotate(-Math.PI / 2);
  c.drawImage(crop, 0, 0);
  return rotated;
}
function cropRegion(sourceCanvas, box, canvasOps) {
  return canvasOps.getToolkit().crop({ bbox: { x0: box.x, y0: box.y, x1: box.x + box.width, y1: box.y + box.height }, canvas: sourceCanvas });
}
async function recognizeText(cropCanvas, ctx, charactersDictionary) {
  let targetHeight = ctx.options.imageHeight ?? 48;
  let imageProcessor = ctx.engine === "opencv" ? ctx.platform.imageProcessor : void 0;
  const { imageTensor, tensorWidth, tensorHeight } = await preprocessImage(cropCanvas, targetHeight, imageProcessor, ctx.platform.canvas.createProcessor.bind(ctx.platform.canvas));
  let inputTensor;
  try {
    inputTensor = new ctx.platform.ort.Tensor("float32", imageTensor, [1, 3, tensorHeight, tensorWidth]);
    let result = await ctx.runInference(inputTensor);
    let dict = charactersDictionary ?? ctx.options.charactersDictionary ?? [];
    return decodeResults(result, dict, tensorWidth, ctx.debugging.verbose);
  } finally {
    inputTensor?.dispose();
  }
}
function sortByReadingOrder(results) {
  return [...results].sort((a, b) => {
    if (Math.abs(a.box.y - b.box.y) < (a.box.height + b.box.height) / 4) {
      return a.box.x - b.box.x;
    }
    return a.box.y - b.box.y;
  });
}
async function runPerBoxStrategy(sourceCanvas, validBoxes, ctx, processBox, charactersDictionary) {
  let cropsDebugPath = ctx.debugging.debugFolder ? `${ctx.debugging.debugFolder}${ctx.platform.pathSeparator}crops` : "";
  if (ctx.debugging.debug && cropsDebugPath) {
    let toolkit = ctx.platform.canvas.getToolkit();
    if ("clearOutput" in toolkit && typeof toolkit.clearOutput === "function") {
      toolkit.clearOutput(cropsDebugPath);
    }
  }
  if (!ctx.debugging.debug) {
    let crops = validBoxes.map(({ box }) => rotateTallCropIfNeeded(cropRegion(sourceCanvas, box, ctx.platform.canvas), ctx));
    let recognized = await recognizeCropsBatched(crops, ctx, charactersDictionary);
    let results2 = validBoxes.map(({ box }, i) => ({ text: recognized[i]?.text ?? "", box, confidence: recognized[i]?.confidence ?? 0 }));
    return sortByReadingOrder(results2);
  }
  let results = [];
  for (const { box, index } of validBoxes) {
    let result = await processBox(sourceCanvas, box, index, validBoxes.length, cropsDebugPath, charactersDictionary);
    if (result !== null) {
      results.push(result);
    }
  }
  return sortByReadingOrder(results);
}
async function runLineStrategy(sourceCanvas, validBoxes, ctx, charactersDictionary) {
  let lines = groupBoxesIntoLines(validBoxes);
  let jobs = [];
  let crops = [];
  for (let lineBoxes of lines) {
    let first = lineBoxes[0];
    if (!first) continue;
    if (lineBoxes.length === 1) {
      crops.push(rotateTallCropIfNeeded(cropRegion(sourceCanvas, first.box, ctx.platform.canvas), ctx));
      jobs.push({ lineBoxes, cropWidths: null });
    } else {
      const { mergedCanvas, cropWidths } = mergeLineCrop(sourceCanvas, lineBoxes, ctx.platform.createCanvas.bind(ctx.platform), ctx.platform.canvas);
      crops.push(mergedCanvas);
      jobs.push({ lineBoxes, cropWidths });
    }
  }
  let recognized = await recognizeCropsBatched(crops, ctx, charactersDictionary);
  let results = [];
  jobs.forEach((job, i) => {
    let rec = recognized[i];
    if (!rec) return;
    if (job.cropWidths === null) {
      let first = job.lineBoxes[0];
      if (first) results.push({ text: rec.text, box: first.box, confidence: rec.confidence });
    } else {
      let pieces = splitTextByPositions(rec.text, rec.positions, job.cropWidths);
      for (let i2 = 0; i2 < job.lineBoxes.length; i2++) {
        let lb = job.lineBoxes[i2];
        if (!lb) continue;
        results.push({ text: (pieces[i2] ?? "").trim(), box: lb.box, confidence: rec.confidence });
      }
    }
  });
  return sortByReadingOrder(results);
}
async function runCrossLineStrategy(sourceCanvas, validBoxes, ctx, charactersDictionary) {
  let lines = groupBoxesIntoLines(validBoxes);
  let targetHeight = ctx.options.imageHeight ?? 48;
  let SEPARATOR_GAP = 20;
  let lineCrops = [];
  for (let lineBoxes of lines) {
    if (lineBoxes.length === 1) {
      let first = lineBoxes[0];
      if (!first) continue;
      let canvas = cropRegion(sourceCanvas, first.box, ctx.platform.canvas);
      lineCrops.push({ canvas, boxes: lineBoxes, cropWidths: [canvas.width] });
    } else {
      const { mergedCanvas, cropWidths } = mergeLineCrop(sourceCanvas, lineBoxes, ctx.platform.createCanvas.bind(ctx.platform), ctx.platform.canvas);
      lineCrops.push({ canvas: mergedCanvas, boxes: lineBoxes, cropWidths });
    }
  }
  let resized = lineCrops.map(({ canvas, boxes, cropWidths }, i) => {
    let ar = canvas.width / canvas.height;
    let resizedWidth = Math.max(MIN_CROP_WIDTH, Math.round(targetHeight * ar));
    return { canvas, boxes, cropWidths, resizedWidth, originalHeight: canvas.height, index: i };
  });
  let maxWidth = Math.max(...resized.map((r) => r.resizedWidth));
  let widthFactor = ctx.options.crossLineWidthFactor ?? 1.5;
  let batchTargetWidth = Math.round(maxWidth * widthFactor);
  let batches = packIntoBatches(resized, (item) => item.resizedWidth, batchTargetWidth, SEPARATOR_GAP);
  let results = [];
  for (let batch of batches) {
    let batchSorted = [...batch].sort((a, b) => a.index - b.index);
    let maxOriginalHeight = Math.max(...batchSorted.map((item) => item.originalHeight));
    let stretchedWidths = batchSorted.map((item) => {
      if (item.originalHeight >= maxOriginalHeight) return item.resizedWidth;
      let heightScale = maxOriginalHeight / item.originalHeight;
      return Math.max(MIN_CROP_WIDTH, Math.round(item.resizedWidth * heightScale));
    });
    let totalCropWidth = stretchedWidths.reduce((sum, w) => sum + w, 0);
    let totalWidth = totalCropWidth + SEPARATOR_GAP * (batchSorted.length - 1);
    let batchCanvas = ctx.platform.createCanvas(totalWidth, targetHeight);
    let bctx = batchCanvas.getContext("2d");
    bctx.fillStyle = "white";
    bctx.fillRect(0, 0, totalWidth, targetHeight);
    let offsetX = 0;
    for (let i = 0; i < batchSorted.length; i++) {
      let item = batchSorted[i];
      let drawWidth = stretchedWidths[i];
      if (item === void 0 || drawWidth === void 0) continue;
      bctx.drawImage(item.canvas, 0, 0, item.canvas.width, item.canvas.height, offsetX, 0, drawWidth, targetHeight);
      offsetX += drawWidth;
      if (i < batchSorted.length - 1) offsetX += SEPARATOR_GAP;
    }
    const { text: batchText, confidence: batchConf, positions } = await recognizeText(batchCanvas, ctx, charactersDictionary);
    let flatSegments = [];
    let flatBoxes = [];
    for (let i = 0; i < batchSorted.length; i++) {
      let item = batchSorted[i];
      let drawWidth = stretchedWidths[i];
      if (!item || drawWidth === void 0) continue;
      let scale = drawWidth / item.canvas.width;
      for (let j = 0; j < item.boxes.length; j++) {
        let lb = item.boxes[j];
        if (!lb) continue;
        let w = (item.cropWidths[j] ?? 0) * scale;
        if (j === item.boxes.length - 1 && i < batchSorted.length - 1) w += SEPARATOR_GAP;
        flatSegments.push(w);
        flatBoxes.push(lb);
      }
    }
    let pieces = splitTextByPositions(batchText, positions, flatSegments);
    for (let k = 0; k < flatBoxes.length; k++) {
      let lb = flatBoxes[k];
      if (!lb) continue;
      results.push({ text: (pieces[k] ?? "").trim(), box: lb.box, confidence: batchConf });
    }
  }
  return sortByReadingOrder(results);
}

// node_modules/ppu-paddle-ocr/core/base-recognition.service.js
var BaseRecognitionService = class {
  options;
  debugging;
  session;
  platform;
  engine;
  constructor(platform, session, options = {}, debugging = {}, engine = "opencv") {
    this.platform = platform;
    this.session = session;
    this.options = { ...DEFAULT_RECOGNITION_OPTIONS, ...options };
    this.debugging = { ...DEFAULT_DEBUGGING_OPTIONS, ...debugging };
    if (engine === "opencv" && !this.platform.imageProcessor) {
      this.engine = "canvas-native";
    } else {
      this.engine = engine;
    }
  }
  log(message) {
    if (this.debugging.verbose) {
      console.log(`[RecognitionService] ${message}`);
    }
  }
  async run(image, detection, charactersDictionary, strategy = "per-line") {
    this.log("Starting text recognition process");
    try {
      let sourceCanvasForCrop;
      if (this.platform.isCanvas(image)) {
        sourceCanvasForCrop = image;
      } else if (this.engine === "opencv" && this.platform.imageProcessor) {
        sourceCanvasForCrop = await this.platform.imageProcessor.prepareCanvas(image);
      } else {
        sourceCanvasForCrop = await this.platform.canvas.prepareCanvas(image);
      }
      let validBoxes = this.filterValidBoxes(detection);
      if (validBoxes.length === 0) {
        return [];
      }
      const { canvas: cropCanvas, ratio: cropRatio } = this.buildCropCanvas(sourceCanvasForCrop);
      let cropBoxes = cropRatio === 1 ? validBoxes : validBoxes.map((v) => ({ ...v, box: scaleBox(v.box, cropRatio) }));
      let ctx = this.buildContext();
      let results;
      switch (strategy) {
        case "cross-line":
          results = await runCrossLineStrategy(cropCanvas, cropBoxes, ctx, charactersDictionary);
          break;
        case "per-line":
          results = await runLineStrategy(cropCanvas, cropBoxes, ctx, charactersDictionary);
          break;
        case "per-box":
        default:
          results = await runPerBoxStrategy(cropCanvas, cropBoxes, ctx, (canvas, box, index, total, debugPath, dict) => this.processBox(canvas, box, index, total, debugPath, dict), charactersDictionary);
      }
      if (cropRatio !== 1) {
        results = results.map((r) => ({ ...r, box: scaleBox(r.box, 1 / cropRatio) }));
      }
      let minimumConfidence = this.options.minimumConfidence ?? 0.5;
      return minimumConfidence > 0 ? results.filter((r) => {
        let bar = /[\p{L}\p{N}]/u.test(r.text) ? minimumConfidence : Math.min(1, minimumConfidence + 0.3);
        return r.confidence >= bar;
      }) : results;
    } catch (error) {
      console.error("Error during text recognition:", error instanceof Error ? error.message : String(error));
      return [];
    }
  }
  buildContext() {
    return { platform: this.platform, options: supportsDynamicBatch(this.session) ? this.options : { ...this.options, recBatchSize: 1 }, debugging: this.debugging, engine: this.engine, runInference: (t) => this.runInference(t) };
  }
  filterValidBoxes(boxes) {
    return boxes.map((box, index) => ({ box, index })).filter(({ box, index }) => this.isValidBox(box, index));
  }
  buildCropCanvas(source) {
    const { width, height } = source;
    let maxCropSourceSideLength = this.options.maxCropSourceSideLength ?? 2e3;
    const { width: resizeW, height: resizeH, ratio } = calculateResizeDimensions(width, height, maxCropSourceSideLength);
    if (ratio === 1) {
      return { canvas: source, ratio: 1 };
    }
    let resized = this.platform.createCanvas(resizeW, resizeH);
    resized.getContext("2d").drawImage(source, 0, 0, width, height, 0, 0, resizeW, resizeH);
    return { canvas: resized, ratio };
  }
  async processBox(sourceCanvas, box, index, totalBoxes, debugPath, charactersDictionary) {
    let start = Date.now();
    try {
      let cropCanvas = this.platform.canvas.getToolkit().crop({ bbox: { x0: box.x, y0: box.y, x1: box.x + box.width, y1: box.y + box.height }, canvas: sourceCanvas });
      let ctx = this.buildContext();
      const { text: recognizedText, confidence } = await this.recognizeTextViaContext(cropCanvas, ctx, charactersDictionary);
      if (this.debugging.debug && debugPath) {
        await this.platform.saveDebugImage(cropCanvas, `crop_${String(index).padStart(3, "0")}.png`, debugPath);
        let processingTime = Date.now() - start;
        this.log(`Box ${index + 1}/${totalBoxes}: [x:${box.x}, y:${box.y}, w:${box.width}, h:${box.height}]
	 \u2192 "${recognizedText}" (processed in ${processingTime}ms)
`);
      }
      return { text: recognizedText, box, confidence };
    } catch (e) {
      let err = e instanceof Error ? e : new Error(String(e));
      console.error(`Error processing box ${index + 1}: ${err.message}`, err.stack);
      return null;
    }
  }
  async recognizeTextViaContext(cropCanvas, ctx, charactersDictionary) {
    const { preprocessImage: preprocessImage2 } = await Promise.resolve().then(() => (init_image_tensor(), image_tensor_exports));
    const { decodeResults: decodeResults2 } = await Promise.resolve().then(() => (init_ctc(), ctc_exports));
    let targetHeight = ctx.options.imageHeight ?? 48;
    let imageProcessor = ctx.engine === "opencv" ? ctx.platform.imageProcessor : void 0;
    const { imageTensor, tensorWidth, tensorHeight } = await preprocessImage2(cropCanvas, targetHeight, imageProcessor, ctx.platform.canvas.createProcessor.bind(ctx.platform.canvas));
    let inputTensor;
    try {
      inputTensor = new ctx.platform.ort.Tensor("float32", imageTensor, [1, 3, tensorHeight, tensorWidth]);
      let result = await ctx.runInference(inputTensor);
      let dict = charactersDictionary ?? ctx.options.charactersDictionary ?? [];
      return decodeResults2(result, dict, tensorWidth, this.debugging.verbose, ctx.options.spaceRecovery ?? false);
    } finally {
      inputTensor?.dispose();
    }
  }
  isValidBox(box, index) {
    if (box.width <= 0 || box.height <= 0) {
      console.warn(`Skipping invalid box ${index + 1}: w=${box.width}, h=${box.height}`);
      return false;
    }
    return true;
  }
  async runInference(inputTensor) {
    let yieldMs = this.options.mainThreadYieldMs ?? 0;
    if (yieldMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, yieldMs));
    }
    let feeds = { x: inputTensor };
    let results = await this.session.run(feeds);
    let outputNodeName = Object.keys(results)[0];
    let outputTensor = outputNodeName ? results[outputNodeName] : void 0;
    if (!outputTensor) {
      throw new Error(`Recognition output tensor '${outputNodeName}' not found. Available keys: ${Object.keys(results)}`);
    }
    return outputTensor;
  }
};
function scaleBox(box, ratio) {
  return { x: Math.round(box.x * ratio), y: Math.round(box.y * ratio), width: Math.max(1, Math.round(box.width * ratio)), height: Math.max(1, Math.round(box.height * ratio)) };
}

// node_modules/ppu-paddle-ocr/web/recognition.service.web.js
function withMainThreadYieldDefault(options, onMainThread = typeof window !== "undefined" && !isWebWorker()) {
  if (!onMainThread) return options;
  return { mainThreadYieldMs: DEFAULT_WEB_MAIN_THREAD_YIELD_MS, ...options };
}
var RecognitionService = class extends BaseRecognitionService {
  constructor(session, options = {}, debugging = {}) {
    super(new WebPlatformProvider(), session, withMainThreadYieldDefault(options), debugging, "canvas-native");
  }
};

// node_modules/ppu-paddle-ocr/web/paddle-ocr.service.web.js
var DEFAULT_WEB_SESSION_OPTIONS = { graphOptimizationLevel: "all" };
var PaddleOcrService = class extends BasePaddleOcrService {
  constructor(options) {
    super(new WebPlatformProvider(), options);
    if (this.options.session === void 0 || Object.keys(this.options.session).length === 0) {
      this.options.session = DEFAULT_WEB_SESSION_OPTIONS;
    }
  }
  async initSessions() {
    throw new Error("Initialization is handled proactively in PaddleOcrService. Call initialize() instead.");
  }
  async _loadResource(source, defaultUrl) {
    if (source instanceof ArrayBuffer) {
      this.log("Loading resource from ArrayBuffer");
      return source;
    }
    let sourceUrl = typeof source === "string" ? source : defaultUrl;
    this.log(`Fetching resource from URL: ${sourceUrl}`);
    return fetchArrayBufferWithRetry(sourceUrl);
  }
  async _resolveSessionExecutionProviders() {
    let current = this.options.session ?? {};
    if (current.executionProviders && current.executionProviders.length > 0) {
      this.log(`Using user-provided executionProviders: ${JSON.stringify(current.executionProviders)}`);
      return;
    }
    let providers = await getDefaultWebExecutionProviders();
    this.options.session = { ...current, executionProviders: providers };
    this.log(`Resolved executionProviders: ${JSON.stringify(providers)}`);
  }
  async _createSession(modelData) {
    return createSessionWithFallback(ort_wasm_bundle_min_exports, modelData, this.options.session, (msg) => console.warn(`[PaddleOcrService] ${msg}`), (next) => this.options.session = next);
  }
  async initialize() {
    try {
      this.log("Initializing PaddleOcrService (Web)...");
      await this._resolveSessionExecutionProviders();
      const [detModelBuffer, recModelBuffer, dictBuffer] = await Promise.all([this._loadResource(this.options.model?.detection, DEFAULT_MODEL_URLS.detection), this._loadResource(this.options.model?.recognition, DEFAULT_MODEL_URLS.recognition), this._loadResource(this.options.model?.charactersDictionary, DEFAULT_MODEL_URLS.charactersDictionary)]);
      const [detectionSession, recognitionSession] = await Promise.all([this._createSession(new Uint8Array(detModelBuffer)), this._createSession(new Uint8Array(recModelBuffer))]);
      this.detectionSession = detectionSession;
      this.recognitionSession = recognitionSession;
      if (this.options.model) this.options.model.detection = detModelBuffer;
      if (this.options.model) this.options.model.recognition = recModelBuffer;
      this.log(`Detection ONNX model loaded successfully
	input: ${detectionSession.inputNames}
	output: ${detectionSession.outputNames}`);
      this.log(`Recognition ONNX model loaded successfully
	input: ${recognitionSession.inputNames}
	output: ${recognitionSession.outputNames}`);
      let charactersDictionary = parseDictionary(dictBuffer);
      if (charactersDictionary.length === 0) {
        throw new Error("Character dictionary is empty or could not be loaded.");
      }
      if (this.options.model) this.options.model.charactersDictionary = dictBuffer;
      if (this.options.recognition) this.options.recognition.charactersDictionary = charactersDictionary;
      this.log(`Character dictionary loaded with ${charactersDictionary.length} entries.`);
      this.detector = new DetectionService(detectionSession, this.options.detection, this.options.debugging);
      this.recognitor = new RecognitionService(recognitionSession, this.options.recognition, this.options.debugging);
      if (this.options.model) this.options.model.detection = void 0;
      if (this.options.model) this.options.model.recognition = void 0;
    } catch (error) {
      console.error("Failed to initialize PaddleOcrService Web:", error);
      throw error;
    }
  }
  isInitialized() {
    return this.detectionSession !== null && this.recognitionSession !== null;
  }
  async changeDetectionModel(model) {
    this.log("Changing detection model...");
    let modelBuffer = await this._loadResource(model, DEFAULT_MODEL_URLS.detection);
    await this.detectionSession?.release();
    this.detectionSession = await this._createSession(new Uint8Array(modelBuffer));
    this.detector = new DetectionService(this.detectionSession, this.options.detection, this.options.debugging);
    if (this.options.model) this.options.model.detection = modelBuffer;
    this.log("Detection model changed successfully.");
  }
  async changeRecognitionModel(model) {
    this.log("Changing recognition model...");
    let modelBuffer = await this._loadResource(model, DEFAULT_MODEL_URLS.recognition);
    await this.recognitionSession?.release();
    this.recognitionSession = await this._createSession(new Uint8Array(modelBuffer));
    this.recognitor = new RecognitionService(this.recognitionSession, this.options.recognition, this.options.debugging);
    if (this.options.model) this.options.model.recognition = modelBuffer;
    this.log("Recognition model changed successfully.");
  }
  async changeTextDictionary(dictionary) {
    this.log("Changing text dictionary...");
    let dictBuffer = await this._loadResource(dictionary, DEFAULT_MODEL_URLS.charactersDictionary);
    let charactersDictionary = parseDictionary(dictBuffer);
    if (charactersDictionary.length === 0) {
      throw new Error("Character dictionary is empty or could not be loaded.");
    }
    if (this.options.model) this.options.model.charactersDictionary = dictBuffer;
    if (this.options.recognition) this.options.recognition.charactersDictionary = charactersDictionary;
    this.log(`Character dictionary changed successfully with ${charactersDictionary.length} entries.`);
  }
  async recognize(image, options) {
    return super.recognize(image, options);
  }
  async destroy() {
    await this.detectionSession?.release();
    await this.recognitionSession?.release();
    this.detectionSession = null;
    this.recognitionSession = null;
    this.detector = null;
    this.recognitor = null;
  }
};

// src/entry.js
var WASM_ONLY = true;
try {
  Y.wasm.wasmPaths = new URL("./", import.meta.url).href;
  console.log("[Paddle] wasmPaths \u5DF2\u6539\u70BA\u672C\u6A5F:", Y.wasm.wasmPaths);
} catch (e) {
  console.warn("[Paddle] \u6539 wasmPaths \u5931\u6557", e);
}
export {
  DEFAULT_DEBUGGING_OPTIONS,
  DEFAULT_DETECTION_OPTIONS,
  DEFAULT_MODEL,
  DEFAULT_MODEL_URLS,
  DEFAULT_PADDLE_OPTIONS,
  DEFAULT_PROCESSING_ENGINE,
  DEFAULT_PROCESSING_OPTIONS,
  DEFAULT_RECOGNITION_OPTIONS,
  DICT_BASE_URL,
  DetectionService,
  MODEL_BASE_URL,
  MODEL_PRESETS,
  PaddleOcrService,
  RecognitionService,
  V3_JAPANESE_MOBILE_MODEL,
  V3_MOBILE_MODEL,
  V4_EN_MOBILE_MODEL,
  V4_MOBILE_MODEL,
  V4_SERVER_DOC_MODEL,
  V4_SERVER_MODEL,
  V5_ARABIC_MOBILE_MODEL,
  V5_CYRILLIC_MOBILE_MODEL,
  V5_DEVANAGARI_MOBILE_MODEL,
  V5_EN_MOBILE_INT8_MODEL,
  V5_EN_MOBILE_MODEL,
  V5_EN_SERVER_MODEL,
  V5_ESLAV_MOBILE_MODEL,
  V5_GREEK_MOBILE_MODEL,
  V5_KOREAN_MOBILE_MODEL,
  V5_LATIN_MOBILE_MODEL,
  V5_MOBILE_MODEL,
  V5_SERVER_MODEL,
  V5_TAMIL_MOBILE_MODEL,
  V5_TELUGU_MOBILE_MODEL,
  V5_THAI_MOBILE_MODEL,
  V6_MEDIUM_MODEL,
  V6_SMALL_MODEL,
  V6_TINY_MODEL,
  WASM_ONLY,
  getDefaultWebExecutionProviders,
  isWebGpuAvailable,
  isWebWorker,
  ort_wasm_bundle_min_exports as ort
};
/*! Bundled license information:

onnxruntime-web/dist/ort.wasm.bundle.min.mjs:
  (*!
   * ONNX Runtime Web v1.27.0
   * Copyright (c) Microsoft Corporation. All rights reserved.
   * Licensed under the MIT License.
   *)
*/
