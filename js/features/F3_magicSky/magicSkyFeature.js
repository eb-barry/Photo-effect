// F3 魔法天空 - Feature entry metadata v0.1.0

import { initMagicSkyPage } from "./magicSkyPage.js";

export const magicSkyFeature = {
  id: "F3_magicSky",
  order: 3,
  code: "F3",
  title: "魔法天空",
  name: "魔法天空",
  subtitle: "AI 換天・夢幻氛圍",
  description: "以 AI 天空分割替換照片中的天空區域。",
  icon: "assets/icons/features/F3-魔法天空.webp",
  route: "#/feature/F3_magicSky",
  modulePath: "./features/F3_magicSky/magicSkyPage.js",
  status: "enabled",
  enabled: true,
  disabled: false,
  isAvailable: true,
  version: "0.3.6",
  mount: initMagicSkyPage
};

export default magicSkyFeature;
