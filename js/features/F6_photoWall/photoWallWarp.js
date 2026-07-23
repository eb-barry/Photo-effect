// F6 照片牆 - 透視／弧形網格變形 (Phase 2A/2B)

export const WARP_GRID_COLS = 14;
export const WARP_GRID_ROWS = 14;
export const HANDLE_HIT_RADIUS = 36;
export const HANDLE_VISUAL_RADIUS = 13;
export const HANDLE_EDGE_VISUAL_RADIUS = 14;

export const WARP_POINT_DEFS = [
  { id: "pointA", handle: "tl", kind: "corner", label: "A 左上角", letter: "A" },
  { id: "pointB", handle: "tr", kind: "corner", label: "B 右上角", letter: "B" },
  { id: "pointC", handle: "br", kind: "corner", label: "C 右下角", letter: "C" },
  { id: "pointD", handle: "bl", kind: "corner", label: "D 左下角", letter: "D" },
  { id: "pointE", handle: "top", kind: "edge", label: "E 上緣弧形", letter: "E" },
  { id: "pointF", handle: "right", kind: "edge", label: "F 右緣弧形", letter: "F" },
  { id: "pointG", handle: "bottom", kind: "edge", label: "G 下緣弧形", letter: "G" },
  { id: "pointH", handle: "left", kind: "edge", label: "H 左緣弧形", letter: "H" }
];

export const HANDLE_LETTERS = Object.fromEntries(
  WARP_POINT_DEFS.map(item => [item.handle, item.letter])
);

const HANDLE_IDS = WARP_POINT_DEFS.map(item => item.handle);

export function createDefaultPerspective(){
  return {
    customized: false,
    corners: null,
    edgeCurve: { top: 0, right: 0, bottom: 0, left: 0 }
  };
}

