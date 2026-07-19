// Shared frame renderer for F5 Frame Studio.
// Draws photo + outer/inner frame rings. Supports procedural materials and textures.

import { createMaterialFillStyle, getMaterialPreset } from "./materialEngine.js";

/**
 * Compute output canvas size including dual-frame chrome.
 * Outer and inner rings sit flush (no gap). outerPadding may be 0.
 */
export function resolveFramedOutputSize(imageWidth, imageHeight, params = {}){
  const outerFrameWidthPx = Math.max(0, Math.round(Number(
    params.outerFrameWidth ?? params.frameWidth
  ) || 0));
  const innerFrameWidthPx = Math.max(0, Math.round(Number(params.innerFrameWidth) || 0));
  const outerPadding = Math.max(0, Math.round(Number(params.outerPadding) || 0));
  const shadow = Math.max(0, Number(params.shadow) || 0);
  const shadowPad = params.transparentBackground
    ? Math.ceil(shadow * 0.35)
    : Math.ceil(shadow * 0.55);

  const totalFrame = Math.max(2, outerFrameWidthPx + innerFrameWidthPx);
  const contentWidth = imageWidth;
  const contentHeight = imageHeight;
  const width = contentWidth + (totalFrame + outerPadding) * 2 + shadowPad * 2;
  const height = contentHeight + (totalFrame + outerPadding) * 2 + shadowPad * 2;

  const polaroidExtra = params.frameStyle === "polaroid"
    ? Math.round(Math.min(contentWidth, contentHeight) * 0.14)
    : 0;

  return {
    width,
    height: height + polaroidExtra,
    content: {
      x: outerPadding + totalFrame + shadowPad,
      y: outerPadding + totalFrame + shadowPad,
      width: contentWidth,
      height: contentHeight
    },
    frameWidthPx: totalFrame,
    outerFrameWidthPx,
    innerFrameWidthPx,
    outerPadding,
    shadowPad,
    polaroidExtra
  };
}

/**
 * Render a framed photo onto ctx. Canvas must already match resolveFramedOutputSize().
 * Supports dual materials: outerMaterialId / innerMaterialId (+ matching textures).
 */
