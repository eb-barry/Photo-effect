// Shared photo analyzer for F5 smart frames (and future modules).
// Phase 1: minimal heuristic API shell. Full recommendation engine comes in Phase 4.

/**
 * Analyze a canvas/image source with lightweight client-side heuristics.
 * Safe to call on preview-sized bitmaps.
 */
export async function analyzePhoto(source){
  const sample = await rasterizeForAnalysis(source, 160);
  if (!sample) {
    return createEmptyAnalysis();
  }

  const { canvas, ctx, width, height } = sample;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumLuma = 0;
  let edgeAcc = 0;
  let skyVotes = 0;
  let greenVotes = 0;
  let blueVotes = 0;
  const hist = new Array(16).fill(0);
  const count = width * height;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sumR += r;
      sumG += g;
      sumB += b;
      sumLuma += luma;
      hist[Math.min(15, Math.floor(luma / 16))] += 1;

      if (y < height * 0.4 && b > r + 8 && b > g + 4 && b > 90) skyVotes += 1;
      if (g > r + 10 && g > b + 6) greenVotes += 1;
      if (b > r + 12 && b > g + 8) blueVotes += 1;

      if (x < width - 1) {
        const j = i + 4;
        const luma2 = 0.2126 * data[j] + 0.7152 * data[j + 1] + 0.0722 * data[j + 2];
        edgeAcc += Math.abs(luma - luma2);
      }
    }
  }

  const brightness = sumLuma / count / 255;
  const avgR = sumR / count;
  const avgG = sumG / count;
  const avgB = sumB / count;
  const maxC = Math.max(avgR, avgG, avgB);
  const minC = Math.min(avgR, avgG, avgB);
  const contrast = (maxC - minC) / 255;
  const colorTemp = avgR - avgB;

  return {
    orientation: width >= height ? "landscape" : "portrait",
    width: source?.width || width,
    height: source?.height || height,
    histogram: hist.map(v => v / count),
    brightness,
    contrast,
    dominantColors: [
      [Math.round(avgR), Math.round(avgG), Math.round(avgB)]
    ],
    colorTemperature: colorTemp,
    edgeDensity: edgeAcc / count / 255,
    textureDensity: edgeAcc / count / 255,
    skyPercentage: skyVotes / count,
    greenPercentage: greenVotes / count,
    bluePercentage: blueVotes / count,
    sampleSize: { width, height },
    canvas
  };
}

/**
 * Recommend frames from analysis. Phase 1 returns a simple ranked shortlist.
 */
export function recommendFrames(analysis, catalog = []){
  if (!analysis || !catalog.length) return [];

  const scored = catalog.map(item => {
    let score = 55;
    const reasons = [];

    if (analysis.skyPercentage > 0.18 && /glass|acrylic|silver|aluminum/i.test(item.id + item.label)) {
      score += 28;
      reasons.push("偵測到較多天空／藍色區域");
    }
    if (analysis.greenPercentage > 0.2 && /wood|oak|pine|walnut/i.test(item.id)) {
      score += 24;
      reasons.push("自然綠色調適合木質畫框");
    }
    if (analysis.brightness < 0.35 && /black|gallery|film/i.test(item.id)) {
      score += 20;
      reasons.push("偏暗影像適合深色專業框");
    }
    if (analysis.brightness > 0.7 && /white|polaroid|acrylic/i.test(item.id)) {
      score += 18;
      reasons.push("明亮影像適合淺色邊框");
    }
    if (analysis.colorTemperature > 12 && /gold|bronze|oak/i.test(item.id)) {
      score += 14;
      reasons.push("暖色調搭配金屬／木質");
    }
    if (analysis.colorTemperature < -12 && /silver|aluminum|film/i.test(item.id)) {
      score += 14;
      reasons.push("冷色調搭配銀／鋁／底片框");
    }

    score = Math.max(1, Math.min(99, Math.round(score)));
    return {
      ...item,
      score,
      reason: reasons[0] || "整體色調與對比適中"
    };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, 5);
}

function createEmptyAnalysis(){
  return {
    orientation: "landscape",
    width: 0,
    height: 0,
    histogram: new Array(16).fill(0),
    brightness: 0.5,
    contrast: 0.2,
    dominantColors: [[128, 128, 128]],
    colorTemperature: 0,
    edgeDensity: 0,
    textureDensity: 0,
    skyPercentage: 0,
    greenPercentage: 0,
    bluePercentage: 0,
    sampleSize: { width: 0, height: 0 }
  };
}

async function rasterizeForAnalysis(source, maxSide){
  try {
    const width = source.naturalWidth || source.width;
    const height = source.naturalHeight || source.height;
    if (!width || !height) return null;

    const scale = Math.min(1, maxSide / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, w, h);
    return { canvas, ctx, width: w, height: h };
  } catch (error) {
    console.warn("[photoAnalyzer] 分析失敗：", error);
    return null;
  }
}
