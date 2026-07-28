// F7 3D 展館 - Three.js 多房間場景、行走、門口切換（圓形展間使用曲面畫框）

import * as THREE from "https://esm.sh/three@0.170.0";
import {
  DOOR_HEIGHT,
  DOOR_WIDTH,
  EYE_HEIGHT,
  ROUND_ROOM_MAX_WALL_PHOTOS,
  ROUND_ROOM_RADIUS,
  ROOM_WALL_HEIGHT,
  SQUARE_ROOM_SIZE,
  findDoorwayTarget,
  getRoomDefinition,
  getRoundWallInwardNormal,
  getSpawnPose,
  getWallInwardNormal
} from "./gallery3dRooms.js";
import { bakeGalleryFramedTexture } from "./gallery3dFrames.js";

const FRAME_DEPTH = 0.06;
const WALL_STEP_BACK_DISTANCE = 1.15;
const DOOR_FRAME_PADDING = 0.12;
const DOOR_FRAME_WIDTH = DOOR_WIDTH + DOOR_FRAME_PADDING;
const DOOR_FRAME_HEIGHT = DOOR_HEIGHT + DOOR_FRAME_PADDING;
const ROUND_WALL_FRAME_SCALE = 0.95;
const ROUND_WALL_FRAME_MIN_SCALE = 0.62;
const ROUND_WALL_FRAME_GAP = 0.22;
const ROUND_WALL_MIN_FRAME_GAP = 0.12;
const ROUND_WALL_DOOR_SIDE_MARGIN = 0.55;

function getRoundWallDoorBlockHalfArc(hangRadius){
  return (DOOR_FRAME_WIDTH / hangRadius) + ROUND_WALL_DOOR_SIDE_MARGIN;
}
const WALL_FRAME_GAP = 0.45;
const WALL_HANG_HEIGHT = 2.2;
const WALL_HANG_HEIGHT_WITH_DOOR = 2.55;
const PHOTO_FOCUS_WIDTH_FILL = 0.98; // fill ~98% of screen width
const PHOTO_FOCUS_MIN_DISTANCE = 0.55;
const PHOTO_FOCUS_MAX_DISTANCE = 4.5;

const FRAME_SCALE = 1.5;

function frameSizeForPhoto(photo, { roundWall = false, roundWallScale = ROUND_WALL_FRAME_SCALE } = {}){
  const legacyWidth = photo?.aspect === "4x3" ? 4 : 3;
  const legacyHeight = photo?.aspect === "4x3" ? 3 : 4;
  const sourceWidth = Number(photo?.width) > 0 ? Number(photo.width) : legacyWidth;
  const sourceHeight = Number(photo?.height) > 0 ? Number(photo.height) : legacyHeight;
  const ratio = sourceWidth / sourceHeight;
  const scale = roundWall ? roundWallScale : 1;
  const maxHeight = 1.02 * FRAME_SCALE * scale;
  const maxWidth = 1.35 * FRAME_SCALE * scale;

  let width;
  let height;
  if (ratio >= 1) {
    width = maxWidth;
    height = width / ratio;
    if (height > maxHeight) {
      height = maxHeight;
      width = height * ratio;
    }
  } else {
    height = maxHeight;
    width = height * ratio;
    if (width > maxWidth) {
      width = maxWidth;
      height = width / ratio;
    }
  }

  return { width, height };
}

function computeRoundWallFitScale(frameCount, segmentSpan, hangRadius){
  if (!frameCount || segmentSpan <= 0) return ROUND_WALL_FRAME_SCALE;

  const gaps = Math.max(0, frameCount - 1);
  const availableArc = segmentSpan - gaps * ROUND_WALL_MIN_FRAME_GAP;
  if (availableArc <= 0) return ROUND_WALL_FRAME_MIN_SCALE;

  // Prefer near-square-room visual size; only shrink when the arc is crowded.
  // Use ~85% of max landscape width as a mixed-aspect packing estimate.
  const typicalFrameWidth = 1.35 * FRAME_SCALE * 0.85;
  const fitScale = (availableArc * hangRadius) / (frameCount * typicalFrameWidth);
  return Math.min(
    ROUND_WALL_FRAME_SCALE,
    Math.max(ROUND_WALL_FRAME_MIN_SCALE, fitScale)
  );
}

