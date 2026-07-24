// F7 3D 展館 - Three.js 多房間場景、行走、畫作縮放、門口切換

import * as THREE from "https://esm.sh/three@0.170.0";
import {
  DOOR_HEIGHT,
  DOOR_WIDTH,
  EYE_HEIGHT,
  ROUND_ROOM_RADIUS,
  ROOM_WALL_HEIGHT,
  SQUARE_ROOM_SIZE,
  findDoorwayTarget,
  getRoomDefinition,
  getSpawnPose
} from "./gallery3dRooms.js";

const FRAME_DEPTH = 0.06;
const FRAME_BORDER = 0.08;

function frameSizeForAspect(aspect){
  if (aspect === "4x3") return { width: 1.35, height: 1.02 };
  return { width: 0.82, height: 1.02 };
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

function createFrameMesh(width, height, texture, photoId){
  const group = new THREE.Group();
  group.userData = { type: "artwork", photoId, zoomed: false };

  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0x2a2118,
    roughness: 0.55,
    metalness: 0.08
  });
  group.add(new THREE.Mesh(
    new THREE.BoxGeometry(width + FRAME_BORDER * 2, height + FRAME_BORDER * 2, FRAME_DEPTH),
    frameMaterial
  ));

  const picture = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
  );
  picture.position.z = FRAME_DEPTH * 0.51;
  picture.userData = { type: "artwork", photoId };
  group.add(picture);

  return group;
}

class RoomControls {
  constructor(camera, domElement){
    this.camera = camera;
    this.domElement = domElement;
    this.enabled = true;
    this.locked = false;
    this.gyroEnabled = false;
    this.smoothing = 0.1;
    this.pointerSensitivity = 0.003;
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
      return (await DeviceOrientationEvent.requestPermission()) === "granted";
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
  }

  setOrientation(yaw, pitch){
    this.yaw = yaw;
    this.pitch = pitch;
    this.targetYaw = yaw;
    this.targetPitch = pitch;
    this._applyCameraRotation();
  }

  resetView(){
    this.yaw = 0;
    this.pitch = 0;
    this.targetYaw = 0;
    this.targetPitch = 0;
    this._orientBaseline = null;
    this._applyCameraRotation();
  }

  dispose(){
    this.disableGyro();
    this.domElement.removeEventListener("pointerdown", this._onPointerDown);
    window.removeEventListener("pointerup", this._onPointerUp);
    window.removeEventListener("pointercancel", this._onPointerUp);
    window.removeEventListener("pointermove", this._onPointerMove);
  }

  _applyCameraRotation(){
    this._euler.set(this.pitch, this.yaw, 0, "YXZ");
    this._quat.setFromEuler(this._euler);
    this.camera.quaternion.copy(this._quat);
  }

  _onPointerDown(event){
    if (!this.enabled || this.gyroEnabled || this.locked) return;
    this._pointerActive = true;
    this._lastX = event.clientX;
    this._lastY = event.clientY;
    this.domElement.setPointerCapture?.(event.pointerId);
  }

  _onPointerUp(){
    this._pointerActive = false;
  }

  _onPointerMove(event){
    if (!this.enabled || this.gyroEnabled || !this._pointerActive || this.locked) return;
    const dx = event.clientX - this._lastX;
    const dy = event.clientY - this._lastY;
    this._lastX = event.clientX;
    this._lastY = event.clientY;
    this.targetYaw -= dx * this.pointerSensitivity;
    this.targetPitch -= dy * this.pointerSensitivity;
    this.targetPitch = THREE.MathUtils.clamp(this.targetPitch, -0.65, 0.65);
  }

