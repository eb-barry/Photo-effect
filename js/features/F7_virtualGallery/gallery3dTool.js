// F7 3D 展館 - 圖片驗證與貼圖準備

import { createScaledDataUrl } from "../F6_photoWall/photoWallTool.js";

export const GALLERY_TEXTURE_MAX_EDGE = 2048;
export const GALLERY_THUMB_MAX_EDGE = 192;

export function readFileAsText(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("讀取檔案失敗"));
    reader.readAsText(file);
  });
}

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

export function resolveGalleryAspect(width, height){
  if (!width || !height) return "3x4";
  return width >= height ? "4x3" : "3x4";
}

export async function prepareGalleryPhoto(file){
  const dataUrl = await fileToDataUrl(file);
  const image = await loadImageFromDataUrl(dataUrl);
  const width = image.width;
  const height = image.height;
  if (!width || !height) {
    throw new Error("無法讀取照片尺寸。");
  }

  const [textureDataUrl, thumbDataUrl] = await Promise.all([
    createScaledDataUrl(dataUrl, GALLERY_TEXTURE_MAX_EDGE),
    createScaledDataUrl(dataUrl, GALLERY_THUMB_MAX_EDGE, "image/jpeg", 0.82)
  ]);

  return {
    dataUrl,
    textureDataUrl,
    thumbDataUrl,
    aspect: resolveGalleryAspect(width, height),
    width,
    height
  };
}

export function canUseDeviceOrientation(){
  return typeof window !== "undefined" && "DeviceOrientationEvent" in window;
}

export function needsGyroPermissionPrompt(){
  return typeof DeviceOrientationEvent !== "undefined"
    && typeof DeviceOrientationEvent.requestPermission === "function";
}

export function shouldOfferGyro(){
  return isLikelyMobileDevice() && canUseDeviceOrientation();
}

export function isLikelyMobileDevice(){
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}
