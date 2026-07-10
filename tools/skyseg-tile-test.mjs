#!/usr/bin/env node
/**
 * skyseg 分塊（Tile）推論測試
 *
 * 用法：
 *   node tools/skyseg-tile-test.mjs
 *   node tools/skyseg-tile-test.mjs --width 1280 --height 960 --step 160
 *   node tools/skyseg-tile-test.mjs --width 1600 --height 1200 --step 320
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ort from "onnxruntime-node";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODEL_PATH = path.join(__dirname, ".cache", "skyseg_fp16.onnx");
const MODEL_URL = "https://huggingface.co/voyagerfromeast/skyseg/resolve/main/skyseg_fp16.onnx";
const TILE_SIZE = 320;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

function parseArgs(argv){
  const options = {
    width: 1280,
    height: 960,
    step: 160,
    horizon: 0.55
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--width") options.width = Number(argv[++i]);
    else if (argv[i] === "--height") options.height = Number(argv[++i]);
    else if (argv[i] === "--step") options.step = Number(argv[++i]);
    else if (argv[i] === "--horizon") options.horizon = Number(argv[++i]);
  }
  return options;
}

async function ensureModel(){
  if (fs.existsSync(MODEL_PATH)) return MODEL_PATH;
  fs.mkdirSync(path.dirname(MODEL_PATH), { recursive: true });
  console.log("下載模型…");
  const response = await fetch(MODEL_URL);
  if (!response.ok) throw new Error(`下載失敗：${response.status}`);
  fs.writeFileSync(MODEL_PATH, Buffer.from(await response.arrayBuffer()));
  return MODEL_PATH;
}

/** 合成測試圖：上方天空、下方地面，帶鋸齒山丘輪廓 */
function createSyntheticImage(width, height, horizonRatio){
  const rgba = new Uint8ClampedArray(width * height * 4);
  const horizonY = Math.round(height * horizonRatio);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const hill = Math.sin(x * 0.03) * 18 + Math.sin(x * 0.11) * 8;
      const edgeY = horizonY + hill;
      const isSky = y < edgeY;

      if (isSky) {
        rgba[i] = 90;
        rgba[i + 1] = 160;
        rgba[i + 2] = 230;
      } else {
        rgba[i] = 34;
        rgba[i + 1] = 58;
        rgba[i + 2] = 42;
      }
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

function rgbaToTensor(rgba, srcW, srcH, dstSize){
  const plane = dstSize * dstSize;
  const data = new Float32Array(3 * plane);
  for (let dy = 0; dy < dstSize; dy++) {
    for (let dx = 0; dx < dstSize; dx++) {
      const sx = Math.min(srcW - 1, Math.floor((dx + 0.5) * srcW / dstSize));
      const sy = Math.min(srcH - 1, Math.floor((dy + 0.5) * srcH / dstSize));
      const si = (sy * srcW + sx) * 4;
      const di = dy * dstSize + dx;
      data[di] = (rgba[si] / 255 - MEAN[0]) / STD[0];
      data[di + plane] = (rgba[si + 1] / 255 - MEAN[1]) / STD[1];
      data[di + plane * 2] = (rgba[si + 2] / 255 - MEAN[2]) / STD[2];
    }
  }
  return data;
}

function cropRgba(rgba, width, height, x0, y0, cropW, cropH){
  const out = new Uint8ClampedArray(cropW * cropH * 4);
  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      const sx = Math.min(width - 1, x0 + x);
      const sy = Math.min(height - 1, y0 + y);
      const src = (sy * width + sx) * 4;
      const dst = (y * cropW + x) * 4;
      out[dst] = rgba[src];
      out[dst + 1] = rgba[src + 1];
      out[dst + 2] = rgba[src + 2];
      out[dst + 3] = 255;
    }
  }
  return out;
}

async function runInference(session, inputName, outputName, tensorData){
  const tensor = new ort.Tensor("float32", tensorData, [1, 3, TILE_SIZE, TILE_SIZE]);
  const t0 = performance.now();
  const result = await session.run({ [inputName]: tensor });
  return {
    elapsedMs: performance.now() - t0,
    probabilities: result[outputName].data
  };
}

