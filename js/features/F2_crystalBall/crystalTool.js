// F2 水晶球 - Canvas 影像處理 v0.1.8
// 固定 3:4 畫框。背景為使用者照片大幅模糊，球內展示照片不變形，只做裁切、縮放、移動、邊緣柔化與玻璃光層。

import { CRYSTAL_SEATS } from "./crystalState.js";

export const CRYSTAL_OUTPUT_WIDTH = 1200;
export const CRYSTAL_OUTPUT_HEIGHT = 1600;
export const CRYSTAL_ASPECT = 3 / 4;

const imageCache = new Map();

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function loadImageFromDataUrl(dataUrl) {
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

export async function renderCrystalBall(ctx, sourceImage, state){
  const width = CRYSTAL_OUTPUT_WIDTH;
  const height = CRYSTAL_OUTPUT_HEIGHT;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);

  if (!sourceImage) {
    drawEmptyState(ctx, width, height);
    return;
  }

  const seat = await loadSeatImage(state.selectedSeatId);
  const layout = getCrystalLayout(width, height, seat);

  drawBlurredUserBackground(ctx, sourceImage, width, height, state.backgroundBlur);
  drawSoftBackdrop(ctx, width, height);
  drawSeat(ctx, seat, layout, state.selectedSeatId);
  drawSeatContactShadow(ctx, layout, state.shadow);
  drawPhotoInsideSphere(ctx, sourceImage, layout, state);
  drawGlassOverlay(ctx, layout, state);
}

export function getCrystalLayout(width = CRYSTAL_OUTPUT_WIDTH, height = CRYSTAL_OUTPUT_HEIGHT, seatImage = null){
  const frameBottomGap = 10;
  const seatWidth = width * 0.45;
  const seatRatio = seatImage ? (seatImage.height / seatImage.width) : 0.70;
  const rawSeatHeight = seatWidth * seatRatio;
  const seatHeight = clamp(rawSeatHeight, height * 0.20, height * 0.36);
  const seatX = (width - seatWidth) / 2;
  const seatY = height - frameBottomGap - seatHeight;

  const sphereDiameter = width * 0.82;
  const sphereRadius = sphereDiameter / 2;
  const overlap = Math.max(34, seatHeight * 0.14);
  const sphereBottom = seatY + overlap;
  const sphereY = sphereBottom - sphereRadius;
  const topMargin = Math.max(24, sphereY - sphereRadius);

  return {
    width,
    height,
    topMargin,
    bottomMargin: frameBottomGap,
    sphereX: width / 2,
    sphereY,
    sphereRadius,
    sphereDiameter,
    seatX,
    seatY,
    seatWidth,
    seatHeight,
    seatTopOverlapY: seatY + overlap,
    frameBottomGap
  };
}

export function clampPhotoPlacement(state, image, layout){
  if (!image || !layout) return { photoOffsetX: 0, photoOffsetY: 0, photoScale: state.photoScale || 118 };
  const baseScale = getSphereCoverScale(image, layout.sphereDiameter);
  const scaleMultiplier = Math.max(1, Number(state.photoScale || 118) / 100);
  const drawWidth = image.width * baseScale * scaleMultiplier;
  const drawHeight = image.height * baseScale * scaleMultiplier;
  const maxX = Math.max(0, (drawWidth - layout.sphereDiameter) / 2);
  const maxY = Math.max(0, (drawHeight - layout.sphereDiameter) / 2);
  return {
    photoScale: Math.max(100, Number(state.photoScale || 118)),
    photoOffsetX: maxX <= 0 ? 0 : clamp(Number(state.photoOffsetX || 0), -100, 100),
    photoOffsetY: maxY <= 0 ? 0 : clamp(Number(state.photoOffsetY || 0), -100, 100)
  };
}

