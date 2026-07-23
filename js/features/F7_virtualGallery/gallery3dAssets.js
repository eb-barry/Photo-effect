// F7 3D 展館 - 重用 F5 畫框展場材質

import { loadGalleryWallCatalog, resolveGallerySceneImage } from "../F5_frame/galleryAssets.js";
import {
  DEFAULT_MOUNT_RECT,
  getGallerySceneById,
  getGallerySceneCatalog
} from "../F5_frame/frameState.js";

const FLOOR_BAND_RATIO = 0.14;
const textureCache = new Map();

export async function loadGallery3dSceneCatalog(){
  await loadGalleryWallCatalog();
  return getGallerySceneCatalog();
}

export function getGallery3dSceneById(sceneId){
  return getGallerySceneById(sceneId);
}

export function pickDefaultGallery3dSceneId(preferredId = null){
  const scenes = getGallerySceneCatalog();
  if (preferredId && scenes.some(scene => scene.id === preferredId)) return preferredId;
  return scenes[0]?.id || "wall-3x4-1";
}

export async function resolveGallery3dRoomTextures(sceneId){
  if (!sceneId) return null;
  if (textureCache.has(sceneId)) return textureCache.get(sceneId);

  const scene = getGallerySceneById(sceneId);
  const image = await resolveGallerySceneImage(sceneId);
  if (!image) return null;

  const textures = buildRoomTexturesFromSceneImage(image, scene?.mount || DEFAULT_MOUNT_RECT);
  const payload = { sceneId, scene, ...textures };
  textureCache.set(sceneId, payload);
  return payload;
}

function buildRoomTexturesFromSceneImage(image, mount){
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const wallHeight = Math.max(1, Math.round(height * (1 - FLOOR_BAND_RATIO)));
  const floorHeight = Math.max(1, height - wallHeight);

  const floorCanvas = document.createElement("canvas");
  floorCanvas.width = width;
  floorCanvas.height = floorHeight;
  floorCanvas.getContext("2d").drawImage(
    image,
    0, wallHeight, width, floorHeight,
    0, 0, width, floorHeight
  );

  const wallCanvas = document.createElement("canvas");
  wallCanvas.width = width;
  wallCanvas.height = wallHeight;
  const wallCtx = wallCanvas.getContext("2d");
  wallCtx.drawImage(image, 0, 0, width, wallHeight, 0, 0, width, wallHeight);

  const mountLeft = Math.round(mount.x * width);
  const mountTop = Math.round(mount.y * height);
  const mountWidth = Math.round(mount.w * width);
  const mountHeight = Math.round(mount.h * height);
  const mountRight = Math.min(width, mountLeft + mountWidth);
  const mountBottom = Math.min(wallHeight, mountTop + mountHeight);

  if (mountRight > mountLeft + 8 && mountBottom > mountTop + 8 && mountLeft > 4) {
    const stripWidth = Math.max(8, mountLeft);
    const stripHeight = mountBottom - mountTop;
    const stripCanvas = document.createElement("canvas");
    stripCanvas.width = stripWidth;
    stripCanvas.height = stripHeight;
    stripCanvas.getContext("2d").drawImage(
      wallCanvas,
      0, mountTop, stripWidth, stripHeight,
      0, 0, stripWidth, stripHeight
    );

    for (let x = mountLeft; x < mountRight; x += stripWidth) {
      const drawWidth = Math.min(stripWidth, mountRight - x);
      wallCtx.drawImage(
        stripCanvas,
        0, 0, drawWidth, stripHeight,
        x, mountTop, drawWidth, stripHeight
      );
    }
  }

  return {
    wallCanvas,
    floorCanvas,
    wallAspect: width / wallHeight,
    floorAspect: width / floorHeight
  };
}

export function invalidateGallery3dRoomTextureCache(sceneId = null){
  if (!sceneId) {
    textureCache.clear();
    return;
  }
  textureCache.delete(sceneId);
}