export function renderFramedPhoto(ctx, sourceImage, options = {}){
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const frameStyle = options.frameStyle || "whiteBorder";
  const outerMaterialId = options.outerMaterialId
    || options.materialId
    || mapStyleToMaterial(frameStyle);
  const innerMaterialId = options.innerMaterialId || null;
  const outerFrameWidth = Math.max(0, Number(options.outerFrameWidth ?? options.frameWidth) || 0);
  const innerFrameWidth = Math.max(0, Number(options.innerFrameWidth) || 0);
  const cornerRadius = Math.max(0, Number(options.cornerRadius) || 0);
  const outerPadding = Math.max(0, Number(options.outerPadding) || 0);
  const shadow = Math.max(0, Math.min(100, Number(options.shadow) || 28));
  const opacity = Math.max(0.15, Math.min(1, Number(options.opacity) ?? 1));
  const outerTexture = options.outerTextureImage || options.textureImage || null;
  const innerTexture = options.innerTextureImage || null;
  const transparentBackground = Boolean(options.transparentBackground);

  const effectiveOuter = outerFrameWidth > 0 ? outerFrameWidth : (innerFrameWidth > 0 ? 0 : 36);
  const effectiveInner = innerMaterialId && innerFrameWidth > 0 ? innerFrameWidth : 0;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const layout = resolveFramedOutputSize(
    options.contentWidth || sourceImage.width,
    options.contentHeight || sourceImage.height,
    {
      outerFrameWidth: effectiveOuter,
      innerFrameWidth: effectiveInner,
      outerPadding,
      shadow,
      frameStyle,
      transparentBackground
    }
  );

  if (!transparentBackground) {
    ctx.fillStyle = frameStyle === "filmBorder" ? "#0b0b0c" : "rgba(245, 248, 247, 1)";
    ctx.fillRect(0, 0, width, height);
  }

  const outerX = layout.shadowPad + outerPadding;
  const outerY = layout.shadowPad + outerPadding;
  const outerW = width - layout.shadowPad * 2 - outerPadding * 2;
  const outerH = height - layout.shadowPad * 2 - outerPadding * 2;
  const photoX = layout.content.x;
  const photoY = layout.content.y;
  const photoW = layout.content.width;
  const photoH = layout.content.height;
  const outerRadius = Math.max(0, cornerRadius + (effectiveOuter + effectiveInner) * 0.12);

  if (shadow > 0) {
    ctx.save();
    ctx.shadowColor = `rgba(0, 0, 0, ${0.18 + shadow / 180})`;
    ctx.shadowBlur = 8 + shadow * 0.45;
    ctx.shadowOffsetY = 4 + shadow * 0.12;
    ctx.fillStyle = "#000";
    roundRect(ctx, outerX, outerY, outerW, outerH, outerRadius);
    ctx.fill();
    ctx.restore();
  }

  if (effectiveOuter > 0) {
    ctx.save();
    ctx.globalAlpha = opacity;
    if (outerTexture && isStripTexture(outerTexture)) {
      drawStripFrameRing(ctx, outerTexture, outerX, outerY, outerW, outerH, effectiveOuter, outerRadius);
    } else {
      const fill = createMaterialFillStyle(ctx, outerMaterialId, {
        textureImage: outerTexture,
        size: 256,
        opacity: 1
      });
      ctx.fillStyle = fill || rgbCss(getMaterialPreset(outerMaterialId).base);
      roundRect(ctx, outerX, outerY, outerW, outerH, outerRadius);
      ctx.fill();
    }
    ctx.restore();
  }

  const innerX = outerX + effectiveOuter;
  const innerY = outerY + effectiveOuter;
  const innerW = outerW - effectiveOuter * 2;
  const innerH = outerH - effectiveOuter * 2;
  // 圓角只適用外框；內框始終直角。
  const innerRadius = 0;

  if (effectiveInner > 0 && innerMaterialId) {
    ctx.save();
    ctx.globalAlpha = opacity;
    if (innerTexture && isStripTexture(innerTexture)) {
      drawStripFrameRing(ctx, innerTexture, innerX, innerY, innerW, innerH, effectiveInner, innerRadius);
    } else {
      const fill = createMaterialFillStyle(ctx, innerMaterialId, {
        textureImage: innerTexture,
        size: 256,
        opacity: 1
      });
      ctx.fillStyle = fill || rgbCss(getMaterialPreset(innerMaterialId).base);
      roundRect(ctx, innerX, innerY, innerW, innerH, innerRadius);
      ctx.fill();
    }
    ctx.restore();
  }

  // 有內框時照片視窗跟內框同為直角；僅外框時才帶一點外框圓角。
  const photoRadius = effectiveInner > 0 ? 0 : Math.max(0, cornerRadius * 0.5);
  ctx.save();
  roundRect(ctx, photoX, photoY, photoW, photoH, photoRadius);
  ctx.clip();
  if (!(outerTexture && isStripTexture(outerTexture)) && !(innerTexture && isStripTexture(innerTexture))) {
    // Non-strip fills cover the photo hole; keep previous behavior (photo over paint).
  } else if (!transparentBackground) {
    ctx.fillStyle = frameStyle === "filmBorder" ? "#0b0b0c" : "rgba(245, 248, 247, 1)";
    ctx.fillRect(photoX, photoY, photoW, photoH);
  }
  drawPlacedPhoto(ctx, sourceImage, photoX, photoY, photoW, photoH, {
    photoScale: options.photoScale,
    photoOffsetX: options.photoOffsetX,
    photoOffsetY: options.photoOffsetY
  });
  ctx.restore();

  if (effectiveOuter > 0 && !(outerTexture && isStripTexture(outerTexture))) {
    drawFrameBevel(ctx, {
      outerX, outerY, outerW, outerH,
      frameWidth: effectiveOuter,
      cornerRadius: outerRadius,
      materialId: outerMaterialId,
      frameStyle
    });
  }
  if (effectiveInner > 0 && innerMaterialId && !(innerTexture && isStripTexture(innerTexture))) {
    drawFrameBevel(ctx, {
      outerX: innerX,
      outerY: innerY,
      outerW: innerW,
      outerH: innerH,
      frameWidth: effectiveInner,
      cornerRadius: innerRadius,
      materialId: innerMaterialId,
      frameStyle
    });
  }

  if (frameStyle === "filmBorder") {
    drawFilmSprockets(ctx, outerX, outerY, outerW, outerH, Math.max(effectiveOuter, 12));
  }
  if (frameStyle === "polaroid") {
    drawPolaroidDetails(ctx, layout, outerX, outerY, outerW, outerH);
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

function drawFrameBevel(ctx, geo){
  const { outerX, outerY, outerW, outerH, frameWidth, cornerRadius, materialId } = geo;
  if (frameWidth <= 0) return;
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
  ctx.save();
  ctx.strokeStyle = "rgba(0,0,0,0.06)";
  ctx.lineWidth = 1;
  roundRect(ctx, outerX + 0.5, outerY + 0.5, outerW - 1, outerH - 1, 4);
  ctx.stroke();
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, radius){
  ctx.beginPath();
  appendRoundRect(ctx, x, y, w, h, radius);
  ctx.closePath();
}

function appendRoundRect(ctx, x, y, w, h, radius){
  const r = Math.max(0, Math.min(radius, Math.min(w, h) / 2));
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function isStripTexture(image){
  if (!image?.width || !image?.height) return false;
  return image.width >= image.height * 2.5;
}

/**
 * Draw a moulding ring from a long horizontal strip (e.g. 2560×256).
 * Each side stretches the strip along its length; corners rotate 90°.
 * cornerRadius clips the ring to a rounded outer/inner silhouette.
 */
function drawStripFrameRing(ctx, stripImage, x, y, w, h, frameWidth, cornerRadius = 0){
  const fw = Math.max(1, Math.min(frameWidth, Math.min(w, h) / 2));
  if (fw <= 0 || w <= 0 || h <= 0) return;

  const outerR = Math.max(0, Math.min(cornerRadius, Math.min(w, h) / 2));
  const holeW = Math.max(1, w - fw * 2);
  const holeH = Math.max(1, h - fw * 2);
  const innerR = Math.max(0, Math.min(cornerRadius * 0.55, Math.min(holeW, holeH) / 2));

  ctx.save();
  ctx.beginPath();
  appendRoundRect(ctx, x, y, w, h, outerR);
  appendRoundRect(ctx, x + fw, y + fw, holeW, holeH, innerR);
  ctx.clip("evenodd");

  // Clockwise: top → right → bottom → left. Strip "height" faces inward.
  drawStripRail(ctx, stripImage, x, y, w, fw, 0);
  drawStripRail(ctx, stripImage, x + w, y, h, fw, 90);
  drawStripRail(ctx, stripImage, x + w, y + h, w, fw, 180);
  drawStripRail(ctx, stripImage, x, y + h, h, fw, 270);
  ctx.restore();
}

function drawStripRail(ctx, stripImage, originX, originY, length, thickness, angleDeg){
  if (length <= 0 || thickness <= 0 || !stripImage) return;
  ctx.save();
  ctx.translate(originX, originY);
  ctx.rotate((angleDeg * Math.PI) / 180);
  // Soft miter: clip a trapezoid so corners meet cleanly.
  const m = Math.min(thickness, length / 2);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(length, 0);
  ctx.lineTo(length - m, thickness);
  ctx.lineTo(m, thickness);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(
    stripImage,
    0, 0, stripImage.width, stripImage.height,
    0, 0, length, thickness
  );
  ctx.restore();
}

/** Cover-fit photo inside a window with optional scale / pan (percent). */
function drawPlacedPhoto(ctx, sourceImage, x, y, w, h, placement = {}){
  if (!sourceImage || !w || !h) return;
  const scale = Math.max(0.5, Math.min(2, (Number(placement.photoScale) || 100) / 100));
  const offsetX = (Number(placement.photoOffsetX) || 0) / 100;
  const offsetY = (Number(placement.photoOffsetY) || 0) / 100;
  const base = Math.max(w / sourceImage.width, h / sourceImage.height) * scale;
  const dw = sourceImage.width * base;
  const dh = sourceImage.height * base;
  const dx = x + (w - dw) / 2 + offsetX * w * 0.35;
  const dy = y + (h - dh) / 2 + offsetY * h * 0.35;
  ctx.drawImage(sourceImage, dx, dy, dw, dh);
}

function rgbCss(rgb){
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

/**
 * Artistic overlay frame: photo cover-fit under a transparent-center WebP frame.
 * Canvas should already match resolveArtisticOutputSize().
 *
 * artisticCornerRadius — rounds the outer silhouette of the composite.
 * artisticFrameWidth — simulates thicker/thinner borders by cropping or
 *   scaling the baked overlay (ornate WebP frames cannot be redrawn like classic tiles).
 */
export function renderArtisticFramedPhoto(ctx, sourceImage, frameImage, options = {}){
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const opacity = Math.max(0.15, Math.min(1, Number(options.opacity) ?? 1));
  const photoScale = Math.max(0.7, Math.min(1.6, (Number(options.photoScale ?? options.artisticPhotoScale) || 100) / 100));
  const offsetX = (Number(options.photoOffsetX ?? options.artisticOffsetX) || 0) / 100;
  const offsetY = (Number(options.photoOffsetY ?? options.artisticOffsetY) || 0) / 100;
  const frameWidthFactor = Math.max(0.5, Math.min(1.6, (Number(options.artisticFrameWidth) || 100) / 100));
  const cornerRadius = Math.max(0, Math.min(
    Math.min(width, height) / 2,
    Number(options.artisticCornerRadius) || 0
  ));
  const transparentBackground = Boolean(options.transparentBackground);
  const shadow = Math.max(0, Math.min(100, Number(options.shadow) || 0));
  const matte = "rgba(245, 248, 247, 1)";

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);

  // Drop shadow follows the rounded outer silhouette when radius > 0.
  if (shadow > 0) {
    ctx.save();
    ctx.shadowColor = `rgba(0, 0, 0, ${0.16 + shadow / 200})`;
    ctx.shadowBlur = 6 + shadow * 0.35;
    ctx.shadowOffsetY = 3 + shadow * 0.1;
    ctx.fillStyle = "#000";
    if (cornerRadius > 0) {
      roundRect(ctx, 2, 2, width - 4, height - 4, Math.max(0, cornerRadius - 1));
      ctx.fill();
    } else {
      ctx.fillRect(2, 2, width - 4, height - 4);
    }
    ctx.restore();
  }

  ctx.save();
  if (cornerRadius > 0) {
    roundRect(ctx, 0, 0, width, height, cornerRadius);
    ctx.clip();
  }

  if (!transparentBackground) {
    ctx.fillStyle = matte;
    ctx.fillRect(0, 0, width, height);
  }

  // Photo under the frame (cover-fit + optional pan/scale).
  if (sourceImage) {
    const base = Math.max(width / sourceImage.width, height / sourceImage.height) * photoScale;
    const dw = sourceImage.width * base;
    const dh = sourceImage.height * base;
    const dx = (width - dw) / 2 + offsetX * width * 0.35;
    const dy = (height - dh) / 2 + offsetY * height * 0.35;
    ctx.drawImage(sourceImage, dx, dy, dw, dh);
  }

  if (frameImage) {
    ctx.save();
    ctx.globalAlpha = opacity;
    drawArtisticFrameOverlay(ctx, frameImage, width, height, frameWidthFactor);
    ctx.restore();
  }

  ctx.restore();
}

/** Scale/crop baked overlay to simulate thicker (factor>1) or thinner (factor<1) borders. */
function drawArtisticFrameOverlay(ctx, frameImage, width, height, frameWidthFactor){
  const fw = frameImage.width || width;
  const fh = frameImage.height || height;
  if (frameWidthFactor >= 1) {
    // Thicker: crop toward the center of the frame art, then stretch to canvas.
    const inset = (1 - 1 / frameWidthFactor) / 2;
    const sx = fw * inset;
    const sy = fh * inset;
    const sw = Math.max(1, fw * (1 - 2 * inset));
    const sh = Math.max(1, fh * (1 - 2 * inset));
    ctx.drawImage(frameImage, sx, sy, sw, sh, 0, 0, width, height);
    return;
  }
  // Thinner: enlarge overlay past the canvas so the hole grows and outer border is clipped.
  const scale = 1 / frameWidthFactor;
  const dw = width * scale;
  const dh = height * scale;
  const dx = (width - dw) / 2;
  const dy = (height - dh) / 2;
  ctx.drawImage(frameImage, dx, dy, dw, dh);
}

/** Output size follows artistic frame aspect (3:4 / 4:3), scaled to maxEdge. */
export function resolveArtisticOutputSize(params = {}){
  const aspectKey = params.aspect || "3x4";
  const maxEdge = Math.max(640, Number(params.maxEdge) || 1080);
  if (aspectKey === "4x3") {
    const width = maxEdge;
    const height = Math.round(width * 3 / 4);
    return { width, height, aspect: "4x3" };
  }
  const height = maxEdge;
  const width = Math.round(height * 3 / 4);
  return { width, height, aspect: "3x4" };
}

/**
 * Scene-based Gallery: full wall image (Layer 1) + classic-framed photo (Layer 2)
 * placed inside a mount rect with pan/scale + multi spotlight overlays.
 */
export function renderGalleryPresentation(ctx, framedLayer, options = {}){
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const sceneImage = options.sceneImage || null;
  const mount = options.mount || { x: 0.20, y: 0.05, w: 0.60, h: 0.90 };
  const scale = Math.max(0.4, Math.min(1.8, (Number(options.galleryPhotoScale) || 100) / 100));
  const offsetX = (Number(options.galleryOffsetX) || 0) / 100;
  const offsetY = (Number(options.galleryOffsetY) || 0) / 100;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);

  if (sceneImage) {
    coverImage(ctx, sceneImage, 0, 0, width, height);
  } else {
    fillProceduralGalleryScene(ctx, width, height, options.aspect || "3x4");
  }

  const mountPx = {
    x: mount.x * width,
    y: mount.y * height,
    w: mount.w * width,
    h: mount.h * height
  };

  const layerW = framedLayer.width;
  const layerH = framedLayer.height;
  const fit = Math.min(mountPx.w / layerW, mountPx.h / layerH) * scale;
  const drawW = layerW * fit;
  const drawH = layerH * fit;
  const baseX = mountPx.x + (mountPx.w - drawW) / 2;
  const baseY = mountPx.y + (mountPx.h - drawH) / 2;
  const drawX = baseX + offsetX * mountPx.w * 0.45;
  const drawY = baseY + offsetY * mountPx.h * 0.45;

  const fastPreview = Boolean(options.fastPreview);

  // Soft contact shadow under Layer 2 (cheaper during gestures).
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.38)";
  ctx.shadowBlur = fastPreview
    ? Math.max(4, Math.min(drawW, drawH) * 0.02)
    : Math.max(12, Math.min(drawW, drawH) * 0.05);
  ctx.shadowOffsetY = fastPreview ? 3 : Math.max(6, drawH * 0.02);
  ctx.fillStyle = "#000";
  ctx.fillRect(drawX, drawY, drawW, drawH);
  ctx.restore();

  ctx.drawImage(framedLayer, drawX, drawY, drawW, drawH);

  // Spotlights are full-canvas screen composites — skip while dragging/pinching.
  if (!fastPreview) {
    drawGallerySpotlights(ctx, width, height, {
      count: Math.max(1, Math.min(4, Number(options.galleryLightCount) || 1)),
      posX: Number(options.galleryLightPosX) || 50,
      posY: Number(options.galleryLightPosY) || 12,
      intensity: Number(options.galleryLightIntensity) || 58,
      direction: Number(options.galleryLightDirection) || 270,
      distance: Number(options.galleryLightDistance) || 55,
      targetX: drawX + drawW / 2,
      targetY: drawY + drawH / 2
    });
  }

  return {
    mount: mountPx,
    layer: { x: drawX, y: drawY, w: drawW, h: drawH }
  };
}

/** Output canvas matches scene aspect (3:4 or 4:3), not the photo. */
export function resolveGalleryOutputSize(photoWidth, photoHeight, params = {}){
  const aspectKey = params.aspect || (photoWidth >= photoHeight ? "4x3" : "3x4");
  const maxEdge = Math.max(640, Number(params.maxEdge) || 1080);
  if (aspectKey === "4x3") {
    const width = maxEdge;
    const height = Math.round(width * 3 / 4);
    return { width, height, aspect: "4x3" };
  }
  const height = maxEdge;
  const width = Math.round(height * 3 / 4);
  return { width, height, aspect: "3x4" };
}

function fillProceduralGalleryScene(ctx, width, height, aspect){
  // Placeholder marble hall until wall-3x4 / wall-4x3 assets arrive.
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#dfe3e8");
  sky.addColorStop(1, "#b8bdc6");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const slabW = width * 0.6;
  const slabH = height * 0.9;
  const slabX = (width - slabW) / 2;
  const slabY = (height - slabH) / 2;
  const marble = ctx.createLinearGradient(slabX, slabY, slabX + slabW, slabY + slabH);
  marble.addColorStop(0, "#f7f5f1");
  marble.addColorStop(0.45, "#ebe6df");
  marble.addColorStop(1, "#d9d2c8");
  ctx.fillStyle = marble;
  ctx.fillRect(slabX, slabY, slabW, slabH);

  ctx.save();
  ctx.strokeStyle = "rgba(120,110,100,0.18)";
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(slabX + slabW * (0.1 + i * 0.1), slabY);
    ctx.bezierCurveTo(
      slabX + slabW * (0.2 + i * 0.08), slabY + slabH * 0.35,
      slabX + slabW * (0.05 + i * 0.09), slabY + slabH * 0.7,
      slabX + slabW * (0.15 + i * 0.08), slabY + slabH
    );
    ctx.stroke();
  }
  ctx.restore();

  // Floor band
  ctx.fillStyle = "rgba(160,165,170,0.55)";
  ctx.fillRect(0, height * 0.86, width, height * 0.14);

  // Soft ceiling spotlight cue
  const light = ctx.createRadialGradient(width / 2, height * 0.08, 10, width / 2, height * 0.08, width * 0.35);
  light.addColorStop(0, "rgba(255,250,235,0.35)");
  light.addColorStop(1, "rgba(255,250,235,0)");
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, width, height);
  void aspect;
}

