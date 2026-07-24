// F7 3D 展館 - Three.js 場景與陀螺儀環視

import * as THREE from "https://esm.sh/three@0.170.0";

const ROOM_SIZE = 22;
const WALL_HALF = ROOM_SIZE / 2;
const EYE_HEIGHT = 1.65;
const WALL_USABLE_WIDTH = ROOM_SIZE - 2.4;
const WALL_USABLE_HEIGHT = 3.6;
const FRAME_DEPTH = 0.06;
const FRAME_BORDER = 0.08;

const WALL_DEFS = [
  { id: "north", axis: "z", sign: -1, rotY: 0 },
  { id: "east", axis: "x", sign: 1, rotY: -Math.PI / 2 },
  { id: "south", axis: "z", sign: 1, rotY: Math.PI },
  { id: "west", axis: "x", sign: -1, rotY: Math.PI / 2 }
];

function frameSizeForAspect(aspect){
  if (aspect === "4x3") return { width: 1.55, height: 1.16 };
  return { width: 0.92, height: 1.16 };
}

function packWallPlacements(photos){
  const gap = 0.34;
  const placements = [];
  let row = [];
  let rowWidth = 0;
  let rowCenterY = 3.35;

  const flushRow = () => {
    if (!row.length) return;
    const totalWidth = row.reduce((sum, item, index) => sum + item.width + (index ? gap : 0), 0);
    let cursor = -totalWidth / 2;
    row.forEach(item => {
      placements.push({
        photo: item.photo,
        width: item.width,
        height: item.height,
        x: cursor + item.width / 2,
        y: rowCenterY
      });
      cursor += item.width + gap;
    });
    row = [];
    rowWidth = 0;
    rowCenterY -= 1.42;
  };

  photos.forEach(photo => {
    const size = frameSizeForAspect(photo.aspect);
    const needed = row.length ? gap + size.width : size.width;
    if (rowWidth + needed > WALL_USABLE_WIDTH && row.length) flushRow();
    row.push({ photo, width: size.width, height: size.height });
    rowWidth += needed;
  });
  flushRow();
  return placements;
}

function splitPhotosAcrossWalls(photos){
  const chunks = [[], [], [], []];
  photos.forEach((photo, index) => {
    chunks[index % 4].push(photo);
  });
  return chunks;
}

function createWallMaterial(){
  return new THREE.MeshStandardMaterial({
    color: 0xf4f1ea,
    roughness: 0.92,
    metalness: 0.02
  });
}

function createSurfaceTexture(sourceCanvas, repeatX, repeatY){
  const texture = new THREE.CanvasTexture(sourceCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function createFrameMesh(width, height, texture){
  const group = new THREE.Group();

  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0x2a2118,
    roughness: 0.55,
    metalness: 0.08
  });

  const outer = new THREE.Mesh(
    new THREE.BoxGeometry(width + FRAME_BORDER * 2, height + FRAME_BORDER * 2, FRAME_DEPTH),
    frameMaterial
  );
  group.add(outer);

  const picture = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
  );
  picture.position.z = FRAME_DEPTH * 0.51;
  group.add(picture);

  return group;
}

class LookControls {
  constructor(camera, domElement){
    this.camera = camera;
    this.domElement = domElement;
    this.enabled = true;
    this.gyroEnabled = false;
    this.smoothing = 0.08;
    this.pointerSensitivity = 0.0032;

    this.yaw = 0;
    this.pitch = 0;
    this.targetYaw = 0;
    this.targetPitch = 0;

    this._pointerActive = false;
    this._lastX = 0;
    this._lastY = 0;
    this._euler = new THREE.Euler(0, 0, 0, "YXZ");
    this._quat = new THREE.Quaternion();
    this._orientQuat = new THREE.Quaternion();
    this._orientBaseline = null;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onOrient = this._onOrient.bind(this);

    domElement.addEventListener("pointerdown", this._onPointerDown);
    window.addEventListener("pointerup", this._onPointerUp);
    window.addEventListener("pointercancel", this._onPointerUp);
    window.addEventListener("pointermove", this._onPointerMove);
  }

  async requestGyroPermission(){
    if (typeof DeviceOrientationEvent !== "undefined"
      && typeof DeviceOrientationEvent.requestPermission === "function") {
      const permission = await DeviceOrientationEvent.requestPermission();
      return permission === "granted";
    }
    return true;
  }

  async enableGyro(){
    const ok = await this.requestGyroPermission();
    if (!ok) return false;
    window.addEventListener("deviceorientation", this._onOrient, true);
    this.gyroEnabled = true;
    this._orientBaseline = null;
    return true;
  }

  disableGyro(){
    window.removeEventListener("deviceorientation", this._onOrient, true);
    this.gyroEnabled = false;
    this._orientBaseline = null;
    this.targetYaw = this.yaw;
    this.targetPitch = this.pitch;
  }

