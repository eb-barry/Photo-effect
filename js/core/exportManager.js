export async function shareCanvas(canvas, type = "image/jpeg", quality = 0.92){
  const blob = await canvasToBlob(canvas, type, quality);
  const extension = type === "image/png" ? "png" : "jpg";
  const file = new File([blob], `photo-effects-${Date.now()}.${extension}`, { type });
  if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: "Photo Effects" }); return true; }
  return false;
}
export async function downloadCanvas(canvas, type = "image/jpeg", quality = 0.92){
  const extension = type === "image/png" ? "png" : "jpg";
  const blob = await canvasToBlob(canvas, type, quality);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = `photo-effects-${Date.now()}.${extension}`; link.rel = "noopener";
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}
function canvasToBlob(canvas, type, quality){ return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Canvas export failed")), type, quality)); }
