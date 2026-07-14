// F5 框住美好 - Feature entry metadata v0.1.0

import { initFramePage } from "./framePage.js";

export const frameFeature = {
  id: "F5_frame",
  order: 5,
  code: "F5",
  title: "框住美好",
  name: "框住美好",
  subtitle: "經典・專業畫框",
  description: "以程序化材質與專業邊框，將照片變成可展示的作品。",
  icon: "assets/icons/features/F5-畫框.webp",
  route: "#/feature/F5_frame",
  modulePath: "./features/F5_frame/framePage.js",
  status: "enabled",
  enabled: true,
  disabled: false,
  isAvailable: true,
  version: "0.4.0",
  mount: initFramePage
};

export default frameFeature;
