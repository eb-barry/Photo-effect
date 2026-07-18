// F5 畫框 - 素材清單載入 v0.1.4
// Driven by per-category manifest.json (auto-synced from all *.webp in the folder).
// Artistic overlays: assets/features/F5_frame/textures/artistic/art-{3x4|4x3}-*.webp

import { setFrameTypesFromCatalog } from "./frameState.js";

const TEXTURE_ROOT = "./assets/features/F5_frame/textures/";

export const FRAME_TEXTURE_CATEGORIES = [
  "classic",
  "professional",
  "artistic",
  "dimensional",
  "smart",
  "light"
];

const textureCache = new Map();
const catalogs = Object.fromEntries(FRAME_TEXTURE_CATEGORIES.map(id => [id, []]));
let catalogPromise = null;

export function getClassicTextureCatalog(){
  return catalogs.classic;
}

export function getArtisticTextureCatalog(){
  return catalogs.artistic;
}

export function getTextureCatalog(categoryId){
  return catalogs[categoryId] || [];
}

export function getAllTextureCatalogs(){
  return { ...catalogs };
}

export function loadFrameAssetCatalog(){
  if (!catalogPromise) {
    catalogPromise = Promise.all(
      FRAME_TEXTURE_CATEGORIES.map(async categoryId => {
        const items = categoryId === "professional" ? [] : await loadCategoryManifest(categoryId);
        catalogs[categoryId] = items;
        setFrameTypesFromCatalog(categoryId, items);
        return { categoryId, items };
      })
    ).then(results => {
      // Ensure professional templates are registered even if loop order changes.
      setFrameTypesFromCatalog("professional", []);
      const byCategory = Object.fromEntries(results.map(item => [item.categoryId, item.items]));
      return byCategory;
    });
  }
  return catalogPromise;
}

export async function loadTextureForMaterial(materialId){
  if (!materialId) return null;
  if (textureCache.has(materialId)) return textureCache.get(materialId);

  await loadFrameAssetCatalog();

  const entry = findCatalogEntry(materialId);
  const candidates = [];
  if (entry?.asset) candidates.push(entry.asset);
  for (const categoryId of FRAME_TEXTURE_CATEGORIES) {
    candidates.push(`${TEXTURE_ROOT}${categoryId}/${encodeURIComponent(`${materialId}.webp`)}`);
  }

  for (const url of [...new Set(candidates)]) {
    try {
      const image = await loadImage(url);
      textureCache.set(materialId, image);
      return image;
    } catch {
      // try next
    }
  }

  console.warn(`[F5 畫框] 找不到材質圖，改用程序化：${materialId}`);
  textureCache.set(materialId, null);
  return null;
}

function findCatalogEntry(materialId){
  for (const categoryId of FRAME_TEXTURE_CATEGORIES) {
    const hit = catalogs[categoryId].find(item => item.id === materialId || item.materialId === materialId);
    if (hit) return hit;
  }
  return null;
}

async function loadCategoryManifest(categoryId){
  const basePath = `${TEXTURE_ROOT}${categoryId}/`;
  const url = `${basePath}manifest.json`;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return [];
    const data = await response.json();
    const items = Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.files)
        ? data.files.map(file => (typeof file === "string" ? { file } : file))
        : Array.isArray(data)
          ? data
          : null;
    if (!items?.length) return [];
    return items
      .map((item, index) => normalizeManifestItem(item, basePath, categoryId, index))
      .filter(Boolean);
  } catch (error) {
    console.warn(`[F5 畫框] 無法載入素材清單：${url}`, error);
    return [];
  }
}

function normalizeManifestItem(item, basePath, categoryId, index){
  if (typeof item === "string") {
    item = { file: item };
  }
  if (!item || typeof item !== "object") return null;

  const file = typeof item.file === "string" && item.file
    ? item.file
    : typeof item.asset === "string"
      ? item.asset.split("/").pop()
      : null;
  if (!file || !/\.webp$/i.test(file)) return null;

  const baseName = file.replace(/\.webp$/i, "");
  const id = typeof item.id === "string" && item.id
    ? item.id
    : slugify(baseName) || `${categoryId}-${index + 1}`;
  const label = typeof item.label === "string" && item.label
    ? item.label
    : titleLabel(baseName);
  const encodedFile = file.split("/").map(encodeURIComponent).join("/");
  const asset = typeof item.asset === "string" && item.asset
    ? item.asset
    : `${basePath}${encodedFile}`;

  return {
    id,
    label,
    file,
    asset,
    materialId: id,
    thumb: asset,
    categoryId,
    aspect: item.aspect || inferAspectFromName(baseName),
    kind: item.kind
      || (categoryId === "artistic" ? "overlay" : null)
      || (categoryId === "classic" ? "strip" : "texture"),
    role: item.role || inferClassicRole(baseName, categoryId)
  };
}

function inferClassicRole(name, categoryId){
  if (categoryId !== "classic") return null;
  const text = String(name).toLowerCase();
  if (/(^|[-_])inner([-_]|$)/.test(text)) return "inner";
  return "outer";
}

function inferAspectFromName(name){
  const text = String(name).toLowerCase();
  if (/art[-_]?3x4/.test(text) || /(?:^|[^0-9])3x4(?:[^0-9]|$)/.test(text)) return "3x4";
  if (/art[-_]?4x3/.test(text) || /(?:^|[^0-9])4x3(?:[^0-9]|$)/.test(text)) return "4x3";
  return null;
}

function slugify(name){
  return String(name)
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fff-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function titleLabel(name){
  return String(name)
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b([a-z])/g, (_, ch) => ch.toUpperCase());
}

function loadImage(url){
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Image load failed: ${url}`));
    image.src = url;
  });
}
