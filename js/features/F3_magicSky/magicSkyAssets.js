// F3 魔法天空 - 素材清單載入（manifest.json，可擴充）

const CATEGORY_CONFIG = {
  sunny: {
    manifestUrl: "./assets/features/F3_magicSky/sunny/manifest.json",
    basePath: "./assets/features/F3_magicSky/sunny/",
    prefix: "sunny"
  },
  night: {
    manifestUrl: "./assets/features/F3_magicSky/night/manifest.json",
    basePath: "./assets/features/F3_magicSky/night/",
    prefix: "night"
  },
  sunset: {
    manifestUrl: "./assets/features/F3_magicSky/sunset/manifest.json",
    basePath: "./assets/features/F3_magicSky/sunset/",
    prefix: "sunset"
  }
};

function buildDefaultItems(category, count = 3){
  const config = CATEGORY_CONFIG[category];
  const labels = {
    sunny: "晴天",
    night: "夜晚",
    sunset: "夕陽"
  };
  return Array.from({ length: count }, (_, index) => {
    const id = `${config.prefix}${index + 1}`;
    return {
      id,
      label: `${labels[category]} ${index + 1}`,
      asset: `${config.basePath}${id}.webp`
    };
  });
}

const DEFAULT_CATALOG = {
  sunny: buildDefaultItems("sunny"),
  night: buildDefaultItems("night"),
  sunset: buildDefaultItems("sunset")
};

const catalog = {
  sunny: [...DEFAULT_CATALOG.sunny],
  night: [...DEFAULT_CATALOG.night],
  sunset: [...DEFAULT_CATALOG.sunset]
};

let catalogPromise = null;

export function getMagicSkyItems(category){
  return catalog[category] || DEFAULT_CATALOG.sunny;
}

export function loadMagicSkyAssetCatalog(){
  if (!catalogPromise) {
    catalogPromise = Promise.all(
      Object.keys(CATEGORY_CONFIG).map(async category => {
        const config = CATEGORY_CONFIG[category];
        const items = await loadManifest(
          config.manifestUrl,
          config.basePath,
          config.prefix,
          DEFAULT_CATALOG[category]
        );
        catalog[category] = items;
        return items;
      })
    ).then(results => {
      const merged = {};
      Object.keys(CATEGORY_CONFIG).forEach((category, index) => {
        merged[category] = results[index];
      });
      return merged;
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
    console.warn(`[F3 魔法天空] 無法載入素材清單：${url}`, error);
    return [...fallback];
  }
}

function normalizeManifestItem(item, prefix, basePath, index){
  const fallbackId = `${prefix}${index + 1}`;
  const id = typeof item?.id === "string" && item.id ? item.id : fallbackId;
  const file = typeof item?.file === "string" && item.file ? item.file : `${id}.webp`;
  const asset = typeof item?.asset === "string" && item.asset ? item.asset : `${basePath}${file}`;
  const label = typeof item?.label === "string" && item.label ? item.label : `${prefix} ${index + 1}`;
  return { id, label, asset };
}