function drawBlurredUserBackground(ctx, image, width, height, blurAmount){
  const crop = getCoverCrop(image.width, image.height, CRYSTAL_ASPECT);
  const blur = clamp(Number(blurAmount || 18), 6, 28);

  ctx.save();
  ctx.filter = `blur(${blur}px)`;
  const expand = blur * 4;
  ctx.drawImage(
    image,
    crop.sx,
    crop.sy,
    crop.sw,
    crop.sh,
    -expand,
    -expand,
    width + expand * 2,
    height + expand * 2
  );
  ctx.filter = "none";
  ctx.fillStyle = "rgba(0,0,0,0.20)";
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawSoftBackdrop(ctx, width, height){
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "rgba(255,255,255,0.22)");
  gradient.addColorStop(0.42, "rgba(255,255,255,0.04)");
  gradient.addColorStop(1, "rgba(0,0,0,0.16)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawPhotoInsideSphere(ctx, image, layout, state){
  const d = Math.ceil(layout.sphereDiameter);
  const r = d / 2;
  const layer = document.createElement("canvas");
  layer.width = d;
  layer.height = d;
  const lctx = layer.getContext("2d", { willReadFrequently: true });

  const placement = clampPhotoPlacement(state, image, layout);
  const baseScale = getSphereCoverScale(image, d);
  const scale = baseScale * (placement.photoScale / 100);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const maxX = Math.max(0, (drawWidth - d) / 2);
  const maxY = Math.max(0, (drawHeight - d) / 2);
  const offsetX = maxX * (placement.photoOffsetX / 100);
  const offsetY = maxY * (placement.photoOffsetY / 100);
  const dx = r - drawWidth / 2 + offsetX;
  const dy = r - drawHeight / 2 + offsetY;

  lctx.save();
  lctx.beginPath();
  lctx.arc(r, r, r, 0, Math.PI * 2);
  lctx.clip();
  lctx.imageSmoothingEnabled = true;
  lctx.imageSmoothingQuality = "high";
  lctx.filter = `contrast(${state.contrast}%) saturate(${state.saturation}%)`;
  lctx.drawImage(image, dx, dy, drawWidth, drawHeight);
  lctx.filter = "none";
  applyWarmth(lctx, d, Number(state.warmth || 0));
  lctx.restore();

  const feather = clamp(Number(state.edgeFeather || 52), 0, 100) / 100;
  applyCircularFeather(layer, feather);

  ctx.save();
  ctx.drawImage(layer, layout.sphereX - layout.sphereRadius, layout.sphereY - layout.sphereRadius, layout.sphereDiameter, layout.sphereDiameter);
  ctx.restore();
}

function applyWarmth(ctx, size, warmth){
  const amount = Math.abs(clamp(warmth, -100, 100)) / 100;
  if (amount <= 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = "overlay";
  ctx.globalAlpha = 0.22 * amount;
  ctx.fillStyle = warmth >= 0 ? "rgb(255,148,58)" : "rgb(56,124,255)";
  ctx.fillRect(0, 0, size, size);
  ctx.restore();
}

function applyCircularFeather(canvas, feather){
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const size = canvas.width;
  const r = size / 2;
  const fadeStart = clamp(0.88 - feather * 0.16, 0.64, 0.95);
  ctx.save();
  ctx.globalCompositeOperation = "destination-in";
  const mask = ctx.createRadialGradient(r, r, r * fadeStart, r, r, r);
  mask.addColorStop(0, "rgba(0,0,0,1)");
  mask.addColorStop(0.76, "rgba(0,0,0,0.96)");
  mask.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();
}

function drawGlassOverlay(ctx, layout, state){
  const { sphereX: cx, sphereY: cy, sphereRadius: r } = layout;
  const highlight = clamp(Number(state.highlight || 82), 0, 100) / 100;
  const position = clamp(Number(state.highlightPosition || 18), 0, 100) / 100;
  const edge = clamp(Number(state.edgeFeather || 58), 0, 100) / 100;
  const shadow = clamp(Number(state.shadow || 56), 0, 100) / 100;
  const hx = cx + (position - 0.5) * r * 0.85;
  const hy = cy - r * 0.42;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  const inner = ctx.createRadialGradient(cx - r * 0.28, cy - r * 0.46, r * 0.04, cx, cy, r);
  inner.addColorStop(0, `rgba(255,255,255,${0.22 + highlight * 0.14})`);
  inner.addColorStop(0.38, "rgba(255,255,255,0.04)");
  inner.addColorStop(0.74, "rgba(210,245,255,0.04)");
  inner.addColorStop(1, `rgba(0,18,32,${0.18 + edge * 0.10 + shadow * 0.08})`);
  ctx.fillStyle = inner;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  const shine = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 0.54);
  shine.addColorStop(0, `rgba(255,255,255,${0.90 * highlight})`);
  shine.addColorStop(0.32, `rgba(255,255,255,${0.28 * highlight})`);
  shine.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = shine;
  ctx.beginPath();
  ctx.ellipse(hx, hy, r * 0.32, r * 0.17, -0.68 + position * 0.38, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.78 * highlight;
  ctx.strokeStyle = "rgba(255,255,255,0.88)";
  ctx.lineWidth = Math.max(2, r * 0.024);
  ctx.beginPath();
  ctx.arc(cx - r * 0.10 + (position - 0.5) * r * 0.22, cy - r * 0.14, r * 0.74, Math.PI * 1.06, Math.PI * 1.44);
  ctx.stroke();

  const sheen = ctx.createLinearGradient(cx - r * 0.85, cy - r, cx - r * 0.15, cy + r);
  sheen.addColorStop(0, `rgba(255,255,255,${0.30 * highlight})`);
  sheen.addColorStop(0.3, `rgba(255,255,255,${0.08 * highlight})`);
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.56, cy - r * 0.06, r * 0.22, r * 0.92, 0.1, 0, Math.PI * 2);
  ctx.fill();

  const baseShade = ctx.createLinearGradient(0, cy + r * 0.10, 0, cy + r);
  baseShade.addColorStop(0, "rgba(255,255,255,0)");
  baseShade.addColorStop(1, `rgba(0,0,0,${0.22 * shadow})`);
  ctx.fillStyle = baseShade;
  ctx.fillRect(cx - r, cy, r * 2, r);
  ctx.restore();

  ctx.save();
  ctx.lineWidth = Math.max(5, r * 0.034);
  const rim = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  rim.addColorStop(0, `rgba(255,255,255,${0.52 + edge * 0.26})`);
  rim.addColorStop(0.45, "rgba(255,255,255,0.10)");
  rim.addColorStop(0.75, "rgba(192,232,248,0.18)");
  rim.addColorStop(1, `rgba(255,255,255,${0.22 + edge * 0.24})`);
  ctx.strokeStyle = rim;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.992, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawSeat(ctx, seatImage, layout, seatId){
  if (seatImage) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    drawImageContain(ctx, seatImage, layout.seatX, layout.seatY, layout.seatWidth, layout.seatHeight);
    ctx.restore();
    return;
  }
  drawSeatFallback(ctx, layout, seatId);
}

function drawSeatFallback(ctx, layout, seatId){
  const { seatX: x, seatY: y, seatWidth: w, seatHeight: h } = layout;
  ctx.save();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.48, "rgba(210,218,220,0.96)");
  g.addColorStop(1, "rgba(170,150,120,0.98)");
  ctx.fillStyle = g;
  roundRect(ctx, x + w * 0.08, y + h * 0.10, w * 0.84, h * 0.78, 42);
  ctx.fill();
  ctx.strokeStyle = "rgba(218,176,80,0.86)";
  ctx.lineWidth = 10;
  ctx.stroke();
  ctx.fillStyle = "rgba(80,64,38,0.52)";
  ctx.font = "700 32px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(seatId || "seat", x + w / 2, y + h * 0.58);
  ctx.restore();
}

