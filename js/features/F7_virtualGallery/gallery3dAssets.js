// F7 3D 展館 - F7 專用牆面／地板材質載入

const WALL_ROOT = "./assets/features/F7_virtualGallery/textures/walls/";
const FLOOR_ROOT = "./assets/features/F7_virtualGallery/textures/floors/";

const imageCache = new Map();
const catalogs = { walls: [], floors: [] };
let catalogPromise = null;

export async function loadGallery3dTextureCatalogs(){
  if (!catalogPromise) {
    catalogPromise = Promise.all([
      loadManifest(`${WALL_ROOT}manifest.json`, WALL_ROOT, "walls"),
      loadManifest(`${FLOOR_ROOT}manifest.json`, FLOOR_ROOT, "floors")
    ]).then(([walls, floors]) => {
      catalogs.walls = walls;
      catalogs.floors = floors;
      return { ...catalogs };
    });
  }
  return catalogPromise;
}

export function getWallTextureCatalog(){
  return catalogs.walls;
}

export function getFloorTextureCatalog(){
  return catalogs.floors;
}

export function pickDefaultTextureId(catalog, preferredId = null){
  if (preferredId && catalog.some(item => item.id === preferredId)) return preferredId;
  return catalog[0]?.id || null;
}

export async function loadGallery3dTextureImage(textureId, kind){
  const key = `${kind}:${textureId}`;
  if (imageCache.has(key)) return imageCache.get(key);

  await loadGallery3dTextureCatalogs();
  const catalog = kind === "floor" ? catalogs.floors : catalogs.walls;
  const entry = catalog.find(item => item.id === textureId) || catalog[0];
  if (!entry?.asset) {
    const fallback = createProceduralTextureCanvas(kind, textureId || "default");
    imageCache.set(key, fallback);
    return fallback;
  }

  try {
    const image = await loadImage(entry.asset);
    imageCache.set(key, image);
    return image;
  } catch (error) {
    console.warn(`[F7 3D 展館] 材質載入失敗：${entry.asset}`, error);
    const fallback = createProceduralTextureCanvas(kind, entry.id);
    imageCache.set(key, fallback);
    return fallback;
  }
}

export async function resolveGallery3dRoomSurfaceTextures({ wallTextureId, floorTextureId }){
  const [wallImage, floorImage] = await Promise.all([
    loadGallery3dTextureImage(wallTextureId, "wall"),
    loadGallery3dTextureImage(floorTextureId, "floor")
  ]);

  return {
    wallCanvas: imageToCanvas(wallImage),
    floorCanvas: imageToCanvas(floorImage),
    wallAspect: (wallImage.width || 1) / (wallImage.height || 1),
    floorAspect: (floorImage.width || 1) / (floorImage.height || 1)
  };
}

async function loadManifest(url, basePath, kind){
  const fallback = [createFallbackEntry(kind, 1, basePath)];
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return fallback;
    const data = await response.json();
    const items = Array.isArray(data?.items) ? data.items : [];
    const normalized = items
      .map((item, index) => normalizeManifestItem(item, basePath, kind, index))
      .filter(Boolean);
    return normalized.length ? normalized : fallback;
  } catch (error) {
    console.warn(`[F7 3D 展館] 無法載入清單：${url}`, error);
    return fallback;
  }
}

function normalizeManifestItem(item, basePath, kind, index){
  if (typeof item === "string") item = { file: item };
  if (!item || typeof item !== "object") return null;
  const file = item.file || `${kind}-${String(index + 1).padStart(2, "0")}.webp`;
  const id = item.id || file.replace(/\.webp$/i, "");
  const label = item.label || (kind === "floor" ? `地板 ${index + 1}` : `牆面 ${index + 1}`);
  const encoded = String(file).split("/").map(encodeURIComponent).join("/");
  const asset = item.asset || `${basePath}${encoded}`;
  return { id, label, file, asset, thumb: item.thumb || asset, kind };
}

function createFallbackEntry(kind, number, basePath){
  const id = `${kind === "floor" ? "floor" : "wall"}-0${number}`;
  return {
    id,
    label: kind === "floor" ? `地板 ${number}` : `牆面 ${number}`,
    file: `${id}.webp`,
    asset: `${basePath}${encodeURIComponent(`${id}.webp`)}`,
    thumb: `${basePath}${encodeURIComponent(`${id}.webp`)}`,
    kind
  };
}

function loadImage(url){
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Image load failed: ${url}`));
    image.src = url;
  });
}

function imageToCanvas(image){
  const canvas = document.createElement("canvas");
  canvas.width = image.width || image.naturalWidth || 512;
  canvas.height = image.height || image.naturalHeight || 512;
  const ctx = canvas.getContext("2d");
  if (image instanceof HTMLCanvasElement) {
    ctx.drawImage(image, 0, 0);
  } else {
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

function createProceduralTextureCanvas(kind, seed){
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const hash = String(seed).split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const base = kind === "floor"
    ? `hsl(${24 + (hash % 18)}, 24%, ${34 + (hash % 8)}%)`
    : `hsl(${38 + (hash % 20)}, 18%, ${78 + (hash % 6)}%)`;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 80; i += 1) {
    ctx.fillStyle = `rgba(255,255,255,${0.02 + (i % 5) * 0.01})`;
    const w = 12 + (i * 17) % 80;
    const h = 6 + (i * 11) % 40;
    ctx.fillRect((i * 53) % size, (i * 29) % size, w, h);
  }
  return canvas;
}
