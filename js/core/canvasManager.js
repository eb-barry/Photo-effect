export class CanvasManager {
  constructor(canvas){
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { willReadFrequently: true });
  }

  setSize(width, height){
    this.canvas.width = Math.round(width);
    this.canvas.height = Math.round(height);
  }

  clear(){
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  resetTransform(){
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.globalAlpha = 1;
    this.ctx.globalCompositeOperation = "source-over";
    this.ctx.filter = "none";
  }
}
