// F8 小行星 - 渲染核心 v0.3.2
// 小行星／隧道極座標投影 + 左右融合 + 接縫高低 + 暈影 + 大氣散射。

export const TINY_PLANET_OUTPUT_SIZE = 1080;
export const TINY_PLANET_WORK_SIZE = 720;

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

/** 小行星／隧道輸出固定正方形。 */
export function resolveOutputSize(){
  return { width: TINY_PLANET_OUTPUT_SIZE, height: TINY_PLANET_OUTPUT_SIZE };
}

export async function renderTinyPlanet(ctx, sourceImage, state){
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);

  if (!sourceImage) {
    drawEmptyState(ctx, width, height);
    return;
  }

  const workSize = Math.min(TINY_PLANET_WORK_SIZE, width, height);
  const warped = applyPolarPlanetEffect(sourceImage, workSize, state);

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#0b1520";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(warped, 0, 0, workSize, workSize, 0, 0, width, height);
  ctx.restore();
}

/**
 * 將來源圖以極座標映射成小行星或隧道。
 * - planet：影像底部收斂至球心，天空展開為外圈
 * - tunnel：相反，天空收進中心
 */
function applyPolarPlanetEffect(sourceImage, size, state){
  const srcCanvas = document.createElement("canvas");
  const srcW = sourceImage.naturalWidth || sourceImage.width;
  const srcH = sourceImage.naturalHeight || sourceImage.height;
  srcCanvas.width = srcW;
  srcCanvas.height = srcH;
  const srcCtx = srcCanvas.getContext("2d", { willReadFrequently: true });
  srcCtx.drawImage(sourceImage, 0, 0);
  const src = srcCtx.getImageData(0, 0, srcW, srcH).data;

  const destCanvas = document.createElement("canvas");
  destCanvas.width = size;
  destCanvas.height = size;
  const destCtx = destCanvas.getContext("2d", { willReadFrequently: true });
  const destImage = destCtx.createImageData(size, size);
  const dest = destImage.data;

  const mode = state.projectionMode === "tunnel" ? "tunnel" : "planet";
  const rotationRad = (Number(state.rotation || 0) * Math.PI) / 180;
  const bend = 0.35 + (clamp(Number(state.bendStrength ?? 55), 0, 100) / 100) * 1.65;
  const zoom = clamp(Number(state.zoom ?? 100), 60, 160) / 100;
  const equator = clamp(Number(state.equatorOffset ?? 0), -50, 50) / 100;
  const seamAmt = clamp(Number(state.seamBlend ?? 0), 0, 100) / 100;
  const seamWidth = seamAmt > 0.001 ? 0.02 + seamAmt * 0.20 : 0;
  const seamHeightAmt = clamp(Number(state.seamHeight ?? 0), -50, 50) / 100;
  const vignetteAmt = clamp(Number(state.vignette ?? 0), 0, 100) / 100;
  const atmoAmt = clamp(Number(state.atmosphere ?? 0), 0, 100) / 100;

  const cx = size / 2;
  const cy = size / 2;
  const radius = (size / 2) * zoom;
  const twoPi = Math.PI * 2;
  const edgeSoft = 0.018;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const di = (y * size + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const distPx = Math.sqrt(dx * dx + dy * dy);
      const r = distPx / Math.max(1, radius);

      if (r > 1 + edgeSoft) {
        dest[di + 3] = 0;
        continue;
      }

      const angle = Math.atan2(dy, dx) + rotationRad;
      const u = ((angle / twoPi) % 1 + 1) % 1;

      const rr = Math.min(1, Math.max(0, r));
      let radial = Math.pow(rr, bend);
      if (mode === "planet") {
        radial = 1 - radial;
      }
      radial = clamp(radial - equator * 0.85, 0, 1);

      let sampleRadial = radial;
      if (Math.abs(seamHeightAmt) > 0.001) {
        const edgeFactor = (0.5 - u) * 2;
        sampleRadial = clamp(radial - edgeFactor * seamHeightAmt * 0.42, 0, 1);
      }

      const sy = sampleRadial * (srcH - 1);
      const sample = sampleWithSeamFusion(src, srcW, srcH, u, sy, seamWidth, seamAmt);

      let red = sample[0];
      let green = sample[1];
      let blue = sample[2];
      let alpha = sample[3];

      if (atmoAmt > 0.01) {
        const rim = smoothstep(0.35, 1, rr);
        const haze = rim * atmoAmt;
        red = lerp(red, 168, haze * 0.55);
        green = lerp(green, 198, haze * 0.62);
        blue = lerp(blue, 235, haze * 0.78);
        const lift = haze * 18;
        red = Math.min(255, red + lift * 0.4);
        green = Math.min(255, green + lift * 0.55);
        blue = Math.min(255, blue + lift * 0.75);
      }

      if (vignetteAmt > 0.01) {
        const shade = 1 - Math.pow(rr, 1.35) * vignetteAmt * 0.92;
        red *= shade;
        green *= shade;
        blue *= shade;
      }

      let edgeAlpha = 1;
      if (r > 1) {
        edgeAlpha = 1 - (r - 1) / edgeSoft;
      } else if (r > 0.97) {
        edgeAlpha = 1 - ((r - 0.97) / 0.03) * 0.08;
      }

      dest[di] = red;
      dest[di + 1] = green;
      dest[di + 2] = blue;
      dest[di + 3] = Math.min(255, alpha * edgeAlpha);
    }
  }

  destCtx.putImageData(destImage, 0, 0);
  return destCanvas;
}

