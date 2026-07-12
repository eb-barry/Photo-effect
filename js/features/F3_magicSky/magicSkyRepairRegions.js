// F3 魔法天空 - SAM 雙類編號區域 v0.7.0
// SAM 網格分割 → 天空 / 非天空兩類編號 → 使用者勾選天空編號套用。

import {
  buildSkyMaskBitmapWithSensitivity,
  samplePhotoImageData
} from "./magicSkySegment.js";
import { decodeSamClick } from "./magicSkySam.js";

const MAX_SAM_CALLS = 28;
const NMS_IOU_THRESHOLD = 0.52;
const MAX_REGIONS = 18;
const SKY_REGION_COLORS = ["#4ecdc4", "#6c8cff", "#70a1ff", "#2ed573", "#00d2d3", "#1e90ff"];
const FG_REGION_COLORS = ["#ff9f43", "#ff6b6b", "#c77dff", "#ffd166", "#a29bfe", "#fd79a8"];

export async function analyzeRepairRegions(maskEntry, sourceImage, samEntry, onStatus = () => {}){
  if (!maskEntry?.probMap || !sourceImage || !samEntry) return [];

  const { probMap, width, height } = maskEntry;
  const photoData = samplePhotoImageData(sourceImage, width, height);
  const existingSkyMask = buildSkyMaskBitmapWithSensitivity(probMap, photoData, width, height, 0);
  const imagePixels = width * height;
  const minPixels = Math.max(72, Math.round(imagePixels * 0.0002));
  const maxPixels = Math.round(imagePixels * 0.45);
  const points = buildPromptGrid(width, height);

  const rawCandidates = [];
  let samCalls = 0;

  onStatus("SAM 分割照片中…");
  for (let i = 0; i < points.length && samCalls < MAX_SAM_CALLS; i += 1) {
    const point = points[i];
    samCalls += 1;
    if (samCalls === 1 || samCalls % 4 === 0) {
      onStatus(`SAM 分割區塊 ${samCalls}/${Math.min(points.length, MAX_SAM_CALLS)}…`);
    }

    try {
      const tensor = await decodeSamClick(samEntry, point.x, point.y, () => {});
      const indices = tensorToActiveIndices(tensor, width, height);
      if (indices.length < minPixels || indices.length > maxPixels) continue;
      rawCandidates.push(buildRegionFromIndices(indices, width));
    } catch (error) {
      console.warn("[F3 SAM 分割] 解碼失敗：", error);
    }
  }

  if (!rawCandidates.length) return [];

  onStatus("整理分割區塊…");
  const deduped = dedupeRegions(rawCandidates, NMS_IOU_THRESHOLD).slice(0, MAX_REGIONS);
  const classified = deduped.map(region => ({
    ...region,
    category: classifySkyRegion(region, probMap, photoData, width, height, existingSkyMask)
  }));

  return assignRegionLabels(classified);
}

