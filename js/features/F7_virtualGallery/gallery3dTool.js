// F7 3D 展館 - 圖片驗證與貼圖準備

import { createScaledDataUrl } from "../F6_photoWall/photoWallTool.js";

export const GALLERY_TEXTURE_MAX_EDGE = 1024;
export const GALLERY_THUMB_MAX_EDGE = 192;
export const ASPECT_TOLERANCE = 0.06;

export function fileToDataUrl(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("讀取檔案失敗"));
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataUrl(dataUrl){
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("圖片載入失敗"));
    image.src = dataUrl;
  });
}

export function detectGalleryAspect(width, height){
  if (!width || !height) return null;
  const ratio = width / height;
  const landscape = 4 / 3;
  const portrait = 3 / 4;

  if (Math.abs(ratio - landscape) <= ASPECT_TOLERANCE) return "4x3";
  if (Math.abs(ratio - portrait) <= ASPECT_TOLERANCE) return "3x4";
  return null;
}

export async function prepareGalleryPhoto(file){
  const dataUrl = await fileToDataUrl(file);
  const image = await loadImageFromDataUrl(dataUrl);
  const aspect = detectGalleryAspect(image.width, image.height);
  if (!aspect) {
    throw new Error("僅支援 4:3 橫向或 3:4 直向照片。");
  }

  const [textureDataUrl, thumbDataUrl] = await Promise.all([
    createScaledDataUrl(dataUrl, GALLERY_TEXTURE_MAX_EDGE),
    createScaledDataUrl(dataUrl, GALLERY_THUMB_MAX_EDGE, "image/jpeg", 0.82)
  ]);

  return {
    dataUrl,
    textureDataUrl,
    thumbDataUrl,
    aspect,
    width: image.width,
    height: image.height
  };
}

export function canUseDeviceOrientation(){
  return typeof window !== "undefined" && "DeviceOrientationEvent" in window;
}

export function isLikelyMobileDevice(){
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}
