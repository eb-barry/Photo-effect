export async function shareCanvas(canvas, type = "image/jpeg", quality = 0.92){
  const blob = await canvasToBlob(canvas, type, quality);
  const extension = type === "image/png" ? "png" : "jpg";
  const file = new File([blob], `photo-effects-${Date.now()}.${extension}`, { type });

  if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
    await navigator.share({
      files: [file],
      title: "Photo Effects"
    });
    return true;
  }

  return false;
}

export async function downloadCanvas(canvas, type = "image/jpeg", quality = 0.92){
  const extension = type === "image/png" ? "png" : "jpg";
  const fileName = `photo-effects-${Date.now()}.${extension}`;
  const blob = await canvasToBlob(canvas, type, quality);

  if (!blob) {
    throw new Error("Canvas export failed");
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function canvasToBlob(canvas, type, quality){
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error("Unable to create image blob"));
    }, type, quality);
  });
}
