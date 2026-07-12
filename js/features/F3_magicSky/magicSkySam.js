// F3 魔法天空 - MobileSAM 點選修復 v0.5.0
// Encoder 一次 / 每次點擊 decoder → 合併修復遮罩。

const ORT_VERSION = "1.22.0";
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist`;
const SAM_ENCODER_URL = "https://huggingface.co/Heliosoph/sam-onnx/resolve/main/mobile_sam_image_encoder.onnx";
const SAM_DECODER_URL = "https://huggingface.co/Heliosoph/sam-onnx/resolve/main/sam_mask_decoder_single.onnx";
const SAM_MODEL_CACHE = "photo-effects-mobilesam-v1";
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
  const inputName = encoder.inputNames[0];
  const results = await encoder.run({ [inputName]: preprocessed.tensor });
  const embeddingName = encoder.outputNames[0];
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
  const masks = results[decoder.outputNames[0]];
  return masks;
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
    encoderSessionPromise = (async () => {
      onStatus("下載 SAM 編碼模型（首次約 28MB）…");
      const ort = await loadOrt();
      const buffer = await fetchModelBuffer(SAM_ENCODER_URL, onStatus, "SAM 編碼模型");
      onStatus("初始化 SAM 編碼模型…");
      return ort.InferenceSession.create(buffer, { executionProviders: ["wasm"] });
    })().catch(error => {
      encoderSessionPromise = null;
      throw error;
    });
  }
  return encoderSessionPromise;
}

async function ensureDecoderSession(onStatus){
  if (!decoderSessionPromise) {
    decoderSessionPromise = (async () => {
      onStatus("下載 SAM 解碼模型（首次約 16MB）…");
      const ort = await loadOrt();
      const buffer = await fetchModelBuffer(SAM_DECODER_URL, onStatus, "SAM 解碼模型");
      onStatus("初始化 SAM 解碼模型…");
      return ort.InferenceSession.create(buffer, { executionProviders: ["wasm"] });
    })().catch(error => {
      decoderSessionPromise = null;
      throw error;
    });
  }
  return decoderSessionPromise;
}

async function fetchModelBuffer(url, onStatus, label){
  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open(SAM_MODEL_CACHE);
      const cached = await cache.match(url);
      if (cached) {
        onStatus(`讀取已快取的 ${label}…`);
        return cached.arrayBuffer();
      }
    } catch (error) {
      console.warn("[F3 SAM] 模型快取讀取失敗：", error);
    }
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${label}下載失敗（${response.status}）`);
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength < 1024) {
    throw new Error(`${label}檔案異常`);
  }

  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open(SAM_MODEL_CACHE);
      await cache.put(url, new Response(buffer.slice(0)));
    } catch (error) {
      console.warn("[F3 SAM] 模型快取寫入失敗：", error);
    }
  }

  return buffer;
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
  const float32Data = new Float32Array(3 * SAM_INPUT_SIZE * SAM_INPUT_SIZE);
  const plane = SAM_INPUT_SIZE * SAM_INPUT_SIZE;

  for (let i = 0; i < plane; i += 1) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    float32Data[i] = (r - SAM_MEAN[0]) / SAM_STD[0];
    float32Data[i + plane] = (g - SAM_MEAN[1]) / SAM_STD[1];
    float32Data[i + plane * 2] = (b - SAM_MEAN[2]) / SAM_STD[2];
  }

  return {
    tensor: new ort.Tensor("float32", float32Data, [1, 3, SAM_INPUT_SIZE, SAM_INPUT_SIZE]),
    resizedW,
    resizedH
  };
}

async function loadOrt(){
  if (ortModule) return ortModule;
  ortModule = await import(`${ORT_BASE}/ort.bundle.min.mjs`);
  ortModule.env.wasm.numThreads = 1;
  ortModule.env.wasm.wasmPaths = ORT_BASE + "/";
  return ortModule;
}
