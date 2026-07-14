// Shared procedural material engine for F5 Frame Studio (and future modules).
// Texture overlays may be applied when WebP assets are available; otherwise fallback is procedural.

const materialCache = new Map();
const CACHE_LIMIT = 24;

export const MATERIAL_PRESETS = {
  wood: {
    id: "wood",
    base: [146, 102, 62],
    grain: [110, 72, 42],
    highlight: [188, 148, 104],
    metallic: 0.05,
    gloss: 0.28
  },
  walnut: {
    id: "walnut",
    base: [92, 58, 38],
    grain: [58, 34, 22],
    highlight: [128, 88, 58],
    metallic: 0.04,
    gloss: 0.22
  },
  oak: {
    id: "oak",
    base: [176, 132, 84],
    grain: [138, 98, 58],
    highlight: [214, 176, 126],
    metallic: 0.04,
    gloss: 0.26
  },
  pine: {
    id: "pine",
    base: [198, 166, 112],
    grain: [168, 132, 78],
    highlight: [232, 208, 158],
    metallic: 0.03,
    gloss: 0.2
  },
  gold: {
    id: "gold",
    base: [198, 156, 62],
    grain: [156, 112, 28],
    highlight: [246, 220, 132],
    metallic: 0.92,
    gloss: 0.82
  },
  silver: {
    id: "silver",
    base: [168, 174, 182],
    grain: [120, 126, 134],
    highlight: [236, 240, 246],
    metallic: 0.88,
    gloss: 0.78
  },
  bronze: {
    id: "bronze",
    base: [150, 98, 52],
    grain: [108, 68, 34],
    highlight: [206, 152, 88],
    metallic: 0.8,
    gloss: 0.68
  },
  aluminum: {
    id: "aluminum",
    base: [186, 190, 196],
    grain: [142, 148, 156],
    highlight: [240, 244, 248],
    metallic: 0.7,
    gloss: 0.62
  },
  acrylic: {
    id: "acrylic",
    base: [220, 236, 242],
    grain: [186, 210, 220],
    highlight: [255, 255, 255],
    metallic: 0.15,
    gloss: 0.9,
    translucent: true
  },
  gallery: {
    id: "gallery",
    base: [42, 42, 44],
    grain: [28, 28, 30],
    highlight: [78, 78, 82],
    metallic: 0.12,
    gloss: 0.35
  },
  polaroid: {
    id: "polaroid",
    base: [244, 242, 236],
    grain: [228, 224, 214],
    highlight: [255, 255, 255],
    metallic: 0,
    gloss: 0.08
  },
  film: {
    id: "film",
    base: [18, 18, 20],
    grain: [8, 8, 10],
    highlight: [54, 54, 58],
    metallic: 0.05,
    gloss: 0.18
  },
  white: {
    id: "white",
    base: [246, 246, 246],
    grain: [228, 228, 228],
    highlight: [255, 255, 255],
    metallic: 0,
    gloss: 0.12
  },
  black: {
    id: "black",
    base: [22, 22, 24],
    grain: [8, 8, 10],
    highlight: [58, 58, 62],
    metallic: 0.08,
    gloss: 0.28
  }
};

export function getMaterialPreset(materialId){
  return MATERIAL_PRESETS[materialId] || MATERIAL_PRESETS.wood;
}

/**
 * Create (or reuse) a tileable procedural material canvas.
 * Optional textureImage overlays when provided.
 */
