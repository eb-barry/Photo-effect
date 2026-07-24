// F7 3D 展館 - Feature entry metadata v0.3.1

import { initGallery3dPage } from "./gallery3dPage.js";

export const gallery3dFeature = {
  id: "F7_virtualGallery",
  order: 7,
  code: "F7",
  title: "3D 展館",
  name: "3D 展館",
  subtitle: "陀螺儀環視・虛擬畫廊",
  description: "上傳最多 30 張 4:3 或 3:4 照片，在 3D 展間中以陀螺儀或拖曳環顧展示。",
  icon: "assets/icons/features/F7-3D展館.webp",
  route: "#/feature/F7_virtualGallery",
  modulePath: "./features/F7_virtualGallery/gallery3dPage.js",
  status: "enabled",
  enabled: true,
  disabled: false,
  isAvailable: true,
  version: "0.3.1",
  mount: initGallery3dPage
};

export default gallery3dFeature;
