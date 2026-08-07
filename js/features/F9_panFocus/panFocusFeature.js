// F9 追焦 - Feature entry metadata v0.1.9

import { initPanFocusPage } from "./panFocusPage.js";

export const panFocusFeature = {
  id: "F9_panFocus",
  order: 9,
  code: "F9",
  title: "追焦",
  name: "追焦",
  subtitle: "主體清晰・水平拖影",
  description: "手動選擇汽車或機車／自行車，保持主體清晰並為背景套用水平追焦運動模糊。",
  icon: "assets/icons/features/F9-追焦.webp",
  route: "#/feature/F9_panFocus",
  modulePath: "./features/F9_panFocus/panFocusPage.js",
  status: "enabled",
  enabled: true,
  disabled: false,
  isAvailable: true,
  version: "0.1.9",
  mount: initPanFocusPage
};

export default panFocusFeature;
