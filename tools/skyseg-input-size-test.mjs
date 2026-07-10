#!/usr/bin/env node
/**
 * skyseg_fp16.onnx 輸入尺寸測試
 * 用法：node tools/skyseg-input-size-test.mjs
 * 可選：node tools/skyseg-input-size-test.mjs 320 640 512
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ort from "onnxruntime-node";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODEL_URL = "https://huggingface.co/voyagerfromeast/skyseg/resolve/main/skyseg_fp16.onnx";
const MODEL_PATH = path.join(__dirname, ".cache", "skyseg_fp16.onnx");
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

const sizes = process.argv.slice(2).map(Number).filter(n => n > 0);
const testSizes = sizes.length ? sizes : [320, 640, 512, 256];

async function ensureModel(){
  if (fs.existsSync(MODEL_PATH)) return MODEL_PATH;
  fs.mkdirSync(path.dirname(MODEL_PATH), { recursive: true });
  console.log("下載模型中…", MODEL_URL);
  const response = await fetch(MODEL_URL);
  if (!response.ok) throw new Error(`模型下載失敗：${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(MODEL_PATH, buffer);
  console.log(`已快取：${MODEL_PATH} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)\n`);
  return MODEL_PATH;
}

function buildInputTensor(size, ortApi){
  const plane = size * size;
  const data = new Float32Array(3 * plane);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const r = x / size;
      const g = y / size;
      const b = 0.5;
      data[i] = (r - MEAN[0]) / STD[0];
      data[i + plane] = (g - MEAN[1]) / STD[1];
      data[i + plane * 2] = (b - MEAN[2]) / STD[2];
    }
  }
  return new ortApi.Tensor("float32", data, [1, 3, size, size]);
}

function describeShape(shape){
  if (!shape) return "unknown";
  return shape.map(dim => (typeof dim === "string" || dim === null ? String(dim) : dim)).join(" × ");
}

async function runOnce(session, size, inputName, outputName){
  const tensor = buildInputTensor(size, ort);
  const start = performance.now();
  const result = await session.run({ [inputName]: tensor });
  const elapsed = performance.now() - start;
  const output = result[outputName];
  const pixels = output.dims.reduce((a, b) => a * b, 1);
  return {
    elapsedMs: elapsed,
    outputDims: output.dims,
    outputPixels: pixels
  };
}

async function main(){
  const modelPath = await ensureModel();
  const session = await ort.InferenceSession.create(modelPath, {
    executionProviders: ["cpu"]
  });

  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];
  const inputMeta = session.inputMetadata[inputName];
  const outputMeta = session.outputMetadata[outputName];

  console.log("=== skyseg_fp16.onnx 模型資訊 ===");
  console.log(`輸入名稱：${inputName}`);
  console.log(`輸入 shape：${describeShape(inputMeta?.dimensions)}`);
  console.log(`輸出名稱：${outputName}`);
  console.log(`輸出 shape：${describeShape(outputMeta?.dimensions)}`);
  console.log("");

  const results = [];
  for (const size of testSizes) {
    process.stdout.write(`測試 ${size}×${size} … `);
    try {
      const run = await runOnce(session, size, inputName, outputName);
      console.log(`✓ 成功 (${run.elapsedMs.toFixed(0)} ms, 輸出 ${describeShape(run.outputDims)})`);
      results.push({ size, ok: true, ...run });
    } catch (error) {
      console.log(`✗ 失敗`);
      console.log(`  ${error.message}`);
      results.push({ size, ok: false, error: error.message });
    }
  }

  console.log("\n=== 摘要 ===");
  const passed = results.filter(item => item.ok);
  const failed = results.filter(item => !item.ok);

  if (passed.length) {
    const base = passed.find(item => item.size === 320) || passed[0];
    console.log("成功的尺寸：");
    for (const item of passed) {
      const ratio = item.elapsedMs / base.elapsedMs;
      console.log(`  ${item.size}×${item.size} → ${item.elapsedMs.toFixed(0)} ms (${ratio.toFixed(2)}×)`);
    }
  }

  if (failed.length) {
    console.log("失敗的尺寸：");
    for (const item of failed) {
      console.log(`  ${item.size}×${item.size}`);
    }
  }

  const supports640 = passed.some(item => item.size === 640);
  console.log("");
  if (supports640) {
    const t320 = passed.find(item => item.size === 320)?.elapsedMs;
    const t640 = passed.find(item => item.size === 640)?.elapsedMs;
    console.log("結論：模型可接受 640×640 輸入。");
    if (t320 && t640) {
      console.log(`640 相對 320 約慢 ${(t640 / t320).toFixed(2)}×（CPU 參考值，iPhone WASM 可能更慢）`);
    }
  } else {
    console.log("結論：此模型不支援 640×640（或測試失敗），維持 320 推論較安全。");
    console.log("替代方案：320 推論後先放大到 640 中繼尺寸，再放大到全圖。");
  }

  process.exit(failed.some(item => item.size === 640) ? 1 : 0);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
