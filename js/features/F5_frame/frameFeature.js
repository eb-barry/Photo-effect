// F5 畫框 - Feature entry metadata v0.1.0

import { initFramePage } from "./framePage.js";

export const frameFeature = {
  id: "F5_frame",
  order: 5,
  code: "F5",
  title: "畫框",
  name: "畫框",
  subtitle: "經典・藝術・照片畫廊",
  description: "經典雙材質、藝術透明疊圖，以及照片畫廊展場合成。",
  icon: "assets/icons/features/F5-畫框.webp",
  route: "#/feature/F5_frame",
  modulePath: "./features/F5_frame/framePage.js",
  status: "enabled",
  enabled: true,
  disabled: false,
  isAvailable: true,
  version: "0.4.3",
  mount: initFramePage
};

export default frameFeature;