/** Bilinear sample with horizontal wrap (panorama-friendly) and vertical clamp. */
function sampleBilinearWrapX(data, width, height, x, y){
  const wrappedX = ((x % width) + width) % width;
  const clampedY = clamp(y, 0, height - 1.0001);

  const x0 = Math.floor(wrappedX);
  const y0 = Math.floor(clampedY);
  const x1 = (x0 + 1) % width;
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = wrappedX - x0;
  const fy = clampedY - y0;

  const i00 = (y0 * width + x0) * 4;
  const i10 = (y0 * width + x1) * 4;
  const i01 = (y1 * width + x0) * 4;
  const i11 = (y1 * width + x1) * 4;

  const out = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const top = data[i00 + c] + (data[i10 + c] - data[i00 + c]) * fx;
    const bottom = data[i01 + c] + (data[i11 + c] - data[i01 + c]) * fx;
    out[c] = top + (bottom - top) * fy;
  }
  return out;
}

/**
 * 左右接縫融合：在 u=0/1 交界處，與鏡像另一側取樣混合，並做輕微角度方向柔化。
 */
function sampleWithSeamFusion(data, width, height, u, y, seamWidth, strength){
  const primary = sampleBilinearWrapX(data, width, height, u * width, y);
  if (seamWidth <= 0.0005 || strength <= 0.001) return primary;

  const distToSeam = Math.min(u, 1 - u);
  if (distToSeam >= seamWidth) return primary;

  const proximity = 1 - distToSeam / seamWidth;
  const mixAmt = Math.pow(smoothstep(0, 1, proximity), 1.1) * strength;

  const mirrorU = 1 - u;
  const mirror = sampleBilinearWrapX(data, width, height, mirrorU * width, y);
  const averaged = [
    (primary[0] + mirror[0]) * 0.5,
    (primary[1] + mirror[1]) * 0.5,
    (primary[2] + mirror[2]) * 0.5,
    (primary[3] + mirror[3]) * 0.5
  ];

  let out = [
    lerp(primary[0], averaged[0], mixAmt),
    lerp(primary[1], averaged[1], mixAmt),
    lerp(primary[2], averaged[2], mixAmt),
    lerp(primary[3], averaged[3], mixAmt)
  ];

  const blurMix = mixAmt * (0.35 + 0.55 * strength);
  if (blurMix > 0.02) {
    const spread = seamWidth * proximity * (0.45 + 0.55 * strength);
    const left = sampleBilinearWrapX(data, width, height, ((u - spread + 1) % 1) * width, y);
    const right = sampleBilinearWrapX(data, width, height, ((u + spread) % 1) * width, y);
    for (let c = 0; c < 4; c++) {
      const soft = (left[c] + out[c] + right[c]) / 3;
      out[c] = lerp(out[c], soft, blurMix);
    }
  }

  return out;
}

function drawEmptyState(ctx, width, height){
  ctx.fillStyle = "#f2f6f8";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#6b7c86";
  ctx.font = "28px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("請開啟全景或風景照片", width / 2, height / 2);
}

function clamp(value, min, max){
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t){
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, x){
  const t = clamp((x - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
