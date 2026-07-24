// F7 3D 展館 - 三房型拓撲（2 方形 + 1 圓形）

export const GALLERY3D_ROOM_COUNT = 3;

export const SQUARE_ROOM_SIZE = 12;
export const ROUND_ROOM_RADIUS = 6;
export const ROOM_WALL_HEIGHT = 4.5;
export const EYE_HEIGHT = 1.65;
export const DOOR_WIDTH = 1.2;
export const DOOR_HEIGHT = 2.2;

/** @typedef {{ id: string, targetRoomId: number, side?: string, angle?: number }} DoorwayDef */

export const ROOM_DEFINITIONS = [
  {
    id: 1,
    shape: "square",
    label: "房間 1",
    doorways: [{ id: "east-door", targetRoomId: 2, side: "east" }]
  },
  {
    id: 2,
    shape: "round",
    label: "房間 2",
    doorways: [
      { id: "round-door-west", targetRoomId: 1, angle: Math.PI },
      { id: "round-door-east", targetRoomId: 3, angle: 0 }
    ]
  },
  {
    id: 3,
    shape: "square",
    label: "房間 3",
    doorways: [{ id: "west-door", targetRoomId: 2, side: "west" }]
  }
];

export function getRoomDefinition(roomId){
  return ROOM_DEFINITIONS.find(room => room.id === Number(roomId)) || ROOM_DEFINITIONS[0];
}

export function getSpawnPose(roomId, fromRoomId = null){
  const room = getRoomDefinition(roomId);
  if (room.shape === "square") {
    const half = SQUARE_ROOM_SIZE / 2;
    if (fromRoomId === 2 && roomId === 1) {
      return { x: half - 2.2, y: EYE_HEIGHT, z: 0, yaw: Math.PI };
    }
    if (fromRoomId === 2 && roomId === 3) {
      return { x: -half + 2.2, y: EYE_HEIGHT, z: 0, yaw: 0 };
    }
    return { x: 0, y: EYE_HEIGHT, z: half - 2.2, yaw: Math.PI };
  }

  const radius = ROUND_ROOM_RADIUS - 2.2;
  if (fromRoomId === 1) {
    return { x: -radius, y: EYE_HEIGHT, z: 0, yaw: 0 };
  }
  if (fromRoomId === 3) {
    return { x: radius, y: EYE_HEIGHT, z: 0, yaw: Math.PI };
  }
  return { x: 0, y: EYE_HEIGHT, z: -radius, yaw: 0 };
}

export function findDoorwayTarget(roomId, doorwayId){
  const room = getRoomDefinition(roomId);
  const doorway = room.doorways.find(item => item.id === doorwayId);
  return doorway?.targetRoomId || null;
}
