// F9 追焦 - Canvas 影像處理 v0.1.0
// 方案 A：主體遮罩清晰 + 背景水平運動模糊。

export const PAN_FOCUS_MAX_EDGE = 1600;
/** @deprecated Use resolveOutputSize() for the active photo. */
export const PAN_FOCUS_OUTPUT_WIDTH = 1200;
/** @deprecated Use resolveOutputSize() for the active photo. */
export const PAN_FOCUS_OUTPUT_HEIGHT = 1600;

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
export function resolveOutputSize(image, maxEdge = PAN_FOCUS_MAX_EDGE){
  if (!image?.width || !image?.height) {
    return { width: PAN_FOCUS_OUTPUT_WIDTH, height: PAN_FOCUS_OUTPUT_HEIGHT };
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

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} sourceImage
 * @param {object} state
 * @param {object|null} maskEntry
 */
export async function renderPanFocus(ctx, sourceImage, state, maskEntry = null){
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);

  if (!sourceImage) {
    drawEmptyState(ctx, width, height);
    return { applied: false, reason: "empty" };
  }

  const sourceCanvas = drawSourceToCanvas(sourceImage, width, height);
  const blurStrength = clamp(Number(state.blurStrength ?? 62), 0, 100);

  if (!maskEntry?.maskCanvas || maskEntry.subjectCoverage < 0.004) {
    ctx.drawImage(sourceCanvas, 0, 0);
    return { applied: false, reason: "no-subject", coverage: maskEntry?.subjectCoverage || 0 };
  }

  if (blurStrength <= 0) {
    ctx.drawImage(sourceCanvas, 0, 0);
    return { applied: true, reason: "zero-blur", coverage: maskEntry.subjectCoverage };
  }

  const direction = resolveRenderDirection(state, maskEntry);
  const blurred = applyHorizontalMotionBlur(sourceCanvas, blurStrength, direction);
  const subjectLayer = extractSubjectLayer(sourceCanvas, maskEntry.maskCanvas, width, height);

  ctx.drawImage(blurred, 0, 0);
  ctx.drawImage(subjectLayer, 0, 0);
  return {
    applied: true,
    reason: "ok",
    coverage: maskEntry.subjectCoverage,
    direction
  };
}

function resolveRenderDirection(state, maskEntry){
  const requested = state.panDirection || "auto";
  if (requested === "left" || requested === "right") return requested;
  return maskEntry?.resolvedDirection === "right" ? "right" : "left";
}

function drawSourceToCanvas(sourceImage, width, height){
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(sourceImage, 0, 0, width, height);
  return canvas;
}

/**
 * Stacked horizontal draws approximate a directional shutter pan.
 * direction "left" = streaks extend left (subject appears moving right).
 */
export function applyHorizontalMotionBlur(sourceCanvas, blurStrength, direction = "left"){
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const maxRadius = Math.max(8, Math.round(Math.min(width, 900) * 0.22));
  const radius = Math.max(1, Math.round((blurStrength / 100) * maxRadius));
  const sign = direction === "right" ? 1 : -1;

  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Work on a slightly downscaled buffer for speed, then upscale.
  const workScale = width > 1100 ? 0.7 : 1;
  const workW = Math.max(2, Math.round(width * workScale));
  const workH = Math.max(2, Math.round(height * workScale));
  const workRadius = Math.max(1, Math.round(radius * workScale));

  const work = document.createElement("canvas");
  work.width = workW;
  work.height = workH;
  const workCtx = work.getContext("2d");
  workCtx.drawImage(sourceCanvas, 0, 0, workW, workH);

  const blur = document.createElement("canvas");
  blur.width = workW;
  blur.height = workH;
  const blurCtx = blur.getContext("2d");

  const steps = Math.max(10, Math.min(52, workRadius));
  const stepSize = workRadius / steps;
  blurCtx.clearRect(0, 0, workW, workH);
  blurCtx.globalAlpha = 1 / (steps * 2 + 1);
  for (let i = -steps; i <= steps; i += 1) {
    // Triangle weight emphasis near center via double-pass density.
    blurCtx.globalAlpha = (1 - Math.abs(i) / (steps + 0.001)) / (steps + 1);
    blurCtx.drawImage(work, i * stepSize * sign, 0);
  }
  blurCtx.globalAlpha = 1;

  // Second lighter pass elongates streaks for a more photographic pan look.
  const streak = document.createElement("canvas");
  streak.width = workW;
  streak.height = workH;
  const streakCtx = streak.getContext("2d");
  streakCtx.globalAlpha = 0.55;
  streakCtx.drawImage(blur, 0, 0);
  streakCtx.globalAlpha = 0.18;
  const longSteps = Math.max(4, Math.round(steps * 0.45));
  for (let i = 1; i <= longSteps; i += 1) {
    streakCtx.drawImage(blur, i * stepSize * 1.65 * sign, 0);
  }
  streakCtx.globalAlpha = 1;

  ctx.drawImage(streak, 0, 0, workW, workH, 0, 0, width, height);
  return out;
}

function extractSubjectLayer(sourceCanvas, maskCanvas, width, height){
  const layer = document.createElement("canvas");
  layer.width = width;
  layer.height = height;
  const ctx = layer.getContext("2d");
  ctx.drawImage(sourceCanvas, 0, 0, width, height);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(maskCanvas, 0, 0, width, height);
  ctx.globalCompositeOperation = "source-over";
  return layer;
}

function drawEmptyState(ctx, width, height){
  ctx.fillStyle = "#102027";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = "600 20px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("請開啟照片", width / 2, height / 2);
}

function clamp(value, min, max){
  return Math.min(max, Math.max(min, value));
}
