export const FEATURE_FILES = [
  "F1-鏡像.webp",
  "F2-水晶球.webp",
  "F3-魔法天空.webp",
  "F4-星芒鏡.webp",
  "F5-畫框.webp",
  "F6-照片牆.webp",
  "F7-浮水印.webp"
];

const FEATURE_ROUTES = {
  F1: "F1_mirror",
  F2: "F2_crystalBall",
  F3: "F3_magicSky",
  F4: "F4_starburst"
};

export function buildFeatures(){
  const active = FEATURE_FILES.map(fileName => {
    const match = fileName.match(/^(F\d+)-(.+)\.(webp|png|jpg|jpeg)$/i);
    const id = match ? match[1] : fileName.split("-")[0];
    const label = match ? match[2] : id;
    const route = FEATURE_ROUTES[id] || null;
    return {
      id,
      label,
      fileName,
      route,
      enabled: Boolean(route),
      icon: `./assets/icons/features/${encodeURIComponent(fileName)}`
    };
  });

  const placeholders = [];
  for (let i = active.length + 1; i <= 28; i++) {
    placeholders.push({
      id: `F${i}`,
      label: `F${i}`,
      route: null,
      enabled: false,
      icon: ""
    });
  }

  return [...active, ...placeholders];
}
