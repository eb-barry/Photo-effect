// F4 星芒鏡 - Feature entry metadata v0.1.1

import { initStarburstPage } from "./starburstPage.js";

export const starburstFeature = {
  id: "F4_starburst",
  order: 4,
  code: "F4",
  title: "星芒鏡",
  name: "星芒鏡",
  subtitle: "自訂光圈・璨爛星芒",
  description: "自訂光圈葉片、光源與星芒效果，為照片加上寫實的星芒光束。",
  icon: "assets/icons/features/F4-星芒鏡.webp",
  route: "#/feature/F4_starburst",
  modulePath: "./features/F4_starburst/starburstPage.js",
  status: "enabled",
  enabled: true,
  disabled: false,
  isAvailable: true,
  version: "0.1.1",
  mount: initStarburstPage
};

export default starburstFeature;
