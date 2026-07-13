// F5 框住美好 - 素材清單載入（manifest.json，可擴充；缺檔時程序化 fallback）

const CLASSIC_MANIFEST_URL = "./assets/features/F5_frame/textures/classic/manifest.json";
const PROFESSIONAL_MANIFEST_URL = "./assets/features/F5_frame/textures/professional/manifest.json";
const CLASSIC_BASE = "./assets/features/F5_frame/textures/classic/";
const PROFESSIONAL_BASE = "./assets/features/F5_frame/textures/professional/";

/** Built-in classic texture map so empty/outdated manifests still resolve files. */
export const DEFAULT_CLASSIC_TEXTURES = [
  { id: "wood", label: "木紋", file: "wood.webp" },
  { id: "walnut", label: "胡桃木", file: "walnut.webp" },
  { id: "oak", label: "橡木", file: "oak.webp" },
  { id: "pine", label: "松木", file: "pine.webp" },
  { id: "gold", label: "金", file: "gold.webp" },
  { id: "silver", label: "銀", file: "silver.webp" },
  { id: "bronze", label: "銅", file: "bronze.webp" },
  { id: "aluminum", label: "鋁", file: "aluminum.webp" },
  { id: "acrylic", label: "壓克力", file: "acrylic.webp" }
];

export const DEFAULT_PROFESSIONAL_TEXTURES = [
  { id: "gallery", label: "畫廊框", file: "gallery.webp" },
  { id: "polaroid", label: "拍立得", file: "polaroid.webp" },
  { id: "film", label: "底片邊框", file: "film-border.webp" }
];

const textureCache = new Map();

let classicCatalog = DEFAULT_CLASSIC_TEXTURES.map(item => withAsset(item, CLASSIC_BASE));
let professionalCatalog = DEFAULT_PROFESSIONAL_TEXTURES.map(item => withAsset(item, PROFESSIONAL_BASE));
let catalogPromise = null;

export function getClassicTextureCatalog(){
  return classicCatalog;
}

export function getProfessionalTextureCatalog(){
  return professionalCatalog;
}

export function loadFrameAssetCatalog(){
  if (!catalogPromise) {
    catalogPromise = Promise.all([
      loadManifest(CLASSIC_MANIFEST_URL, CLASSIC_BASE, DEFAULT_CLASSIC_TEXTURES),
      loadManifest(PROFESSIONAL_MANIFEST_URL, PROFESSIONAL_BASE, DEFAULT_PROFESSIONAL_TEXTURES)
    ]).then(([classic, professional]) => {
      classicCatalog = classic;
      professionalCatalog = professional;
      return { classic, professional };
    });
  }
  return catalogPromise;
}

export async function loadTextureForMaterial(materialId){
  if (!materialId) return null;
  if (textureCache.has(materialId)) return textureCache.get(materialId);

  await loadFrameAssetCatalog();

  const candidates = collectTextureCandidates(materialId);
  for (const url of candidates) {
    try {
      const image = await loadImage(url);
      textureCache.set(materialId, image);
      return image;
    } catch {
      // try next candidate
    }
  }

  console.warn(`[F5 框住美好] 找不到材質圖，改用程序化：${materialId}`);
  textureCache.set(materialId, null);
  return null;
}

function collectTextureCandidates(materialId){
  const urls = [];
  const entry = [...classicCatalog, ...professionalCatalog].find(item => item.id === materialId);
  if (entry?.asset) urls.push(entry.asset);

  // Direct path fallbacks (works even if manifest items were empty).
  urls.push(`${CLASSIC_BASE}${materialId}.webp`);
  urls.push(`${PROFESSIONAL_BASE}${materialId}.webp`);
  if (materialId === "film") {
    urls.push(`${PROFESSIONAL_BASE}film-border.webp`);
  }

  return [...new Set(urls)];
}

async function loadManifest(url, basePath, defaults){
  const fallback = defaults.map(item => withAsset(item, basePath));
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return fallback;
    const data = await response.json();
    const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : null;
    if (!items?.length) return fallback;

    const fromManifest = items.map((item, index) => normalizeManifestItem(item, basePath, index));
    // Merge defaults so known ids are never dropped if manifest is partial.
    const byId = new Map(fallback.map(item => [item.id, item]));
    for (const item of fromManifest) byId.set(item.id, item);
    return [...byId.values()];
  } catch (error) {
    console.warn(`[F5 框住美好] 無法載入素材清單：${url}`, error);
    return fallback;
  }
}

function normalizeManifestItem(item, basePath, index){
  const fallbackId = `texture${index + 1}`;
  const id = typeof item?.id === "string" && item.id ? item.id : fallbackId;
  const file = typeof item?.file === "string" && item.file ? item.file : `${id}.webp`;
  const asset = typeof item?.asset === "string" && item.asset ? item.asset : `${basePath}${file}`;
  const label = typeof item?.label === "string" && item.label ? item.label : id;
  return { id, label, asset, file };
}

function withAsset(item, basePath){
  return {
    ...item,
    asset: `${basePath}${item.file}`
  };
}

function loadImage(url){
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Image load failed: ${url}`));
    image.src = url;
  });
}