  _onOrient(event){
    if (!this.enabled || !this.gyroEnabled || this.locked) return;
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
      THREE.MathUtils.clamp((event.beta || 0) - this._orientBaseline.beta, -30, 30)
    );
    const gamma = THREE.MathUtils.degToRad((event.gamma || 0) - this._orientBaseline.gamma);
    this._euler.set(
      THREE.MathUtils.clamp(beta, -0.55, 0.55),
      alpha,
      THREE.MathUtils.clamp(-gamma, -0.35, 0.35),
      "YXZ"
    );
    this._orientQuat.setFromEuler(this._euler);
    this.camera.quaternion.slerp(this._orientQuat, this.smoothing);
  }

  update(){
    if (!this.enabled || this.locked) return;
    if (this.gyroEnabled) return;
    this.yaw = THREE.MathUtils.lerp(this.yaw, this.targetYaw, this.smoothing);
    this.pitch = THREE.MathUtils.lerp(this.pitch, this.targetPitch, this.smoothing);
    this._applyCameraRotation();
  }
}

export class Gallery3DScene {
  constructor(container, callbacks = {}){
    this.container = container;
    this.callbacks = callbacks;
    this.currentRoomId = 1;
    this.interactionEnabled = false;
    this._textures = [];
    this._roomTextures = [];
    this._roomGroup = new THREE.Group();
    this._artworkGroups = [];
    this._clickables = [];
    this._animationId = 0;
    this._cameraTween = null;
    this._zoomedArtworkId = null;
    this._returnPose = null;
    this._zoomAnimating = false;
    this._hadGyroBeforeZoom = false;
    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();
    this._resizeObserver = null;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance"
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x10141a, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = "gallery3d-canvas";
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x10141a, 10, 28);
    this.scene.add(this._roomGroup);

