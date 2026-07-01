export class MirrorTool {
  constructor(canvasManager){
    this.canvasManager = canvasManager;
  }

  render(sourceCanvas, state){
    const canvas = this.canvasManager.canvas;
    const ctx = this.canvasManager.ctx;
    const width = sourceCanvas.width;
    const height = sourceCanvas.height;

    this.canvasManager.setSize(width, height);
    this.canvasManager.resetTransform();
    this.canvasManager.clear();

    if (state.mode === "horizontal") {
      this.renderHorizontal(ctx, sourceCanvas, width, height, state);
    } else if (state.mode === "vertical") {
      this.renderVertical(ctx, sourceCanvas, width, height, state);
    } else if (state.mode === "reflection") {
      this.renderReflection(ctx, sourceCanvas, width, height, state, false);
    } else {
      this.renderReflection(ctx, sourceCanvas, width, height, state, true);
    }
  }

  renderHorizontal(ctx, source, width, height, state){
    const axisX = Math.round(width * state.axis / 100);

    ctx.drawImage(source, 0, 0);

    ctx.save();
    ctx.globalAlpha = state.blend / 100;
    ctx.beginPath();
    ctx.rect(axisX, 0, width - axisX, height);
    ctx.clip();

    ctx.translate(axisX * 2, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(source, 0, 0);
    ctx.restore();

    this.drawGuideLine(ctx, axisX, 0, axisX, height);
  }

  renderVertical(ctx, source, width, height, state){
    const axisY = Math.round(height * state.axis / 100);

    ctx.drawImage(source, 0, 0);

    ctx.save();
    ctx.globalAlpha = state.blend / 100;
    ctx.beginPath();
    ctx.rect(0, axisY, width, height - axisY);
    ctx.clip();

    ctx.translate(0, axisY * 2);
    ctx.scale(1, -1);
    ctx.drawImage(source, 0, 0);
    ctx.restore();

    this.drawGuideLine(ctx, 0, axisY, width, axisY);
  }

  renderReflection(ctx, source, width, height, state, withRipple){
    const axisY = Math.round(height * state.axis / 100);

    ctx.drawImage(source, 0, 0);

    const reflectionHeight = height - axisY;
    if (reflectionHeight <= 0) return;

    const temp = document.createElement("canvas");
    temp.width = width;
    temp.height = reflectionHeight;

    const tctx = temp.getContext("2d", { willReadFrequently: true });

    tctx.save();
    tctx.translate(0, reflectionHeight);
    tctx.scale(1, -1);
    tctx.drawImage(
      source,
      0,
      Math.max(0, axisY - reflectionHeight),
      width,
      reflectionHeight,
      0,
      0,
      width,
      reflectionHeight
    );
    tctx.restore();

    if (withRipple && state.ripple > 0) {
      this.applyRipple(temp, state.ripple, state.density);
    }

    const mask = document.createElement("canvas");
    mask.width = width;
    mask.height = reflectionHeight;
    const mctx = mask.getContext("2d");

    mctx.drawImage(temp, 0, 0);
    mctx.globalCompositeOperation = "destination-in";

    const gradient = mctx.createLinearGradient(0, 0, 0, reflectionHeight);
    gradient.addColorStop(0, `rgba(0,0,0,${state.blend / 100})`);
    gradient.addColorStop(1, "rgba(0,0,0,0)");

    mctx.fillStyle = gradient;
    mctx.fillRect(0, 0, width, reflectionHeight);

    ctx.drawImage(mask, 0, axisY);

    this.drawGuideLine(ctx, 0, axisY, width, axisY);
  }

  applyRipple(canvas, strength, density){
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const width = canvas.width;
    const height = canvas.height;

    const source = ctx.getImageData(0, 0, width, height);
    const output = ctx.createImageData(width, height);

    const src = source.data;
    const dst = output.data;

    for (let y = 0; y < height; y++) {
      const fade = 1 - y / height;
      const offset = Math.round(
        Math.sin(y / density * Math.PI * 2) * strength * fade
      );

      for (let x = 0; x < width; x++) {
        const sx = clamp(x + offset, 0, width - 1);

        const srcIndex = (y * width + sx) * 4;
        const dstIndex = (y * width + x) * 4;

        dst[dstIndex] = src[srcIndex];
        dst[dstIndex + 1] = src[srcIndex + 1];
        dst[dstIndex + 2] = src[srcIndex + 2];
        dst[dstIndex + 3] = src[srcIndex + 3];
      }
    }

    ctx.putImageData(output, 0, 0);
  }

  drawGuideLine(ctx, x1, y1, x2, y2){
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,.82)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(0,0,0,.32)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
}

function clamp(value, min, max){
  return Math.max(min, Math.min(max, value));
}
