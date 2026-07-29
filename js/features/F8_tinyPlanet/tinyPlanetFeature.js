// F8 小行星 - Feature entry metadata v0.3.1

import { initTinyPlanetPage } from "./tinyPlanetPage.js";

export const tinyPlanetFeature = {
  id: "F8_tinyPlanet",
  order: 8,
  code: "F8",
  title: "小行星",
  name: "小行星",
  subtitle: "全景彎折・魚眼畸變",
  description: "小行星／隧道極座標效果，以及獨立的魚眼焦距即時畸變。",
  icon: "assets/icons/features/F8-小行星.webp",
  route: "#/feature/F8_tinyPlanet",
  modulePath: "./features/F8_tinyPlanet/tinyPlanetPage.js",
  status: "enabled",
  enabled: true,
  disabled: false,
  isAvailable: true,
  version: "0.3.1",
  mount: initTinyPlanetPage
};

export default tinyPlanetFeature;
