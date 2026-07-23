// Shared draft hygiene for Photo Effects.
// Large base64 photos in localStorage block the main thread on every getItem/setItem
// for the origin — including home and unrelated features.

const OVERSIZED_CHARS = 350_000; // ~250–350KB text ≈ one compressed photo dataURL

const KNOWN_DRAFT_KEYS = [
  "photoEffects.F2_crystalBall.draft.v9",
  "photoEffects.F3_magicSky.draft.v3",
  "photoEffects.F4_starburst.draft.v4",
  "photoEffects.F5_frame.draft.v5",
  "photoEffects.F5_frame.draft.v6",
  "photoEffects.F5_frame.draft.v7",
  "photoEffects.F5_frame.draft.v8",
  "photoEffects.F5_frame.draft.v9",
  "photoEffects.F6_photoWall.draft.v1",
  "photoEffects.F7_virtualGallery.draft.v1",
  "photoEffects.F7_virtualGallery.draft.v2"
];

/**
 * Remove or strip oversized localStorage drafts that poison app-wide responsiveness.
 * Prefer stripping `sourceImageDataUrl` when present so params can still restore.
 */
export function pruneOversizedLocalDrafts(){
  try {
    const keys = new Set(KNOWN_DRAFT_KEYS);
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) keys.add(key);
    }

    keys.forEach(key => {
      if (!key || !key.startsWith("photoEffects")) return;
      let raw;
      try {
        raw = localStorage.getItem(key);
      } catch {
        return;
      }
      if (!raw || raw.length < OVERSIZED_CHARS) return;

      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && "sourceImageDataUrl" in parsed) {
          parsed.sourceImageDataUrl = null;
          const next = JSON.stringify(parsed);
          if (next.length < OVERSIZED_CHARS) {
            localStorage.setItem(key, next);
            console.warn(`[draftStorage] stripped oversized image from ${key}`);
            return;
          }
        }
      } catch {
        // not JSON — fall through to remove
      }

      try {
        localStorage.removeItem(key);
        console.warn(`[draftStorage] removed oversized key ${key} (${raw.length} chars)`);
      } catch (error) {
        console.warn(`[draftStorage] unable to prune ${key}`, error);
      }
    });
  } catch (error) {
    console.warn("[draftStorage] prune failed", error);
  }
}
