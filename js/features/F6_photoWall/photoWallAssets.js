// F6 照片牆 - 場景素材清單

const SCENE_BASE = "./assets/features/F6_photoWall/scenes/";
const SCENE_MANIFEST_URL = `${SCENE_BASE}manifest.json`;

export const DEFAULT_PHOTO_WALL_SCENES = [
  { id: "scene-3x4-1", label: "直式展場 1", file: "scene-3x4-1.webp", aspect: "3x4" },
  { id: "scene-3x4-2", label: "直式展場 2", file: "scene-3x4-2.webp", aspect: "3x4" },
  { id: "scene-4x3-1", label: "橫式展場 1", file: "scene-4x3-1.webp", aspect: "4x3" },
  { id: "scene-4x3-2", label: "橫式展場 2", file: "scene-4x3-2.webp", aspect: "4x3" }
];

let sceneCatalog = DEFAULT_PHOTO_WALL_SCENES.map(normalizeScene);
let catalogPromise = null;

export function getPhotoWallScenes(){
  return sceneCatalog;
}

export function loadPhotoWallSceneCatalog(){
  if (!catalogPromise) {
    catalogPromise = loadManifest().then(items => {
      sceneCatalog = items;
      return items;
    });
  }
  return catalogPromise;
}

export async function resolveSceneImage(sceneId){
  await loadPhotoWallSceneCatalog();
  const entry = sceneCatalog.find(item => item.id === sceneId);
  if (!entry?.asset) return null;
  try {
    return await loadImage(entry.asset);
  } catch {
    return null;
  }
}

async function loadManifest(){
  const fallback = DEFAULT_PHOTO_WALL_SCENES.map(normalizeScene);
  try {
    const response = await fetch(SCENE_MANIFEST_URL, { cache: "no-store" });
    if (!response.ok) return fallback;
    const data = await response.json();
    const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : null;
    if (!items?.length) return fallback;
    const normalized = items.map(normalizeScene).filter(Boolean);
    return normalized.length ? normalized : fallback;
  } catch (error) {
    console.warn("[F6 照片牆] 場景清單載入失敗：", error);
    return fallback;
  }
}

function normalizeScene(item){
  if (!item) return null;
  const file = item.file || `${item.id || "scene-3x4-1"}.webp`;
  const id = item.id || file.replace(/\.webp$/i, "");
  const aspect = item.aspect || inferAspect(file, id);
  const encodedFile = String(file).split("/").map(encodeURIComponent).join("/");
  const asset = `${SCENE_BASE}${encodedFile}`;
  const thumbFile = item.thumb || file;
  const encodedThumb = String(thumbFile).split("/").map(encodeURIComponent).join("/");
  const thumb = thumbFile === file ? asset : `${SCENE_BASE}${encodedThumb}`;
  return {
    id,
    label: item.label || prettifyLabel(id),
    file,
    aspect,
    asset,
    thumb
  };
}

function inferAspect(file, id){
  const text = `${file} ${id}`.toLowerCase();
  if (text.includes("4x3")) return "4x3";
  return "3x4";
}

function prettifyLabel(id){
  const match = String(id).match(/(\d+)\s*$/);
  const num = match ? match[1] : "";
  if (/4x3/i.test(id)) return `橫式展場 ${num}`.trim();
  if (/3x4/i.test(id)) return `直式展場 ${num}`.trim();
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
