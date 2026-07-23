// F6 照片牆 - 透視／弧形網格變形 (Phase 2A/2B)

export const WARP_GRID_COLS = 14;
export const WARP_GRID_ROWS = 14;
export const HANDLE_HIT_RADIUS = 36;
export const HANDLE_VISUAL_RADIUS = 13;
export const HANDLE_EDGE_VISUAL_RADIUS = 14;

const HANDLE_IDS = ["tl", "tr", "br", "bl", "top", "bottom"];

export function createDefaultPerspective(){
  return {
    customized: false,
    corners: null,
    edgeCurve: { top: 0, bottom: 0 }
  };
}

export function computePlacementQuad(photo, image, canvasW, canvasH){
  const scale = photo.position?.scale || 0.28;
  const drawW = canvasW * scale;
  const aspect = image.height / Math.max(1, image.width);
  const drawH = drawW * aspect;
  const cx = (photo.position?.x ?? 0.5) * canvasW;
  const cy = (photo.position?.y ?? 0.5) * canvasH;
  const left = cx - drawW / 2;
  const top = cy - drawH / 2;
  return {
    tl: norm(left, top, canvasW, canvasH),
    tr: norm(left + drawW, top, canvasW, canvasH),
    br: norm(left + drawW, top + drawH, canvasW, canvasH),
    bl: norm(left, top + drawH, canvasW, canvasH)
  };
}

export function resolvePhotoCorners(photo, image, canvasW, canvasH){
  const placement = computePlacementQuad(photo, image, canvasW, canvasH);
  if (!photo.perspective?.customized || !photo.perspective?.corners) {
    return cloneCorners(placement);
  }
  return normalizeCornerRecord(photo.perspective.corners, placement);
}

export function resolvePhotoEdgeCurve(photo){
  const curve = photo.perspective?.edgeCurve || {};
  return {
    top: clamp(Number(curve.top) || 0, -100, 100),
    bottom: clamp(Number(curve.bottom) || 0, -100, 100)
  };
}

export function cornersToCanvas(corners, canvasW, canvasH){
  return {
    tl: denorm(corners.tl, canvasW, canvasH),
    tr: denorm(corners.tr, canvasW, canvasH),
    br: denorm(corners.br, canvasW, canvasH),
    bl: denorm(corners.bl, canvasW, canvasH)
  };
}

export function canvasPointToCorner(canvasX, canvasY, canvasW, canvasH){
  return {
    x: clamp(canvasX / Math.max(1, canvasW), -0.25, 1.25),
    y: clamp(canvasY / Math.max(1, canvasH), -0.25, 1.25)
  };
}

export function mapWarpPoint(u, v, cornersPx, edgeCurve){
  const { tl, tr, br, bl } = cornersPx;
  const top = quadraticEdge(tl, tr, edgeCurve.top, u);
  const bottom = quadraticEdge(bl, br, edgeCurve.bottom, u);
  return {
    x: top.x + (bottom.x - top.x) * v,
    y: top.y + (bottom.y - top.y) * v
  };
}

export function getWarpBounds(cornersPx, edgeCurve){
  const points = [];
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    points.push(mapWarpPoint(u, 0, cornersPx, edgeCurve));
    points.push(mapWarpPoint(u, 1, cornersPx, edgeCurve));
  }
  for (let j = 1; j < steps; j++) {
    const v = j / steps;
    points.push(mapWarpPoint(0, v, cornersPx, edgeCurve));
    points.push(mapWarpPoint(1, v, cornersPx, edgeCurve));
  }
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY, points };
}

export function pointInWarp(u, v, cornersPx, edgeCurve){
  const pt = mapWarpPoint(u, v, cornersPx, edgeCurve);
  return pt;
}

export function hitTestWarpPhoto(cornersPx, edgeCurve, canvasX, canvasY){
  if (pointInPolygon(canvasX, canvasY, getWarpBoundaryPolygon(cornersPx, edgeCurve))) {
    return true;
  }
  const bounds = getWarpBounds(cornersPx, edgeCurve);
  return canvasX >= bounds.x && canvasX <= bounds.x + bounds.w
    && canvasY >= bounds.y && canvasY <= bounds.y + bounds.h;
}

export function getWarpBoundaryPolygon(cornersPx, edgeCurve){
  const steps = 16;
  const poly = [];
  for (let i = 0; i <= steps; i++) poly.push(mapWarpPoint(i / steps, 0, cornersPx, edgeCurve));
  for (let i = 1; i <= steps; i++) poly.push(mapWarpPoint(1, i / steps, cornersPx, edgeCurve));
  for (let i = steps - 1; i >= 0; i--) poly.push(mapWarpPoint(i / steps, 1, cornersPx, edgeCurve));
  for (let i = steps - 1; i >= 1; i--) poly.push(mapWarpPoint(0, i / steps, cornersPx, edgeCurve));
  return poly;
}

