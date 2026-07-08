// F2 水晶球 - Canvas 影像處理 v0.2.1
// 固定 3:4 畫框。1150×1150 底座錨點定位、球面折射放大、邊緣色散與玻璃光層。

import {
  CRYSTAL_SEATS,
  SEAT_CRADLE_ANCHOR,
  SEAT_DISPLAY_WIDTH_RATIO,
  SPHERE_DIAMETER_RATIO,
  SPHERE_LIFT_RATIO
} from "./crystalState.js";

export const CRYSTAL_OUTPUT_WIDTH = 1200;
export const CRYSTAL_OUTPUT_HEIGHT = 1600;
export const CRYSTAL_ASPECT = 3 / 4;

const imageCache = new Map();
const LENS_WORK_SIZE = 560;

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
  const seatWidth = width * SEAT_DISPLAY_WIDTH_RATIO;
  const seatRatio = seatImage ? (seatImage.height / seatImage.width) : 1;
  const rawSeatHeight = seatWidth * seatRatio;
  const seatHeight = clamp(rawSeatHeight, height * 0.22, height * 0.42);
  const seatX = (width - seatWidth) / 2;
  const seatY = height - frameBottomGap - seatHeight;

  const cradleX = seatX + seatWidth * SEAT_CRADLE_ANCHOR.x;
  const cradleY = seatY + seatHeight * SEAT_CRADLE_ANCHOR.y;

  const sphereDiameter = Math.min(seatWidth * SPHERE_DIAMETER_RATIO, width * 0.84);
  const sphereRadius = sphereDiameter / 2;
  const sphereX = cradleX;
  const sphereY = cradleY - sphereRadius - seatHeight * SPHERE_LIFT_RATIO;
  const topMargin = Math.max(24, sphereY - sphereRadius);

  return {
    width,
    height,
    topMargin,
    bottomMargin: frameBottomGap,
    sphereX,
    sphereY,
    sphereRadius,
    sphereDiameter,
    cradleX,
    cradleY,
    seatX,
    seatY,
    seatWidth,
    seatHeight,
    seatTopOverlapY: cradleY - seatHeight * 0.02,
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

  const placement = clampPhotoPlacement(state, image, layout);
  const baseScale = getSphereCoverScale(image, d);
  const scale = baseScale * (placement.photoScale / 100);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const maxX = Math.max(0, (drawWidth - d) / 2);
  const maxY = Math.max(0, (drawHeight - d) / 2);
  const offsetX = maxX * (placement.photoOffsetX / 100);
  const offsetY = maxY * (placement.photoOffsetY / 100);

  const srcPad = Math.ceil(d * 0.18);
  const srcSize = d + srcPad * 2;
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = srcSize;
  srcCanvas.height = srcSize;
  const sctx = srcCanvas.getContext("2d", { willReadFrequently: true });
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = "high";
  sctx.filter = `contrast(${state.contrast}%) saturate(${state.saturation}%)`;
  sctx.drawImage(
    image,
    srcPad + r - drawWidth / 2 + offsetX,
    srcPad + r - drawHeight / 2 + offsetY,
    drawWidth,
    drawHeight
  );
  sctx.filter = "none";
  applyWarmth(sctx, srcSize, Number(state.warmth || 0));

  const workSize = Math.min(LENS_WORK_SIZE, d);
  const warped = applySphericalLensEffect(srcCanvas, workSize, state);

  const layer = document.createElement("canvas");
  layer.width = d;
  layer.height = d;
  const lctx = layer.getContext("2d", { willReadFrequently: true });
  lctx.imageSmoothingEnabled = true;
  lctx.imageSmoothingQuality = "high";
  lctx.drawImage(warped, 0, 0, workSize, workSize, 0, 0, d, d);

  const feather = clamp(Number(state.edgeFeather || 52), 0, 100) / 100;
  applyCircularFeather(layer, feather);

  ctx.save();
  ctx.drawImage(layer, layout.sphereX - r, layout.sphereY - r, d, d);
  ctx.restore();
}