export function buildRepairMaskCanvas(regions, selectedIds, width, height){
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  if (!selectedIds?.size) return canvas;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = ctx.createImageData(width, height);
  const pixels = imageData.data;

  for (const region of regions) {
    if (!region.selectable || !selectedIds.has(region.id)) continue;
    for (const index of region.indices) {
      pixels[index * 4 + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export function renderRepairRegionMarkers(markersEl, regions, selectedIds, canvas, layout){
  if (!markersEl) return;
  markersEl.innerHTML = "";
  if (!regions?.length || !canvas || !layout) {
    markersEl.classList.add("hidden");
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width / Math.max(1, canvas.width);
  const scaleY = rect.height / Math.max(1, canvas.height);

  for (const region of regions) {
    const localX = layout.x + (region.centroidX / canvas.width) * layout.width;
    const localY = layout.y + (region.centroidY / canvas.height) * layout.height;
    const badge = document.createElement("button");
    badge.type = "button";
    badge.className = `magic-sky-repair-badge${region.category === "nonSky" ? " is-reference" : ""}`;
    badge.dataset.regionId = region.id;
    badge.style.left = `${localX * scaleX}px`;
    badge.style.top = `${localY * scaleY}px`;
    badge.style.borderColor = region.color;
    if (region.selectable && selectedIds?.has(region.id)) badge.classList.add("is-selected");
    badge.setAttribute("aria-pressed", String(region.selectable && selectedIds?.has(region.id)));
    badge.setAttribute("aria-label", `${region.groupLabel} ${region.displayLabel}`);
    badge.textContent = region.displayLabel;
    if (!region.selectable) badge.disabled = true;
    markersEl.appendChild(badge);
  }

  markersEl.classList.remove("hidden");
}

function buildPromptGrid(width, height){
  const cols = clamp(Math.round(width / 320), 4, 7);
  const rows = clamp(Math.round(height / 280), 5, 8);
  const points = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      points.push({
        x: ((col + 0.5) / cols) * width,
        y: ((row + 0.5) / rows) * height
      });
    }
  }

  return points;
}

function buildRegionFromIndices(indices, width){
  let sumX = 0;
  let sumY = 0;
  let minX = width;
  let maxX = 0;
  let minY = Infinity;
  let maxY = 0;

  for (const index of indices) {
    const x = index % width;
    const y = (index / width) | 0;
    sumX += x;
    sumY += y;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  const count = indices.length;
  return {
    indices,
    pixelCount: count,
    centroidX: sumX / count,
    centroidY: sumY / count,
    bounds: { minX, minY, maxX, maxY }
  };
}

function dedupeRegions(regions, iouThreshold){
  const sorted = [...regions].sort((a, b) => a.pixelCount - b.pixelCount);
  const kept = [];

  for (const region of sorted) {
    const overlaps = kept.some(existing => maskIoU(existing.indices, region.indices) > iouThreshold);
    if (!overlaps) kept.push(region);
  }

  return kept;
}

function assignRegionLabels(regions){
  let skyCount = 0;
  let fgCount = 0;
  const output = [];

  for (const region of regions) {
    if (region.category === "sky") {
      skyCount += 1;
      output.push({
        ...region,
        id: `sky-${skyCount}`,
        displayLabel: String(skyCount),
        groupLabel: "天空",
        selectable: true,
        color: SKY_REGION_COLORS[(skyCount - 1) % SKY_REGION_COLORS.length]
      });
      continue;
    }

    fgCount += 1;
    output.push({
      ...region,
      id: `fg-${fgCount}`,
      displayLabel: String(fgCount),
      groupLabel: "非天空",
      selectable: false,
      color: FG_REGION_COLORS[(fgCount - 1) % FG_REGION_COLORS.length]
    });
  }

  return output;
}

function classifySkyRegion(region, probMap, photoData, width, height, existingSkyMask){
  const { indices } = region;
  let probSum = 0;
  let lumSum = 0;
  let skyLikeCount = 0;
  let existingCount = 0;
  let ySum = 0;

  for (const index of indices) {
    probSum += probMap[index];
    const byteIndex = index * 4;
    lumSum += sampleLuminance(photoData, byteIndex);
    if (isSkyLikePixel(photoData, byteIndex)) skyLikeCount += 1;
    if (existingSkyMask[index]) existingCount += 1;
    ySum += (index / width) | 0;
  }

  const count = indices.length;
  const avgProb = probSum / count;
  const avgLum = lumSum / count;
  const skyLikeRatio = skyLikeCount / count;
  const existingRatio = existingCount / count;
  const topBias = 1 - (ySum / count) / height;

  let score = avgProb * 0.42 + skyLikeRatio * 0.28 + topBias * 0.12 + existingRatio * 0.18;
  if (avgProb < 0.1 && skyLikeRatio < 0.22) score -= 0.28;
  if (avgLum < 0.34) score -= 0.12;

  return score >= 0.36 ? "sky" : "nonSky";
}

function tensorToActiveIndices(maskTensor, width, height){
  const maskData = maskTensor.data;
  const dims = maskTensor.dims || [];
  const maskH = dims.length >= 4 ? dims[2] : height;
  const maskW = dims.length >= 4 ? dims[3] : width;
  const indices = [];

  for (let y = 0; y < height; y += 1) {
    const my = Math.min(maskH - 1, Math.floor((y + 0.5) * maskH / height));
    for (let x = 0; x < width; x += 1) {
      const mx = Math.min(maskW - 1, Math.floor((x + 0.5) * maskW / width));
      if (maskData[my * maskW + mx] > 0) indices.push(y * width + x);
    }
  }

  return indices;
}

function maskIoU(indicesA, indicesB){
  const lookup = new Set(indicesB);
  let intersection = 0;
  for (const index of indicesA) {
    if (lookup.has(index)) intersection += 1;
  }
  const union = indicesA.length + indicesB.length - intersection;
  return union > 0 ? intersection / union : 0;
}

function sampleLuminance(photoData, byteIndex){
  return (
    photoData[byteIndex] * 0.299
    + photoData[byteIndex + 1] * 0.587
    + photoData[byteIndex + 2] * 0.114
  ) / 255;
}

function isSkyLikePixel(photoData, byteIndex){
  const r = photoData[byteIndex];
  const g = photoData[byteIndex + 1];
  const b = photoData[byteIndex + 2];
  const lum = sampleLuminance(photoData, byteIndex);
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const saturation = maxC === 0 ? 0 : (maxC - minC) / maxC;

  if (lum >= 0.58 && saturation <= 0.4) return true;
  if (b >= r * 0.9 && b >= g * 0.85 && lum >= 0.42) return true;
  return lum >= 0.66 && saturation <= 0.28;
}

function clamp(value, min, max){
  return Math.max(min, Math.min(max, value));
}
