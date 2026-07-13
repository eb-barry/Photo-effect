// F5 框住美好 - 素材清單載入（manifest.json，可擴充；缺檔時程序化 fallback）

const CLASSIC_MANIFEST_URL = "./assets/features/F5_frame/textures/classic/manifest.json";
const PROFESSIONAL_MANIFEST_URL = "./assets/features/F5_frame/textures/professional/manifest.json";
const CLASSIC_BASE = "./assets/features/F5_frame/textures/classic/";
const PROFESSIONAL_BASE = "./assets/features/F5_frame/textures/professional/";

const textureCache = new Map();

let classicCatalog = [];
let professionalCatalog = [];
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
      loadManifest(CLASSIC_MANIFEST_URL, CLASSIC_BASE),
      loadManifest(PROFESSIONAL_MANIFEST_URL, PROFESSIONAL_BASE)
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
  const entry = [...classicCatalog, ...professionalCatalog].find(item => item.id === materialId);
  if (!entry?.asset) {
    textureCache.set(materialId, null);
    return null;
  }

  try {
    const image = await loadImage(entry.asset);
    textureCache.set(materialId, image);
    return image;
  } catch (error) {
    console.warn(`[F5 框住美好] 材質載入失敗，改用程序化：${entry.asset}`, error);
    textureCache.set(materialId, null);
    return null;
  }
}

async function loadManifest(url, basePath){
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return [];
    const data = await response.json();
    const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : null;
    if (!items?.length) return [];
    return items.map((item, index) => normalizeManifestItem(item, basePath, index));
  } catch (error) {
    console.warn(`[F5 框住美好] 無法載入素材清單：${url}`, error);
    return [];
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

function loadImage(url){
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Image load failed: ${url}`));
    image.src = url;
  });
}