function applySphericalLensEffect(sourceCanvas, size, state){
  const refraction = clamp(Number(state.refraction ?? 62), 0, 100) / 100;
  const srcCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const srcW = sourceCanvas.width;
  const srcH = sourceCanvas.height;
  const srcImage = srcCtx.getImageData(0, 0, srcW, srcH);
  const src = srcImage.data;

  const destCanvas = document.createElement("canvas");
  destCanvas.width = size;
  destCanvas.height = size;
  const destCtx = destCanvas.getContext("2d", { willReadFrequently: true });
  const destImage = destCtx.createImageData(size, size);
  const dest = destImage.data;

  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2;
  const srcCx = srcW / 2;
  const srcCy = srcH / 2;

  const magnify = 0.16 + refraction * 0.28;
  const edgeStart = 0.66 - refraction * 0.06;
  const chroma = refraction * 3.4;
  const fresnelStrength = 0.03 + refraction * 0.07;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ndx = (x - cx) / radius;
      const ndy = (y - cy) / radius;
      const dist = Math.sqrt(ndx * ndx + ndy * ndy);
      const di = (y * size + x) * 4;

      if (dist > 1) {
        dest[di + 3] = 0;
        continue;
      }

      let sx = ndx;
      let sy = ndy;

      const barrel = 1 + magnify * (1 - dist * dist);
      sx /= barrel;
      sy /= barrel;

      if (dist > edgeStart) {
        const t = (dist - edgeStart) / Math.max(0.001, 1 - edgeStart);
        const invert = t * t * refraction * 0.68;
        sx *= (1 - 2 * invert);
        sy *= (1 - 2 * invert);
        const edgePull = t * refraction * 0.12;
        sx *= (1 + edgePull);
        sy *= (1 + edgePull);
      }

      const ca = (dist > 0.52 ? (dist - 0.52) / 0.48 : 0) * chroma;
      const sampleAt = (ox, oy) => sampleBilinear(
        src,
        srcW,
        srcH,
        srcCx + sx * srcCx + ox,
        srcCy + sy * srcCy + oy
      );

      const red = sampleAt(-ca, 0);
      const green = sampleAt(0, 0);
      const blue = sampleAt(ca, 0);

      const z = Math.sqrt(Math.max(0, 1 - dist * dist));
      const fresnel = 1 - fresnelStrength * (1 - z) * (1 - z);
      const edgeAlpha = 1 - Math.pow(dist, 14) * 0.02;

      dest[di] = red[0] * fresnel;
      dest[di + 1] = green[1] * fresnel;
      dest[di + 2] = blue[2] * fresnel;
      dest[di + 3] = Math.min(255, green[3] * edgeAlpha);
    }
  }

  destCtx.putImageData(destImage, 0, 0);
  return destCanvas;
}

function sampleBilinear(data, width, height, x, y){
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  if (x0 < 0 || y0 < 0 || x1 >= width || y1 >= height) return [0, 0, 0, 0];

  const fx = x - x0;
  const fy = y - y0;
  const i00 = (y0 * width + x0) * 4;
  const i10 = (y0 * width + x1) * 4;
  const i01 = (y1 * width + x0) * 4;
  const i11 = (y1 * width + x1) * 4;
  const lerp = (a, b, t) => a + (b - a) * t;
  const out = [0, 0, 0, 0];

  for (let c = 0; c < 4; c++) {
    const top = lerp(data[i00 + c], data[i10 + c], fx);
    const bottom = lerp(data[i01 + c], data[i11 + c], fx);
    out[c] = lerp(top, bottom, fy);
  }
  return out;
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
  const fadeStart = clamp(0.96 - feather * 0.06, 0.90, 0.98);
  ctx.save();
  ctx.globalCompositeOperation = "destination-in";
  const mask = ctx.createRadialGradient(r, r, r * fadeStart, r, r, r);
  mask.addColorStop(0, "rgba(0,0,0,1)");
  mask.addColorStop(0.88, "rgba(0,0,0,1)");
  mask.addColorStop(1, "rgba(0,0,0,0.98)");
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();
}

