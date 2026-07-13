// F4 星芒鏡 - Canvas 影像處理 v0.1.3
// 2D FFT 光圈繞射核心 + 幽靈/眩光/光暈疊層 + 色散與背景光衰減合成。

import { getLightSourceById, getSpikeCount } from "./starburstState.js";

export const STARBURST_MAX_EDGE = 1600;
/** @deprecated Use resolveOutputSize() for the active photo. */
export const STARBURST_OUTPUT_WIDTH = 1200;
/** @deprecated Use resolveOutputSize() for the active photo. */
export const STARBURST_OUTPUT_HEIGHT = 1600;

const KERNEL_SIZE = 256;
const KERNEL_CACHE_LIMIT = 14;
const kernelCache = new Map();

export function fileToDataUrl(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function loadImageFromDataUrl(dataUrl){
  return new Promise((resolve, reject) => {
    if (!dataUrl) {
      reject(new Error("Missing image data URL"));
      return;
    }
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
}

/** 依原圖比例決定輸出尺寸，不裁切、支援任意直式／橫式／正方形照片。 */
export function resolveOutputSize(image, maxEdge = STARBURST_MAX_EDGE){
  if (!image?.width || !image?.height) {
    return { width: STARBURST_OUTPUT_WIDTH, height: STARBURST_OUTPUT_HEIGHT };
  }
  const ratio = image.width / image.height;
  if (ratio >= 1) {
    const width = Math.min(image.width, maxEdge);
    const height = Math.max(1, Math.round(width / ratio));
    return { width, height };
  }
  const height = Math.min(image.height, maxEdge);
  const width = Math.max(1, Math.round(height * ratio));
  return { width, height };
}

export async function renderStarburstLens(ctx, sourceImage, state, options = {}){
  const showMarker = options.showMarker !== false;
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);

  if (!sourceImage) {
    drawEmptyState(ctx, width, height);
    return;
  }

  ctx.drawImage(sourceImage, 0, 0, width, height);

  if (!state.hasPlacedPoint) return;

  const point = { x: state.starburstX * width, y: state.starburstY * height };
  const minDim = Math.min(width, height);
  const lightSource = getLightSourceById(state.lightSourceId);
  const backgroundTint = sampleBackgroundColor(ctx, point.x, point.y, minDim);
  const tintColor = blendRgb(lightSource.color, backgroundTint, 0.12);

  const layer = document.createElement("canvas");
  layer.width = width;
  layer.height = height;
  const layerCtx = layer.getContext("2d", { willReadFrequently: true });

  drawHalation(layerCtx, point, minDim, state.halation, tintColor);
  drawFlare(layerCtx, point, minDim, state.flare, tintColor);
  drawGhosting(layerCtx, point, width, height, minDim, state.ghosting, tintColor, state);
  drawStarburstCore(layerCtx, point, minDim, state, tintColor, lightSource.color);

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.drawImage(layer, 0, 0);
  ctx.restore();

  if (showMarker) drawPositionMarker(ctx, point);
}

function drawStarburstCore(ctx, point, minDim, state, tintColor, coreColor){
  const intensity = clamp(Number(state.lightIntensity ?? 72), 0, 100) / 100;
  const sharpness = clamp(Number(state.sharpness ?? 60), 0, 100) / 100;

  drawDiffractionCorona(ctx, point, minDim, state, tintColor, intensity, sharpness);
  drawProceduralSpikes(ctx, point, minDim, state, tintColor, intensity);

  const coreRadius = Math.max(2, minDim * 0.007 * (0.4 + intensity));
  const coreGlow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, coreRadius * 5);
  coreGlow.addColorStop(0, `rgba(255,255,255,${0.9 * (0.5 + intensity * 0.5)})`);
  coreGlow.addColorStop(0.35, `rgba(${coreColor[0]},${coreColor[1]},${coreColor[2]},${0.5 * intensity})`);
  coreGlow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = coreGlow;
  ctx.beginPath();
  ctx.arc(point.x, point.y, coreRadius * 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 以 2D FFT 光圈遮罩繞射能量作為核心周圍的柔光暈環貼圖，強化玻璃質感。 */
function drawDiffractionCorona(ctx, point, minDim, state, tintColor, intensity, sharpness){
  const kernel = getApertureKernel(state);
  const drawDiameter = minDim * (0.16 + intensity * 0.1) * (0.7 + sharpness * 0.3);
  const halfDraw = drawDiameter / 2;
  const tinted = tintSprite(kernel.canvas, tintColor);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.32 + intensity * 0.22;
  ctx.drawImage(tinted, point.x - halfDraw, point.y - halfDraw, drawDiameter, drawDiameter);
  ctx.restore();
}

/**
 * 星芒道數 = 光圈葉片數（雙數）或 2 倍葉片數（單數），以錐形放射光束模擬繞射光束，
 * 沿光束加入色散、不對稱隨機偏移與邊緣柔化，避免真實影像域 FFT 卷積在有限解析度下
 * 被平滑成單純的同心圓（Airy 環）而遺失尖銳星芒方向性。
 */
function drawProceduralSpikes(ctx, point, minDim, state, tintColor, intensity){
  const spikeCount = getSpikeCount(state.bladeCount);
  const fStop = clamp(Number(state.apertureFStop ?? 8), 1.4, 16);
  const sharpness = clamp(Number(state.sharpness ?? 60), 0, 100) / 100;
  const curvature = clamp(Number(state.bladeCurvature ?? 0), 0, 100) / 100;
  const softness = clamp(Number(state.edgeSoftness ?? 0), 0, 100) / 100;
  const asymmetry = clamp(Number(state.randomAsymmetry ?? 0), 0, 100) / 100;
  const dispersion = clamp(Number(state.dispersion ?? 0), 0, 100) / 100;

  const fStopT = (fStop - 1.4) / (16 - 1.4);
  const lengthFactor = (0.14 + fStopT * 0.58) * (0.5 + sharpness * 0.7) * (1 - curvature * 0.55);
  const maxLength = minDim * clamp(lengthFactor, 0.04, 0.85) * (0.55 + intensity * 0.55);
  const widthDeg = (2.2 + curvature * 8.5) * (1 - sharpness * 0.3);

  const seed = Math.round(point.x * 131 + point.y * 977 + spikeCount * 613);
  const rand = createSeededRandom(seed);

  const spikeLayer = document.createElement("canvas");
  spikeLayer.width = ctx.canvas.width;
  spikeLayer.height = ctx.canvas.height;
  const layerCtx = spikeLayer.getContext("2d");

  for (let i = 0; i < spikeCount; i++) {
    const angleJitter = (rand() - 0.5) * asymmetry * ((Math.PI * 2) / spikeCount) * 0.4;
    const lengthJitter = 1 + (rand() - 0.5) * asymmetry * 0.5;
    const angle = -Math.PI / 2 + i * ((Math.PI * 2) / spikeCount) + angleJitter;
    drawSingleSpike(layerCtx, point, angle, maxLength * lengthJitter, widthDeg, tintColor, intensity, dispersion);
  }

  if (softness > 0.03) {
    const blurPx = softness * minDim * 0.012;
    const blurred = document.createElement("canvas");
    blurred.width = spikeLayer.width;
    blurred.height = spikeLayer.height;
    const blurCtx = blurred.getContext("2d");
    blurCtx.filter = `blur(${blurPx.toFixed(2)}px)`;
    blurCtx.drawImage(spikeLayer, 0, 0);
    ctx.drawImage(blurred, 0, 0);
  } else {
    ctx.drawImage(spikeLayer, 0, 0);
  }
}

function drawSingleSpike(ctx, point, angle, length, widthDeg, tintColor, intensity, dispersion){
  if (length < 1.5) return;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const perpX = -dy;
  const perpY = dx;
  const halfWidthRad = (widthDeg * Math.PI) / 360;
  const baseHalfWidth = Math.tan(halfWidthRad) * length;
  const tipHalfWidth = baseHalfWidth * 0.06;
  const baseAlpha = 0.42 + intensity * 0.5;

  const drawWedge = (colorRgb, alphaScale, lengthScale) => {
    const len = length * lengthScale;
    if (len < 1.5) return;
    const tipX = point.x + dx * len;
    const tipY = point.y + dy * len;
    const halfWidth = baseHalfWidth * lengthScale;
    const tipHalf = tipHalfWidth * lengthScale;

    const gradient = ctx.createLinearGradient(point.x, point.y, tipX, tipY);
    gradient.addColorStop(0, `rgba(${colorRgb[0]},${colorRgb[1]},${colorRgb[2]},${baseAlpha * alphaScale})`);
    gradient.addColorStop(0.32, `rgba(${colorRgb[0]},${colorRgb[1]},${colorRgb[2]},${baseAlpha * 0.4 * alphaScale})`);
    gradient.addColorStop(1, `rgba(${colorRgb[0]},${colorRgb[1]},${colorRgb[2]},0)`);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(point.x + perpX * halfWidth, point.y + perpY * halfWidth);
    ctx.lineTo(tipX + perpX * tipHalf, tipY + perpY * tipHalf);
    ctx.lineTo(tipX - perpX * tipHalf, tipY - perpY * tipHalf);
    ctx.lineTo(point.x - perpX * halfWidth, point.y - perpY * halfWidth);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  drawWedge(tintColor, 1, 1);
  if (dispersion > 0.02) {
    drawWedge([255, 138, 104], 0.5 * dispersion, 1.1);
    drawWedge([116, 172, 255], 0.42 * dispersion, 0.88);
  }
}

function drawFlare(ctx, point, minDim, flareValue, tintColor){
  const amount = clamp(Number(flareValue ?? 0), 0, 100) / 100;
  if (amount <= 0.01) return;
  const radius = minDim * (0.28 + amount * 0.5);
  const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
  gradient.addColorStop(0, `rgba(${tintColor[0]},${tintColor[1]},${tintColor[2]},${0.24 * amount})`);
  gradient.addColorStop(0.55, `rgba(${tintColor[0]},${tintColor[1]},${tintColor[2]},${0.08 * amount})`);
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHalation(ctx, point, minDim, halationValue, tintColor){
  const amount = clamp(Number(halationValue ?? 0), 0, 100) / 100;
  if (amount <= 0.01) return;
  const radius = minDim * (0.09 + amount * 0.16);
  const warm = blendRgb(tintColor, [255, 96, 60], 0.55);
  const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
  gradient.addColorStop(0, `rgba(${warm[0]},${warm[1]},${warm[2]},${0.42 * amount})`);
  gradient.addColorStop(0.7, `rgba(${warm[0]},${warm[1]},${warm[2]},${0.16 * amount})`);
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * 幽靈效應（Lens Ghost / Ghost Flare）。
 *
 * - 形狀 = 當下光圈多邊形（7 片葉片 → 七角形鬼影）。
 * - 顏色：5–7 片（暖色系）琥珀/淡黃；8–11 片（冷色系）綠/紫紅/暗藍交錯。
 * - 高透明度（source-over 低 alpha），背景依然清晰可見。
 * - 弱：1–2 個柔焦光斑，靠近光源；強：沿對軸線排成「光斑項鍊」+ Flare Veil。
 *
 * 位置邏輯：
 *  - ghostRefX/Y 是用手指拖曳時鎖定的「軸心參考座標」。
 *  - 使用滑桿平移時，軸心不變，整個光斑串以 (dx, dy) 剛體平移，
 *    角度與排列密度均保持不變。
 */
function drawGhosting(ctx, point, width, height, minDim, ghostingValue, tintColor, state){
  const amount = clamp(Number(ghostingValue ?? 0), 0, 100) / 100;
  if (amount <= 0.01) return;

  const bladeCount = clamp(Number(state.bladeCount) || 7, 5, 11);
  const curvature = clamp(Number(state.bladeCurvature ?? 0), 0, 100) / 100;
  const asymmetry = clamp(Number(state.randomAsymmetry ?? 0), 0, 100) / 100;

  const cx = width / 2;
  const cy = height / 2;

  // Ghost axis is derived from the locked reference position (set by finger drag).
  // When slider translates the star, refX/refY stay fixed so the necklace angle is preserved.
  const refX = clamp(Number(state.ghostRefX ?? state.starburstX), 0.02, 0.98) * width;
  const refY = clamp(Number(state.ghostRefY ?? state.starburstY), 0.02, 0.98) * height;
  const axisDx = refX - cx;
  const axisDy = refY - cy;

  // Rigid translation applied on top of the reference-based ghost positions.
  const translateX = point.x - refX;
  const translateY = point.y - refY;

  const count = Math.max(1, Math.round(1 + amount * 6));

  const isWarmBlade = bladeCount <= 7;
  const ghostPalette = isWarmBlade
    ? [[220, 170, 60], [240, 200, 90], [200, 140, 30], [230, 190, 80], [255, 210, 100], [195, 155, 40], [215, 175, 55]]
    : [[60, 200, 80], [170, 60, 200], [50, 80, 210], [60, 200, 140], [200, 50, 180], [40, 100, 220], [80, 210, 100]];

  for (let i = 1; i <= count; i++) {
    const t = -(0.30 + i * 0.28 + (i - 1) * 0.08 * amount);
    const gx = cx + axisDx * t + translateX;
    const gy = cy + axisDy * t + translateY;

    const sizeT = Math.max(0.08, 1 - (i - 1) * 0.12);
    const baseRadius = minDim * (0.045 + amount * 0.045) * sizeT;
    if (baseRadius < 1.5) continue;

    const ghostColor = ghostPalette[(i - 1) % ghostPalette.length];
    const baseAlpha = clamp(amount * 0.35 * (1.2 - (i - 1) * 0.14), 0.015, 0.50);
    const blurAmount = clamp(1 - amount * 0.82, 0.06, 1);

    drawGhostPolygon(ctx, gx, gy, baseRadius, bladeCount, curvature, asymmetry, ghostColor, baseAlpha, blurAmount, i);
  }

  if (amount > 0.55) {
    drawFlareVeil(ctx, point, width, height, minDim, amount);
  }
}

/**
 * 繪製單顆多邊形鬼影光斑，消除可見輪廓圓環：
 *  - 徑向漸層在距多邊形邊緣 ~18% 處即衰減至 alpha=0，確保邊界透明。
 *  - 不畫 stroke，只靠漸層 fill + 模糊實現柔和幾何感。
 *  - 畫布四周留出足夠 padding，讓模糊不被截斷。
 */
function drawGhostPolygon(ctx, cx, cy, radius, bladeCount, curvature, asymmetry, color, baseAlpha, blurAmount, index){
  const minBlurPx = 2.5;
  const blurPx = Math.max(minBlurPx, blurAmount * radius * 0.40);
  const pad = Math.ceil(blurPx * 2.5);
  const size = Math.ceil(radius * 2) + pad * 2;
  const half = size / 2;

  const ghostCanvas = document.createElement("canvas");
  ghostCanvas.width = size;
  ghostCanvas.height = size;
  const gctx = ghostCanvas.getContext("2d");

  const rand = createSeededRandom(bladeCount * 7919 + index * 997 + 31);
  const vertices = [];
  for (let i = 0; i < bladeCount; i++) {
    const baseAngle = -Math.PI / 2 + i * ((Math.PI * 2) / bladeCount);
    const angleJitter = (rand() - 0.5) * asymmetry * ((Math.PI * 2) / bladeCount) * 0.28;
    const radiusJitter = 1 + (rand() - 0.5) * asymmetry * 0.30;
    vertices.push({ angle: baseAngle + angleJitter, r: radius * radiusJitter });
  }

  gctx.beginPath();
  for (let i = 0; i <= bladeCount; i++) {
    const curr = vertices[i % bladeCount];
    const x = half + Math.cos(curr.angle) * curr.r;
    const y = half + Math.sin(curr.angle) * curr.r;
    if (i === 0) { gctx.moveTo(x, y); continue; }
    const prev = vertices[(i - 1) % bladeCount];
    let ca = curr.angle;
    if (ca < prev.angle) ca += Math.PI * 2;
    const midA = (prev.angle + ca) / 2;
    const avgR = (prev.r + curr.r) / 2;
    const bulge = avgR + (radius * 1.15 - avgR) * curvature;
    gctx.quadraticCurveTo(half + Math.cos(midA) * bulge, half + Math.sin(midA) * bulge, x, y);
  }
  gctx.closePath();

  // Gradient fades to 0 at 82% of radius so the polygon boundary is already transparent —
  // no visible ring at the polygon edge regardless of blur amount.
  const innerColor = blendColor(color, [255, 255, 255], 0.15);
  const gradRadius = radius * 0.82;
  const radGrad = gctx.createRadialGradient(half, half, 0, half, half, gradRadius);
  radGrad.addColorStop(0, `rgba(${innerColor[0]},${innerColor[1]},${innerColor[2]},${clamp(baseAlpha * 0.88, 0, 1)})`);
  radGrad.addColorStop(0.50, `rgba(${color[0]},${color[1]},${color[2]},${clamp(baseAlpha * 0.60, 0, 1)})`);
  radGrad.addColorStop(1, `rgba(${color[0]},${color[1]},${color[2]},0)`);
  gctx.fillStyle = radGrad;
  gctx.fill();
  // No stroke — prevents the visible ring outline entirely.

  const blurred = document.createElement("canvas");
  blurred.width = size;
  blurred.height = size;
  const bctx = blurred.getContext("2d");
  bctx.filter = `blur(${blurPx.toFixed(2)}px)`;
  bctx.drawImage(ghostCanvas, 0, 0);

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(blurred, cx - half, cy - half);
  ctx.restore();
}

function drawFlareVeil(ctx, point, width, height, minDim, amount){
  const veilStrength = clamp((amount - 0.55) / 0.45, 0, 1) * 0.22;
  if (veilStrength < 0.005) return;

  const veilRadius = minDim * (0.55 + amount * 0.3);
  const veil = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, veilRadius);
  veil.addColorStop(0, `rgba(255,255,255,${veilStrength * 0.9})`);
  veil.addColorStop(0.45, `rgba(245,240,230,${veilStrength * 0.45})`);
  veil.addColorStop(1, "rgba(255,255,255,0)");

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = veil;
  ctx.beginPath();
  ctx.arc(point.x, point.y, veilRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function blendColor(a, b, t){
  return [
    clamp(a[0] + (b[0] - a[0]) * t, 0, 255),
    clamp(a[1] + (b[1] - a[1]) * t, 0, 255),
    clamp(a[2] + (b[2] - a[2]) * t, 0, 255)
  ];
}

function drawPositionMarker(ctx, point){
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(point.x, point.y, 16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(10,186,181,0.95)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(point.x - 24, point.y);
  ctx.lineTo(point.x - 9, point.y);
  ctx.moveTo(point.x + 9, point.y);
  ctx.lineTo(point.x + 24, point.y);
  ctx.moveTo(point.x, point.y - 24);
  ctx.lineTo(point.x, point.y - 9);
  ctx.moveTo(point.x, point.y + 9);
  ctx.lineTo(point.x, point.y + 24);
  ctx.stroke();
  ctx.restore();
}

function tintSprite(spriteCanvas, colorRgb){
  const size = spriteCanvas.width;
  const output = document.createElement("canvas");
  output.width = size;
  output.height = size;
  const outCtx = output.getContext("2d");
  outCtx.drawImage(spriteCanvas, 0, 0);
  outCtx.globalCompositeOperation = "source-in";
  outCtx.fillStyle = `rgb(${colorRgb[0]},${colorRgb[1]},${colorRgb[2]})`;
  outCtx.fillRect(0, 0, size, size);
  return output;
}

function sampleBackgroundColor(ctx, x, y, minDim){
  const size = Math.max(4, Math.round(minDim * 0.05));
  const half = size / 2;
  try {
    const data = ctx.getImageData(Math.max(0, x - half), Math.max(0, y - half), size, size).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count++;
    }
    if (!count) return [255, 255, 255];
    return [r / count, g / count, b / count];
  } catch (error) {
    return [255, 255, 255];
  }
}

function blendRgb(a, b, t){
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ];
}

function getApertureKernel(state){
  const key = [
    state.bladeCount,
    state.bladeCurvature,
    state.edgeSoftness,
    state.randomAsymmetry,
    Number(state.apertureFStop).toFixed(1)
  ].join("|");

  if (kernelCache.has(key)) {
    const entry = kernelCache.get(key);
    kernelCache.delete(key);
    kernelCache.set(key, entry);
    return entry;
  }

  const entry = buildApertureKernel(state);
  kernelCache.set(key, entry);
  if (kernelCache.size > KERNEL_CACHE_LIMIT) {
    const oldestKey = kernelCache.keys().next().value;
    kernelCache.delete(oldestKey);
  }
  return entry;
}

function buildApertureKernel(state){
  const size = KERNEL_SIZE;
  const bladeCount = Math.round(clamp(Number(state.bladeCount) || 7, 5, 11));
  const curvature = clamp(Number(state.bladeCurvature ?? 0), 0, 100) / 100;
  const softness = clamp(Number(state.edgeSoftness ?? 0), 0, 100) / 100;
  const asymmetry = clamp(Number(state.randomAsymmetry ?? 0), 0, 100) / 100;
  const fStop = clamp(Number(state.apertureFStop ?? 8), 1.4, 16);

  const apertureRadius = clamp(size * 0.12 * (11 / fStop), size * 0.045, size * 0.3);
  const maskCanvas = buildApertureMaskCanvas(size, apertureRadius, bladeCount, curvature, asymmetry, softness);

  const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
  const maskData = maskCtx.getImageData(0, 0, size, size).data;

  const re = new Float32Array(size * size);
  const im = new Float32Array(size * size);
  for (let i = 0, p = 0; i < maskData.length; i += 4, p++) {
    re[p] = maskData[i] / 255;
  }

  fft2DForward(size, re, im);

  const power = new Float32Array(size * size);
  let maxPower = 0;
  for (let i = 0; i < re.length; i++) {
    const value = re[i] * re[i] + im[i] * im[i];
    power[i] = value;
    if (value > maxPower) maxPower = value;
  }
  if (maxPower <= 0) maxPower = 1;

  const gamma = 0.55 + (softness * 0.9) + (curvature * 0.7);
  const logK = 260;
  const shifted = new Float32Array(size * size);
  const half = size / 2;
  for (let y = 0; y < size; y++) {
    const srcY = (y + half) % size;
    for (let x = 0; x < size; x++) {
      const srcX = (x + half) % size;
      const normalized = power[srcY * size + srcX] / maxPower;
      const compressed = Math.log(1 + logK * normalized) / Math.log(1 + logK);
      shifted[y * size + x] = Math.pow(clamp(compressed, 0, 1), gamma);
    }
  }

  const sprite = document.createElement("canvas");
  sprite.width = size;
  sprite.height = size;
  const spriteCtx = sprite.getContext("2d");
  const spriteData = spriteCtx.createImageData(size, size);
  for (let i = 0, p = 0; p < shifted.length; i += 4, p++) {
    const alpha = Math.round(clamp(shifted[p], 0, 1) * 255);
    spriteData.data[i] = 255;
    spriteData.data[i + 1] = 255;
    spriteData.data[i + 2] = 255;
    spriteData.data[i + 3] = alpha;
  }
  spriteCtx.putImageData(spriteData, 0, 0);

  return { canvas: sprite };
}

function buildApertureMaskCanvas(size, radius, bladeCount, curvature, asymmetry, softness){
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const rand = createSeededRandom(bladeCount * 7919 + 13);
  const vertices = [];
  for (let i = 0; i < bladeCount; i++) {
    const baseAngle = -Math.PI / 2 + i * ((Math.PI * 2) / bladeCount);
    const angleJitter = (rand() - 0.5) * asymmetry * ((Math.PI * 2) / bladeCount) * 0.32;
    const radiusJitter = 1 + (rand() - 0.5) * asymmetry * 0.34;
    vertices.push({ angle: baseAngle + angleJitter, radius: radius * radiusJitter });
  }

  ctx.beginPath();
  for (let i = 0; i <= bladeCount; i++) {
    const current = vertices[i % bladeCount];
    const x = cx + Math.cos(current.angle) * current.radius;
    const y = cy + Math.sin(current.angle) * current.radius;
    if (i === 0) {
      ctx.moveTo(x, y);
      continue;
    }
    const previous = vertices[(i - 1) % bladeCount];
    let currentAngle = current.angle;
    if (currentAngle < previous.angle) currentAngle += Math.PI * 2;
    const midAngle = (previous.angle + currentAngle) / 2;
    const averageRadius = (previous.radius + current.radius) / 2;
    const bulgeRadius = averageRadius + (radius * 1.18 - averageRadius) * curvature;
    const controlX = cx + Math.cos(midAngle) * bulgeRadius;
    const controlY = cy + Math.sin(midAngle) * bulgeRadius;
    ctx.quadraticCurveTo(controlX, controlY, x, y);
  }
  ctx.closePath();
  ctx.fillStyle = "#fff";
  ctx.fill();

  const blurPx = softness * size * 0.045;
  if (blurPx > 0.3) {
    const blurred = document.createElement("canvas");
    blurred.width = size;
    blurred.height = size;
    const blurCtx = blurred.getContext("2d");
    blurCtx.filter = `blur(${blurPx.toFixed(2)}px)`;
    blurCtx.drawImage(canvas, 0, 0);
    return blurred;
  }

  return canvas;
}

function fft2DForward(size, re, im){
  const rowRe = new Float32Array(size);
  const rowIm = new Float32Array(size);
  for (let y = 0; y < size; y++) {
    const offset = y * size;
    for (let x = 0; x < size; x++) {
      rowRe[x] = re[offset + x];
      rowIm[x] = im[offset + x];
    }
    fft1D(rowRe, rowIm);
    for (let x = 0; x < size; x++) {
      re[offset + x] = rowRe[x];
      im[offset + x] = rowIm[x];
    }
  }

  const colRe = new Float32Array(size);
  const colIm = new Float32Array(size);
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      colRe[y] = re[y * size + x];
      colIm[y] = im[y * size + x];
    }
    fft1D(colRe, colIm);
    for (let y = 0; y < size; y++) {
      re[y * size + x] = colRe[y];
      im[y * size + x] = colIm[y];
    }
  }
}

function fft1D(re, im){
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tempRe = re[i];
      re[i] = re[j];
      re[j] = tempRe;
      const tempIm = im[i];
      im[i] = im[j];
      im[j] = tempIm;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curWr = 1;
      let curWi = 0;
      const half = len / 2;
      for (let j = 0; j < half; j++) {
        const uRe = re[i + j];
        const uIm = im[i + j];
        const vRe = re[i + j + half] * curWr - im[i + j + half] * curWi;
        const vIm = re[i + j + half] * curWi + im[i + j + half] * curWr;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + half] = uRe - vRe;
        im[i + j + half] = uIm - vIm;
        const nextWr = curWr * wr - curWi * wi;
        const nextWi = curWr * wi + curWi * wr;
        curWr = nextWr;
        curWi = nextWi;
      }
    }
  }
}

function createSeededRandom(seed){
  let state = seed >>> 0;
  return function random(){
    state |= 0;
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawEmptyState(ctx, width, height){
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#04191c");
  gradient.addColorStop(1, "#0abab5");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function clamp(value, min, max){
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}
