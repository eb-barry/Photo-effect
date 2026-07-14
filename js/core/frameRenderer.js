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
