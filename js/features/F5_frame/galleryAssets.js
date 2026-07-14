// F5 Gallery scene walls - wall-3x4-*.webp / wall-4x3-*.webp

import {
  DEFAULT_GALLERY_SCENES,
  DEFAULT_MOUNT_RECT,
  getGallerySceneById,
  setGallerySceneCatalog
} from "./frameState.js";

const WALL_BASE = "./assets/features/F5_frame/gallery/walls/";
const WALL_MANIFEST_URL = `${WALL_BASE}manifest.json`;

const sceneImageCache = new Map();
let catalogPromise = null;

export function loadGalleryWallCatalog(){
  if (!catalogPromise) {
    catalogPromise = loadSceneManifest().then(items => {
      setGallerySceneCatalog(items);
      return items;
    });
  }
  return catalogPromise;
}

export async function resolveGallerySceneImage(sceneId){
  if (!sceneId) return null;
  if (sceneImageCache.has(sceneId)) return sceneImageCache.get(sceneId);

  await loadGalleryWallCatalog();
  const entry = getGallerySceneById(sceneId);
  if (!entry?.asset) {
    sceneImageCache.set(sceneId, null);
    return null;
  }

  try {
    const image = await loadImage(entry.asset);
    sceneImageCache.set(sceneId, image);
    return image;
  } catch {
    sceneImageCache.set(sceneId, null);
    return null;
  }
}

async function loadSceneManifest(){
  const fallback = DEFAULT_GALLERY_SCENES.map(normalizeScene);
  try {
    const response = await fetch(WALL_MANIFEST_URL, { cache: "no-store" });
    if (!response.ok) return fallback;
    const data = await response.json();
    const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : null;
    if (!items?.length) return fallback;

    const normalized = items.map(normalizeScene).filter(Boolean);
    return normalized.length ? normalized : fallback;
  } catch (error) {
    console.warn("[F5 Gallery] 展場清單載入失敗：", error);
    return fallback;
  }
}

function normalizeScene(item){
  if (!item) return null;
  if (typeof item === "string") item = { file: item };
  const file = item.file || `${item.id || "wall-3x4-01"}.webp`;
  if (!/\.webp$/i.test(file)) return null;
  if (!/wall[-_]?(3x4|4x3)[-_]?\d+/i.test(file) && !item.aspect) {
    // Still accept explicit aspect from manifest
  }
  const id = item.id || file.replace(/\.webp$/i, "");
  const aspect = item.aspect || inferAspectFromFile(file);
  const encoded = String(file).split("/").map(encodeURIComponent).join("/");
  const asset = `${WALL_BASE}${encoded}`;
  return {
    id,
    label: item.label || prettify(id),
    file,
    aspect,
    mount: { ...DEFAULT_MOUNT_RECT, ...(item.mount || {}) },
    asset,
    thumb: asset
  };
}

function inferAspectFromFile(file){
  const name = String(file).toLowerCase();
  if (name.includes("4x3") || name.includes("4-3")) return "4x3";
  return "3x4";
}

function prettify(id){
  const match = String(id).match(/(\d+)\s*$/);
  const num = match ? match[1] : "";
  if (/3x4/i.test(id)) return `直式展場 ${num}`.trim();
  if (/4x3/i.test(id)) return `橫式展場 ${num}`.trim();
  return String(id).replace(/[-_]+/g, " ");
}

function loadImage(url){
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Scene image load failed: ${url}`));
    image.src = url;
  });
}
