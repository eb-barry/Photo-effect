# Photo Effects - ARCHITECTURE.md

**Version:** 1.0\
**Status:** Living Document

## 1. Project Goal

Photo Effects is a client-side Progressive Web App (PWA) for
professional image editing. It runs entirely in the browser using HTML5,
JavaScript, Canvas API, CSS3, IndexedDB and LocalStorage. No backend
server is required.

## 2. Core Technologies

-   HTML5
-   JavaScript ES Modules
-   Canvas API
-   CSS3
-   Progressive Web App (PWA)
-   GitHub Pages
-   IndexedDB
-   LocalStorage

## 3. Design Principles

1.  Production-quality code only.
2.  No placeholder implementations.
3.  No duplicated code.
4.  Reuse shared components.
5.  Modular architecture.
6.  Optimized for Android and iPhone.
7.  Senior-friendly interface.

## 4. Repository Structure

``` text
photo-effects/
assets/
  icons/
    app/
    features/
    ui/
  styles/
    main.css
js/
  app.js
  config/
  core/
  home/
  settings/
  features/
    F1_mirror/
    F2_crystalBall/
    ...
manifest.json
service-worker.js
index.html
```

## 5. CSS Standard

Only one global stylesheet:

`assets/styles/main.css`

Do not create additional CSS files unless explicitly approved.

## 6. Feature Module Standard

Each feature owns only its image-processing logic.

``` text
F2_crystalBall/
  crystalPage.js
  crystalTool.js
  crystalUI.js
  crystalState.js
```

## 7. Shared Framework

Shared services: - Home - Settings - Open Photo - Save Photo - Share
Photo - Canvas - Export - Auto Save - Draft Restore - IndexedDB -
LocalStorage - Responsive UI

## 8. Draft Recovery

Every feature automatically preserves: - Source image - Processing
parameters - UI state - Unfinished work

Users returning to the feature continue exactly where they left off.

## 9. UI Standard

-   Tiffany Green theme
-   Apple Human Interface inspired
-   Large touch targets
-   Large icons
-   High contrast
-   Minimal text
-   Senior friendly

## 10. Icon Rules

Feature icons: `assets/icons/features/F1-鏡像.webp`

UI icons: `assets/icons/ui/首頁.png` `assets/icons/ui/返回.png`
`assets/icons/ui/設定.png` `assets/icons/ui/開啟照片.png`
`assets/icons/ui/儲存照片.png` `assets/icons/ui/分享照片.png`

## 11. Development Rules

-   Respect existing architecture.
-   Do not redesign the framework.
-   Modify only necessary files.
-   Do not generate README during development.
-   Deliver only changed files.

## 12. Coding Standards

-   Clean code
-   ES Modules
-   Reusable components
-   No duplicated logic
-   Backward compatibility

## 13. Performance

-   Smooth mobile rendering
-   Minimize memory usage
-   Render only when necessary

## 14. AI Assistant Rules

Every AI assistant should: 1. Follow this architecture. 2. Focus only on
the requested feature. 3. Preserve compatibility. 4. Avoid unnecessary
changes.

## 15. Roadmap

Phase 1: Core + F1--F7

Phase 2: F8--F28

Phase 3: Undo/Redo, Batch Processing, Final v1.0
