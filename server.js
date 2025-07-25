import http from 'http';
import { Server } from 'socket.io';
import { OctreeNode, computeMapBounds } from './octree.js';
import * as THREE from 'three';

const server = http.createServer();
const io = new Server(server, {
  cors: {
    origin: '*'
  }
});

process.on("uncaughtException", err => {
  console.error("UNCAUGHT EXCEPTION:", err);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("UNHANDLED PROMISE:", reason);
});

const rooms = {};
const playerLastSeen = {}; // { socket.id: timestamp }
const activeLasers = {}; // roomId -> [{ id, shooterId, origin, direction, position, life }]

const maps = {
  default: {
    "name": "Jump Arena XL",
    "objects": [
      { "type": "ground", "position": { "x": 0, "y": -1, "z": 0 }, "size": [200, 1, 200], "texture": "https://www.dailysummary.io/textures/stone.jpg" },

      { "type": "box", "position": { "x": -100, "y": 0, "z": -10 }, "size": [4, 1, 4], "color": "#ff0000" },
      { "type": "box", "position": { "x": -95, "y": 2, "z": -10 }, "size": [4, 1, 4], "color": "#00ff00" },
      { "type": "box", "position": { "x": -90, "y": 4, "z": -10 }, "size": [4, 1, 4], "color": "#0000ff" },
      { "type": "box", "position": { "x": -85, "y": 6, "z": -10 }, "size": [4, 1, 4], "color": "#ffff00" },
      { "type": "box", "position": { "x": -80, "y": 8, "z": -10 }, "size": [4, 1, 4], "color": "#ff00ff" },
      { "type": "box", "position": { "x": -75, "y": 10, "z": -10 }, "size": [4, 1, 4], "color": "#ff0000" },
      { "type": "box", "position": { "x": -70, "y": 12, "z": -10 }, "size": [4, 1, 4], "color": "#0000ff" },

      { "type": "box", "position": { "x": -10, "y": 0, "z": -20 }, "size": [4, 1, 4], "texture": "https://www.dailysummary.io/textures/hardwood2_diffuse.jpg" },
      { "type": "box", "position": { "x": -5, "y": 2, "z": -20 }, "size": [4, 1, 4], "texture": "https://www.dailysummary.io/textures/hardwood2_diffuse.jpg" },
      { "type": "box", "position": { "x": 0, "y": 4, "z": -20 }, "size": [4, 1, 4], "texture": "https://www.dailysummary.io/textures/hardwood2_diffuse.jpg" },
      { "type": "box", "position": { "x": 5, "y": 6, "z": -20 }, "size": [4, 1, 4], "texture": "https://www.dailysummary.io/textures/hardwood2_diffuse.jpg" },
      { "type": "box", "position": { "x": 10, "y": 8, "z": -20 }, "size": [4, 1, 4], "texture": "https://www.dailysummary.io/textures/hardwood2_diffuse.jpg" },
      { "type": "box", "position": { "x": 15, "y": 10, "z": -20 }, "size": [4, 1, 4], "texture": "https://www.dailysummary.io/textures/hardwood2_diffuse.jpg" },
      { "type": "box", "position": { "x": 20, "y": 12, "z": -20 }, "size": [4, 1, 4], "texture": "https://www.dailysummary.io/textures/hardwood2_diffuse.jpg" },

      { "type": "box", "position": { "x": 0, "y": 4, "z": 35 }, "size": [6, 10, 6], "texture": "https://www.dailysummary.io/textures/brick_diffuse.jpg" },

      { "type": "box", "position": { "x": -30, "y": 0, "z": 20 }, "size": [10, 2, 10], "texture": "https://www.dailysummary.io/textures/brick_diffuse.jpg" },
      { "type": "box", "position": { "x": -35, "y": 3, "z": 20 }, "size": [1, 6, 10], "texture": "https://www.dailysummary.io/textures/brick_diffuse.jpg" },
      { "type": "box", "position": { "x": -25, "y": 3, "z": 20 }, "size": [1, 6, 10], "texture": "https://www.dailysummary.io/textures/brick_diffuse.jpg" },
      { "type": "box", "position": { "x": -30, "y": 3, "z": 25 }, "size": [10, 6, 1], "texture": "https://www.dailysummary.io/textures/brick_diffuse.jpg" },
      { "type": "box", "position": { "x": -30, "y": 7, "z": 20 }, "size": [10, 1, 10], "texture": "https://www.dailysummary.io/textures/brick_diffuse.jpg" },

      { "type": "box", "position": { "x": 60, "y": 20, "z": 0 }, "size": [100, 1, 100], "texture": "https://www.dailysummary.io/textures/stone.jpg" },

      { "type": "box", "position": { "x": -26, "y": 0, "z": 0 }, "size": [4, 1, 4], "texture": "https://www.dailysummary.io/textures/hardwood2_diffuse.jpg" },
      { "type": "box", "position": { "x": -24, "y": 1, "z": 0 }, "size": [4, 1, 4], "texture": "https://www.dailysummary.io/textures/hardwood2_diffuse.jpg" },
      { "type": "box", "position": { "x": -22, "y": 2, "z": 0 }, "size": [4, 1, 4], "texture": "https://www.dailysummary.io/textures/hardwood2_diffuse.jpg" },
      { "type": "box", "position": { "x": -20, "y": 3, "z": 0 }, "size": [4, 1, 4], "texture": "https://www.dailysummary.io/textures/hardwood2_diffuse.jpg" },
      { "type": "box", "position": { "x": -18, "y": 4, "z": 0 }, "size": [4, 1, 4], "texture": "https://www.dailysummary.io/textures/hardwood2_diffuse.jpg" },
      { "type": "box", "position": { "x": -16, "y": 5, "z": 0 }, "size": [4, 1, 4], "texture": "https://www.dailysummary.io/textures/hardwood2_diffuse.jpg" },
      { "type": "box", "position": { "x": -14, "y": 6, "z": 0 }, "size": [4, 1, 4], "texture": "https://www.dailysummary.io/textures/hardwood2_diffuse.jpg" },
      { "type": "box", "position": { "x": -12, "y": 7, "z": 0 }, "size": [4, 1, 4], "texture": "https://www.dailysummary.io/textures/hardwood2_diffuse.jpg" },
      { "type": "box", "position": { "x": -10, "y": 8, "z": 0 }, "size": [4, 1, 4], "texture": "https://www.dailysummary.io/textures/hardwood2_diffuse.jpg" },
      { "type": "box", "position": { "x": -8, "y": 9, "z": 0 }, "size": [4, 1, 4], "texture": "https://www.dailysummary.io/textures/hardwood2_diffuse.jpg" },
      { "type": "box", "position": { "x": -6, "y": 10, "z": 0 }, "size": [4, 1, 4], "texture": "https://www.dailysummary.io/textures/hardwood2_diffuse.jpg" },
      { "type": "box", "position": { "x": -4, "y": 11, "z": 0 }, "size": [4, 1, 4], "texture": "https://www.dailysummary.io/textures/hardwood2_diffuse.jpg" },
      { "type": "box", "position": { "x": -2, "y": 12, "z": 0 }, "size": [4, 1, 4], "texture": "https://www.dailysummary.io/textures/hardwood2_diffuse.jpg" },
      { "type": "box", "position": { "x": 0, "y": 13, "z": 0 }, "size": [4, 1, 4], "texture": "https://www.dailysummary.io/textures/hardwood2_diffuse.jpg" },
      { "type": "box", "position": { "x": 2, "y": 14, "z": 0 }, "size": [4, 1, 4], "texture": "https://www.dailysummary.io/textures/hardwood2_diffuse.jpg" },
      { "type": "box", "position": { "x": 4, "y": 15, "z": 0 }, "size": [4, 1, 4], "texture": "https://www.dailysummary.io/textures/hardwood2_diffuse.jpg" },
      { "type": "box", "position": { "x": 6, "y": 16, "z": 0 }, "size": [4, 1, 4], "texture": "https://www.dailysummary.io/textures/hardwood2_diffuse.jpg" },
      { "type": "box", "position": { "x": 8, "y": 17, "z": 0 }, "size": [4, 1, 4], "texture": "https://www.dailysummary.io/textures/hardwood2_diffuse.jpg" },
      { "type": "box", "position": { "x": 10, "y": 18, "z": 0 }, "size": [4, 1, 4], "texture": "https://www.dailysummary.io/textures/hardwood2_diffuse.jpg" },
      { "type": "box", "position": { "x": 12, "y": 19, "z": 0 }, "size": [4, 1, 4], "texture": "https://www.dailysummary.io/textures/hardwood2_diffuse.jpg" }
    ],
    "healthPacks": [
      { "id": "hp1", "position": { "x": 0, "y": 11, "z": 35 }, "available": true },
      { "id": "hp2", "position": { "x": -30, "y": 8, "z": 20 }, "available": true },
      { "id": "hp3", "position": { "x": 40, "y": 21, "z": 0 }, "available": true }
    ]
  },
  road: {
    "name": "Simple Road Test",
    "objects": [
      { "position": { "x": 0, "y": -1, "z": 0 }, "size": [100, 1, 100], "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 1, "y": 1, "z": 1 }, "type": "ground", "texture": "https://www.dailysummary.io/textures/stone.jpg" },
      { "position": { "x": 0, "y": -0.2, "z": 0 }, "size": [5, 0.08, 5], "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 4.999997615815346, "y": 1.0000000223517422, "z": 5 }, "type": "box", "file": "https://www.dailysummary.io/models/ModularRoadKit.glb", "model": "road_drivewaySingleBarrier", "offset": { "x": 8.35000205039978, "y": 0, "z": 5.999999046325684 } },
      { "position": { "x": -5, "y": -0.2, "z": 0 }, "size": [5, 0.08, 5], "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 4.999997615815346, "y": 1.0000000223517422, "z": 5 }, "type": "box", "file": "https://www.dailysummary.io/models/ModularRoadKit.glb", "model": "road_drivewaySingleBarrier", "offset": { "x": 8.35000205039978, "y": 0, "z": 5.999999046325684 } },
      { "position": { "x": -10, "y": -0.2, "z": 0 }, "size": [5, 0.08, 5], "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 4.999997615815346, "y": 1.0000000223517422, "z": 5 }, "type": "box", "file": "https://www.dailysummary.io/models/ModularRoadKit.glb", "model": "road_drivewaySingleBarrier", "offset": { "x": 8.35000205039978, "y": 0, "z": 5.999999046325684 } },
      { "position": { "x": 5, "y": -0.2, "z": 0 }, "size": [5, 0.08, 5], "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 4.999997615815346, "y": 1.0000000223517422, "z": 5 }, "type": "box", "file": "https://www.dailysummary.io/models/ModularRoadKit.glb", "model": "road_drivewaySingleBarrier", "offset": { "x": 8.35000205039978, "y": 0, "z": 5.999999046325684 } },
      { "position": { "x": 10, "y": -0.2, "z": 0 }, "size": [5, 0.08, 5], "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 4.999997615815346, "y": 1.0000000223517422, "z": 5 }, "type": "box", "file": "https://www.dailysummary.io/models/ModularRoadKit.glb", "model": "road_drivewaySingleBarrier", "offset": { "x": 8.35000205039978, "y": 0, "z": 5.999999046325684 } },
      { "position": { "x": 15, "y": -0.2, "z": 0 }, "size": [5, 0.08, 5], "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 4.999997615815346, "y": 1.0000000223517422, "z": 5 }, "type": "box", "file": "https://www.dailysummary.io/models/ModularRoadKit.glb", "model": "road_drivewaySingleBarrier", "offset": { "x": 8.35000205039978, "y": 0, "z": 5.999999046325684 } },
      { "position": { "x": 20, "y": -0.2, "z": 0 }, "size": [5, 0.08, 5], "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 4.999997615815346, "y": 1.0000000223517422, "z": 5 }, "type": "box", "file": "https://www.dailysummary.io/models/ModularRoadKit.glb", "model": "road_drivewaySingleBarrier", "offset": { "x": 8.35000205039978, "y": 0, "z": 5.999999046325684 } },
      { "position": { "x": 25, "y": -0.2, "z": 0 }, "size": [5, 0.08, 5], "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 4.999997615815346, "y": 1.0000000223517422, "z": 5 }, "type": "box", "file": "https://www.dailysummary.io/models/ModularRoadKit.glb", "model": "road_drivewaySingleBarrier", "offset": { "x": 8.35000205039978, "y": 0, "z": 5.999999046325684 } },
      { "position": { "x": 30, "y": -0.2, "z": 0 }, "size": [5, 0.08, 5], "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 4.999997615815346, "y": 1.0000000223517422, "z": 5 }, "type": "box", "file": "https://www.dailysummary.io/models/ModularRoadKit.glb", "model": "road_drivewaySingleBarrier", "offset": { "x": 8.35000205039978, "y": 0, "z": 5.999999046325684 } },
      { "position": { "x": 35, "y": -0.2, "z": 0 }, "size": [5, 0.08, 5], "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 4.999997615815346, "y": 1.0000000223517422, "z": 5 }, "type": "box", "file": "https://www.dailysummary.io/models/ModularRoadKit.glb", "model": "road_drivewaySingleBarrier", "offset": { "x": 8.35000205039978, "y": 0, "z": 5.999999046325684 } },
      { "position": { "x": 40, "y": -0.2, "z": 0 }, "size": [5, 0.08, 5], "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 4.999997615815346, "y": 1.0000000223517422, "z": 5 }, "type": "box", "file": "https://www.dailysummary.io/models/ModularRoadKit.glb", "model": "road_drivewaySingleBarrier", "offset": { "x": 8.35000205039978, "y": 0, "z": 5.999999046325684 } },
      { "position": { "x": -15, "y": -0.2, "z": 0 }, "size": [5, 0.08, 5], "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 4.999997615815346, "y": 1.0000000223517422, "z": 5 }, "type": "box", "file": "https://www.dailysummary.io/models/ModularRoadKit.glb", "model": "road_drivewaySingleBarrier", "offset": { "x": 8.35000205039978, "y": 0, "z": 5.999999046325684 } },
      { "position": { "x": 0, "y": 90, "z": 0 }, "size": [0.05, 4, 0.23], "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 0.9999997615814777, "y": 5.92592582127031, "z": 1.0222204891281312 }, "type": "box", "file": "https://www.dailysummary.io/models/ModularRoadKit.glb", "model": "light_curved", "offset": { "x": -0.4990909993648529, "y": 0, "z": 7 } },
      { "position": { "x": 0, "y": 1, "z": 2.5 }, "size": [0.5, 3, 0.5], "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 9.999997615814777, "y": 4.444444365952733, "z": 2.2222184546263724 }, "type": "box", "file": "https://www.dailysummary.io/models/ModularRoadKit.glb", "model": "light_curved", "offset": { "x": -0.4990909993648529, "y": 0, "z": 7 } },
      { "position": { "x": -5, "y": 1, "z": 2.5 }, "size": [0.5, 3, 0.5], "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 9.999997615814777, "y": 4.444444365952733, "z": 2.2222184546263724 }, "type": "box", "file": "https://www.dailysummary.io/models/ModularRoadKit.glb", "model": "light_curved", "offset": { "x": -0.4990909993648529, "y": 0, "z": 7 } },
      { "position": { "x": -10, "y": 1, "z": 2.5 }, "size": [0.5, 3, 0.5], "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 9.999997615814777, "y": 4.444444365952733, "z": 2.2222184546263724 }, "type": "box", "file": "https://www.dailysummary.io/models/ModularRoadKit.glb", "model": "light_curved", "offset": { "x": -0.4990909993648529, "y": 0, "z": 7 } },
      { "position": { "x": -15, "y": 1, "z": 2.5 }, "size": [0.5, 3, 0.5], "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 9.999997615814777, "y": 4.444444365952733, "z": 2.2222184546263724 }, "type": "box", "file": "https://www.dailysummary.io/models/ModularRoadKit.glb", "model": "light_curved", "offset": { "x": -0.4990909993648529, "y": 0, "z": 7 } },
      { "position": { "x": 5, "y": 1, "z": 2.5 }, "size": [0.5, 3, 0.5], "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 9.999997615814777, "y": 4.444444365952733, "z": 2.2222184546263724 }, "type": "box", "file": "https://www.dailysummary.io/models/ModularRoadKit.glb", "model": "light_curved", "offset": { "x": -0.4990909993648529, "y": 0, "z": 7 } },
      { "position": { "x": 10, "y": 1, "z": 2.5 }, "size": [0.5, 3, 0.5], "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 9.999997615814777, "y": 4.444444365952733, "z": 2.2222184546263724 }, "type": "box", "file": "https://www.dailysummary.io/models/ModularRoadKit.glb", "model": "light_curved", "offset": { "x": -0.4990909993648529, "y": 0, "z": 7 } },
      { "position": { "x": 15, "y": 1, "z": 2.5 }, "size": [0.5, 3, 0.5], "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 9.999997615814777, "y": 4.444444365952733, "z": 2.2222184546263724 }, "type": "box", "file": "https://www.dailysummary.io/models/ModularRoadKit.glb", "model": "light_curved", "offset": { "x": -0.4990909993648529, "y": 0, "z": 7 } },
      { "position": { "x": 20, "y": 1, "z": 2.5 }, "size": [0.5, 3, 0.5], "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 9.999997615814777, "y": 4.444444365952733, "z": 2.2222184546263724 }, "type": "box", "file": "https://www.dailysummary.io/models/ModularRoadKit.glb", "model": "light_curved", "offset": { "x": -0.4990909993648529, "y": 0, "z": 7 } },
      { "position": { "x": 25, "y": 1, "z": 2.5 }, "size": [0.5, 3, 0.5], "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 9.999997615814777, "y": 4.444444365952733, "z": 2.2222184546263724 }, "type": "box", "file": "https://www.dailysummary.io/models/ModularRoadKit.glb", "model": "light_curved", "offset": { "x": -0.4990909993648529, "y": 0, "z": 7 } },
      { "position": { "x": 30, "y": 1, "z": 2.5 }, "size": [0.5, 3, 0.5], "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 9.999997615814777, "y": 4.444444365952733, "z": 2.2222184546263724 }, "type": "box", "file": "https://www.dailysummary.io/models/ModularRoadKit.glb", "model": "light_curved", "offset": { "x": -0.4990909993648529, "y": 0, "z": 7 } },
      { "position": { "x": 35, "y": 1, "z": 2.5 }, "size": [0.5, 3, 0.5], "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 9.999997615814777, "y": 4.444444365952733, "z": 2.2222184546263724 }, "type": "box", "file": "https://www.dailysummary.io/models/ModularRoadKit.glb", "model": "light_curved", "offset": { "x": -0.4990909993648529, "y": 0, "z": 7 } },
      { "position": { "x": 40, "y": 1, "z": 2.5 }, "size": [0.5, 3, 0.5], "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 9.999997615814777, "y": 4.444444365952733, "z": 2.2222184546263724 }, "type": "box", "file": "https://www.dailysummary.io/models/ModularRoadKit.glb", "model": "light_curved", "offset": { "x": -0.4990909993648529, "y": 0, "z": 7 } }
    ],
    "healthPacks": []
  },
  city: {
    "name": "City",
    "objects": [
      { "position": { "x": 0, "y": 92.5, "z": 0 }, "size": [814, 206, 800], "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 1.9993230161949644, "y": 1.9846980309968454, "z": 1.9999352713911427 }, "type": "box", "file": "https://www.dailysummary.io/models/city_highres.glb", "model": "Sketchfab_Scene", "offset": { "x": -212.53021621704102, "y": 49.25186499625598, "z": -208.66839599609375 } }
    ],
    "healthPacks": []
  },
  anotherCity: {
    "name": "Detailed City",
    "objects": [
      { "position": { "x": 0, "y": 65, "z": 0 }, "size": [332, 140, 302], "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 1.990831431526063, "y": 1.988958187444187, "z": 1.999921682822281 }, "type": "box", "file": "https://www.dailysummary.io/models/FullCity.glb", "model": "Sketchfab_Scene", "offset": { "x": -6.283851623535156, "y": 34.458319501665684, "z": 6.247860158213669 } },
      { "position": { "x": 0, "y": -4.5, "z": 0 }, "size": [500, 1, 500], "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 1, "y": 1, "z": 1 }, "type": "box", "color": "#888888", "texture": "https://www.dailysummary.io/textures/stone.jpg" }
    ],
    "healthPacks": []
  },
  npmSmart: {
    "name": "Block town",
    "objects": [
      { "position": { "x": 0, "y": 30, "z": 0 }, "size": [500.15, 75, 500.15], "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 97.11650702509202, "y": 99.9998649062582, "z": 97.11650702509202 }, "type": "box", "file": "https://www.dailysummary.io/models/npcs_are_becoming_smart_map.glb", "model": "Sketchfab_Scene", "offset": { "x": 0, "y": 0.0222455019746981, "z": 0 } }
    ],
    "healthPacks": []
  }
};

function distanceVec3(a, b) {
  return Math.sqrt(
    (a.x - b.x) ** 2 +
    (a.y - b.y) ** 2 +
    (a.z - b.z) ** 2
  );
}

function vec3({ x, y, z }) {
  return { x, y, z };
}

function subtractVec3(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function addVec3(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scaleVec3(a, s) {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

function dotVec3(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function normalizeVec3(v) {
  const length = Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

function segmentSphereIntersect(p1, p2, center, radius) {
  const d = subtractVec3(p2, p1); // segment direction
  const f = subtractVec3(p1, center); // from center to segment start

  const a = dotVec3(d, d);
  const b = 2 * dotVec3(f, d);
  const c = dotVec3(f, f) - radius * radius;

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return false;

  const t1 = (-b - Math.sqrt(discriminant)) / (2 * a);
  const t2 = (-b + Math.sqrt(discriminant)) / (2 * a);

  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
}

function getAABB(obj) {
  const half = {
    x: obj.size[0] / 2,
    y: obj.size[1] / 2,
    z: obj.size[2] / 2
  };

  const min = {
    x: obj.position.x - half.x,
    y: obj.position.y - half.y,
    z: obj.position.z - half.z
  };

  const max = {
    x: obj.position.x + half.x,
    y: obj.position.y + half.y,
    z: obj.position.z + half.z
  };

  return { min, max };
}

function rayIntersectsAABB(origin, dir, maxDist, min, max) {
  let tmin = (min.x - origin.x) / dir.x;
  let tmax = (max.x - origin.x) / dir.x;
  if (tmin > tmax) [tmin, tmax] = [tmax, tmin];

  let tymin = (min.y - origin.y) / dir.y;
  let tymax = (max.y - origin.y) / dir.y;
  if (tymin > tymax) [tymin, tymax] = [tymax, tymin];

  if ((tmin > tymax) || (tymin > tmax)) return null;
  if (tymin > tmin) tmin = tymin;
  if (tymax < tmax) tmax = tymax;

  let tzmin = (min.z - origin.z) / dir.z;
  let tzmax = (max.z - origin.z) / dir.z;
  if (tzmin > tzmax) [tzmin, tzmax] = [tzmax, tzmin];

  if ((tmin > tzmax) || (tzmin > tmax)) return null;

  const hitDist = Math.max(tmin, tzmin);
  return (hitDist >= 0 && hitDist <= maxDist) ? hitDist : null;
}

function ensureOctreeForMap(map) {
  if (!map.octree) {
    const bounds = computeMapBounds(map.objects);
    const octree = new OctreeNode(bounds.center, bounds.size * 1.2);
    for (const mesh of map.objects) {
      octree.insert(mesh);
    }
    map.octree = octree;
  }
}

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  playerLastSeen[socket.id] = Date.now();

  socket.on('getMaps', (callback) => {
    const availableMaps = Object.entries(maps).map(([id, map]) => ({
      id,
      name: map.name || id
    }));
    callback(availableMaps);
  });

  socket.on('getRooms', (callback) => {
    const availableRooms = Object.entries(rooms).map(([id, room]) => ({
      id,
      count: Object.keys(room.players).length
    }));
    callback(availableRooms);
  });

  socket.on('createRoom', ({ name, modelName, mapName }, callback) => {

    // Basic input validation
    if (typeof name !== 'string' || typeof modelName !== 'string') {
      return callback({ error: 'Invalid input' });
    }

    // Trim and limit length and allow only basic alphanumeric, dashes, underscores, and spaces
    name = name.trim().substring(0, 64);
    modelName = modelName.trim().substring(0, 64);
    const safeName = name.replace(/[^\w\s-]/g, '');
    const safeModel = modelName.replace(/[^\w.-]/g, '');

    if (mapName == null) {
      mapName = 'default';
    }

    const roomId = `room-${Math.random().toString(36).substr(2, 6)}`;

    const map = maps[mapName];
    ensureOctreeForMap(map);

    rooms[roomId] = {
      players: {},
      map,
      octree: map.octree
    };

    socket.join(roomId);
    rooms[roomId].players[socket.id] = { name: safeName, position: { x: 0, y: 0, z: 0 }, health: 100, modelName: safeModel };
    console.warn("Player created room", socket.id);
    socket.emit("loadMap", rooms[roomId].map);
    callback({ roomId, health: 100 });
    io.to(roomId).emit('playerList', rooms[roomId].players);
  });

  socket.on('joinRoom', ({ roomId, name, modelName }, callback) => {
    if (!rooms[roomId]) return callback({ error: 'Room not found' });

    // Basic input validation
    if (typeof name !== 'string' || typeof modelName !== 'string') {
      return callback({ error: 'Invalid input' });
    }

    // Trim and limit length and allow only basic alphanumeric, dashes, underscores, and spaces
    name = name.trim().substring(0, 64);
    modelName = modelName.trim().substring(0, 64);
    const safeName = name.replace(/[^\w\s-]/g, '');
    const safeModel = modelName.replace(/[^\w.-]/g, '');

    socket.join(roomId);
    rooms[roomId].players[socket.id] = { name: safeName, position: { x: 0, y: 0, z: 0 }, health: 100, modelName: safeModel };
    console.warn("Player joined room", socket.id);
    socket.emit("loadMap", rooms[roomId].map);
    callback({ success: true, health: 100 });
    io.to(roomId).emit('playerList', rooms[roomId].players);
    sendMessage(roomId, safeName + ' joined the game.');
  });

  socket.on("heartbeat", () => {
    playerLastSeen[socket.id] = Date.now();
    socket.emit("heartbeatAck");
  });

  socket.on('move', (data) => {
    try {
      const { roomId, position, rotation, isIdle, isGrounded } = data;
      if (!roomId || !position) return;
      const room = rooms[roomId];
      if (room?.players[socket.id]) {
        room.players[socket.id].position = position;
        room.players[socket.id].rotation = rotation;
        socket.to(roomId).emit('playerMoved', {
          id: socket.id,
          position,
          rotation,
          isIdle,
          isGrounded
        });
        tryPickupHealthPack(roomId, socket.id);
        if (position.y < -100 && room.players[socket.id].health > 0 && !room.players[socket.id].isDead) {
          room.players[socket.id].health = 0;
          room.players[socket.id].isDead = true;
          respawnPlayer(roomId, socket.id, socket.id, 'fell to his death', 100);
        }
      }
    } catch (err) {
      console.error("Error handling move:", err);
    }
  });

  socket.on('shoot', ({ roomId, origin, direction, id }) => {
    // Validate input
    if (!roomId || !origin || !direction || typeof id !== 'string') return;

    const room = rooms[roomId];
    if (!room || !room.players[socket.id]) return;

    const now = Date.now();
    const laser = {
      id,
      shooterId: socket.id,
      origin,
      direction,
      position: { ...origin },
      life: 2000, // ms to live
      speed: 100,  // units/sec
      lastUpdate: now
    };

    if (!activeLasers[roomId]) activeLasers[roomId] = [];
    activeLasers[roomId].push(laser);

    // Send initial fire for visuals
    io.to(roomId).emit('laserFired', {
      shooterId: socket.id,
      origin,
      direction,
      id
    });
  });

  socket.on("machinegunFire", ({ roomId, origin, direction }) => {
    const room = rooms[roomId];
    if (!room || !room.players[socket.id]) return;

    const range = 100;
    let nearestWallDist = Infinity;
    let wallHitPos = null;

    const nearbyObjects = room.octree.queryRay(origin, direction, range);

    const intersectables = nearbyObjects
      .map(obj => {
        const { min, max } = getAABB(obj);
        const dist = rayIntersectsAABB(origin, direction, range, min, max);
        return dist != null ? { obj, dist, min, max } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.dist - b.dist);

    // Find the nearest hit
    for (const { dist, min, max, obj } of intersectables) {
      nearestWallDist = dist;
      wallHitPos = addVec3(origin, scaleVec3(direction, dist));
      break; // early exit
    }

    // === 2. Check player hitboxes ===
    let hitPlayerId = null;
    let hitPlayerPos = null;

    const playerHalfSize = { x: 0.4, y: 0.9, z: 0.4 }; // adjust for your game

    for (const [pid, player] of Object.entries(room.players)) {
      if (pid === socket.id) continue;

      const min = {
        x: player.position.x - playerHalfSize.x,
        y: player.position.y - playerHalfSize.y,
        z: player.position.z - playerHalfSize.z
      };

      const max = {
        x: player.position.x + playerHalfSize.x,
        y: player.position.y + playerHalfSize.y,
        z: player.position.z + playerHalfSize.z
      };

      const hitDist = rayIntersectsAABB(origin, direction, range, min, max);
      if (hitDist != null && hitDist < nearestWallDist) {
        nearestWallDist = hitDist;
        hitPlayerId = pid;
        hitPlayerPos = addVec3(origin, scaleVec3(direction, hitDist));
      }
    }

    // === 3. Act on nearest hit ===
    if (hitPlayerId) {
      const victim = room.players[hitPlayerId];
      victim.health = (victim.health || 100);

      if (victim.health > 0) {
        victim.health -= 3;

        io.to(roomId).emit("machinegunHit", {
          shooterId: socket.id,
          targetId: hitPlayerId,
          position: hitPlayerPos,
          origin,
          direction,
          health: Math.max(0, victim.health),
          damage: 3
        });

        if (victim.health <= 0) {
          respawnPlayer(roomId, hitPlayerId, socket.id, "machine gunned");
        }
      }
    } else if (wallHitPos) {
      io.to(roomId).emit("machinegunBlocked", {
        shooterId: socket.id,
        origin,
        direction
      });
    }
  });

  socket.on("shotgunFire", ({ roomId, origin, direction }) => {
    const room = rooms[roomId];
    if (!room || !room.players[socket.id]) return;

    const PELLET_COUNT = 8;
    const SPREAD_ANGLE = 10; // degrees
    const MAX_RANGE = 30;

    const hitsPerPlayer = {}; // accumulate damage per target

    for (let i = 0; i < PELLET_COUNT; i++) {
      const pelletDir = getSpreadDirection(direction, SPREAD_ANGLE);
      let nearestWallDist = Infinity;
      let wallHitPos = null;

      const nearbyObjects = room.octree.queryRay(origin, pelletDir, MAX_RANGE);

      const intersectables = nearbyObjects
        .map(obj => {
          const { min, max } = getAABB(obj);
          const dist = rayIntersectsAABB(origin, pelletDir, MAX_RANGE, min, max);
          return dist != null ? { obj, dist, min, max } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.dist - b.dist);

      for (const { dist } of intersectables) {
        nearestWallDist = dist;
        wallHitPos = addVec3(origin, scaleVec3(pelletDir, dist));
        break;
      }

      let hitPlayerId = null;
      let hitPlayerPos = null;

      const playerHalfSize = { x: 0.4, y: 0.9, z: 0.4 };

      for (const [pid, player] of Object.entries(room.players)) {
        if (pid === socket.id) continue;

        const min = {
          x: player.position.x - playerHalfSize.x,
          y: player.position.y - playerHalfSize.y,
          z: player.position.z - playerHalfSize.z
        };

        const max = {
          x: player.position.x + playerHalfSize.x,
          y: player.position.y + playerHalfSize.y,
          z: player.position.z + playerHalfSize.z
        };

        const hitDist = rayIntersectsAABB(origin, pelletDir, MAX_RANGE, min, max);
        if (hitDist != null && hitDist < nearestWallDist) {
          nearestWallDist = hitDist;
          hitPlayerId = pid;
          hitPlayerPos = addVec3(origin, scaleVec3(pelletDir, hitDist));
        }
      }

      if (hitPlayerId) {
        const damage = computeShotgunDamage(nearestWallDist);
        hitsPerPlayer[hitPlayerId] = hitsPerPlayer[hitPlayerId] || {
          totalDamage: 0,
          position: hitPlayerPos
        };
        hitsPerPlayer[hitPlayerId].totalDamage += damage;
      } else if (wallHitPos) {
        io.to(roomId).emit("shotgunBlocked", {
          shooterId: socket.id,
          origin,
          direction: pelletDir
        });
      }
    }

    // Apply damage to hit players
    for (const [targetId, { totalDamage, position }] of Object.entries(hitsPerPlayer)) {
      const victim = room.players[targetId];
      victim.health = (victim.health || 100);

      if (victim.health > 0) {
        victim.health -= totalDamage;

        io.to(roomId).emit("shotgunHit", {
          shooterId: socket.id,
          targetId,
          position,
          origin,
          direction,
          health: Math.max(0, victim.health),
          damage: totalDamage
        });

        if (victim.health <= 0) {
          respawnPlayer(roomId, targetId, socket.id, "shotgunned");
        }
      }

    }
  });

  socket.on('disconnect', () => {
    handleDisconnect(socket);
  });

  socket.on('grappleStart', ({ roomId, origin, direction }) => {
    socket.to(roomId).emit('remoteGrappleStart', {
      playerId: socket.id,
      origin,
      direction
    });
  });

  socket.on('grappleEnd', ({ roomId }) => {
    socket.to(roomId).emit('remoteGrappleEnd', {
      playerId: socket.id
    });
  });
});

function handleDisconnect(socket) {
  for (const roomId in rooms) {
    if (rooms[roomId].players[socket.id]) {
      if (activeLasers[roomId]) {
        activeLasers[roomId] = activeLasers[roomId].filter(l => l.shooterId !== socket.id);
      }
      sendMessage(roomId, rooms[roomId].players[socket.id].name + ' left the game.');
      delete rooms[roomId].players[socket.id];
      io.to(roomId).emit('playerDisconnected', socket.id);
      console.log(`Client disconnected: ${socket.id}`);
      if (Object.keys(rooms[roomId].players).length === 0) {
        delete activeLasers[roomId];
        delete rooms[roomId]?.octree;
        delete rooms[roomId];
        console.warn("Room deleted", roomId);
      }
      break;
    }
  }
  delete playerLastSeen[socket.id];
}

setInterval(() => {
  const now = Date.now();
  for (const id in playerLastSeen) {
    if (now - playerLastSeen[id] > 300000) {
      const sock = io.sockets.sockets.get(id);
      if (sock) {
        console.warn("Client timeout disconnecting:", id);
        handleDisconnect(sock);
        sock.disconnect(); // optional
      } else {
        cleanupStalePlayer(id); // fallback
      }
    }
  }
}, 30000);

function cleanupStalePlayer(id) {
  for (const roomId in rooms) {
    if (rooms[roomId].players[id]) {
      delete rooms[roomId].players[id];
      io.to(roomId).emit('playerDisconnected', id);
      console.log(`Client disconnected: ${socket.id}`);
      if (Object.keys(rooms[roomId].players).length === 0) {
        delete activeLasers[roomId];
        delete rooms[roomId];
        delete rooms[roomId]?.octree;
        console.warn("Room deleted (stale cleanup):", roomId);
      }
      break;
    }
  }
  delete playerLastSeen[id];
}

function respawnPlayer(roomId, playerId, shooterId, action, timer = 1000) {
  const room = rooms[roomId];
  if (!room || !room.players[playerId]) return;

  // Notify player (so they can update UI and visuals)
  io.to(roomId).emit('playerDied', {
    playerId: playerId,
    position: { x: room.players[playerId].position.x, y: room.players[playerId].position.y, z: room.players[playerId].position.z },
    message: shooterId !== playerId ?
      `${room.players[shooterId].name} ${action} ${room.players[playerId].name}` :
      `${room.players[playerId].name} ${action}`
  });

  // Reset data after delay
  setTimeout(() => {

    if (room.players[playerId] == null) {
      cleanupStalePlayer(playerId);
      return;
    }

    const spawnPosition = { x: 0, y: 0, z: 0 }; // change as needed
    room.players[playerId].position = spawnPosition;
    room.players[playerId].health = 100;
    room.players[playerId].isDead = false;

    // Notify player (so they can update UI and visuals)
    io.to(roomId).emit('respawn', {
      playerId: playerId,
      position: spawnPosition,
      health: 100
    });

    // Also notify other players about position reset
    io.to(roomId).emit('playerMoved', {
      id: playerId,
      position: spawnPosition,
      rotation: { x: 0, y: 0, z: 0 },
      isIdle: true,
      isGrounded: true
    });
  }, timer);
}

function updateRoomLasers(roomId) {
  const now = Date.now();

  const lasers = activeLasers[roomId];
  const room = rooms[roomId];
  if (!room || !lasers) return;

  for (let i = lasers.length - 1; i >= 0; i--) {
    const laser = lasers[i];
    const delta = now - (laser.lastUpdate || now); // milliseconds since last update

    laser.life -= delta;
    laser.lastUpdate = now;

    const moveDistance = (laser.speed * delta) / 1000;

    // Track previous position for swept collision
    laser.prevPosition = { ...laser.position };

    // Get nearby objects using the octree
    const nearbyObjects = room.octree.queryRay(laser.prevPosition, laser.direction, moveDistance);

    let blocked = false;

    for (const obj of nearbyObjects) {
      const { min, max } = getAABB(obj);

      if (rayIntersectsAABB(laser.prevPosition, laser.direction, moveDistance, min, max) != null) {
        blocked = true;
        break;
      }
    }

    if (blocked) {
      // Inform all players so they can remove the laser visually
      io.to(roomId).emit('laserBlocked', {
        id: laser.id,
        position: laser.position
      });

      lasers.splice(i, 1);
      continue; // skip player hit checks
    }

    // Move laser forward
    laser.position.x += laser.direction.x * moveDistance;
    laser.position.y += laser.direction.y * moveDistance;
    laser.position.z += laser.direction.z * moveDistance;

    // Check for hit
    const hitRadius = 0.6;
    let hitId = null;
    let hitPlayer = null;

    for (const [pid, player] of Object.entries(room.players)) {
      if (pid === laser.shooterId) continue;

      // Swept hit detection (segment-sphere)
      const hit = segmentSphereIntersect(
        laser.prevPosition,
        laser.position,
        player.position,
        hitRadius
      );

      if (hit) {
        hitId = pid;
        hitPlayer = player;

        if (typeof hitPlayer.health !== 'number') {
          hitPlayer.health = 100;
        }

        if (hitPlayer.health > 0) {
          hitPlayer.health -= 10;
          if (hitPlayer.health <= 0) {
            respawnPlayer(roomId, hitId, laser.shooterId, 'blasted');
          }
        }
        break;
      }
    }

    if (hitId || laser.life <= 0) {
      // Remove laser
      lasers.splice(i, 1);

      // Inform clients
      if (hitId) {
        io.to(roomId).emit('laserHit', {
          shooterId: laser.shooterId,
          targetId: hitId,
          position: laser.position,
          health: hitPlayer.health,
          damage: 10
        });
      }
    }
  }
}

setInterval(() => {
  for (const roomId in activeLasers) {
    if (activeLasers[roomId]?.length > 0) {
      updateRoomLasers(roomId);
    }
  }
}, 1000 / 60); // 60 FPS

function computeShotgunDamage(distance) {
  if (distance < 5) return 5;
  if (distance < 15) return 4;
  if (distance < 30) return 2;
  return 0;
}

function toVector3(obj) {
  return new THREE.Vector3(obj.x, obj.y, obj.z);
}

function getSpreadDirection(baseDir, spreadAngleDeg) {
  const spreadAngleRad = THREE.MathUtils.degToRad(spreadAngleDeg);
  const randomAngle = Math.random() * 2 * Math.PI;
  const randomRadius = Math.random() * Math.tan(spreadAngleRad);

  // Get orthogonal basis to baseDir
  const dir = toVector3(baseDir).clone().normalize();
  const up = Math.abs(dir.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const right = new THREE.Vector3().crossVectors(up, dir).normalize();
  const upOrtho = new THREE.Vector3().crossVectors(dir, right).normalize();

  // Offset direction in a cone
  const offset = right.multiplyScalar(Math.cos(randomAngle) * randomRadius)
    .add(upOrtho.multiplyScalar(Math.sin(randomAngle) * randomRadius));

  const spreadDir = dir.clone().add(offset).normalize();
  return spreadDir;
}

function sendMessage(roomId, message) {
  io.to(roomId).emit('serverMessage', {
    message: message
  });
}

function tryPickupHealthPack(roomId, playerId) {
  const room = rooms[roomId];
  if (!room) return;

  const player = room.players[playerId];
  if (!player) return;

  for (const pack of room.map.healthPacks) {
    if (!pack.available) continue;

    const dx = player.position.x - pack.position.x;
    const dy = player.position.y - pack.position.y;
    const dz = player.position.z - pack.position.z;
    const distSq = dx * dx + dy * dy + dz * dz;

    if (distSq < 2.0) {
      pack.available = false;
      player.health = Math.min(100, (player.health || 100) + 25);

      io.to(roomId).emit("healthPackTaken", {
        id: pack.id,
        targetPlayerId: playerId,
        health: player.health
      });

      setTimeout(() => {
        pack.available = true;
        io.to(roomId).emit("healthPackRespawned", { id: pack.id });
      }, 10000);
    }
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
