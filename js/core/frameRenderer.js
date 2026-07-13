// Shared frame renderer for F5 Frame Studio.
// Draws photo + frame + shadow/highlight. Supports procedural materials and optional textures.

import { createMaterialFillStyle, getMaterialPreset } from "./materialEngine.js";

/**
 * Compute output canvas size including frame chrome.
 * @returns {{ width: number, height: number, content: DOMRect-like, frameWidthPx: number }}
 */
export function resolveFramedOutputSize(imageWidth, imageHeight, params = {}){
  const frameWidthPx = Math.max(2, Math.round(Number(params.frameWidth) || 36));
  const innerPadding = Math.max(0, Math.round(Number(params.innerPadding) || 0));
  const outerPadding = Math.max(0, Math.round(Number(params.outerPadding) || 8));
  const shadow = Math.max(0, Number(params.shadow) || 0);
  const shadowPad = Math.ceil(shadow * 0.55);

  const contentWidth = imageWidth;
  const contentHeight = imageHeight;
  const width = contentWidth + (frameWidthPx + innerPadding + outerPadding) * 2 + shadowPad * 2;
  const height = contentHeight + (frameWidthPx + innerPadding + outerPadding) * 2 + shadowPad * 2;

  // Polaroid adds extra bottom mat.
  const polaroidExtra = params.frameStyle === "polaroid"
    ? Math.round(Math.min(contentWidth, contentHeight) * 0.14)
    : 0;

  return {
    width,
    height: height + polaroidExtra,
    content: {
      x: outerPadding + frameWidthPx + innerPadding + shadowPad,
      y: outerPadding + frameWidthPx + innerPadding + shadowPad,
      width: contentWidth,
      height: contentHeight
    },
    frameWidthPx,
    innerPadding,
    outerPadding,
    shadowPad,
    polaroidExtra
  };
}

/**
 * Render a framed photo onto ctx. Canvas must already match resolveFramedOutputSize().
 */
export function renderFramedPhoto(ctx, sourceImage, options = {}){
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const frameStyle = options.frameStyle || "whiteBorder";
  const materialId = options.materialId || mapStyleToMaterial(frameStyle);
  const frameWidth = Math.max(2, Number(options.frameWidth) || 36);
  const cornerRadius = Math.max(0, Number(options.cornerRadius) || 0);
  const innerPadding = Math.max(0, Number(options.innerPadding) || 0);
  const outerPadding = Math.max(0, Number(options.outerPadding) || 8);
  const shadow = Math.max(0, Math.min(100, Number(options.shadow) || 28));
  const opacity = Math.max(0.15, Math.min(1, Number(options.opacity) ?? 1));
  const textureImage = options.textureImage || null;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const layout = resolveFramedOutputSize(
    options.contentWidth || sourceImage.width,
    options.contentHeight || sourceImage.height,
    {
      frameWidth,
      innerPadding,
      outerPadding,
      shadow,
      frameStyle
    }
  );

  // Background behind frame (transparent-looking mat).
  ctx.fillStyle = frameStyle === "filmBorder" ? "#0b0b0c" : "rgba(245, 248, 247, 1)";
  ctx.fillRect(0, 0, width, height);

  const outerX = layout.shadowPad + outerPadding;
  const outerY = layout.shadowPad + outerPadding;
  const outerW = width - layout.shadowPad * 2 - outerPadding * 2;
  const outerH = height - layout.shadowPad * 2 - outerPadding * 2 - (frameStyle === "filmBorder" ? 0 : 0);
  const photoX = layout.content.x;
  const photoY = layout.content.y;
  const photoW = layout.content.width;
  const photoH = layout.content.height;

  // Drop shadow under the whole frame.
  if (shadow > 0) {
    ctx.save();
    ctx.shadowColor = `rgba(0, 0, 0, ${0.18 + shadow / 180})`;
    ctx.shadowBlur = 8 + shadow * 0.45;
    ctx.shadowOffsetY = 4 + shadow * 0.12;
    ctx.fillStyle = "#000";
    roundRect(ctx, outerX, outerY, outerW, outerH, cornerRadius + frameWidth * 0.15);
    ctx.fill();
    ctx.restore();
  }

  // Frame body
  ctx.save();
  ctx.globalAlpha = opacity;
  const fill = createMaterialFillStyle(ctx, materialId, { textureImage, size: 256, opacity: 1 });
  ctx.fillStyle = fill || rgbCss(getMaterialPreset(materialId).base);
  roundRect(ctx, outerX, outerY, outerW, outerH, Math.max(0, cornerRadius + frameWidth * 0.12));
  ctx.fill();
  ctx.restore();

  // Inner mat / padding area
  const matX = outerX + frameWidth;
  const matY = outerY + frameWidth;
  const matW = outerW - frameWidth * 2;
  const matH = outerH - frameWidth * 2;
  ctx.fillStyle = pickMatColor(frameStyle);
  roundRect(ctx, matX, matY, matW, matH, Math.max(0, cornerRadius));
  ctx.fill();

  // Photo
  ctx.save();
  roundRect(ctx, photoX, photoY, photoW, photoH, Math.max(0, cornerRadius * 0.5));
  ctx.clip();
  ctx.drawImage(sourceImage, photoX, photoY, photoW, photoH);
  ctx.restore();

  // Inner bevel / highlight on frame edge
  drawFrameBevel(ctx, {
    outerX, outerY, outerW, outerH,
    frameWidth,
    cornerRadius: Math.max(0, cornerRadius + frameWidth * 0.12),
    materialId,
    frameStyle
  });

  // Style-specific decorations
  if (frameStyle === "filmBorder") {
    drawFilmSprockets(ctx, outerX, outerY, outerW, outerH, frameWidth);
  }
  if (frameStyle === "polaroid") {
    drawPolaroidDetails(ctx, layout, outerX, outerY, outerW, outerH);
  }
  if (frameStyle === "gallery") {
    drawGalleryLiner(ctx, matX, matY, matW, matH, photoX, photoY, photoW, photoH);
  }
}

