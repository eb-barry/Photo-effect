const UI_ICON_MAP = { home:"首頁", back:"返回", settings:"設定", openPhoto:"開啟照片", savePhoto:"儲存照片", sharePhoto:"分享照片" };
export function uiIcon(name){ const fileBase = UI_ICON_MAP[name] || name; return `./assets/icons/ui/${encodeURIComponent(fileBase)}.png`; }
export function iconButton({ icon, label, id = "", className = "" }){
  const iconPath = uiIcon(icon);
  const safeLabel = String(label).replaceAll('"', "&quot;");
  return `<button class="icon-button ${className}" ${id ? `id="${id}"` : ""} aria-label="${safeLabel}" title="${safeLabel}" type="button"><img src="${iconPath}" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline'" /><span class="icon-text-fallback">${safeLabel}</span></button>`;
}
