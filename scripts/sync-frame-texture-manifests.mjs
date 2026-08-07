#!/usr/bin/env node
/**
 * Scan F5 texture / wall / artistic overlay folders and rewrite manifest.json
 * from all *.webp files.
 *
 * Usage: node scripts/sync-frame-texture-manifests.mjs
 *
 * Drop new .webp files into:
 *   assets/features/F5_frame/textures/classic/          (tile materials)
 *   assets/features/F5_frame/textures/artistic/         (transparent overlay frames)
 *       Naming: art-3x4-*.webp  /  art-4x3-*.webp
 *       (any filename containing 3x4 or 4x3 also works)
 *   assets/features/F5_frame/gallery/walls/             (wall-3x4 / wall-4x3)
 *   assets/features/F5_frame/polaroid/papers/
 *   assets/features/F5_frame/film/borders/
 * then run this script so the app picks them up automatically.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CATEGORIES = [
  { id: "classic", dir: "assets/features/F5_frame/textures/classic" },
  { id: "professional", dir: "assets/features/F5_frame/textures/professional" },
  { id: "artistic", dir: "assets/features/F5_frame/textures/artistic" },
  { id: "dimensional", dir: "assets/features/F5_frame/textures/dimensional" },
  { id: "smart", dir: "assets/features/F5_frame/textures/smart" },
  { id: "light", dir: "assets/features/F5_frame/textures/light" },
  { id: "gallery-walls", dir: "assets/features/F5_frame/gallery/walls" },
  { id: "polaroid-papers", dir: "assets/features/F5_frame/polaroid/papers" },
  { id: "film-borders", dir: "assets/features/F5_frame/film/borders" }
];

/** Optional display-name overrides for known classic ids. */
const LABEL_OVERRIDES = {
  wood: "木紋",
  walnut: "胡桃木",
  oak: "橡木",
  pine: "松木",
  gold: "金框",
  silver: "銀框",
  bronze: "銅框",
  aluminum: "鋁框",
  acrylic: "壓克力"
};

const PREFERRED_ORDER = [
  "wood", "walnut", "oak", "pine",
  "gold", "silver", "bronze", "aluminum", "acrylic"
];

function slugify(name){
  return String(name)
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fff-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "texture";
}

function titleLabel(name){
  const wall = String(name).match(/^wall[-_]?(3x4|4x3)[-_]?(\d+)$/i);
  if (wall) {
    const aspect = wall[1].toLowerCase();
    const num = String(Number(wall[2]));
    return aspect === "4x3" ? `橫式展場 ${num}` : `直式展場 ${num}`;
  }
  const art = String(name).match(/^art[-_]?(3x4|4x3)[-_]?(.+)$/i);
  if (art) {
    const aspect = art[1].toLowerCase();
    const rest = String(art[2]).replace(/[-_]+/g, " ").trim();
    const pretty = rest
      ? rest.replace(/\b([a-z])/g, (_, ch) => ch.toUpperCase())
      : "";
    const orient = aspect === "4x3" ? "橫式" : "直式";
    return pretty ? `${orient}藝術 ${pretty}` : `${orient}藝術畫框`;
  }
  const classic = String(name).match(/^classic[-_]?(\d+)$/i);
  if (classic) return `外框 ${Number(classic[1])}`;
  const inner = String(name).match(/^inner[-_]?(\d+)$/i);
  if (inner) return `內框 ${Number(inner[1])}`;
  return String(name)
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b([a-z])/g, (_, ch) => ch.toUpperCase());
}

function uniqueId(baseId, used){
  let id = baseId;
  let n = 2;
  while (used.has(id)) {
    id = `${baseId}-${n}`;
    n += 1;
  }
  used.add(id);
  return id;
}

function naturalCompare(a, b){
  return String(a).localeCompare(String(b), "en", { numeric: true, sensitivity: "base" });
}

function inferAspectFromFile(file){
  const name = String(file).toLowerCase();
  if (/wall[-_]?3x4/.test(name) || /art[-_]?3x4/.test(name) || /(?:^|[^0-9])3x4(?:[^0-9]|$)/.test(name)) {
    return "3x4";
  }
  if (/wall[-_]?4x3/.test(name) || /art[-_]?4x3/.test(name) || /(?:^|[^0-9])4x3(?:[^0-9]|$)/.test(name)) {
    return "4x3";
  }
  return null;
}

function inferClassicRole(file){
  const name = String(file).toLowerCase();
  if (/^inner[-_]?\d*\.webp$/i.test(name) || /(^|[-_])inner([-_]|$)/i.test(name)) {
    return "inner";
  }
  if (/^classic[-_]?\d*\.webp$/i.test(name) || /(^|[-_])classic([-_]|$)/i.test(name)) {
    return "outer";
  }
  return "outer";
}

function syncCategory(category){
  const absDir = path.join(root, category.dir);
  if (!fs.existsSync(absDir)) {
    fs.mkdirSync(absDir, { recursive: true });
  }

  const files = fs.readdirSync(absDir)
    .filter(name => /\.webp$/i.test(name) && fs.statSync(path.join(absDir, name)).isFile())
    .sort(naturalCompare);

  const used = new Set();
  const items = files.map(file => {
    const baseName = file.replace(/\.webp$/i, "");
    const rawId = slugify(baseName);
    const id = uniqueId(rawId, used);
    const label = LABEL_OVERRIDES[rawId] || LABEL_OVERRIDES[id] || titleLabel(baseName);
    const aspect = inferAspectFromFile(file);
    const entry = { id, label, file };
    if (aspect) entry.aspect = aspect;
    if (category.id === "artistic") entry.kind = "overlay";
    if (category.id === "classic") {
      entry.kind = "strip";
      entry.role = inferClassicRole(file);
    }
    return entry;
  });

  items.sort((a, b) => {
    if (a.role && b.role && a.role !== b.role) {
      return a.role === "outer" ? -1 : 1;
    }
    const ai = PREFERRED_ORDER.indexOf(a.id);
    const bi = PREFERRED_ORDER.indexOf(b.id);
    if (ai !== -1 || bi !== -1) {
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    }
    if (a.aspect && b.aspect && a.aspect !== b.aspect) {
      return a.aspect.localeCompare(b.aspect);
    }
    return naturalCompare(a.id, b.id);
  });

  const manifestPath = path.join(absDir, "manifest.json");
  const payload = {
    generatedAt: new Date().toISOString(),
    note: "Auto-generated by scripts/sync-frame-texture-manifests.mjs — do not hand-edit unless needed.",
    items
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`[F5] ${category.id}: ${items.length} texture(s) → ${path.relative(root, manifestPath)}`);
}

for (const category of CATEGORIES) {
  syncCategory(category);
}