function splitPhotosEvenly(photos, bucketCount){
  const buckets = Array.from({ length: bucketCount }, () => []);
  photos.forEach((photo, index) => {
    buckets[index % bucketCount].push(photo);
  });
  return buckets;
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

function createDoorTexture(sourceCanvas){
  const texture = new THREE.CanvasTexture(sourceCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

const _inwardVector = new THREE.Vector3();
const _planeFacing = new THREE.Vector3(0, 0, 1);

function alignMeshFacing(mesh, normal){
  _inwardVector.set(normal.x, normal.y, normal.z).normalize();
  mesh.quaternion.setFromUnitVectors(_planeFacing, _inwardVector);
}

function createFrameMesh(width, height, texture, photoId){
  const group = new THREE.Group();
  group.userData = { type: "artwork", photoId, artWidth: width, artHeight: height };

  const picture = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      toneMapped: false,
      side: THREE.DoubleSide
    })
  );
  picture.position.z = FRAME_DEPTH * 0.5;
  picture.userData = { type: "artwork", photoId };
  group.add(picture);
  group.userData.pictureMesh = picture;

  const hitPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  hitPlane.position.z = FRAME_DEPTH * 0.52;
  hitPlane.userData = { type: "artwork", photoId };
  group.add(hitPlane);

  return group;
}

