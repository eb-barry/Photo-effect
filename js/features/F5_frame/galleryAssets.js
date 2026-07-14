// F5 Gallery wall textures - assets/features/F5_frame/gallery/walls/

import {
  DEFAULT_GALLERY_WALLS,
  getGalleryWallById,
  setGalleryWallCatalog
} from "./frameState.js";

const WALL_BASE = "./assets/features/F5_frame/gallery/walls/";
const WALL_MANIFEST_URL = `${WALL_BASE}manifest.json`;

const wallImageCache = new Map();
let wallCatalogPromise = null;

export function loadGalleryWallCatalog(){
  if (!wallCatalogPromise) {
    wallCatalogPromise = loadWallManifest().then(items => {
      setGalleryWallCatalog(items);
      return items;
    });
  }
  return wallCatalogPromise;
}

export async function resolveGalleryWallImage(wallId){
  if (!wallId) return null;
  if (wallImageCache.has(wallId)) return wallImageCache.get(wallId);

  await loadGalleryWallCatalog();
  const entry = getGalleryWallById(wallId);
  if (!entry?.asset) {
    wallImageCache.set(wallId, null);
    return null;
  }

  try {
    const image = await loadImage(entry.asset);
    wallImageCache.set(wallId, image);
    return image;
  } catch {
    wallImageCache.set(wallId, null);
    return null;
  }
}

async function loadWallManifest(){
  const fallback = DEFAULT_GALLERY_WALLS.map(normalizeWall);
  try {
    const response = await fetch(WALL_MANIFEST_URL, { cache: "no-store" });
    if (!response.ok) return fallback;
    const data = await response.json();
    const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : null;
    if (!items?.length) return fallback;

    const byId = new Map(fallback.map(item => [item.id, item]));
    for (const raw of items) {
      const normalized = normalizeWall(raw);
      if (normalized) byId.set(normalized.id, normalized);
    }
    return [...byId.values()];
  } catch (error) {
    console.warn("[F5 Gallery] 牆面清單載入失敗，使用程序化牆面：", error);
    return fallback;
  }
}

function normalizeWall(item){
  if (!item) return null;
  if (typeof item === "string") item = { file: item };
  const file = item.file || `${item.id || "wall"}.webp`;
  const baseName = String(file).replace(/\.webp$/i, "");
  const id = item.id || slugify(baseName);
  const known = DEFAULT_GALLERY_WALLS.find(wall => wall.id === id);
  const label = item.label || known?.label || titleLabel(baseName);
  const color = item.color || known?.color || "#e8e6e1";
  const encoded = String(file).split("/").map(encodeURIComponent).join("/");
  const asset = `${WALL_BASE}${encoded}`;
  return { id, label, file, color, asset, thumb: asset };
}

function slugify(name){
  return String(name).trim().toLowerCase().replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]+/g, "");
}

function titleLabel(name){
  return String(name).replace(/[-_]+/g, " ").replace(/\b([a-z])/g, (_, c) => c.toUpperCase());
}

function loadImage(url){
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Wall image load failed: ${url}`));
    image.src = url;
  });
}