export function createDefaultEdgeCurve(){
  return { top: 0, right: 0, bottom: 0, left: 0 };
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

export function mergeCornerRecord(perspectiveCorners, baseCorners){
  const source = perspectiveCorners || {};
  return {
    tl: { ...(source.tl || baseCorners.tl) },
    tr: { ...(source.tr || baseCorners.tr) },
    br: { ...(source.br || baseCorners.br) },
    bl: { ...(source.bl || baseCorners.bl) }
  };
}

export function resolvePhotoCorners(photo, image, canvasW, canvasH){
  const placement = computePlacementQuad(photo, image, canvasW, canvasH);
  if (!photo.perspective?.customized) {
    return cloneCorners(placement);
  }
  return normalizeCornerRecord(mergeCornerRecord(photo.perspective.corners, placement), placement);
}

export function resolvePhotoEdgeCurve(photo){
  const curve = photo.perspective?.edgeCurve || {};
  return {
    top: clamp(Number(curve.top) || 0, -100, 100),
    right: clamp(Number(curve.right) || 0, -100, 100),
    bottom: clamp(Number(curve.bottom) || 0, -100, 100),
    left: clamp(Number(curve.left) || 0, -100, 100)
  };
}

export function getWarpPointDef(parameterId){
  return WARP_POINT_DEFS.find(item => item.id === parameterId) || WARP_POINT_DEFS[0];
}

export function getPerspectiveParameterValue(photo, parameterId, baseCorners){
  const def = getWarpPointDef(parameterId);
  const corners = mergeCornerRecord(photo.perspective?.corners, baseCorners);
  if (def.kind === "corner") {
    return getCornerPullValue(corners, baseCorners, def.handle);
  }
  const edgeCurve = resolvePhotoEdgeCurve(photo);
  return Math.round(edgeCurve[def.handle] || 0);
}

export function applyPerspectiveParameterValue(photo, parameterId, value, baseCorners){
  const def = getWarpPointDef(parameterId);
  const perspective = normalizePerspectiveRecord(photo.perspective, baseCorners);
  const corners = mergeCornerRecord(perspective.corners, baseCorners);
  const edgeCurve = { ...perspective.edgeCurve };

  if (def.kind === "corner") {
    setCornerPullValue(corners, baseCorners, def.handle, value);
  } else {
    edgeCurve[def.handle] = clamp(value, -100, 100);
  }

  return {
    customized: true,
    corners,
    edgeCurve
  };
}

export function applyPerspectiveParameterDelta(photo, parameterId, delta, baseCorners){
  const current = getPerspectiveParameterValue(photo, parameterId, baseCorners);
  const def = getWarpPointDef(parameterId);
  const next = def.kind === "corner"
    ? clamp(current + delta, -100, 100)
    : clamp(current + delta, -100, 100);
  return applyPerspectiveParameterValue(photo, parameterId, next, baseCorners);
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
  const left = quadraticEdge(tl, bl, edgeCurve.left, v);
  const right = quadraticEdge(tr, br, edgeCurve.right, v);
  const topLine = bilinear(tl, tr, bl, br, u, 0);
  const bottomLine = bilinear(tl, tr, bl, br, u, 1);

  return {
    x: (1 - v) * top.x + v * bottom.x + (1 - u) * left.x + u * right.x - ((1 - v) * topLine.x + v * bottomLine.x),
    y: (1 - v) * top.y + v * bottom.y + (1 - u) * left.y + u * right.y - ((1 - v) * topLine.y + v * bottomLine.y)
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
  return {
    tl: cornersPx.tl,
    tr: cornersPx.tr,
    br: cornersPx.br,
    bl: cornersPx.bl,
    top: quadraticEdge(cornersPx.tl, cornersPx.tr, edgeCurve.top, 0.5),
    right: quadraticEdge(cornersPx.tr, cornersPx.br, edgeCurve.right, 0.5),
    bottom: quadraticEdge(cornersPx.bl, cornersPx.br, edgeCurve.bottom, 0.5),
    left: quadraticEdge(cornersPx.tl, cornersPx.bl, edgeCurve.left, 0.5)
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
  if (photo.perspective?.customized) return true;
  const curve = resolvePhotoEdgeCurve(photo);
  return curve.top !== 0 || curve.right !== 0 || curve.bottom !== 0 || curve.left !== 0;
}

export function drawWarpedPhoto(ctx, image, corners, edgeCurve, canvasW, canvasH, options = {}){
  const cornersPx = cornersToCanvas(corners, canvasW, canvasH);
  const curve = {
    top: edgeCurve?.top || 0,
    right: edgeCurve?.right || 0,
    bottom: edgeCurve?.bottom || 0,
    left: edgeCurve?.left || 0
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
  const curve = resolvePhotoEdgeCurve({ perspective: { edgeCurve } });
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
  const showLabels = style.showLabels !== false;

  ctx.save();
  Object.entries(handles).forEach(([id, pt]) => {
    const isEdge = id === "top" || id === "right" || id === "bottom" || id === "left";
    const radius = isEdge ? edgeRadius : cornerRadius;
    ctx.beginPath();
    ctx.fillStyle = isEdge ? "#2f55d4" : "#0abab5";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2.5;
    ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (showLabels && HANDLE_LETTERS[id]) {
      ctx.fillStyle = "#fff";
      ctx.font = `800 ${Math.max(11, radius + 1)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(HANDLE_LETTERS[id], pt.x, pt.y + 0.5);
    }
  });
  ctx.restore();
}

export function computeEdgeCurveFromPoint(cornersPx, handleId, pointPx){
  const pairs = {
    top: [cornersPx.tl, cornersPx.tr],
    right: [cornersPx.tr, cornersPx.br],
    bottom: [cornersPx.bl, cornersPx.br],
    left: [cornersPx.tl, cornersPx.bl]
  };
  const [start, end] = pairs[handleId] || pairs.top;
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const len = Math.hypot(end.x - start.x, end.y - start.y);
  if (len < 1) return 0;
  const nx = -(end.y - start.y) / len;
  const ny = (end.x - start.x) / len;
  const offset = (pointPx.x - mid.x) * nx + (pointPx.y - mid.y) * ny;
  return clamp((offset / (len * 0.42)) * 100, -100, 100);
}

export function buildCustomizedPerspective(photo, baseCorners, partial = {}){
  const corners = mergeCornerRecord(partial.corners || photo.perspective?.corners, baseCorners);
  const edgeCurve = {
    ...createDefaultEdgeCurve(),
    ...resolvePhotoEdgeCurve(photo),
    ...(partial.edgeCurve || {})
  };
  return normalizePerspectiveRecord({ customized: true, corners, edgeCurve }, baseCorners);
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

export function normalizePerspectiveRecord(perspective, baseCorners){
  const source = perspective || {};
  const next = {
    customized: Boolean(source.customized),
    corners: null,
    edgeCurve: {
      ...createDefaultEdgeCurve(),
      ...resolvePhotoEdgeCurve({ perspective: source })
    }
  };
  if (next.customized && baseCorners) {
    next.corners = normalizeCornerRecord(mergeCornerRecord(source.corners, baseCorners), baseCorners);
  }
  return next;
}

function getCornerPullValue(corners, baseCorners, cornerKey){
  const center = quadCenter(baseCorners);
  const base = baseCorners[cornerKey];
  const current = corners[cornerKey];
  const baseDist = Math.hypot(base.x - center.x, base.y - center.y);
  if (baseDist < 0.0001) return 0;
  const curDist = Math.hypot(current.x - center.x, current.y - center.y);
  return Math.round(((curDist / baseDist) - 1) * 100);
}

function setCornerPullValue(corners, baseCorners, cornerKey, pullPercent){
  const center = quadCenter(baseCorners);
  const base = baseCorners[cornerKey];
  const dx = base.x - center.x;
  const dy = base.y - center.y;
  const dist = Math.hypot(dx, dy) * (1 + pullPercent / 100);
  if (dist < 0.0001) {
    corners[cornerKey] = { ...base };
    return;
  }
  const angle = Math.atan2(dy, dx);
  corners[cornerKey] = {
    x: clamp(center.x + Math.cos(angle) * dist, -0.25, 1.25),
    y: clamp(center.y + Math.sin(angle) * dist, -0.25, 1.25)
  };
}

function bilinear(tl, tr, bl, br, u, v){
  return {
    x: (1 - u) * (1 - v) * tl.x + u * (1 - v) * tr.x + (1 - u) * v * bl.x + u * v * br.x,
    y: (1 - u) * (1 - v) * tl.y + u * (1 - v) * tr.y + (1 - u) * v * bl.y + u * v * br.y
  };
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