function createCurvedFrameGeometry(width, height, surfaceRadius, centerAngle, hangY){
  const angularWidth = width / surfaceRadius;
  const widthSegments = Math.max(
    12,
    Math.min(48, Math.ceil(angularWidth * 32))
  );
  const geometry = new THREE.PlaneGeometry(width, height, widthSegments, 1);
  const position = geometry.attributes.position;

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const theta = centerAngle + x / surfaceRadius;
    position.setXYZ(
      index,
      Math.sin(theta) * surfaceRadius,
      hangY + y,
      Math.cos(theta) * surfaceRadius
    );
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function createCurvedFrameMesh(width, height, texture, photoId, surfaceRadius, centerAngle, hangY, slotIndex){
  const group = new THREE.Group();
  group.userData = { type: "artwork", photoId, artWidth: width, artHeight: height };

  const geometry = createCurvedFrameGeometry(width, height, surfaceRadius, centerAngle, hangY);
  const picture = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      toneMapped: false,
      side: THREE.DoubleSide
    })
  );
  picture.renderOrder = 10 + slotIndex;
  picture.userData = { type: "artwork", photoId };
  group.add(picture);
  group.userData.pictureMesh = picture;

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
    if (this.gyroEnabled) return true;
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
    this._cameraAnimating = false;
    this._doorTexture = null;
    this._entryFromRoomId = null;
    this._frameSettings = null;
    this._focusedPhotoId = null;
    this._focusReturnPosition = null;
    this._focusLockedGyro = false;
    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();
    this._resizeObserver = null;
    this._focusTarget = new THREE.Vector3();
    this._focusNormal = new THREE.Vector3();
    this._tmpLook = new THREE.Vector3();

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

  _cancelCameraAnimation(){
    if (this._cameraTween) {
      cancelAnimationFrame(this._cameraTween);
      this._cameraTween = null;
    }
    this._cameraAnimating = false;
  }

  prepareForRoomTransition(){
    this._cancelCameraAnimation();
    this._clearPhotoFocusState();
    this.controls.locked = false;
  }

  _clearArtworks(){
    this._cancelCameraAnimation();
    this._clearPhotoFocusState();
    this._artworkGroups = [];
    this._textures.forEach(texture => texture.dispose());
    this._textures = [];
    this.controls.locked = false;
    this._doorTexture = null;
  }

  async loadRoom({
    roomId,
    surfaceTextures,
    photos = [],
    fromRoomId = null,
    interactionEnabled = true,
    frameSettings = null,
    doorTextureCanvas = null
  }){
    this.prepareForRoomTransition();
    this._disposeRoom();
    this._frameSettings = frameSettings;
    this.currentRoomId = Number(roomId);
    this._entryFromRoomId = fromRoomId;
    this.interactionEnabled = interactionEnabled;
    if (doorTextureCanvas) {
      this._doorTexture = createDoorTexture(doorTextureCanvas);
      this._textures.push(this._doorTexture);
    }
    const room = getRoomDefinition(roomId);

    if (room.shape === "round") {
      this._buildRoundRoom(surfaceTextures, room);
      await this._hangPhotosOnRoundWall(photos, room);
    } else {
      this._buildSquareRoom(surfaceTextures, room);
      await this._hangPhotosOnSquareWalls(photos, room);
    }

    const spawn = getSpawnPose(roomId, fromRoomId);
    this.camera.position.set(spawn.x, spawn.y, spawn.z);
    this.controls.setOrientation(spawn.yaw, 0);
  }

  _tagWallClickable(mesh){
    mesh.userData = { ...mesh.userData, type: "wall" };
    this._clickables.push(mesh);
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
      ? new THREE.MeshBasicMaterial({ map: wallTexture, side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({
        map: wallTexture,
        roughness: 0.9,
        metalness: 0.02,
        side: THREE.DoubleSide
      });
    wallMeshes.forEach(mesh => {
      mesh.material = wallMaterial.clone();
      mesh.material.map = wallTexture;
      if (unlitWalls) mesh.material.side = THREE.DoubleSide;
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
        wall.userData = { type: "wall" };
        this._roomGroup.add(wall);
        wallMeshes.push(wall);
      }
    });

    this._applySurfaceMaterials(surfaceTextures, wallMeshes, floor, {
      wallRepeatScale: 1,
      unlitWalls: true
    });
    wallMeshes.forEach(mesh => this._tagWallClickable(mesh));
  }

  _createWallPlane(width, height){
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshStandardMaterial({ color: 0xf4f1ea })
    );
    wall.userData = { type: "wall" };
    return wall;
  }

  _createDoorHitbox(doorway){
    const group = new THREE.Group();
    const doorData = {
      type: "door",
      doorwayId: doorway.id,
      targetRoomId: doorway.targetRoomId
    };
    group.userData = doorData;

    const doorMaterial = this._doorTexture
      ? new THREE.MeshBasicMaterial({
        map: this._doorTexture,
        transparent: true,
        toneMapped: false,
        side: THREE.DoubleSide
      })
      : new THREE.MeshBasicMaterial({
        color: 0xb8c8d8,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
        side: THREE.DoubleSide
      });

    const doorPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(DOOR_FRAME_WIDTH, DOOR_FRAME_HEIGHT),
      doorMaterial
    );
    doorPanel.userData = doorData;
    group.add(doorPanel);
    this._roomGroup.add(group);
    this._clickables.push(doorPanel);
    return group;
  }

  _placeDoorOnWall(door, def, roomSize){
    const half = roomSize / 2;
    const doorCenterY = DOOR_HEIGHT / 2;
    const inset = 0.12;
    const normal = getWallInwardNormal(def.side);

    if (def.side === "east" || def.side === "west") {
      const x = def.side === "east" ? half : -half;
      door.position.set(x + normal.x * inset, doorCenterY, 0);
    } else {
      const z = def.side === "north" ? -half : half;
      door.position.set(0, doorCenterY, z + normal.z * inset);
    }
    alignMeshFacing(door, normal);
  }

  _addWallWithDoor(def, roomSize, doorway, wallMeshes){
    const half = roomSize / 2;
    const segmentWidth = (roomSize - DOOR_WIDTH) / 2;
    const lintelHeight = ROOM_WALL_HEIGHT - DOOR_HEIGHT;
    const wallCenterY = ROOM_WALL_HEIGHT / 2;
    const lintelCenterY = DOOR_HEIGHT + lintelHeight / 2;
    const doorCenterY = DOOR_HEIGHT / 2;

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
      left.rotation.y = rotY;
      right.rotation.y = rotY;
      lintel.rotation.y = rotY;
    } else {
      const z = def.side === "north" ? -half : half;
      const rotY = def.side === "north" ? 0 : Math.PI;
      const leftX = -(segmentWidth / 2 + DOOR_WIDTH / 2);
      const rightX = (segmentWidth / 2 + DOOR_WIDTH / 2);
      left.position.set(leftX, wallCenterY, z);
      right.position.set(rightX, wallCenterY, z);
      lintel.position.set(0, lintelCenterY, z);
      left.rotation.y = rotY;
      right.rotation.y = rotY;
      lintel.rotation.y = rotY;
    }

    this._placeDoorOnWall(door, def, roomSize);

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
    wall.userData = { type: "wall" };
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
      const normal = getRoundWallInwardNormal(angle);
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius;
      const door = this._createDoorHitbox(doorway);
      door.position.set(
        x + normal.x * 0.12,
        DOOR_HEIGHT / 2,
        z + normal.z * 0.12
      );
      alignMeshFacing(door, normal);
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
    this._tagWallClickable(wall);
  }

  _getSquareWallDefinitions(){
    const half = SQUARE_ROOM_SIZE / 2;
    return [
      { side: "north", axis: "x", wallCoord: -half },
      { side: "south", axis: "x", wallCoord: half },
      { side: "east", axis: "z", wallCoord: half },
      { side: "west", axis: "z", wallCoord: -half }
    ];
  }

  _splitEvenly(items, buckets){
    const chunks = Array.from({ length: buckets }, () => []);
    items.forEach((item, index) => {
      chunks[index % buckets].push(item);
    });
    return chunks;
  }

  _getWallHangRanges(wall, room){
    const half = SQUARE_ROOM_SIZE / 2 - 0.55;
    const doorway = room.doorways.find(item => item.side === wall.side);
    if (!doorway) return [{ min: -half, max: half }];
    const gap = DOOR_FRAME_WIDTH / 2 + 0.42;
    return [
      { min: -half, max: -gap },
      { min: gap, max: half }
    ];
  }

  async _prepareFramedPhoto(photo, loader, { roundWall = false, roundWallScale = ROUND_WALL_FRAME_SCALE } = {}){
    const sourceTexture = await loader.loadAsync(photo.textureDataUrl);
    sourceTexture.colorSpace = THREE.SRGBColorSpace;
    const framedCanvas = await bakeGalleryFramedTexture(
      sourceTexture.image,
      this._frameSettings || {}
    );
    sourceTexture.dispose();
    const texture = new THREE.CanvasTexture(framedCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    this._textures.push(texture);
    return {
      photo,
      texture,
      size: frameSizeForPhoto(
        { width: framedCanvas.width, height: framedCanvas.height },
        { roundWall, roundWallScale }
      )
    };
  }

  _clampFrameCoord(coord, halfWidth, range){
    const margin = 0.08;
    const min = range.min + halfWidth + margin;
    const max = range.max - halfWidth - margin;
    if (min > max) return (range.min + range.max) / 2;
    return Math.min(max, Math.max(min, coord));
  }

  _layoutFramesInRange(prepared, range, gap = WALL_FRAME_GAP){
    if (!prepared.length) return [];

    const span = range.max - range.min;
    const totalWidth = prepared.reduce((sum, item, index) => (
      sum + item.size.width + (index > 0 ? gap : 0)
    ), 0);
    const effectiveGap = totalWidth > span && prepared.length > 1
      ? Math.max(0.12, (span - prepared.reduce((sum, item) => sum + item.size.width, 0)) / (prepared.length - 1))
      : gap;

    let cursor = range.min + span / 2 - totalWidth / 2;
    return prepared.map((item, index) => {
      if (index > 0) cursor += effectiveGap;
      const coord = this._clampFrameCoord(cursor + item.size.width / 2, item.size.width / 2, range);
      cursor = coord + item.size.width / 2;
      return { ...item, coord };
    });
  }

  async _placeFramesOnWall(wall, photos, loader, ranges, { hasDoorway = false } = {}){
    if (!photos.length) return;
    const perRange = this._splitEvenly(photos, ranges.length);
    const normal = getWallInwardNormal(wall.side);
    const surfaceInset = 0.12;
    const hangY = hasDoorway ? WALL_HANG_HEIGHT_WITH_DOOR : WALL_HANG_HEIGHT;

    for (let rangeIndex = 0; rangeIndex < ranges.length; rangeIndex += 1) {
      const range = ranges[rangeIndex];
      const chunk = perRange[rangeIndex];
      if (!chunk.length) continue;
      const prepared = [];
      for (const photo of chunk) {
        prepared.push(await this._prepareFramedPhoto(photo, loader));
      }
      const placed = this._layoutFramesInRange(prepared, range);
      for (const item of placed) {
        const { photo, texture, size, coord } = item;
        const frame = createFrameMesh(size.width, size.height, texture, photo.id);
        if (wall.axis === "x") {
          frame.position.set(coord, hangY, wall.wallCoord + normal.z * surfaceInset);
        } else {
          frame.position.set(wall.wallCoord + normal.x * surfaceInset, hangY, coord);
        }
        alignMeshFacing(frame, normal);
        this._registerArtwork(frame, {
          photoId: photo.id,
          artWidth: size.width,
          artHeight: size.height,
          normal
        });
        this._roomGroup.add(frame);
        this._artworkGroups.push(frame);
      }
    }
  }

  async _hangPhotosOnSquareWalls(photos, room){
    if (!photos.length) return;
    const loader = new THREE.TextureLoader();
    const walls = this._getSquareWallDefinitions();
    const wallChunks = this._splitEvenly(photos, walls.length);

    for (let wallIndex = 0; wallIndex < walls.length; wallIndex += 1) {
      const wall = walls[wallIndex];
      const chunk = wallChunks[wallIndex];
      if (!chunk.length) continue;
      const doorway = room.doorways.find(item => item.side === wall.side);
      const ranges = this._getWallHangRanges(wall, room);
      await this._placeFramesOnWall(wall, chunk, loader, ranges, { hasDoorway: Boolean(doorway) });
    }
  }

  _isAngleBlockedByDoor(angle, doorAngles, doorArc){
    return doorAngles.some(doorAngle => {
      let delta = angle - doorAngle;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      return Math.abs(delta) < doorArc;
    });
  }

  _getRoundWallFreeSegments(doorAngles, doorArc){
    const step = 0.03;
    const samples = [];
    for (let index = 0; index <= Math.ceil((Math.PI * 2) / step); index += 1) {
      const angle = -Math.PI + index * step;
      samples.push({
        angle,
        blocked: this._isAngleBlockedByDoor(angle, doorAngles, doorArc)
      });
    }

    const segments = [];
    let start = null;
    for (const sample of samples) {
      if (!sample.blocked && start === null) start = sample.angle;
      if (sample.blocked && start !== null) {
        segments.push({ start, end: sample.angle });
        start = null;
      }
    }
    if (start !== null) {
      segments.push({ start, end: Math.PI });
    }
    return segments.filter(segment => segment.end - segment.start > 0.2);
  }

  _layoutAnglesInSegment(segment, preparedFrames, hangRadius){
    let frames = preparedFrames;
    const span = segment.end - segment.start;
    if (!frames.length || span <= 0) return [];

    while (frames.length > 0) {
      const frameArcs = frames.map(item => item.size.width / hangRadius);
      const gaps = Math.max(0, frames.length - 1);
      let gap = ROUND_WALL_FRAME_GAP;
      let totalArc = frameArcs.reduce((sum, arc) => sum + arc, 0) + gap * gaps;

      if (totalArc <= span) {
        let cursor = segment.start + Math.max(0, (span - totalArc) / 2);
        const angles = [];
        for (let index = 0; index < frames.length; index += 1) {
          const arc = frameArcs[index];
          angles.push(cursor + arc / 2);
          cursor += arc + (index < frames.length - 1 ? gap : 0);
        }
        return angles;
      }

      if (gaps > 0) {
        gap = Math.max(
          ROUND_WALL_MIN_FRAME_GAP,
          (span - frameArcs.reduce((sum, arc) => sum + arc, 0)) / gaps
        );
        totalArc = frameArcs.reduce((sum, arc) => sum + arc, 0) + gap * gaps;
        if (totalArc <= span) {
          let cursor = segment.start + Math.max(0, (span - totalArc) / 2);
          const angles = [];
          for (let index = 0; index < frames.length; index += 1) {
            const arc = frameArcs[index];
            angles.push(cursor + arc / 2);
            cursor += arc + (index < frames.length - 1 ? gap : 0);
          }
          return angles;
        }
      }

      frames = frames.slice(0, -1);
    }

    return [];
  }

  _placeRoundWallFrame(prepared, angle, hangRadius, slotIndex){
    const { photo, texture, size } = prepared;
    const surfaceRadius = hangRadius - 0.02 - (slotIndex % 3) * 0.01;
    const frame = createCurvedFrameMesh(
      size.width,
      size.height,
      texture,
      photo.id,
      surfaceRadius,
      angle,
      WALL_HANG_HEIGHT,
      slotIndex
    );
    const normal = getRoundWallInwardNormal(angle);
    const focusPoint = {
      x: Math.sin(angle) * surfaceRadius,
      y: WALL_HANG_HEIGHT,
      z: Math.cos(angle) * surfaceRadius
    };
    this._registerArtwork(frame, {
      photoId: photo.id,
      artWidth: size.width,
      artHeight: size.height,
      normal,
      focusPoint
    });
    this._roomGroup.add(frame);
    this._artworkGroups.push(frame);
  }

  async _hangPhotosOnRoundWall(photos, room){
    const wallPhotos = photos.slice(0, ROUND_ROOM_MAX_WALL_PHOTOS);
    if (!wallPhotos.length) return;

    const loader = new THREE.TextureLoader();
    const radius = ROUND_ROOM_RADIUS - 0.1;
    const hangRadius = radius - 0.12;
    const doorAngles = room.doorways.map(item => item.angle || 0);
    const doorArc = getRoundWallDoorBlockHalfArc(hangRadius);
    const segments = this._getRoundWallFreeSegments(doorAngles, doorArc)
      .filter(segment => segment.end - segment.start > 0.55)
      .sort((a, b) => a.start - b.start);

    if (!segments.length) return;

    const buckets = splitPhotosEvenly(wallPhotos, segments.length);
    let slotIndex = 0;

    for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
      const chunk = buckets[segmentIndex];
      if (!chunk.length) continue;

      const segment = segments[segmentIndex];
      const segmentSpan = segment.end - segment.start;
      const fitScale = computeRoundWallFitScale(chunk.length, segmentSpan, hangRadius);
      const prepared = [];
      for (const photo of chunk) {
        prepared.push(await this._prepareFramedPhoto(photo, loader, {
          roundWall: true,
          roundWallScale: fitScale
        }));
      }

      const angles = this._layoutAnglesInSegment(segment, prepared, hangRadius);
      const placeCount = Math.min(prepared.length, angles.length);
      for (let index = 0; index < placeCount; index += 1) {
        this._placeRoundWallFrame(
          prepared[index],
          angles[index],
          hangRadius,
          slotIndex
        );
        slotIndex += 1;
      }
    }
  }

  _resolveInteractiveData(object){
    let node = object;
    while (node) {
      if (node.userData?.type) return node.userData;
      node = node.parent;
    }
    return {};
  }

  _setPointerFromEvent(event){
    const rect = this.renderer.domElement.getBoundingClientRect();
    this._pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this._pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._pointer, this.camera);
  }

  _onCanvasClick(event){
    if (!this.interactionEnabled || this._cameraAnimating) return;
    this._setPointerFromEvent(event);
    const hits = this._raycaster.intersectObjects(this._clickables, true);

    for (const hit of hits) {
      const data = this._resolveInteractiveData(hit.object);
      if (data.type === "artwork") {
        this._togglePhotoFocus(data.photoId);
        return;
      }
      if (data.type === "door") {
        if (this._focusedPhotoId) this._exitPhotoFocus({ keepView: true });
        this.callbacks.onDoorwaySelected?.({
          doorwayId: data.doorwayId,
          targetRoomId: data.targetRoomId
        });
        return;
      }
      if (data.type === "wall") {
        if (this._focusedPhotoId) {
          this._exitPhotoFocus({ keepView: true });
          return;
        }
        this._stepBackAlongView();
        return;
      }
      if (data.type === "floor") {
        if (this._focusedPhotoId) {
          this._exitPhotoFocus({ keepView: true });
          return;
        }
        this._walkToward(hit.point);
        return;
      }
    }
  }

  _registerArtwork(frame, {
    photoId,
    artWidth,
    artHeight,
    normal,
    focusPoint = null
  }){
    const normalVector = {
      x: Number(normal?.x) || 0,
      y: Number(normal?.y) || 0,
      z: Number(normal?.z) || 0
    };
    frame.userData = {
      ...frame.userData,
      type: "artwork",
      photoId,
      artWidth,
      artHeight,
      focusNormal: normalVector,
      focusPoint
    };

    frame.traverse(node => {
      if (!node.isMesh) return;
      node.userData = {
        ...node.userData,
        type: "artwork",
        photoId,
        artWidth,
        artHeight
      };
      this._clickables.push(node);
    });
  }

  _findArtworkGroup(photoId){
    return this._artworkGroups.find(group => group.userData?.photoId === photoId) || null;
  }

  _getArtworkFocusPose(frame){
    const artWidth = Number(frame.userData?.artWidth) || 1;
    const normal = frame.userData?.focusNormal || { x: 0, y: 0, z: 1 };
    this._focusNormal.set(normal.x, normal.y, normal.z).normalize();

    if (frame.userData?.focusPoint) {
      this._focusTarget.set(
        frame.userData.focusPoint.x,
        frame.userData.focusPoint.y,
        frame.userData.focusPoint.z
      );
    } else {
      frame.getWorldPosition(this._focusTarget);
    }

    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(this.camera.aspect, 0.01));
    let distance = (artWidth * 0.5) / Math.tan(hFov * 0.5);
    distance /= PHOTO_FOCUS_WIDTH_FILL;
    distance = THREE.MathUtils.clamp(distance, PHOTO_FOCUS_MIN_DISTANCE, PHOTO_FOCUS_MAX_DISTANCE);

    const position = this._focusTarget.clone().addScaledVector(this._focusNormal, distance);
    position.y = this._focusTarget.y;
    this._clampCameraToRoom(position);

    // Three.js cameras look down -Z at yaw=0, so forward is
    // (-sin(yaw), *, -cos(yaw)). Match that when aiming at the artwork.
    this._tmpLook.copy(this._focusTarget).sub(position);
    const yaw = Math.atan2(-this._tmpLook.x, -this._tmpLook.z);
    const planar = Math.hypot(this._tmpLook.x, this._tmpLook.z) || 0.0001;
    // Positive camera pitch tips the nose down; invert look.y accordingly.
    const pitch = THREE.MathUtils.clamp(Math.atan2(-this._tmpLook.y, planar), -0.65, 0.65);

    return { position, yaw, pitch, target: this._focusTarget.clone() };
  }

  _togglePhotoFocus(photoId){
    if (!photoId) return;
    if (this._focusedPhotoId === photoId) {
      this._exitPhotoFocus({ keepView: true });
      return;
    }
    this._enterPhotoFocus(photoId);
  }

  _enterPhotoFocus(photoId){
    const frame = this._findArtworkGroup(photoId);
    if (!frame) return;
    const pose = this._getArtworkFocusPose(frame);

    this._focusedPhotoId = photoId;
    this._focusReturnPosition = this.camera.position.clone();
    this._lockFocusLook(true);
    this._syncControlsFromCamera();

    this._animateCameraPose(pose.position, pose.yaw, pose.pitch, 650);
  }

  _syncControlsFromCamera(){
    const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, "YXZ");
    this.controls.setOrientation(euler.y, euler.x);
  }

  _exitPhotoFocus({ keepView = true } = {}){
    if (!this._focusedPhotoId) return;

    let returnPosition;
    if (this._focusReturnPosition) {
      returnPosition = this._focusReturnPosition.clone();
    } else {
      const back = new THREE.Vector3();
      this.camera.getWorldDirection(back);
      back.y = 0;
      if (back.lengthSq() < 0.0001) back.set(0, 0, 1);
      back.normalize().multiplyScalar(-WALL_STEP_BACK_DISTANCE);
      returnPosition = this.camera.position.clone().add(back);
    }

    this._clampCameraToRoom(returnPosition);
    returnPosition.y = EYE_HEIGHT;

    const yaw = this.controls.yaw;
    const pitch = this.controls.pitch;
    this._focusedPhotoId = null;
    this._focusReturnPosition = null;

    if (keepView) {
      this.controls.setOrientation(yaw, pitch);
    }

    this._animateCameraPosition(returnPosition, 550, {
      onComplete: () => this._lockFocusLook(false)
    });
  }

  _lockFocusLook(locked){
    if (locked) {
      if (this.controls.gyroEnabled) {
        this.controls.disableGyro();
        this._focusLockedGyro = true;
      }
      this.controls.locked = true;
      return;
    }

    this.controls.locked = false;
    if (this._focusLockedGyro) {
      this._focusLockedGyro = false;
      this.controls.enableGyro().catch(() => {});
    }
  }

  _clearPhotoFocusState(){
    this._focusedPhotoId = null;
    this._focusReturnPosition = null;
    if (this._focusLockedGyro || this.controls.locked) {
      this._focusLockedGyro = false;
      this.controls.locked = false;
    }
  }

  _stepBackAlongView(){
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 0.0001) {
      forward.set(-Math.sin(this.controls.yaw), 0, -Math.cos(this.controls.yaw));
    }
    forward.normalize();

    const target = this.camera.position.clone().addScaledVector(forward, -WALL_STEP_BACK_DISTANCE);
    target.y = EYE_HEIGHT;
    this._clampCameraToRoom(target);
    this._animateCameraPosition(target, 500);
  }

  _walkToward(point){
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

  _finishCameraAnimation(onComplete){
    this._cameraTween = null;
    this._cameraAnimating = false;
    onComplete?.();
  }

  _animateCameraPosition(targetPosition, duration, options = {}){
    this._cancelCameraAnimation();
    const start = this.camera.position.clone();
    const startFov = this.camera.fov;
    const targetFov = options.fov ?? startFov;
    const onComplete = options.onComplete;
    const startTime = performance.now();
    this._cameraAnimating = true;
    const step = now => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      this.camera.position.lerpVectors(start, targetPosition, eased);
      if (targetFov !== startFov) {
        this.camera.fov = THREE.MathUtils.lerp(startFov, targetFov, eased);
        this.camera.updateProjectionMatrix();
      }
      if (t < 1) {
        this._cameraTween = requestAnimationFrame(step);
      } else {
        this._finishCameraAnimation(onComplete);
      }
    };
    this._cameraTween = requestAnimationFrame(step);
  }

  _shortestAngleDelta(from, to){
    let delta = to - from;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return delta;
  }

  _animateCameraPose(targetPosition, yaw, pitch, duration){
    this._cancelCameraAnimation();
    const startPos = this.camera.position.clone();
    const startYaw = this.controls.yaw;
    const startPitch = this.controls.pitch;
    const yawDelta = this._shortestAngleDelta(startYaw, yaw);
    const startTime = performance.now();
    this._cameraAnimating = true;
    const step = now => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      this.camera.position.lerpVectors(startPos, targetPosition, eased);
      const nextYaw = startYaw + yawDelta * eased;
      const nextPitch = THREE.MathUtils.lerp(startPitch, pitch, eased);
      this.controls.setOrientation(nextYaw, nextPitch);
      if (t < 1) {
        this._cameraTween = requestAnimationFrame(step);
      } else {
        this.controls.setOrientation(yaw, pitch);
        this._finishCameraAnimation();
      }
    };
    this._cameraTween = requestAnimationFrame(step);
  }

  async enableGyro(){
    return this.controls.enableGyro();
  }

  disableGyro(){
    this.controls.disableGyro();
  }

  resetView(){
    this._clearPhotoFocusState();
    const spawn = getSpawnPose(this.currentRoomId, this._entryFromRoomId);
    this.camera.fov = 68;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(spawn.x, spawn.y, spawn.z);
    this.controls.resetView();
    this.controls.setOrientation(spawn.yaw, 0);
    if (this.controls.gyroEnabled) {
      this.controls._orientBaseline = null;
    }
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
    this._cancelCameraAnimation();
    this.renderer.domElement.removeEventListener("click", this._onCanvasClick);
    this._resizeObserver?.disconnect();
    this._disposeRoom();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

export { findDoorwayTarget };