export function getWarpHandles(cornersPx, edgeCurve){
  const topMid = quadraticEdge(cornersPx.tl, cornersPx.tr, edgeCurve.top, 0.5);
  const bottomMid = quadraticEdge(cornersPx.bl, cornersPx.br, edgeCurve.bottom, 0.5);
  return {
    tl: cornersPx.tl,
    tr: cornersPx.tr,
    br: cornersPx.br,
    bl: cornersPx.bl,
    top: topMid,
    bottom: bottomMid
  };
}

export function hitTestWarpHandle(handles, canvasX, canvasY, radius = HANDLE_HIT_RADIUS){
  for (const id of HANDLE_IDS) {
    const pt = handles[id];
    if (!pt) continue;
    if (Math.hypot(canvasX - pt.x, canvasY - pt.y) <= radius) {
      return id;
    }
  }
  return null;
}

export function photoNeedsWarpDraw(photo){
  const curve = resolvePhotoEdgeCurve(photo);
  if (curve.top !== 0 || curve.bottom !== 0) return true;
  return Boolean(photo.perspective?.customized && photo.perspective?.corners);
}

export function drawWarpedPhoto(ctx, image, corners, edgeCurve, canvasW, canvasH, options = {}){
  const cornersPx = cornersToCanvas(corners, canvasW, canvasH);
  const curve = {
    top: edgeCurve?.top || 0,
    bottom: edgeCurve?.bottom || 0
  };

  const cols = options.gridCols || WARP_GRID_COLS;
  const rows = options.gridRows || WARP_GRID_ROWS;
  const iw = image.width;
  const ih = image.height;

  ctx.save();
  if (!options.fastPreview) {
    ctx.shadowColor = "rgba(0,0,0,0.28)";
    const bounds = getWarpBounds(cornersPx, curve);
    ctx.shadowBlur = Math.max(6, Math.min(bounds.w, bounds.h) * 0.03);
    ctx.shadowOffsetY = Math.max(3, bounds.h * 0.02);
  }

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const u0 = col / cols;
      const u1 = (col + 1) / cols;
      const v0 = row / rows;
      const v1 = (row + 1) / rows;

      const d00 = mapWarpPoint(u0, v0, cornersPx, curve);
      const d10 = mapWarpPoint(u1, v0, cornersPx, curve);
      const d11 = mapWarpPoint(u1, v1, cornersPx, curve);
      const d01 = mapWarpPoint(u0, v1, cornersPx, curve);

      const sx0 = u0 * iw;
      const sx1 = u1 * iw;
      const sy0 = v0 * ih;
      const sy1 = v1 * ih;

      drawTexturedTriangle(ctx, image,
        { x: sx0, y: sy0 }, { x: sx1, y: sy0 }, { x: sx1, y: sy1 },
        d00, d10, d11
      );
      drawTexturedTriangle(ctx, image,
        { x: sx0, y: sy0 }, { x: sx1, y: sy1 }, { x: sx0, y: sy1 },
        d00, d11, d01
      );
    }
  }
  ctx.restore();

  return getWarpBounds(cornersPx, curve);
}

