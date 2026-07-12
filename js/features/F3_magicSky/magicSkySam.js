// F3 魔法天空 - MobileSAM 點選修復 v0.5.3
// Encoder 一次 / 每次點擊 decoder → 合併修復遮罩。

const ORT_VERSION = "1.22.0";
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist`;
const SAM_ENCODER_URLS = [
  "https://huggingface.co/Heliosoph/sam-onnx/resolve/main/mobile_sam_image_encoder.onnx",
  "https://huggingface.co/Acly/MobileSAM/resolve/main/mobile_sam_image_encoder.onnx"
];
const SAM_DECODER_URLS = [
  "https://huggingface.co/Heliosoph/sam-onnx/resolve/main/sam_mask_decoder_single.onnx",
  "https://huggingface.co/Acly/MobileSAM/resolve/main/sam_mask_decoder_single.onnx"
];
const SAM_MODEL_CACHE = "photo-effects-mobilesam-v2";
const SAM_ENCODER_MIN_BYTES = 20 * 1024 * 1024;
const SAM_DECODER_MIN_BYTES = 12 * 1024 * 1024;
const SAM_INPUT_SIZE = 1024;
const SAM_MEAN = [123.675, 116.28, 103.53];
const SAM_STD = [58.395, 57.12, 57.375];

let ortModule = null;
let encoderSessionPromise = null;
let decoderSessionPromise = null;
const embeddingCache = new Map();
const repairMaskCache = new Map();

export function getSamRepairMask(photoKey){
  return repairMaskCache.get(photoKey || "") || null;
}

export function clearSamRepairMask(photoKey){
  if (photoKey) repairMaskCache.delete(photoKey);
}

export function setSamRepairMask(photoKey, canvas){
  if (!canvas) return;
  repairMaskCache.set(photoKey || "default", canvas);
}

export function clearSamEmbedding(photoKey){
  if (photoKey) embeddingCache.delete(photoKey);
}

export async function ensureSamEmbedding(sourceImage, photoKey, onStatus = () => {}){
  const key = photoKey || "default";
  const cached = embeddingCache.get(key);
  if (cached?.width === sourceImage.width && cached?.height === sourceImage.height) {
    return cached;
  }

  const ort = await loadOrt();
  const encoder = await ensureEncoderSession(onStatus);
  onStatus("SAM 影像編碼中…");
  const preprocessed = preprocessSamImage(sourceImage, ort);
  const inputName = encoder.inputNames.includes("input_image")
    ? "input_image"
    : encoder.inputNames[0];
  const results = await encoder.run({ [inputName]: preprocessed.tensor });
  const embeddingName = encoder.outputNames.includes("image_embeddings")
    ? "image_embeddings"
    : encoder.outputNames[0];
  const entry = {
    width: sourceImage.width,
    height: sourceImage.height,
    embeddings: results[embeddingName],
    resizedW: preprocessed.resizedW,
    resizedH: preprocessed.resizedH
  };
  embeddingCache.set(key, entry);
  return entry;
}

export async function decodeSamClick(samEntry, imageX, imageY, onStatus = () => {}){
  if (!samEntry?.embeddings) {
    throw new Error("Missing SAM embedding");
  }
  onStatus("解碼修復遮罩…");
  const ort = await loadOrt();
  const decoder = await ensureDecoderSession(onStatus);
  const pointCoords = new ort.Tensor(
    "float32",
    new Float32Array([imageX, imageY]),
    [1, 1, 2]
  );
  const pointLabels = new ort.Tensor("float32", new Float32Array([1]), [1, 1]);
  const maskInput = new ort.Tensor("float32", new Float32Array(256 * 256), [1, 1, 256, 256]);
  const hasMaskInput = new ort.Tensor("float32", new Float32Array([0]), [1]);
  const origImSize = new ort.Tensor(
    "float32",
    new Float32Array([samEntry.height, samEntry.width]),
    [2]
  );

  const feeds = {
    image_embeddings: samEntry.embeddings,
    point_coords: pointCoords,
    point_labels: pointLabels,
    mask_input: maskInput,
    has_mask_input: hasMaskInput,
    orig_im_size: origImSize
  };

  const results = await decoder.run(feeds);
  const maskOutputName = decoder.outputNames.includes("masks")
    ? "masks"
    : decoder.outputNames[0];
  return results[maskOutputName];
}

export function mergeSamMaskIntoRepair(photoKey, width, height, maskTensor){
  const key = photoKey || "default";
  let canvas = repairMaskCache.get(key);
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    repairMaskCache.set(key, canvas);
  }

  const maskData = maskTensor.data;
  const dims = maskTensor.dims || [];
  const maskH = dims.length >= 4 ? dims[2] : height;
  const maskW = dims.length >= 4 ? dims[3] : width;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;

  for (let y = 0; y < height; y += 1) {
    const my = Math.min(maskH - 1, Math.floor((y + 0.5) * maskH / height));
    for (let x = 0; x < width; x += 1) {
      const mx = Math.min(maskW - 1, Math.floor((x + 0.5) * maskW / width));
      const value = maskData[my * maskW + mx];
      if (value <= 0) continue;
      const idx = (y * width + x) * 4 + 3;
      pixels[idx] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

async function ensureEncoderSession(onStatus){
  if (!encoderSessionPromise) {
    encoderSessionPromise = createModelSession(
      SAM_ENCODER_URLS,
      SAM_ENCODER_MIN_BYTES,
      onStatus,
      "SAM 編碼模型",
      "下載 SAM 編碼模型（首次約 28MB）…"
    ).catch(error => {
      encoderSessionPromise = null;
      throw error;
    });
  }
  return encoderSessionPromise;
}

async function ensureDecoderSession(onStatus){
  if (!decoderSessionPromise) {
    decoderSessionPromise = createModelSession(
      SAM_DECODER_URLS,
      SAM_DECODER_MIN_BYTES,
      onStatus,
      "SAM 解碼模型",
      "下載 SAM 解碼模型（首次約 16MB）…"
    ).catch(error => {
      decoderSessionPromise = null;
      throw error;
    });
  }
  return decoderSessionPromise;
}

async function createModelSession(urls, minBytes, onStatus, label, downloadMessage){
  const ort = await loadOrt();
  onStatus(downloadMessage);
  const buffer = await fetchModelBuffer(urls, onStatus, label, minBytes);
  onStatus(`初始化 ${label}…`);
  try {
    return await ort.InferenceSession.create(buffer, { executionProviders: ["wasm"] });
  } catch (error) {
    await invalidateModelCache(urls);
    throw new Error(`${label}初始化失敗：${error?.message || error}`);
  }
}

async function fetchModelBuffer(urls, onStatus, label, minBytes){
  let lastError = null;
  for (const url of urls) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await fetchModelBufferOnce(url, onStatus, label, minBytes);
      } catch (error) {
        lastError = error;
        console.warn(`[F3 SAM] ${label} 下載失敗（${url}，第 ${attempt + 1} 次）：`, error);
        await invalidateModelCache([url]);
        if (attempt < 2) {
          onStatus(`${label}下載重試中（${attempt + 2}/3）…`);
          await delay(1000 * (attempt + 1));
        }
      }
    }
  }
  throw lastError || new Error(`${label}下載失敗`);
}

async function fetchModelBufferOnce(url, onStatus, label, minBytes){
  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open(SAM_MODEL_CACHE);
      const cached = await cache.match(url);
      if (cached) {
        const buffer = await cached.arrayBuffer();
        if (isValidModelBuffer(buffer, minBytes)) {
          onStatus(`讀取已快取的 ${label}…`);
          return buffer;
        }
        await cache.delete(url);
      }
    } catch (error) {
      console.warn("[F3 SAM] 模型快取讀取失敗：", error);
    }
  }

  onStatus(`下載 ${label}…`);
  const response = await fetch(url, { cache: "no-store", redirect: "follow" });
  if (!response.ok) {
    throw new Error(`${label}下載失敗（HTTP ${response.status}）`);
  }

  const buffer = await response.arrayBuffer();
  if (!isValidModelBuffer(buffer, minBytes)) {
    throw new Error(`${label}檔案異常（${formatBytes(buffer.byteLength)}）`);
  }

  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open(SAM_MODEL_CACHE);
      await cache.put(url, new Response(buffer.slice(0), {
        headers: { "Content-Type": "application/octet-stream" }
      }));
    } catch (error) {
      console.warn("[F3 SAM] 模型快取寫入失敗：", error);
    }
  }

  return buffer;
}

async function invalidateModelCache(urls){
  if (typeof caches === "undefined") return;
  try {
    const cache = await caches.open(SAM_MODEL_CACHE);
    await Promise.all(urls.map(url => cache.delete(url)));
  } catch (error) {
    console.warn("[F3 SAM] 模型快取清除失敗：", error);
  }
}

function isValidModelBuffer(buffer, minBytes){
  if (!buffer || buffer.byteLength < minBytes) return false;
  const bytes = new Uint8Array(buffer, 0, Math.min(8, buffer.byteLength));
  return bytes[0] !== 0x3c;
}

function formatBytes(bytes){
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}

function delay(ms){
  return new Promise(resolve => setTimeout(resolve, ms));
}

function preprocessSamImage(image, ort){
  const width = image.width;
  const height = image.height;
  const scale = SAM_INPUT_SIZE / Math.max(width, height);
  const resizedW = Math.round(width * scale);
  const resizedH = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = SAM_INPUT_SIZE;
  canvas.height = SAM_INPUT_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "rgb(0, 0, 0)";
  ctx.fillRect(0, 0, SAM_INPUT_SIZE, SAM_INPUT_SIZE);
  ctx.drawImage(image, 0, 0, resizedW, resizedH);

  const { data } = ctx.getImageData(0, 0, SAM_INPUT_SIZE, SAM_INPUT_SIZE);
  const float32Data = new Float32Array(SAM_INPUT_SIZE * SAM_INPUT_SIZE * 3);

  for (let i = 0; i < SAM_INPUT_SIZE * SAM_INPUT_SIZE; i += 1) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const base = i * 3;
    float32Data[base] = (r - SAM_MEAN[0]) / SAM_STD[0];
    float32Data[base + 1] = (g - SAM_MEAN[1]) / SAM_STD[1];
    float32Data[base + 2] = (b - SAM_MEAN[2]) / SAM_STD[2];
  }

  return {
    tensor: new ort.Tensor("float32", float32Data, [SAM_INPUT_SIZE, SAM_INPUT_SIZE, 3]),
    resizedW,
    resizedH
  };
}

async function loadOrt(){
  if (ortModule) return ortModule;
  ortModule = await import(`${ORT_BASE}/ort.bundle.min.mjs`);
  ortModule.env.wasm.wasmPaths = ORT_BASE + "/";
  return ortModule;
}
