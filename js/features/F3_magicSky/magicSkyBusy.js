// F3 魔法天空 - 處理中提示 UI

export function createProcessingOverlay(overlayEl, textEl){
  let depth = 0;
  let timer = null;
  let visible = false;

  const setMessage = message => {
    if (textEl && message) textEl.textContent = message;
  };

  const showNow = message => {
    if (message) setMessage(message);
    overlayEl?.classList.remove("hidden");
    visible = true;
  };

  const hideNow = () => {
    overlayEl?.classList.add("hidden");
    visible = false;
  };

  const begin = (message, delayMs = 150) => {
    depth += 1;
    if (message) setMessage(message);

    if (visible || timer) return;

    if (delayMs <= 0) {
      showNow(message);
      return;
    }

    timer = setTimeout(() => {
      timer = null;
      if (depth > 0) showNow(message);
    }, delayMs);
  };

  const end = () => {
    depth = Math.max(0, depth - 1);
    if (depth > 0) return;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    hideNow();
  };

  const run = async (message, task, options = {}) => {
    begin(message, options.delay ?? 150);
    try {
      return await task();
    } finally {
      end();
    }
  };

  const reset = () => {
    depth = 0;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    hideNow();
  };

  const isActive = () => depth > 0 || visible;

  return { begin, end, run, reset, isActive, setMessage, showNow, hideNow };
}

export const INTENSIVE_RENDER_PARAMS = new Set([
  "photoExposure",
  "photoContrast",
  "photoBrightness",
  "photoDarken",
  "photoWarmth",
  "photoSaturation",
  "skyExposure",
  "skyContrast",
  "skyBrightness",
  "skyDarken",
  "skyOpacity",
  "skyWarmth",
  "skySaturation",
  "edgeFeather",
  "maskExpansion",
  "skyEdgeRefine",
  "skySensitivity",
  "skyOffsetX",
  "skyOffsetY",
  "skyScale"
]);
