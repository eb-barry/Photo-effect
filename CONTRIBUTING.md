# Contributing to Photo Effects

## Development Principles

-   Follow ARCHITECTURE.md
-   Follow UI_GUIDELINE.md
-   Follow FEATURES.md

## Before Coding

Do not redesign the framework.

Implement only the requested feature.

Reuse shared framework components.

## Code Quality

-   Production ready
-   Modular
-   Reusable
-   No duplicated code

## Pull Requests

Keep changes focused.

Modify only files required for the feature.

Avoid unrelated refactoring.

## F5 frame assets

Drop new WebP files into the matching folder, then regenerate manifests.

**Manual (no extra sync PR):** GitHub → **Actions** → **Sync F5 frame manifests** → **Run workflow**  
(select `main` or your branch; the Action rewrites `manifest.json` and commits)

**Local:**

```bash
node scripts/sync-frame-texture-manifests.mjs
```

- Classic tile materials: `assets/features/F5_frame/textures/classic/`
- Artistic overlays (transparent center): `assets/features/F5_frame/textures/artistic/` (`art-3x4-*.webp` / `art-4x3-*.webp`)
- Gallery walls: `assets/features/F5_frame/gallery/walls/` (`wall-3x4-*.webp` / `wall-4x3-*.webp`)