export function drawWarpOutline(ctx, corners, edgeCurve, canvasW, canvasH, style = {}){
  const cornersPx = cornersToCanvas(corners, canvasW, canvasH);
  const curve = {
    top: edgeCurve?.top || 0,
    bottom: edgeCurve?.bottom || 0
  };
  const poly = getWarpBoundaryPolygon(cornersPx, curve);
  if (!poly.length) return;

  ctx.save();
  ctx.strokeStyle = style.color || "#ff3b30";
  ctx.lineWidth = style.lineWidth || 2.5;
  if (style.glow) {
    ctx.shadowColor = "rgba(255, 59, 48, 0.85)";
    ctx.shadowBlur = style.glow;
  }
  ctx.beginPath();
  ctx.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

export function drawWarpHandles(ctx, handles, style = {}){
  const cornerRadius = style.radius || HANDLE_VISUAL_RADIUS;
  const edgeRadius = style.edgeRadius || HANDLE_EDGE_VISUAL_RADIUS;
  ctx.save();
  Object.entries(handles).forEach(([id, pt]) => {
    const isEdge = id === "top" || id === "bottom";
    const radius = isEdge ? edgeRadius : cornerRadius;
    ctx.beginPath();
    ctx.fillStyle = isEdge ? "#2f55d4" : "#0abab5";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2.5;
    ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();
}

export function computeEdgeCurveFromPoint(cornersPx, handleId, pointPx){
  const start = handleId === "top" ? cornersPx.tl : cornersPx.bl;
  const end = handleId === "top" ? cornersPx.tr : cornersPx.br;
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const len = Math.hypot(end.x - start.x, end.y - start.y);
  if (len < 1) return 0;
  const nx = -(end.y - start.y) / len;
  const ny = (end.x - start.x) / len;
  const offset = (pointPx.x - mid.x) * nx + (pointPx.y - mid.y) * ny;
  return clamp((offset / (len * 0.42)) * 100, -100, 100);
}

export function transformCornersWithPosition(corners, before, after){
  if (!corners) return corners;
  const scaleFactor = (after.scale || 0.28) / Math.max(0.0001, before.scale || 0.28);
  const dx = (after.x ?? 0.5) - (before.x ?? 0.5);
  const dy = (after.y ?? 0.5) - (before.y ?? 0.5);
  const center = quadCenter(corners);
  const next = {};
  ["tl", "tr", "br", "bl"].forEach(key => {
    const relX = corners[key].x - center.x;
    const relY = corners[key].y - center.y;
    next[key] = {
      x: clamp(center.x + dx + relX * scaleFactor, -0.25, 1.25),
      y: clamp(center.y + dy + relY * scaleFactor, -0.25, 1.25)
    };
  });
  return next;
}

function drawTexturedTriangle(ctx, image, s0, s1, s2, d0, d1, d2){
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(d0.x, d0.y);
  ctx.lineTo(d1.x, d1.y);
  ctx.lineTo(d2.x, d2.y);
  ctx.closePath();
  ctx.clip();

  const denom = (s1.x - s0.x) * (s2.y - s0.y) - (s2.x - s0.x) * (s1.y - s0.y);
  if (Math.abs(denom) < 0.0001) {
    ctx.restore();
    return;
  }

  const m11 = ((d1.x - d0.x) * (s2.y - s0.y) - (d2.x - d0.x) * (s1.y - s0.y)) / denom;
  const m12 = ((d1.y - d0.y) * (s2.y - s0.y) - (d2.y - d0.y) * (s1.y - s0.y)) / denom;
  const m21 = ((d2.x - d0.x) * (s1.x - s0.x) - (d1.x - d0.x) * (s2.x - s0.x)) / denom;
  const m22 = ((d2.y - d0.y) * (s1.x - s0.x) - (d1.y - d0.y) * (s2.x - s0.x)) / denom;
  const dx = d0.x - m11 * s0.x - m21 * s0.y;
  const dy = d0.y - m12 * s0.x - m22 * s0.y;

  ctx.transform(m11, m12, m21, m22, dx, dy);
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}

function quadraticEdge(start, end, curveAmount, t){
  const mid = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2
  };
  const edgeLen = Math.hypot(end.x - start.x, end.y - start.y);
  const normal = edgeLen > 0
    ? { x: -(end.y - start.y) / edgeLen, y: (end.x - start.x) / edgeLen }
    : { x: 0, y: -1 };
  const offset = (curveAmount / 100) * edgeLen * 0.42;
  const control = {
    x: mid.x + normal.x * offset,
    y: mid.y + normal.y * offset
  };
  const inv = 1 - t;
  return {
    x: inv * inv * start.x + 2 * inv * t * control.x + t * t * end.x,
    y: inv * inv * start.y + 2 * inv * t * control.y + t * t * end.y
  };
}

function normalizeCornerRecord(corners, fallback){
  const source = corners || {};
  const result = {};
  ["tl", "tr", "br", "bl"].forEach(key => {
    const point = source[key] || fallback[key];
    result[key] = {
      x: clamp(Number(point?.x) || 0, -0.25, 1.25),
      y: clamp(Number(point?.y) || 0, -0.25, 1.25)
    };
  });
  return result;
}

function cloneCorners(corners){
  return {
    tl: { ...corners.tl },
    tr: { ...corners.tr },
    br: { ...corners.br },
    bl: { ...corners.bl }
  };
}

function quadCenter(corners){
  return {
    x: (corners.tl.x + corners.tr.x + corners.br.x + corners.bl.x) / 4,
    y: (corners.tl.y + corners.tr.y + corners.br.y + corners.bl.y) / 4
  };
}

function norm(x, y, canvasW, canvasH){
  return {
    x: x / Math.max(1, canvasW),
    y: y / Math.max(1, canvasH)
  };
}

function denorm(point, canvasW, canvasH){
  return {
    x: point.x * canvasW,
    y: point.y * canvasH
  };
}

function pointInPolygon(x, y, polygon){
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / Math.max(0.0001, yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function clamp(value, min, max){
  return Math.min(max, Math.max(min, Number(value) || 0));
}