function drawSeatContactShadow(ctx, layout, shadowValue){
  const strength = clamp(Number(shadowValue || 56), 0, 100) / 100;
  if (strength <= 0.01) return;
  const { sphereX: cx, seatY, seatWidth, seatX, seatHeight, sphereRadius: r } = layout;
  ctx.save();
  ctx.beginPath();
  ctx.rect(seatX, seatY, seatWidth, Math.max(20, seatHeight * 0.24));
  ctx.clip();
  const g = ctx.createRadialGradient(cx, seatY + 8, r * 0.08, cx, seatY + 6, r * 0.72);
  g.addColorStop(0, `rgba(0,0,0,${0.24 * strength})`);
  g.addColorStop(0.5, `rgba(0,0,0,${0.10 * strength})`);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, seatY + 12, r * 0.62, Math.max(10, seatHeight * 0.10), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

async function loadSeatImage(seatId){
  const seat = CRYSTAL_SEATS.find(item => item.id === seatId) || CRYSTAL_SEATS[0];
  if (!seat?.asset) return null;
  if (imageCache.has(seat.asset)) return imageCache.get(seat.asset);

  const promise = new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(makeTransparentSeat(image));
    image.onerror = () => {
      console.warn(`[F2 水晶球] 找不到底座素材：${seat.asset}`);
      resolve(null);
    };
    image.src = seat.asset;
  });
  imageCache.set(seat.asset, promise);
  return promise;
}