function coverImage(ctx, image, x, y, w, h){
  const scale = Math.max(w / image.width, h / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(image, dx, dy, dw, dh);
}

function drawGallerySpotlights(ctx, width, height, light){
  const intensity = light.intensity / 100;
  if (intensity <= 0.01) return;

  const count = light.count;
  const baseX = (light.posX / 100) * width;
  const baseY = (light.posY / 100) * height;
  const distance = (light.distance / 100) * Math.min(width, height);
  const dirRad = (light.direction * Math.PI) / 180;
  const radius = distance * 0.85;

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < count; i++) {
    const spread = (i - (count - 1) / 2) * (width * 0.06);
    const cx = baseX + spread + Math.cos(dirRad) * distance * 0.15;
    const cy = baseY + Math.sin(dirRad) * distance * 0.15;
    // Pull glow toward artwork target slightly
    const tx = cx * 0.35 + light.targetX * 0.65;
    const ty = cy * 0.35 + light.targetY * 0.65;
    const gradient = ctx.createRadialGradient(tx, ty, radius * 0.05, tx, ty, radius);
    gradient.addColorStop(0, `rgba(255,244,220,${0.4 * intensity})`);
    gradient.addColorStop(0.4, `rgba(255,236,200,${0.16 * intensity})`);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.restore();
}