    this.camera = new THREE.PerspectiveCamera(68, 1, 0.1, 60);
    this.controls = new RoomControls(this.camera, this.renderer.domElement);
    this._buildLights();
    this._bindInteraction();
    this.resize();
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(this.container);
  }

  _buildLights(){
    this.scene.add(new THREE.HemisphereLight(0xfff4e8, 0x4a4038, 0.7));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.2));
    const spot = new THREE.PointLight(0xfff1dd, 24, 16, 2);
    spot.position.set(0, ROOM_WALL_HEIGHT - 0.4, 0);
    this.scene.add(spot);
  }

  _bindInteraction(){
    this._onCanvasClick = this._onCanvasClick.bind(this);
    this.renderer.domElement.addEventListener("click", this._onCanvasClick);
  }

  _disposeRoom(){
    this._clearArtworks();
    this._disposeRoomTextures();
    while (this._roomGroup.children.length) {
      const child = this._roomGroup.children[0];
      this._roomGroup.remove(child);
      child.traverse(node => {
        if (node.geometry) node.geometry.dispose();
        if (node.material) {
          if (Array.isArray(node.material)) node.material.forEach(mat => mat.dispose());
          else node.material.dispose();
        }
      });
    }
    this._clickables = [];
  }

  _disposeRoomTextures(){
    this._roomTextures.forEach(texture => texture.dispose());
    this._roomTextures = [];
  }

  _clearArtworks(){
    this._artworkGroups = [];
    this._textures.forEach(texture => texture.dispose());
    this._textures = [];
    this._zoomedArtworkId = null;
    this._returnPose = null;
    this._zoomAnimating = false;
    this.controls.locked = false;
  }

  async loadRoom({
    roomId,
    surfaceTextures,
    photos = [],
    fromRoomId = null,
    interactionEnabled = true
  }){
    this._disposeRoom();
    this.currentRoomId = Number(roomId);
    this.interactionEnabled = interactionEnabled;
    const room = getRoomDefinition(roomId);

    if (room.shape === "round") {
      this._buildRoundRoom(surfaceTextures, room);
      await this._hangPhotosOnRoundWall(photos);
    } else {
      this._buildSquareRoom(surfaceTextures, room);
      await this._hangPhotosOnSquareWalls(photos, room);
    }

    const spawn = getSpawnPose(roomId, fromRoomId);
    this.camera.position.set(spawn.x, spawn.y, spawn.z);
    this.controls.setOrientation(spawn.yaw, 0);
  }

  _applySurfaceMaterials(surfaceTextures, wallMeshes, floorMesh, options = {}){
    if (!surfaceTextures) return;
    const { wallRepeatScale = 1, unlitWalls = false, wallRepeat } = options;
    const { wallCanvas, floorCanvas } = surfaceTextures;
    const wallRepeatX = wallRepeat?.x ?? Math.max(1.5, 4 * wallRepeatScale);
    const wallRepeatY = wallRepeat?.y ?? Math.max(1, ROOM_WALL_HEIGHT / 2.2);
    const wallTexture = createSurfaceTexture(wallCanvas, wallRepeatX, wallRepeatY);
    const floorTexture = createSurfaceTexture(
      floorCanvas,
      Math.max(2, 6 * wallRepeatScale),
      Math.max(2, 6 * wallRepeatScale)
    );
    this._roomTextures.push(wallTexture, floorTexture);

    const wallMaterial = unlitWalls
      ? new THREE.MeshBasicMaterial({ map: wallTexture, side: THREE.BackSide })
      : new THREE.MeshStandardMaterial({
        map: wallTexture,
        roughness: 0.9,
        metalness: 0.02
      });
    wallMeshes.forEach(mesh => {
      mesh.material = wallMaterial.clone();
      mesh.material.map = wallTexture;
      if (unlitWalls) mesh.material.side = THREE.BackSide;
    });

    if (floorMesh) {
      floorMesh.material = new THREE.MeshStandardMaterial({
        map: floorTexture,
        roughness: 0.84,
        metalness: 0.04
      });
    }
  }

  _buildSquareRoom(surfaceTextures, room){
    const size = SQUARE_ROOM_SIZE;
    const half = size / 2;
    const wallMeshes = [];

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({ color: 0x6f5848 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.userData = { type: "floor" };
    this._roomGroup.add(floor);
    this._clickables.push(floor);

    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({ color: 0xece7de, roughness: 0.95 })
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = ROOM_WALL_HEIGHT;
    this._roomGroup.add(ceiling);

    const wallDefs = [
      { side: "north", pos: [0, ROOM_WALL_HEIGHT / 2, -half], rotY: 0, skipDoor: false },
      { side: "south", pos: [0, ROOM_WALL_HEIGHT / 2, half], rotY: Math.PI, skipDoor: false },
      { side: "west", pos: [-half, ROOM_WALL_HEIGHT / 2, 0], rotY: -Math.PI / 2, skipDoor: false },
      { side: "east", pos: [half, ROOM_WALL_HEIGHT / 2, 0], rotY: Math.PI / 2, skipDoor: false }
    ];

    wallDefs.forEach(def => {
      const doorway = room.doorways.find(item => item.side === def.side);
      if (doorway) {
        this._addWallWithDoor(def, size, doorway, wallMeshes);
      } else {
        const wall = new THREE.Mesh(
          new THREE.PlaneGeometry(size, ROOM_WALL_HEIGHT),
          new THREE.MeshStandardMaterial({ color: 0xf4f1ea })
        );
        wall.position.set(...def.pos);
        wall.rotation.y = def.rotY;
        this._roomGroup.add(wall);
        wallMeshes.push(wall);
      }
    });

    this._applySurfaceMaterials(surfaceTextures, wallMeshes, floor, { wallRepeatScale: 1 });
  }

  _createWallPlane(width, height){
    return new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshStandardMaterial({ color: 0xf4f1ea })
    );
  }

  _createDoorHitbox(doorway){
    const door = new THREE.Mesh(
      new THREE.PlaneGeometry(DOOR_WIDTH, DOOR_HEIGHT),
      new THREE.MeshBasicMaterial({
        color: 0x6a7a88,
        transparent: true,
        opacity: 0.14,
        depthWrite: false
      })
    );
    door.userData = { type: "door", doorwayId: doorway.id, targetRoomId: doorway.targetRoomId };
    this._roomGroup.add(door);
    this._clickables.push(door);
    return door;
  }

  _addWallWithDoor(def, roomSize, doorway, wallMeshes){
    const half = roomSize / 2;
    const segmentWidth = (roomSize - DOOR_WIDTH) / 2;
    const lintelHeight = ROOM_WALL_HEIGHT - DOOR_HEIGHT;
    const wallCenterY = ROOM_WALL_HEIGHT / 2;
    const lintelCenterY = DOOR_HEIGHT + lintelHeight / 2;
    const doorCenterY = DOOR_HEIGHT / 2;
    const inset = 0.03;

    const left = this._createWallPlane(segmentWidth, ROOM_WALL_HEIGHT);
    const right = this._createWallPlane(segmentWidth, ROOM_WALL_HEIGHT);
    const lintel = this._createWallPlane(DOOR_WIDTH, lintelHeight);
    const door = this._createDoorHitbox(doorway);

    if (def.side === "east" || def.side === "west") {
      const x = def.side === "east" ? half : -half;
      const rotY = def.side === "east" ? Math.PI / 2 : -Math.PI / 2;
      const leftZ = def.side === "east"
        ? -(segmentWidth / 2 + DOOR_WIDTH / 2)
        : (segmentWidth / 2 + DOOR_WIDTH / 2);
      const rightZ = def.side === "east"
        ? (segmentWidth / 2 + DOOR_WIDTH / 2)
        : -(segmentWidth / 2 + DOOR_WIDTH / 2);
      left.position.set(x, wallCenterY, leftZ);
      right.position.set(x, wallCenterY, rightZ);
      lintel.position.set(x, lintelCenterY, 0);
      door.position.set(def.side === "east" ? half - inset : -half + inset, doorCenterY, 0);
      left.rotation.y = rotY;
      right.rotation.y = rotY;
      lintel.rotation.y = rotY;
      door.rotation.y = rotY;
    } else {
      const z = def.side === "north" ? -half : half;
      const rotY = def.side === "north" ? 0 : Math.PI;
      const leftX = def.side === "north"
        ? -(segmentWidth / 2 + DOOR_WIDTH / 2)
        : (segmentWidth / 2 + DOOR_WIDTH / 2);
      const rightX = def.side === "north"
        ? (segmentWidth / 2 + DOOR_WIDTH / 2)
        : -(segmentWidth / 2 + DOOR_WIDTH / 2);
      left.position.set(leftX, wallCenterY, z);
      right.position.set(rightX, wallCenterY, z);
      lintel.position.set(0, lintelCenterY, z);
      door.position.set(0, doorCenterY, def.side === "north" ? -half + inset : half - inset);
      left.rotation.y = rotY;
      right.rotation.y = rotY;
      lintel.rotation.y = rotY;
      door.rotation.y = rotY;
    }

    this._roomGroup.add(left, right, lintel);
    wallMeshes.push(left, right, lintel);
  }

  _buildRoundRoom(surfaceTextures, room){
    const radius = ROUND_ROOM_RADIUS;
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, ROOM_WALL_HEIGHT, 48, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xf4f1ea, side: THREE.BackSide })
    );
    wall.position.y = ROOM_WALL_HEIGHT / 2;
    this._roomGroup.add(wall);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 48),
      new THREE.MeshStandardMaterial({ color: 0x6f5848 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.userData = { type: "floor" };
    this._roomGroup.add(floor);
    this._clickables.push(floor);

    const ceiling = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 48),
      new THREE.MeshStandardMaterial({ color: 0xece7de, roughness: 0.95 })
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = ROOM_WALL_HEIGHT;
    this._roomGroup.add(ceiling);

    room.doorways.forEach(doorway => {
      const angle = doorway.angle || 0;
      const x = Math.sin(angle) * (radius - 0.05);
      const z = Math.cos(angle) * (radius - 0.05);
      const door = this._createDoorHitbox(doorway);
      door.position.set(x, DOOR_HEIGHT / 2, z);
      door.rotation.y = angle;
    });

    const circumference = 2 * Math.PI * radius;
    this._applySurfaceMaterials(surfaceTextures, [wall], floor, {
      wallRepeatScale: 1.2,
      unlitWalls: true,
      wallRepeat: {
        x: circumference / 2.4,
        y: ROOM_WALL_HEIGHT / 2.4
      }
    });
  }

  async _hangPhotosOnSquareWalls(photos, room){
    if (!photos.length) return;
    const loader = new THREE.TextureLoader();
    const walls = [
      { rotY: 0, z: -(SQUARE_ROOM_SIZE / 2 - 0.08), axis: "x" },
      { rotY: Math.PI, z: SQUARE_ROOM_SIZE / 2 - 0.08, axis: "x" },
      { rotY: -Math.PI / 2, x: -(SQUARE_ROOM_SIZE / 2 - 0.08), axis: "z" }
    ].filter(wall => !room.doorways.some(door => (
      (door.side === "east" && wall.rotY === Math.PI / 2)
      || (door.side === "west" && wall.rotY === -Math.PI / 2)
    )));

    const chunks = walls.map(() => []);
    photos.forEach((photo, index) => {
      chunks[index % walls.length].push(photo);
    });

    for (let wallIndex = 0; wallIndex < walls.length; wallIndex += 1) {
      const wall = walls[wallIndex];
      const chunk = chunks[wallIndex];
      let cursor = -((chunk.length - 1) * 1.2) / 2;
      for (const photo of chunk) {
        const size = frameSizeForAspect(photo.aspect);
        const texture = await loader.loadAsync(photo.textureDataUrl);
        texture.colorSpace = THREE.SRGBColorSpace;
        this._textures.push(texture);
        const frame = createFrameMesh(size.width, size.height, texture, photo.id);
        if (wall.axis === "x") {
          frame.position.set(cursor, 2.2, wall.z);
          frame.rotation.y = wall.rotY;
        } else {
          frame.position.set(wall.x, 2.2, cursor);
          frame.rotation.y = wall.rotY;
        }
        this._roomGroup.add(frame);
        this._artworkGroups.push(frame);
        this._clickables.push(frame, ...frame.children);
        cursor += size.width + 0.35;
      }
    }
  }

  async _hangPhotosOnRoundWall(photos){
    if (!photos.length) return;
    const loader = new THREE.TextureLoader();
    const radius = ROUND_ROOM_RADIUS - 0.1;
    const span = Math.PI * 1.35;
    const start = -span / 2;

    for (let index = 0; index < photos.length; index += 1) {
      const photo = photos[index];
      const angle = start + (span * index) / Math.max(photos.length - 1, 1);
      const size = frameSizeForAspect(photo.aspect);
      const texture = await loader.loadAsync(photo.textureDataUrl);
      texture.colorSpace = THREE.SRGBColorSpace;
      this._textures.push(texture);
      const frame = createFrameMesh(size.width, size.height, texture, photo.id);
      frame.position.set(Math.sin(angle) * radius, 2.2, Math.cos(angle) * radius);
      frame.rotation.y = angle;
      this._roomGroup.add(frame);
      this._artworkGroups.push(frame);
      this._clickables.push(frame, ...frame.children);
    }
  }

  _onCanvasClick(event){
    if (!this.interactionEnabled || this._zoomAnimating) return;

    if (this._zoomedArtworkId) {
      this._zoomOutArtwork();
      return;
    }

    const rect = this.renderer.domElement.getBoundingClientRect();
    this._pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this._pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._pointer, this.camera);
    const hits = this._raycaster.intersectObjects(this._clickables, false);
    if (!hits.length) return;

    const target = hits[0].object;
    const data = target.userData || {};
    if (data.type === "floor") {
      this._walkToward(hits[0].point);
      return;
    }
    if (data.type === "door") {
      this.callbacks.onDoorwaySelected?.({
        doorwayId: data.doorwayId,
        targetRoomId: data.targetRoomId
      });
      return;
    }
    if (data.type === "artwork") {
      const photoId = data.photoId;
      const group = this._artworkGroups.find(item => item.userData.photoId === photoId);
      if (group) this._zoomInArtwork(group);
    }
  }

  _walkToward(point){
    if (this._zoomedArtworkId) return;
    const next = point.clone();
    next.y = EYE_HEIGHT;
    const dx = next.x - this.camera.position.x;
    const dz = next.z - this.camera.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.2) return;
    const maxStep = 1.8;
    const scale = Math.min(1, maxStep / distance);
    const target = new THREE.Vector3(
      this.camera.position.x + dx * scale,
      EYE_HEIGHT,
      this.camera.position.z + dz * scale
    );
    this._animateCameraPosition(target, 500);
  }

  _clampCameraToRoom(position){
    const room = getRoomDefinition(this.currentRoomId);
    if (room.shape === "round") {
      const maxRadius = ROUND_ROOM_RADIUS - 0.85;
      const distance = Math.hypot(position.x, position.z);
      if (distance > maxRadius) {
        const scale = maxRadius / distance;
        position.x *= scale;
        position.z *= scale;
      }
      return position;
    }

    const half = SQUARE_ROOM_SIZE / 2 - 0.85;
    position.x = THREE.MathUtils.clamp(position.x, -half, half);
    position.z = THREE.MathUtils.clamp(position.z, -half, half);
    return position;
  }

  _getRoomCenter(){
    return new THREE.Vector3(0, EYE_HEIGHT, 0);
  }

  _getArtworkFocus(group){
    const worldPos = new THREE.Vector3();
    group.getWorldPosition(worldPos);
    const roomCenter = this._getRoomCenter();
    const box = new THREE.Box3().setFromObject(group);
    const size = new THREE.Vector3();
    box.getSize(size);
    const artSize = Math.max(size.x, size.y, 0.8);
    const yaw = Math.atan2(worldPos.x - roomCenter.x, worldPos.z - roomCenter.z);
    const horizontal = Math.hypot(worldPos.x - roomCenter.x, worldPos.z - roomCenter.z);
    const pitch = THREE.MathUtils.clamp(
      Math.atan2((worldPos.y + 0.05) - roomCenter.y, horizontal),
      -0.22,
      0.22
    );
    const targetFov = 36;
    const distance = (artSize * 0.56) / Math.tan(THREE.MathUtils.degToRad(targetFov / 2));
    const inward = new THREE.Vector3().subVectors(roomCenter, worldPos);
    inward.y = 0;
    if (inward.lengthSq() < 0.01) inward.set(0, 0, 1);
    inward.normalize();
    const targetPos = worldPos.clone().add(inward.multiplyScalar(distance));
    targetPos.y = THREE.MathUtils.lerp(EYE_HEIGHT, worldPos.y, 0.35);
    this._clampCameraToRoom(targetPos);
    return { worldPos, roomCenter, yaw, pitch, targetFov, targetPos };
  }

  _zoomInArtwork(group){
    const photoId = group.userData.photoId;
    this._returnPose = {
      position: this.camera.position.clone(),
      yaw: this.controls.yaw,
      pitch: this.controls.pitch,
      fov: this.camera.fov
    };

    const focus = this._getArtworkFocus(group);
    this._zoomedArtworkId = photoId;
    group.userData.zoomed = true;
    this.controls.locked = true;
    this._hadGyroBeforeZoom = this.controls.gyroEnabled;
    if (this._hadGyroBeforeZoom) this.controls.disableGyro();
    this.callbacks.onArtworkZoomChange?.(photoId);

    this._animateCameraState({
      position: focus.roomCenter.clone(),
      yaw: focus.yaw,
      pitch: focus.pitch,
      fov: this._returnPose.fov
    }, {
      position: focus.targetPos,
      yaw: focus.yaw,
      pitch: focus.pitch,
      fov: focus.targetFov
    }, 1050, () => {
      this._zoomAnimating = false;
      this.controls.setOrientation(focus.yaw, focus.pitch);
    });
  }

  _zoomOutArtwork(){
    if (!this._returnPose) {
      this._zoomedArtworkId = null;
      this.controls.locked = false;
      this.callbacks.onArtworkZoomChange?.(null);
      return;
    }

    const group = this._artworkGroups.find(item => item.userData.photoId === this._zoomedArtworkId);
    const returnPose = this._returnPose;
    this._zoomAnimating = true;

    this._animateCameraState({
      position: this.camera.position.clone(),
      yaw: this.controls.yaw,
      pitch: this.controls.pitch,
      fov: this.camera.fov
    }, {
      position: returnPose.position,
      yaw: returnPose.yaw,
      pitch: returnPose.pitch,
      fov: returnPose.fov
    }, 900, () => {
      this._zoomedArtworkId = null;
      this._returnPose = null;
      this._zoomAnimating = false;
      this.controls.locked = false;
      if (this._hadGyroBeforeZoom) {
        this.enableGyro();
        this._hadGyroBeforeZoom = false;
      }
      if (group) group.userData.zoomed = false;
      this.controls.setOrientation(returnPose.yaw, returnPose.pitch);
      this.callbacks.onArtworkZoomChange?.(null);
    });
  }

  _animateCameraState(fromState, toState, duration, onComplete){
    const startTime = performance.now();
    this._zoomAnimating = true;
    const step = now => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;

      this.camera.position.lerpVectors(fromState.position, toState.position, eased);
      const nextYaw = THREE.MathUtils.lerp(fromState.yaw, toState.yaw, eased);
      const nextPitch = THREE.MathUtils.lerp(fromState.pitch, toState.pitch, eased);
      this.camera.fov = THREE.MathUtils.lerp(fromState.fov, toState.fov, eased);
      this.camera.updateProjectionMatrix();
      this.controls.setOrientation(nextYaw, nextPitch);

      if (t < 1) {
        this._cameraTween = requestAnimationFrame(step);
      } else {
        this._cameraTween = null;
        onComplete?.();
      }
    };
    if (this._cameraTween) cancelAnimationFrame(this._cameraTween);
    this._cameraTween = requestAnimationFrame(step);
  }

  _animateCameraPosition(targetPosition, duration){
    const start = this.camera.position.clone();
    const startTime = performance.now();
    const step = now => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      this.camera.position.lerpVectors(start, targetPosition, eased);
      if (t < 1) this._cameraTween = requestAnimationFrame(step);
      else this._cameraTween = null;
    };
    if (this._cameraTween) cancelAnimationFrame(this._cameraTween);
    this._cameraTween = requestAnimationFrame(step);
  }

  _animateCameraPose(targetPosition, yaw, pitch, duration){
    const startPos = this.camera.position.clone();
    const startYaw = this.controls.yaw;
    const startPitch = this.controls.pitch;
    const startTime = performance.now();
    const step = now => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      this.camera.position.lerpVectors(startPos, targetPosition, eased);
      const nextYaw = THREE.MathUtils.lerp(startYaw, yaw, eased);
      const nextPitch = THREE.MathUtils.lerp(startPitch, pitch, eased);
      this.controls.setOrientation(nextYaw, nextPitch);
      if (t < 1) this._cameraTween = requestAnimationFrame(step);
      else this._cameraTween = null;
    };
    if (this._cameraTween) cancelAnimationFrame(this._cameraTween);
    this._cameraTween = requestAnimationFrame(step);
  }

  async enableGyro(){
    return this.controls.enableGyro();
  }

  disableGyro(){
    this.controls.disableGyro();
  }

  resetView(){
    if (this._zoomedArtworkId) {
      this._zoomOutArtwork();
      return;
    }
    this._returnPose = null;
    const spawn = getSpawnPose(this.currentRoomId);
    this.camera.fov = 68;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(spawn.x, spawn.y, spawn.z);
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
    if (this._cameraTween) cancelAnimationFrame(this._cameraTween);
    this.renderer.domElement.removeEventListener("click", this._onCanvasClick);
    this._resizeObserver?.disconnect();
    this._disposeRoom();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

export { findDoorwayTarget };