function upscaleProbabilities(probabilities, outW, outH){
  const out = new Float32Array(outW * outH);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const sx = Math.min(TILE_SIZE - 1, Math.floor(x * TILE_SIZE / outW));
      const sy = Math.min(TILE_SIZE - 1, Math.floor(y * TILE_SIZE / outH));
      out[y * outW + x] = probabilities[sy * TILE_SIZE + sx];
    }
  }
  return out;
}

function sampleTileProbability(probabilities, localX, localY, regionW, regionH){
  const sx = Math.min(TILE_SIZE - 1, Math.floor((localX + 0.5) * TILE_SIZE / regionW));
  const sy = Math.min(TILE_SIZE - 1, Math.floor((localY + 0.5) * TILE_SIZE / regionH));
  return probabilities[sy * TILE_SIZE + sx];
}

function tileBlendWeight(localX, localY, regionW, regionH, feather){
  const dx = Math.min(localX, regionW - 1 - localX);
  const dy = Math.min(localY, regionH - 1 - localY);
  const d = Math.min(dx, dy);
  if (feather <= 0) return 1;
  return Math.min(1, d / feather);
}

function buildTileOrigins(length, step){
  const maxOrigin = Math.max(0, length - TILE_SIZE);
  const origins = [];
  for (let pos = 0; pos <= maxOrigin; pos += step) origins.push(pos);
  if (origins[origins.length - 1] !== maxOrigin) origins.push(maxOrigin);
  return [...new Set(origins)];
}

async function runBaseline(session, rgba, width, height, inputName, outputName){
  const tensorData = rgbaToTensor(rgba, width, height, TILE_SIZE);
  const { elapsedMs, probabilities } = await runInference(session, inputName, outputName, tensorData);
  const mask = upscaleProbabilities(probabilities, width, height);
  return { elapsedMs, tileCount: 1, mask };
}

async function runTiled(session, rgba, width, height, step, inputName, outputName){
  const xs = buildTileOrigins(width, step);
  const ys = buildTileOrigins(height, step);
  const feather = Math.max(8, Math.floor(step * 0.35));
  const accum = new Float32Array(width * height);
  const weight = new Float32Array(width * height);
  let elapsedMs = 0;
  let tileCount = 0;

  for (const y0 of ys) {
    for (const x0 of xs) {
      const regionW = Math.min(TILE_SIZE, width - x0);
      const regionH = Math.min(TILE_SIZE, height - y0);
      const crop = cropRgba(rgba, width, height, x0, y0, regionW, regionH);
      const tensorData = rgbaToTensor(crop, regionW, regionH, TILE_SIZE);
      const result = await runInference(session, inputName, outputName, tensorData);
      elapsedMs += result.elapsedMs;
      tileCount += 1;

      for (let ly = 0; ly < regionH; ly++) {
        for (let lx = 0; lx < regionW; lx++) {
          const gx = x0 + lx;
          const gy = y0 + ly;
          const idx = gy * width + gx;
          const prob = sampleTileProbability(result.probabilities, lx, ly, regionW, regionH);
          const w = tileBlendWeight(lx, ly, regionW, regionH, feather);
          accum[idx] += prob * w;
          weight[idx] += w;
        }
      }
    }
  }

  const mask = new Float32Array(width * height);
  for (let i = 0; i < mask.length; i++) {
    mask[i] = weight[i] > 0 ? accum[i] / weight[i] : 0;
  }

  return { elapsedMs, tileCount, mask, feather, xs: xs.length, ys: ys.length };
}

function measureHorizonError(mask, width, height, sampleXs){
  const errors = [];
  for (const x of sampleXs) {
    let bestY = 0;
    let bestDist = Infinity;
    for (let y = 1; y < height - 1; y++) {
      const p = mask[y * width + x];
      const dist = Math.abs(p - 0.5);
      if (dist < bestDist) {
        bestDist = dist;
        bestY = y;
      }
    }
    errors.push(bestY);
  }
  return errors;
}