export function createMaterialPattern(materialId, options = {}){
  const size = Math.max(64, Math.min(512, Number(options.size) || 256));
  const textureImage = options.textureImage || null;
  const opacity = clamp01(options.opacity ?? 1);
  const cacheKey = `${materialId}|${size}|${textureImage ? `tex:${textureImage.width}x${textureImage.height}` : "proc"}|${opacity.toFixed(2)}`;

  if (materialCache.has(cacheKey)) {
    const cached = materialCache.get(cacheKey);
    materialCache.delete(cacheKey);
    materialCache.set(cacheKey, cached);
    return cached;
  }

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const preset = getMaterialPreset(materialId);

  if (textureImage) {
    // Prefer the provided WebP as the primary surface.
    ctx.drawImage(textureImage, 0, 0, size, size);
    if ((preset.gloss || 0) > 0.3) {
      const gradient = ctx.createLinearGradient(0, 0, size, size);
      gradient.addColorStop(0, `rgba(255,255,255,${0.06 + preset.gloss * 0.08})`);
      gradient.addColorStop(0.5, "rgba(255,255,255,0)");
      gradient.addColorStop(1, `rgba(0,0,0,${0.06 + (preset.metallic || 0) * 0.08})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
    }
  } else {
    paintProceduralMaterial(ctx, size, preset);
  }

  if (opacity < 1) {
    const faded = document.createElement("canvas");
    faded.width = size;
    faded.height = size;
    const fadedCtx = faded.getContext("2d");
    fadedCtx.globalAlpha = opacity;
    fadedCtx.drawImage(canvas, 0, 0);
    remember(cacheKey, faded);
    return faded;
  }

  remember(cacheKey, canvas);
  return canvas;
}

export function createMaterialFillStyle(ctx, materialId, options = {}){
  // Always tile via a downscaled pattern canvas (default 256).
  // createPattern(full WebP) was a major preview cost on large texture assets.
  const patternCanvas = createMaterialPattern(materialId, {
    size: options.size || 256,
    textureImage: options.textureImage || null,
    opacity: options.opacity
  });
  return ctx.createPattern(patternCanvas, "repeat");
}

function paintProceduralMaterial(ctx, size, preset){
  const { base, grain, highlight, metallic, gloss, translucent } = preset;
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const seed = hashString(preset.id);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const nx = x / size;
      const ny = y / size;

      let tone = 0.55;
      if (metallic > 0.5) {
        const band = Math.sin((nx * 18 + ny * 2.4 + seeded(seed, x, y) * 0.4) * Math.PI * 2);
        const sweep = Math.sin((nx * 3.2 - ny * 0.8) * Math.PI * 2) * 0.5 + 0.5;
        tone = 0.42 + band * 0.18 + sweep * 0.28 * gloss;
      } else if (preset.id.includes("wood") || ["walnut", "oak", "pine", "wood"].includes(preset.id)) {
        const wave = Math.sin((nx * 26 + Math.sin(ny * 10) * 1.8) * Math.PI * 2);
        const knot = Math.sin((nx * 4.2 + ny * 7.1 + seed) * Math.PI * 2) * 0.08;
        tone = 0.48 + wave * 0.16 + knot + (seeded(seed + 3, x, y) - 0.5) * 0.08;
      } else if (translucent) {
        const rim = Math.pow(Math.abs(Math.sin(nx * Math.PI)) * Math.abs(Math.sin(ny * Math.PI)), 0.45);
        tone = 0.62 + rim * 0.28 + (seeded(seed, x, y) - 0.5) * 0.04;
      } else {
        tone = 0.5 + (seeded(seed, x, y) - 0.5) * 0.16 + Math.sin((nx + ny) * 12) * 0.04;
      }

      const mix = clamp01(tone);
      const darkMix = clamp01(1 - mix);
      const r = Math.round(base[0] * mix + grain[0] * darkMix * 0.55 + highlight[0] * Math.max(0, mix - 0.62) * 1.4);
      const g = Math.round(base[1] * mix + grain[1] * darkMix * 0.55 + highlight[1] * Math.max(0, mix - 0.62) * 1.4);
      const b = Math.round(base[2] * mix + grain[2] * darkMix * 0.55 + highlight[2] * Math.max(0, mix - 0.62) * 1.4);

      data[i] = clampByte(r);
      data[i + 1] = clampByte(g);
      data[i + 2] = clampByte(b);
      data[i + 3] = translucent ? Math.round(210 + mix * 40) : 255;
    }
  }

  ctx.putImageData(image, 0, 0);

  // Soft bevel sheen strip for metals / glossy surfaces.
  if (gloss > 0.3) {
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, `rgba(255,255,255,${0.08 + gloss * 0.12})`);
    gradient.addColorStop(0.45, "rgba(255,255,255,0)");
    gradient.addColorStop(1, `rgba(0,0,0,${0.08 + metallic * 0.1})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
}

function tileImage(ctx, image, size){
  const pattern = ctx.createPattern(image, "repeat");
  if (!pattern) {
    ctx.drawImage(image, 0, 0, size, size);
    return;
  }
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, size, size);
}

function remember(key, value){
  materialCache.set(key, value);
  while (materialCache.size > CACHE_LIMIT) {
    const oldest = materialCache.keys().next().value;
    materialCache.delete(oldest);
  }
}

function seeded(seed, x, y){
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function hashString(text){
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 1000;
}

function clamp01(value){
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function clampByte(value){
  return Math.max(0, Math.min(255, value));
}
