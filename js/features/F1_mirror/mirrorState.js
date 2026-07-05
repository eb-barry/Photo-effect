const MIRROR_STATE_KEY = "photoEffectsMirrorState";
const DB_NAME = "PhotoEffectsDraftDB";
const DB_VERSION = 1;
const STORE_NAME = "drafts";
const MIRROR_IMAGE_KEY = "F1_mirror_source_image";

export function loadMirrorState(){
  try {
    const saved = JSON.parse(localStorage.getItem(MIRROR_STATE_KEY) || "{}");
    return {
      mode: saved.mode === "reflection" ? "water" : (saved.mode || "water"),
      leftOffset: Number(saved.leftOffset ?? 0),
      rightOffset: Number(saved.rightOffset ?? 0),
      opacity: Number(saved.opacity ?? saved.blend ?? 75),
      ripple: Number(saved.ripple ?? 18),
      density: Number(saved.density ?? 24),
      sliderTarget: saved.sliderTarget || "rightOffset"
    };
  } catch {
    return getDefaultMirrorState();
  }
}

export function getDefaultMirrorState(){
  return {
    mode: "water",
    leftOffset: 0,
    rightOffset: 0,
    opacity: 75,
    ripple: 18,
    density: 24,
    sliderTarget: "rightOffset"
  };
}

export function saveMirrorState(state){
  const saved = {
    mode: state.mode,
    leftOffset: state.leftOffset,
    rightOffset: state.rightOffset,
    opacity: state.opacity,
    ripple: state.ripple,
    density: state.density,
    sliderTarget: state.sliderTarget
  };
  localStorage.setItem(MIRROR_STATE_KEY, JSON.stringify(saved));
}

export async function saveMirrorDraft(state){
  saveMirrorState(state);
  if (!state.source?.imageCanvas) return;

  const blob = await canvasToBlob(state.source.imageCanvas, "image/png");
  await putDraft(MIRROR_IMAGE_KEY, {
    blob,
    width: state.source.width,
    height: state.source.height,
    updatedAt: Date.now()
  });
}

export async function loadMirrorDraftImage(){
  const record = await getDraft(MIRROR_IMAGE_KEY);
  if (!record?.blob) return null;

  const bitmap = await createImageBitmap(record.blob);
  const canvas = document.createElement("canvas");
  canvas.width = record.width || bitmap.width;
  canvas.height = record.height || bitmap.height;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  return {
    imageCanvas: canvas,
    width: canvas.width,
    height: canvas.height,
    originalName: "restored-draft.png"
  };
}

function canvasToBlob(canvas, type){
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error("Unable to save draft image"));
    }, type);
  });
}

function openDB(){
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putDraft(key, value){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function getDraft(key){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