function measureEdgeRoughness(mask, width, height){
  let sum = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx = Math.abs(mask[i + 1] - mask[i - 1]);
      const gy = Math.abs(mask[i + width] - mask[i - width]);
      if (gx + gy > 0.25) {
        sum += gx + gy;
        count += 1;
      }
    }
  }
  return count ? sum / count : 0;
}

function median(values){
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function main(){
  const options = parseArgs(process.argv.slice(2));
  const { width, height, step, horizon } = options;
  const modelPath = await ensureModel();
  const session = await ort.InferenceSession.create(modelPath, { executionProviders: ["cpu"] });
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];
  const rgba = createSyntheticImage(width, height, horizon);

  console.log("=== skyseg 分塊（Tile）推論測試 ===");
  console.log(`影像：${width}×${height}，地平線約 ${(horizon * 100).toFixed(0)}% 高`);
  console.log(`Tile：${TILE_SIZE}×${TILE_SIZE}，步進 step=${step}`);
  console.log("");

  const baseline = await runBaseline(session, rgba, width, height, inputName, outputName);
  const tiled = await runTiled(session, rgba, width, height, step, inputName, outputName);

  const sampleXs = [Math.floor(width * 0.2), Math.floor(width * 0.5), Math.floor(width * 0.8)];
  const trueHorizon = Math.round(height * horizon);
  const baselineHorizon = median(measureHorizonError(baseline.mask, width, height, sampleXs));
  const tiledHorizon = median(measureHorizonError(tiled.mask, width, height, sampleXs));
  const baselineRough = measureEdgeRoughness(baseline.mask, width, height);
  const tiledRough = measureEdgeRoughness(tiled.mask, width, height);

  console.log("--- Baseline（整圖縮放 320 一次推論）---");
  console.log(`  推論次數：${baseline.tileCount}`);
  console.log(`  總耗時：${baseline.elapsedMs.toFixed(0)} ms`);
  console.log(`  地平線誤差：${Math.abs(baselineHorizon - trueHorizon)} px`);
  console.log(`  邊緣粗糙度：${baselineRough.toFixed(4)}（越低越平滑）`);

  console.log("");
  console.log(`--- Tiled（${tiled.xs}×${tiled.ys} = ${tiled.tileCount} 塊，feather≈${tiled.feather}px）---`);
  console.log(`  推論次數：${tiled.tileCount}`);
  console.log(`  總耗時：${tiled.elapsedMs.toFixed(0)} ms（約 ${(tiled.elapsedMs / baseline.elapsedMs).toFixed(1)}×）`);
  console.log(`  地平線誤差：${Math.abs(tiledHorizon - trueHorizon)} px`);
  console.log(`  邊緣粗糙度：${tiledRough.toFixed(4)}（越低越平滑）`);

  console.log("");
  console.log("=== 結論 ===");
  const faster = baseline.elapsedMs < tiled.elapsedMs;
  const sharper = tiledRough < baselineRough;
  const horizonBetter = Math.abs(tiledHorizon - trueHorizon) < Math.abs(baselineHorizon - trueHorizon);

  if (sharper || horizonBetter) {
    console.log("✓ Tile 在合成測試圖上邊緣品質優於 baseline。");
  } else {
    console.log("○ 此測試圖上 Tile 品質優勢不明顯（真實照片可能不同）。");
  }
  console.log(`✗ Tile 耗時為 baseline 的 ${(tiled.elapsedMs / baseline.elapsedMs).toFixed(1)}×（${tiled.tileCount} 次推論）`);

  const iphoneEstimate = (tiled.elapsedMs / baseline.elapsedMs) * 4;
  console.log(`  iPhone WASM 粗估：若 baseline ~8s，tile 可能 ~${(8 * tiled.elapsedMs / baseline.elapsedMs).toFixed(0)}s`);

  console.log("");
  console.log("建議 step 參考：");
  console.log("  step=320（無重疊）→ 最快，品質提升有限");
  console.log("  step=160（50% 重疊）→ 品質較好，耗時約 3–6×");
  console.log("  生產環境可考慮：僅對天空區域上半部 tile，或 1280 寬以下用 baseline");
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