  resetView(){
    this.yaw = 0;
    this.pitch = 0;
    this.targetYaw = 0;
    this.targetPitch = 0;
    this._orientBaseline = null;
    this.camera.rotation.set(0, 0, 0);
    this.camera.quaternion.set(0, 0, 0, 1);
  }

  dispose(){
    this.disableGyro();
    this.domElement.removeEventListener("pointerdown", this._onPointerDown);
    window.removeEventListener("pointerup", this._onPointerUp);
    window.removeEventListener("pointercancel", this._onPointerUp);
    window.removeEventListener("pointermove", this._onPointerMove);
  }

  _onPointerDown(event){
    if (!this.enabled || this.gyroEnabled) return;
    this._pointerActive = true;
    this._lastX = event.clientX;
    this._lastY = event.clientY;
    this.domElement.setPointerCapture?.(event.pointerId);
  }

  _onPointerUp(){
    this._pointerActive = false;
  }

  _onPointerMove(event){
    if (!this.enabled || this.gyroEnabled || !this._pointerActive) return;
    const dx = event.clientX - this._lastX;
    const dy = event.clientY - this._lastY;
    this._lastX = event.clientX;
    this._lastY = event.clientY;
    this.targetYaw -= dx * this.pointerSensitivity;
    this.targetPitch -= dy * this.pointerSensitivity;
    this.targetPitch = THREE.MathUtils.clamp(this.targetPitch, -0.75, 0.75);
  }

  _onOrient(event){
    if (!this.enabled || !this.gyroEnabled) return;
    if (!this._orientBaseline) {
      this._orientBaseline = {
        alpha: event.alpha || 0,
        beta: event.beta || 0,
        gamma: event.gamma || 0
      };
      return;
    }

    const alpha = THREE.MathUtils.degToRad((event.alpha || 0) - this._orientBaseline.alpha);
    const beta = THREE.MathUtils.degToRad(
      THREE.MathUtils.clamp((event.beta || 0) - this._orientBaseline.beta, -35, 35)
    );
    const gamma = THREE.MathUtils.degToRad((event.gamma || 0) - this._orientBaseline.gamma);

    this._euler.set(
      THREE.MathUtils.clamp(beta, -0.7, 0.7),
      alpha,
      THREE.MathUtils.clamp(-gamma, -0.45, 0.45),
      "YXZ"
    );
    this._orientQuat.setFromEuler(this._euler);
    this.camera.quaternion.slerp(this._orientQuat, this.smoothing);
  }

  update(){
    if (!this.enabled) return;
    if (this.gyroEnabled) return;

    this.yaw = THREE.MathUtils.lerp(this.yaw, this.targetYaw, this.smoothing);
    this.pitch = THREE.MathUtils.lerp(this.pitch, this.targetPitch, this.smoothing);
    this._euler.set(this.pitch, this.yaw, 0, "YXZ");
    this._quat.setFromEuler(this._euler);
    this.camera.quaternion.slerp(this._quat, this.smoothing);
  }
}

export class Gallery3DScene {
  constructor(container){
    this.container = container;
    this.photos = [];
    this._textures = [];
    this._roomTextures = [];
    this._frameGroups = [];
    this._roomMeshes = { floor: null, ceiling: null, walls: [] };
    this._animationId = 0;
    this._resizeObserver = null;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance"
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x0d1218, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = "gallery3d-canvas";
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0d1218, 14, 34);

    this.camera = new THREE.PerspectiveCamera(68, 1, 0.1, 80);
    this.camera.position.set(0, EYE_HEIGHT, 0);

