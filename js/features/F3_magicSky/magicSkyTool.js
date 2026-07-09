// F3 魔法天空 - Canvas 影像處理 v0.1.0
// v0.1.0：僅繪製使用者照片；v0.2.0 加入 AI 天空遮罩與替換。

export const MAGIC_SKY_OUTPUT_WIDTH = 1200;
export const MAGIC_SKY_OUTPUT_HEIGHT = 1600;
export const MAGIC_SKY_ASPECT = 3 / 4;

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

export async function renderMagicSky(ctx, sourceImage, state){
  const width = MAGIC_SKY_OUTPUT_WIDTH;
  const height = MAGIC_SKY_OUTPUT_HEIGHT;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);

  if (!sourceImage) {
    drawEmptyState(ctx, width, height);
    return;
  }

  drawPhotoCover(ctx, sourceImage, width, height);
}

function drawPhotoCover(ctx, image, width, height){
  const imageRatio = image.width / image.height;
  const canvasRatio = width / height;
  let drawWidth;
  let drawHeight;
  let offsetX;
  let offsetY;

  if (imageRatio > canvasRatio) {
    drawHeight = height;
    drawWidth = height * imageRatio;
    offsetX = (width - drawWidth) / 2;
    offsetY = 0;
  } else {
    drawWidth = width;
    drawHeight = width / imageRatio;
    offsetX = 0;
    offsetY = (height - drawHeight) / 2;
  }

  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
}

function drawEmptyState(ctx, width, height){
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#dff8f6");
  gradient.addColorStop(1, "#b8ece8");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}
