export async function downloadCanvas(canvas, type = "image/jpeg", quality = 0.92){
  const extension = type === "image/png" ? "png" : "jpg";
  const fileName = `photo-editor-${Date.now()}.${extension}`;

  const blob = await canvasToBlob(canvas, type, quality);

  if (navigator.canShare && navigator.share) {
    const file = new File([blob], fileName, { type });

    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: "Photo Editor",
          text: "匯出的圖片"
        });
        return;
      } catch (error) {
        if (error.name === "AbortError") return;
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function canvasToBlob(canvas, type, quality){
  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), type, quality);
  });
}