    this.controls = new LookControls(this.camera, this.renderer.domElement);
    this._buildRoom();
    this._buildLights();
    this.resize();
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(this.container);
  }

  _buildRoom(){
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM_SIZE + 2, ROOM_SIZE + 2),
      new THREE.MeshStandardMaterial({ color: 0x6f5848, roughness: 0.88, metalness: 0.04 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    this.scene.add(floor);
    this._roomMeshes.floor = floor;

    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM_SIZE + 2, ROOM_SIZE + 2),
      new THREE.MeshStandardMaterial({ color: 0xece7de, roughness: 0.95, metalness: 0 })
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 4.8;
    this.scene.add(ceiling);
    this._roomMeshes.ceiling = ceiling;

    const wallMaterial = createWallMaterial();
    WALL_DEFS.forEach(wall => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_SIZE, 4.8), wallMaterial.clone());
      if (wall.axis === "z") {
        mesh.position.set(0, 2.4, wall.sign * WALL_HALF);
        mesh.rotation.y = wall.rotY;
      } else {
        mesh.position.set(wall.sign * WALL_HALF, 2.4, 0);
        mesh.rotation.y = wall.rotY;
      }
      this.scene.add(mesh);
      this._roomMeshes.walls.push(mesh);
    });

    const baseboard = new THREE.MeshStandardMaterial({ color: 0xd9d2c6, roughness: 0.8 });
    WALL_DEFS.forEach(wall => {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(ROOM_SIZE, 0.18, 0.08), baseboard);
      if (wall.axis === "z") {
        strip.position.set(0, 0.09, wall.sign * (WALL_HALF - 0.05));
      } else {
        strip.position.set(wall.sign * (WALL_HALF - 0.05), 0.09, 0);
      }
      this.scene.add(strip);
    });
  }

  _disposeRoomTextures(){
    this._roomTextures.forEach(texture => texture.dispose());
    this._roomTextures = [];
  }

  setRoomTextures(roomTextures){
    this._disposeRoomTextures();
    if (!roomTextures) return;

    const { wallCanvas, floorCanvas, wallAspect, floorAspect } = roomTextures;
    const wallRepeatX = Math.max(1.5, ROOM_SIZE / Math.max(wallAspect * 2.2, 1));
    const wallRepeatY = Math.max(1, 4.8 / 2.4);
    const floorRepeat = Math.max(2, ROOM_SIZE / Math.max((floorAspect || 1) * 2.5, 1));

    const wallTexture = createSurfaceTexture(wallCanvas, wallRepeatX, wallRepeatY);
    const floorTexture = createSurfaceTexture(floorCanvas, floorRepeat, floorRepeat);
    this._roomTextures.push(wallTexture, floorTexture);

    const wallMaterial = new THREE.MeshStandardMaterial({
      map: wallTexture,
      roughness: 0.9,
      metalness: 0.02
    });
    const floorMaterial = new THREE.MeshStandardMaterial({
      map: floorTexture,
      roughness: 0.82,
      metalness: 0.04
    });

    this._roomMeshes.walls.forEach(mesh => {
      mesh.material.dispose();
      mesh.material = wallMaterial.clone();
      mesh.material.map = wallTexture;
    });

    if (this._roomMeshes.floor) {
      this._roomMeshes.floor.material.dispose();
      this._roomMeshes.floor.material = floorMaterial;
    }

    if (this.scene.fog) {
      const sample = floorCanvas.getContext("2d")?.getImageData(0, 0, 1, 1)?.data;
      if (sample) {
        const fogColor = new THREE.Color(
          sample[0] / 255,
          sample[1] / 255,
          sample[2] / 255
        ).multiplyScalar(0.42);
        this.scene.fog.color.copy(fogColor);
        this.renderer.setClearColor(fogColor, 1);
      }
    }
  }

  _buildLights(){
    this.scene.add(new THREE.HemisphereLight(0xfff4e8, 0x4a4038, 0.72));
    const ambient = new THREE.AmbientLight(0xffffff, 0.22);
    this.scene.add(ambient);

    const spots = [
      [0, 3.8, -6],
      [6, 3.8, 0],
      [0, 3.8, 6],
      [-6, 3.8, 0]
    ];
    spots.forEach(([x, y, z]) => {
      const light = new THREE.PointLight(0xfff1dd, 28, 18, 2);
      light.position.set(x, y, z);
      this.scene.add(light);
    });
  }

  _clearFrames(){
    this._frameGroups.forEach(group => {
      this.scene.remove(group);
      group.traverse(node => {
        if (node.geometry) node.geometry.dispose();
        if (node.material) {
          if (Array.isArray(node.material)) node.material.forEach(mat => mat.dispose());
          else node.material.dispose();
        }
      });
    });
    this._frameGroups = [];

    this._textures.forEach(texture => texture.dispose());
    this._textures = [];
  }

  async setPhotos(photos){
    this.photos = photos;
    this._clearFrames();
    if (!photos.length) return;

    const loader = new THREE.TextureLoader();
    const wallChunks = splitPhotosAcrossWalls(photos);

    for (let wallIndex = 0; wallIndex < WALL_DEFS.length; wallIndex += 1) {
      const wall = WALL_DEFS[wallIndex];
      const chunk = wallChunks[wallIndex];
      if (!chunk.length) continue;

      const placements = packWallPlacements(chunk);
      for (const placement of placements) {
        const texture = await loader.loadAsync(placement.photo.textureDataUrl);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        this._textures.push(texture);

        const frame = createFrameMesh(placement.width, placement.height, texture);
        const inset = WALL_HALF - FRAME_DEPTH;

        if (wall.axis === "z") {
          frame.position.set(placement.x, placement.y, wall.sign * inset);
          frame.rotation.y = wall.rotY;
        } else {
          frame.position.set(wall.sign * inset, placement.y, placement.x);
          frame.rotation.y = wall.rotY;
        }

        this.scene.add(frame);
        this._frameGroups.push(frame);
      }
    }
  }

  async enableGyro(){
    return this.controls.enableGyro();
  }

  disableGyro(){
    this.controls.disableGyro();
  }

  resetView(){
    this.controls.resetView();
  }

  start(){
    if (this._animationId) return;
    const tick = () => {
      this._animationId = requestAnimationFrame(tick);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  stop(){
    if (!this._animationId) return;
    cancelAnimationFrame(this._animationId);
    this._animationId = 0;
  }

  resize(){
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  dispose(){
    this.stop();
    this._resizeObserver?.disconnect();
    this._clearFrames();
    this._disposeRoomTextures();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
