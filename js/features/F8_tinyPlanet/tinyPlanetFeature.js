// F8 小行星 - Feature entry metadata v0.5.0

import { initTinyPlanetPage } from "./tinyPlanetPage.js";

export const tinyPlanetFeature = {
  id: "F8_tinyPlanet",
  order: 8,
  code: "F8",
  title: "小行星",
  name: "小行星",
  subtitle: "全景彎折・行星旋轉",
  description: "將全景或風景照片彎折成小行星／隧道效果，並在調整項目中微調變形與氛圍光影。",
  icon: "assets/icons/features/F8-小行星.webp",
  route: "#/feature/F8_tinyPlanet",
  modulePath: "./features/F8_tinyPlanet/tinyPlanetPage.js",
  status: "enabled",
  enabled: true,
  disabled: false,
  isAvailable: true,
  version: "0.5.0",
  mount: initTinyPlanetPage
};

export default tinyPlanetFeature;