export function mapStyleToMaterial(frameStyle){
  switch (frameStyle) {
    case "whiteBorder":
    case "thinBorder":
      return "white";
    case "blackBorder":
    case "thickBorder":
      return "black";
    case "wood":
    case "walnut":
    case "oak":
    case "pine":
    case "gold":
    case "silver":
    case "bronze":
    case "aluminum":
    case "acrylic":
      return frameStyle;
    case "gallery":
      return "gallery";
    case "polaroid":
      return "polaroid";
    case "filmBorder":
      return "film";
    default:
      return "wood";
  }
}

function pickMatColor(frameStyle){
  if (frameStyle === "polaroid") return "#f7f5ef";
  if (frameStyle === "filmBorder") return "#111113";
  if (frameStyle === "gallery") return "#f3f1ea";
  return "#ffffff";
}

function drawFrameBevel(ctx, geo){
  const { outerX, outerY, outerW, outerH, frameWidth, cornerRadius, materialId } = geo;
  const preset = getMaterialPreset(materialId);
  const gloss = preset.gloss || 0.2;

  ctx.save();
  ctx.lineWidth = Math.max(1, frameWidth * 0.12);
  roundRect(ctx, outerX + 1, outerY + 1, outerW - 2, outerH - 2, cornerRadius);
  ctx.strokeStyle = `rgba(255,255,255,${0.12 + gloss * 0.35})`;
  ctx.stroke();

  const inset = frameWidth;
  roundRect(ctx, outerX + inset, outerY + inset, outerW - inset * 2, outerH - inset * 2, Math.max(0, cornerRadius - 2));
  ctx.strokeStyle = `rgba(0,0,0,${0.18 + gloss * 0.2})`;
  ctx.stroke();
  ctx.restore();
}

function drawFilmSprockets(ctx, x, y, w, h, frameWidth){
  const holeW = Math.max(6, frameWidth * 0.38);
  const holeH = Math.max(8, frameWidth * 0.55);
  const gap = holeH * 1.55;
  ctx.fillStyle = "rgba(245,245,245,0.92)";

  const drawColumn = (cx) => {
    for (let yy = y + frameWidth * 0.35; yy < y + h - frameWidth * 0.35; yy += gap) {
      roundRect(ctx, cx - holeW / 2, yy, holeW, holeH, 2);
      ctx.fill();
    }
  };

  drawColumn(x + frameWidth * 0.5);
  drawColumn(x + w - frameWidth * 0.5);
}

function drawPolaroidDetails(ctx, layout, outerX, outerY, outerW, outerH){
  // Soft bottom caption area already created by polaroidExtra; add subtle edge.
  ctx.save();
  ctx.strokeStyle = "rgba(0,0,0,0.06)";
  ctx.lineWidth = 1;
  roundRect(ctx, outerX + 0.5, outerY + 0.5, outerW - 1, outerH - 1, 4);
  ctx.stroke();
  ctx.restore();
}

function drawGalleryLiner(ctx, matX, matY, matW, matH, photoX, photoY, photoW, photoH){
  ctx.save();
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = 1;
  ctx.strokeRect(photoX - 1, photoY - 1, photoW + 2, photoH + 2);
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.strokeRect(matX + 2, matY + 2, matW - 4, matH - 4);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, radius){
  const r = Math.max(0, Math.min(radius, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function rgbCss(rgb){
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}
