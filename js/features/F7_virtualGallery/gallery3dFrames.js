// F7 3D 展館 - 套用 F5 經典畫框材質

import {
  getClassicTextureCatalog,
  loadFrameAssetCatalog,
  loadTextureForMaterial
} from "../F5_frame/frameAssets.js";
import { renderFramedPhoto, resolveFramedOutputSize } from "../../core/frameRenderer.js";

export const GALLERY_OUTER_FRAME_WIDTH_PX = 55;
export const GALLERY_INNER_FRAME_WIDTH_PX = 25;

export const GALLERY_DEFAULT_OUTER_FRAME_ID = "classic-1";
export const GALLERY_DEFAULT_INNER_FRAME_ID = "inner-1";

export async function ensureGalleryFrameCatalog(){
  await loadFrameAssetCatalog();
}

export function getGalleryOuterFrameCatalog(){
  return getClassicTextureCatalog().filter(item => item.role === "outer");
}

export function getGalleryInnerFrameCatalog(){
  return getClassicTextureCatalog().filter(item => item.role === "inner");
}

export function pickDefaultFrameId(catalog, preferredId, fallbackId){
  if (preferredId && catalog.some(item => item.id === preferredId)) return preferredId;
  if (fallbackId && catalog.some(item => item.id === fallbackId)) return fallbackId;
  return catalog[0]?.id || fallbackId;
}

function loadImageFromSource(source){
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("圖片載入失敗"));
    image.src = source;
  });
}

export async function bakeGalleryFramedTexture(photoSource, frameSettings = {}){
  const outerFrameTypeId = frameSettings.outerFrameTypeId || GALLERY_DEFAULT_OUTER_FRAME_ID;
  const innerFrameTypeId = frameSettings.innerFrameTypeId || null;
  const photoImage = typeof photoSource === "string"
    ? await loadImageFromSource(photoSource)
    : photoSource;

  const [outerTexture, innerTexture] = await Promise.all([
    loadTextureForMaterial(outerFrameTypeId),
    innerFrameTypeId ? loadTextureForMaterial(innerFrameTypeId) : Promise.resolve(null)
  ]);

  const layout = resolveFramedOutputSize(photoImage.width, photoImage.height, {
    outerFrameWidth: GALLERY_OUTER_FRAME_WIDTH_PX,
    innerFrameWidth: innerFrameTypeId ? GALLERY_INNER_FRAME_WIDTH_PX : 0,
    outerPadding: 0,
    shadow: 0,
    transparentBackground: true
  });

  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d");
  renderFramedPhoto(ctx, photoImage, {
    contentWidth: photoImage.width,
    contentHeight: photoImage.height,
    outerMaterialId: outerFrameTypeId,
    innerMaterialId: innerFrameTypeId,
    outerFrameWidth: GALLERY_OUTER_FRAME_WIDTH_PX,
    innerFrameWidth: innerFrameTypeId ? GALLERY_INNER_FRAME_WIDTH_PX : 0,
    outerTextureImage: outerTexture,
    innerTextureImage: innerTexture,
    outerPadding: 0,
    shadow: 0,
    transparentBackground: true
  });

  return canvas;
}

export async function buildGalleryFramedPreviewDataUrl(photoSource, frameSettings = {}){
  const canvas = await bakeGalleryFramedTexture(photoSource, frameSettings);
  return canvas.toDataURL("image/png");
}
