// F3 魔法天空 - 編號候選區域修復 v0.6.0
// 自動找出天空缺口 → 編號 → 使用者勾選套用（避免 SAM 點選蓋滿全圖）。

import {
  buildSkyMaskBitmapWithSensitivity,
  discoverSkyGapRegions,
  samplePhotoImageData
} from "./magicSkySegment.js";
import { decodeSamClick } from "./magicSkySam.js";

const SAM_MAX_MASK_RATIO = 0.22;
const REGION_COLORS = [
  "#ff6b6b",
  "#4ecdc4",
  "#ffd166",
  "#6c8cff",
  "#c77dff",
  "#ff9f43",
  "#2ed573",
  "#70a1ff"
];

export async function analyzeRepairRegions(maskEntry, sourceImage, samEntry, onStatus = () => {}){
  if (!maskEntry?.probMap || !sourceImage) return [];

  const { probMap, width, height } = maskEntry;
  const photoData = samplePhotoImageData(sourceImage, width, height);
  const coveredMask = buildSkyMaskBitmapWithSensitivity(probMap, photoData, width, height, 0);

  onStatus("搜尋天空候選區域…");
  const rawRegions = discoverSkyGapRegions(probMap, photoData, width, height, coveredMask);
  if (!rawRegions.length) return [];

  const regions = [];
  for (let i = 0; i < rawRegions.length; i += 1) {
    const raw = rawRegions[i];
    onStatus(`分析候選區域 ${i + 1}/${rawRegions.length}…`);
    let indices = raw.indices;

    if (samEntry) {
      try {
        const tensor = await decodeSamClick(samEntry, raw.centroidX, raw.centroidY, onStatus);
        const samIndices = tensorToActiveIndices(tensor, width, height);
        const imagePixels = width * height;
        const samRatio = samIndices.length / imagePixels;
        if (samRatio <= SAM_MAX_MASK_RATIO && samIndices.length >= 6) {
          const refined = intersectIndices(raw.indices, samIndices);
          if (refined.length >= 6) indices = refined;
        }
      } catch (error) {
        console.warn(`[F3 修復區域] SAM 精修區域 ${raw.id} 失敗：`, error);
      }
    }

    regions.push({
      ...raw,
      indices,
      pixelCount: indices.length,
      color: REGION_COLORS[(raw.id - 1) % REGION_COLORS.length]
    });
  }

  return regions.filter(region => region.pixelCount >= 6);
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
    if (!selectedIds.has(region.id)) continue;
    for (const index of region.indices) {
      const alphaIndex = index * 4 + 3;
      pixels[alphaIndex] = 255;
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
    badge.className = "magic-sky-repair-badge";
    badge.dataset.regionId = String(region.id);
    badge.style.left = `${localX * scaleX}px`;
    badge.style.top = `${localY * scaleY}px`;
    badge.style.borderColor = region.color;
    if (selectedIds?.has(region.id)) badge.classList.add("is-selected");
    badge.setAttribute("aria-pressed", String(selectedIds?.has(region.id)));
    badge.setAttribute("aria-label", `候選區域 ${region.id}`);
    badge.textContent = String(region.id);
    markersEl.appendChild(badge);
  }

  markersEl.classList.remove("hidden");
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

function intersectIndices(baseIndices, candidateIndices){
  const lookup = new Set(baseIndices);
  return candidateIndices.filter(index => lookup.has(index));
}
