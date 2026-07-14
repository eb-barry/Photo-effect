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
 * Gallery presentation: wall + framed artwork + lighting + directional shadow.
 * Canvas should already match resolveGalleryOutputSize().
 */
export function renderGalleryPresentation(ctx, sourceImage, options = {}){
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const frameWidth = Math.max(2, Number(options.frameWidth) || 36);
  const cornerRadius = Math.max(0, Number(options.cornerRadius) || 4);
  const innerPadding = Math.max(0, Number(options.innerPadding) || 10);
  const opacity = Math.max(0.2, Math.min(1, Number(options.opacity) ?? 1));
  const wallColor = options.wallColor || "#f4f3ef";
  const wallImage = options.wallImage || null;
  const contentWidth = options.contentWidth || sourceImage.width;
  const contentHeight = options.contentHeight || sourceImage.height;

  const layout = resolveGalleryOutputSize(contentWidth, contentHeight, {
    frameWidth,
    innerPadding,
    wallMarginRatio: options.wallMarginRatio
  });

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);

  // Wall background
  if (wallImage) {
    coverImage(ctx, wallImage, 0, 0, width, height);
  } else {
    fillProceduralWall(ctx, width, height, wallColor);
  }

  const art = layout.artwork;
  const frameOuter = {
    x: art.x - innerPadding - frameWidth,
    y: art.y - innerPadding - frameWidth,
    w: art.width + (innerPadding + frameWidth) * 2,
    h: art.height + (innerPadding + frameWidth) * 2
  };

  // Artwork drop shadow (directional)
  drawGalleryShadow(ctx, frameOuter, {
    distance: Number(options.galleryShadowDistance) || 28,
    blur: Number(options.galleryShadowBlur) || 48,
    opacity: Number(options.galleryShadowOpacity) || 46,
    direction: Number(options.galleryShadowDirection) || 220
  });

  // Frame body (procedural gallery black/graphite)
  ctx.save();
  ctx.globalAlpha = opacity;
  const frameGrad = ctx.createLinearGradient(frameOuter.x, frameOuter.y, frameOuter.x + frameOuter.w, frameOuter.y + frameOuter.h);
  frameGrad.addColorStop(0, "#3a3a3e");
  frameGrad.addColorStop(0.5, "#1f1f23");
  frameGrad.addColorStop(1, "#2c2c30");
  ctx.fillStyle = frameGrad;
  roundRect(ctx, frameOuter.x, frameOuter.y, frameOuter.w, frameOuter.h, cornerRadius + 2);
  ctx.fill();
  ctx.restore();

  // Mat
  ctx.fillStyle = "#f7f4ec";
  roundRect(
    ctx,
    frameOuter.x + frameWidth,
    frameOuter.y + frameWidth,
    frameOuter.w - frameWidth * 2,
    frameOuter.h - frameWidth * 2,
    Math.max(0, cornerRadius)
  );
  ctx.fill();

  // Photo
  ctx.save();
  roundRect(ctx, art.x, art.y, art.width, art.height, Math.max(0, cornerRadius * 0.4));
  ctx.clip();
  ctx.drawImage(sourceImage, art.x, art.y, art.width, art.height);
  ctx.restore();

  // Frame bevel
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, frameOuter.x + 1, frameOuter.y + 1, frameOuter.w - 2, frameOuter.h - 2, cornerRadius + 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  roundRect(
    ctx,
    frameOuter.x + frameWidth,
    frameOuter.y + frameWidth,
    frameOuter.w - frameWidth * 2,
    frameOuter.h - frameWidth * 2,
    Math.max(0, cornerRadius)
  );
  ctx.stroke();
  ctx.restore();

  // Lighting overlay
  drawGalleryLighting(ctx, width, height, frameOuter, {
    mode: options.galleryLightMode || "museum",
    intensity: Number(options.galleryLightIntensity) || 62,
    radius: Number(options.galleryLightRadius) || 58,
    warmth: Number(options.galleryLightWarmth) || 58,
    angle: Number(options.galleryLightAngle) || 210,
    shadowStrength: Number(options.galleryLightShadow) || 42
  });

  // Optional default caption (typography ready; handwriting fonts prepared in CSS)
  if (options.showCaption && (options.galleryTitle || options.galleryAuthor)) {
    drawGalleryCaption(ctx, frameOuter, options);
  }
}

export function resolveGalleryOutputSize(imageWidth, imageHeight, params = {}){
  const frameWidthPx = Math.max(2, Math.round(Number(params.frameWidth) || 36));
  const innerPadding = Math.max(0, Math.round(Number(params.innerPadding) || 10));
  const wallMarginRatio = Math.max(0.12, Math.min(0.4, Number(params.wallMarginRatio) || 0.22));
  const minSide = Math.min(imageWidth, imageHeight);
  const wallPad = Math.round(minSide * wallMarginRatio);

  const artworkW = imageWidth;
  const artworkH = imageHeight;
  const width = artworkW + (frameWidthPx + innerPadding) * 2 + wallPad * 2;
  const height = artworkH + (frameWidthPx + innerPadding) * 2 + wallPad * 2;

  return {
    width,
    height,
    wallPad,
    frameWidthPx,
    innerPadding,
    artwork: {
      x: wallPad + frameWidthPx + innerPadding,
      y: wallPad + frameWidthPx + innerPadding,
      width: artworkW,
      height: artworkH
    }
  };
}