function makeTransparentSeat(image){
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = img.data;
  const w = canvas.width;
  const h = canvas.height;
  const visited = new Uint8Array(w * h);
  const queue = new Uint32Array(w * h);
  let head = 0;
  let tail = 0;

  const tryPush = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const idx = y * w + x;
    if (visited[idx]) return;
    const di = idx * 4;
    if (!isNearWhite(data[di], data[di + 1], data[di + 2], data[di + 3])) return;
    visited[idx] = 1;
    queue[tail++] = idx;
  };

  for (let x = 0; x < w; x++) {
    tryPush(x, 0);
    tryPush(x, h - 1);
  }
  for (let y = 1; y < h - 1; y++) {
    tryPush(0, y);
    tryPush(w - 1, y);
  }

  while (head < tail) {
    const idx = queue[head++];
    const di = idx * 4;
    data[di + 3] = 0;
    const x = idx % w;
    const y = Math.floor(idx / w);
    tryPush(x + 1, y);
    tryPush(x - 1, y);
    tryPush(x, y + 1);
    tryPush(x, y - 1);
  }

  softenWhiteEdge(data, w, h);
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function softenWhiteEdge(data, width, height){
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] === 0) continue;
      if (!isNearWhite(data[idx], data[idx + 1], data[idx + 2], data[idx + 3])) continue;
      let transparentNeighbors = 0;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const ni = ((y + dy) * width + (x + dx)) * 4;
        if (data[ni + 3] === 0) transparentNeighbors++;
      }
      if (transparentNeighbors > 0) {
        data[idx + 3] = Math.min(data[idx + 3], 120);
      }
    }
  }
}

function isNearWhite(r, g, b, a){
  if (a < 8) return false;
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  return r >= 234 && g >= 234 && b >= 234 && (max - min) <= 28;
}

function getCoverCrop(imageWidth, imageHeight, targetAspect){
  const imageAspect = imageWidth / imageHeight;
  if (imageAspect > targetAspect) {
    const sw = imageHeight * targetAspect;
    return { sx: (imageWidth - sw) / 2, sy: 0, sw, sh: imageHeight };
  }
  const sh = imageWidth / targetAspect;
  return { sx: 0, sy: (imageHeight - sh) / 2, sw: imageWidth, sh };
}

function getSphereCoverScale(image, size){
  return Math.max(size / image.width, size / image.height);
}

function drawImageContain(ctx, image, x, y, width, height){
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const dx = x + (width - drawWidth) / 2;
  const dy = y + (height - drawHeight) / 2;
  ctx.drawImage(image, dx, dy, drawWidth, drawHeight);
}

function drawEmptyState(ctx, width, height){
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#eafffd");
  gradient.addColorStop(1, "#0ABAB5");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = "rgba(255,255,255,0.86)";
  roundRect(ctx, width * 0.12, height * 0.38, width * 0.76, 150, 30);
  ctx.fill();
  ctx.fillStyle = "#073f3d";
  ctx.font = "700 42px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("請開啟照片", width / 2, height * 0.38 + 64);
  ctx.font = "500 28px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText("建立水晶球相片展示", width / 2, height * 0.38 + 112);
  ctx.restore();
}

function roundRect(ctx, x, y, width, height, radius){
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function clamp(value, min, max){
  return Math.max(min, Math.min(max, Number(value)));
}