function drawGlassOverlay(ctx, layout, state){
  const { sphereX: cx, sphereY: cy, sphereRadius: r } = layout;
  const highlight = clamp(Number(state.highlight || 82), 0, 100) / 100;
  const position = clamp(Number(state.highlightPosition || 18), 0, 100) / 100;
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
  inner.addColorStop(0.74, "rgba(210,245,255,0.06)");
  inner.addColorStop(0.92, "rgba(220,248,255,0.10)");
  inner.addColorStop(1, `rgba(255,255,255,${0.06 + highlight * 0.08})`);
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

  const rx = cx - (hx - cx) * 0.58;
  const ry = cy - (hy - cy) * 0.42;
  const reflection = ctx.createRadialGradient(rx, ry, 0, rx, ry, r * 0.36);
  reflection.addColorStop(0, `rgba(255,255,255,${0.16 * highlight})`);
  reflection.addColorStop(0.55, `rgba(200,235,255,${0.06 * highlight})`);
  reflection.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = reflection;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

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
  baseShade.addColorStop(1, `rgba(0,0,0,${0.18 * shadow})`);
  ctx.fillStyle = baseShade;
  ctx.fillRect(cx - r, cy, r * 2, r);

  const edgeHighlight = ctx.createRadialGradient(cx, cy, r * 0.84, cx, cy, r);
  edgeHighlight.addColorStop(0, "rgba(255,255,255,0)");
  edgeHighlight.addColorStop(0.72, `rgba(255,255,255,${0.04 + highlight * 0.06})`);
  edgeHighlight.addColorStop(0.90, `rgba(220,248,255,${0.22 + highlight * 0.18})`);
  edgeHighlight.addColorStop(0.97, `rgba(255,255,255,${0.14 + highlight * 0.10})`);
  edgeHighlight.addColorStop(1, `rgba(200,235,255,${0.06 + highlight * 0.04})`);
  ctx.fillStyle = edgeHighlight;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
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
  const { sphereX: cx, cradleY, seatX, seatWidth, seatHeight, sphereRadius: r } = layout;
  ctx.save();
  ctx.beginPath();
  ctx.rect(seatX, cradleY - seatHeight * 0.04, seatWidth, Math.max(24, seatHeight * 0.14));
  ctx.clip();
  const g = ctx.createRadialGradient(cx, cradleY + 4, r * 0.06, cx, cradleY + 2, r * 0.58);
  g.addColorStop(0, `rgba(0,0,0,${0.30 * strength})`);
  g.addColorStop(0.45, `rgba(0,0,0,${0.12 * strength})`);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cradleY + 8, r * 0.50, Math.max(8, seatHeight * 0.048), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

async function loadSeatImage(seatId){
  const seat = CRYSTAL_SEATS.find(item => item.id === seatId) || CRYSTAL_SEATS[0];
  if (!seat?.asset) return null;
  if (imageCache.has(seat.asset)) return imageCache.get(seat.asset);

  const promise = new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(imageHasAlpha(image) ? image : makeTransparentSeat(image));
    image.onerror = () => {
      console.warn(`[F2 水晶球] 找不到底座素材：${seat.asset}`);
      resolve(null);
    };
    image.src = seat.asset;
  });
  imageCache.set(seat.asset, promise);
  return promise;
}

function imageHasAlpha(image){
  const canvas = document.createElement("canvas");
  const sampleW = Math.min(image.width, 96);
  const sampleH = Math.min(image.height, 96);
  canvas.width = sampleW;
  canvas.height = sampleH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, sampleW, sampleH);
  const data = ctx.getImageData(0, 0, sampleW, sampleH).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) return true;
  }
  return false;
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
