// F2 水晶球 - 素材清單載入（manifest.json，可擴充不限 6 個）

const SCENE_MANIFEST_URL = "./assets/features/F2_crystalBall/scenes/manifest.json";
const SEAT_MANIFEST_URL = "./assets/features/F2_crystalBall/seats/manifest.json";
const SCENE_BASE = "./assets/features/F2_crystalBall/scenes/";
const SEAT_BASE = "./assets/features/F2_crystalBall/seats/";

export const DEFAULT_CRYSTAL_SCENES = [
  { id: "scene1", label: "書房", asset: `${SCENE_BASE}scene1.webp` },
  { id: "scene2", label: "峽谷", asset: `${SCENE_BASE}scene2.webp` },
  { id: "scene3", label: "辦公室", asset: `${SCENE_BASE}scene3.webp` },
  { id: "scene4", label: "巴黎", asset: `${SCENE_BASE}scene4.webp` },
  { id: "scene5", label: "客廳", asset: `${SCENE_BASE}scene5.webp` },
  { id: "scene6", label: "臥室", asset: `${SCENE_BASE}scene6.webp` }
];

export const DEFAULT_CRYSTAL_SEATS = [
  { id: "seat1", label: "白大理石", asset: `${SEAT_BASE}seat1.webp` },
  { id: "seat2", label: "七彩水晶", asset: `${SEAT_BASE}seat2.webp` },
  { id: "seat3", label: "黃金寶石", asset: `${SEAT_BASE}seat3.webp` },
  { id: "seat4", label: "楠木雕刻", asset: `${SEAT_BASE}seat4.webp` },
  { id: "seat5", label: "藍綠寶石", asset: `${SEAT_BASE}seat5.webp` },
  { id: "seat6", label: "檜木雕刻", asset: `${SEAT_BASE}seat6.webp` }
];

let sceneCatalog = [...DEFAULT_CRYSTAL_SCENES];
let seatCatalog = [...DEFAULT_CRYSTAL_SEATS];
let catalogPromise = null;

export function getCrystalScenes(){
  return sceneCatalog;
}

export function getCrystalSeats(){
  return seatCatalog;
}

export function loadCrystalAssetCatalog(){
  if (!catalogPromise) {
    catalogPromise = Promise.all([
      loadManifest(SCENE_MANIFEST_URL, SCENE_BASE, "scene", DEFAULT_CRYSTAL_SCENES),
      loadManifest(SEAT_MANIFEST_URL, SEAT_BASE, "seat", DEFAULT_CRYSTAL_SEATS)
    ]).then(([scenes, seats]) => {
      sceneCatalog = scenes;
      seatCatalog = seats;
      return { scenes, seats };
    });
  }
  return catalogPromise;
}

async function loadManifest(url, basePath, prefix, fallback){
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return [...fallback];
    const data = await response.json();
    const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : null;
    if (!items?.length) return [...fallback];
    return items.map((item, index) => normalizeManifestItem(item, prefix, basePath, index));
  } catch (error) {
    console.warn(`[F2 水晶球] 無法載入素材清單：${url}`, error);
    return [...fallback];
  }
}

function normalizeManifestItem(item, prefix, basePath, index){
  const fallbackId = `${prefix}${index + 1}`;
  const id = typeof item?.id === "string" && item.id ? item.id : fallbackId;
  const file = typeof item?.file === "string" && item.file
    ? item.file
    : `${id}.webp`;
  const asset = typeof item?.asset === "string" && item.asset
    ? item.asset
    : `${basePath}${file}`;
  const label = typeof item?.label === "string" && item.label
    ? item.label
    : `${prefix === "scene" ? "場景" : "底座"} ${index + 1}`;
  return { id, label, asset };
}