function fillProceduralWall(ctx, width, height, color){
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  const image = ctx.getImageData(0, 0, Math.min(width, 512), Math.min(height, 512));
  // Lightweight noise on a sample region then leave solid fill — keep simple for perf.
  ctx.save();
  ctx.globalAlpha = 0.04;
  for (let i = 0; i < 1200; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    ctx.fillStyle = Math.random() > 0.5 ? "#000" : "#fff";
    ctx.fillRect(x, y, 1.2, 1.2);
  }
  ctx.restore();
  // Soft vignette
  const vignette = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.2, width / 2, height / 2, Math.max(width, height) * 0.72);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.16)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
  void image;
}

function coverImage(ctx, image, x, y, w, h){
  const scale = Math.max(w / image.width, h / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(image, dx, dy, dw, dh);
}

function drawGalleryShadow(ctx, rect, shadow){
  const distance = shadow.distance;
  const blur = 6 + shadow.blur * 0.7;
  const alpha = Math.max(0, Math.min(1, shadow.opacity / 100)) * 0.7;
  const rad = (shadow.direction * Math.PI) / 180;
  const ox = Math.cos(rad) * distance;
  const oy = Math.sin(rad) * distance;

  ctx.save();
  ctx.shadowColor = `rgba(0,0,0,${alpha})`;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = ox;
  ctx.shadowOffsetY = oy;
  ctx.fillStyle = "#000";
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 4);
  ctx.fill();
  ctx.restore();
}

function drawGalleryLighting(ctx, width, height, frameOuter, light){
  const intensity = light.intensity / 100;
  if (intensity <= 0.01) return;

  const warmth = light.warmth / 100;
  const cool = 1 - warmth;
  const r = Math.round(255 * warmth + 210 * cool);
  const g = Math.round(236 * warmth + 230 * cool);
  const b = Math.round(196 * warmth + 255 * cool);
  const radius = (Math.min(width, height) * (0.25 + light.radius / 200));

  let cx = width / 2;
  let cy = height * 0.18;
  if (light.mode === "left") {
    cx = width * 0.18;
    cy = height * 0.35;
  } else if (light.mode === "right") {
    cx = width * 0.82;
    cy = height * 0.35;
  } else if (light.mode === "soft") {
    cx = width / 2;
    cy = height / 2;
  } else if (light.mode === "museum") {
    cx = frameOuter.x + frameOuter.w / 2;
    cy = Math.max(0, frameOuter.y - height * 0.08);
  }

  // Angle nudges spotlight center slightly
  const rad = (light.angle * Math.PI) / 180;
  cx += Math.cos(rad) * width * 0.04;
  cy += Math.sin(rad) * height * 0.03;

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const gradient = ctx.createRadialGradient(cx, cy, radius * 0.05, cx, cy, radius);
  gradient.addColorStop(0, `rgba(${r},${g},${b},${0.42 * intensity})`);
  gradient.addColorStop(0.45, `rgba(${r},${g},${b},${0.16 * intensity})`);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  // Ambient occlusion around artwork
  const ao = light.shadowStrength / 100;
  if (ao > 0.02) {
    ctx.save();
    const edge = ctx.createRadialGradient(
      frameOuter.x + frameOuter.w / 2,
      frameOuter.y + frameOuter.h / 2,
      Math.min(frameOuter.w, frameOuter.h) * 0.35,
      frameOuter.x + frameOuter.w / 2,
      frameOuter.y + frameOuter.h / 2,
      Math.max(frameOuter.w, frameOuter.h) * 0.95
    );
    edge.addColorStop(0, "rgba(0,0,0,0)");
    edge.addColorStop(1, `rgba(0,0,0,${0.22 * ao})`);
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}

function drawGalleryCaption(ctx, frameOuter, options){
  const title = options.galleryTitle || "";
  const author = options.galleryAuthor || "";
  const y = frameOuter.y + frameOuter.h + 28;
  ctx.save();
  ctx.fillStyle = "rgba(30,30,30,0.82)";
  ctx.textAlign = "center";
  ctx.font = "600 18px \"Segoe UI\", \"Noto Sans TC\", sans-serif";
  if (title) ctx.fillText(title, frameOuter.x + frameOuter.w / 2, y);
  ctx.font = "400 14px \"Segoe UI\", \"Noto Sans TC\", sans-serif";
  if (author) ctx.fillText(author, frameOuter.x + frameOuter.w / 2, y + 22);
  ctx.restore();
}
