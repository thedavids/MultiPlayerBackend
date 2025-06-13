import http from 'http';
import { Server } from 'socket.io';

const server = http.createServer();
const io = new Server(server, {
  cors: {
    origin: '*'
  }
});

const rooms = {};
const playerLastSeen = {}; // { socket.id: timestamp }
const activeLasers = {}; // roomId -> [{ id, shooterId, origin, direction, position, life }]

const maps = {
  default: {
    name: "Jump Arena XL",
    objects: [
      // Main ground
      { type: "ground", position: { x: 0, y: -1, z: 0 }, size: [200, 1, 200], texture: "https://www.dailysummary.io/textures/stone.jpg" },

      // Staggered platforms
      { type: "box", position: { x: -10, y: 0, z: -10 }, size: [4, 1, 4], color: "#ff0000" },
      { type: "box", position: { x: -5, y: 2, z: -10 }, size: [4, 1, 4], color: "#00ff00" },
      { type: "box", position: { x: 0, y: 4, z: -10 }, size: [4, 1, 4], color: "#0000ff" },
      { type: "box", position: { x: 5, y: 6, z: -10 }, size: [4, 1, 4], color: "#ffff00" },
      { type: "box", position: { x: 10, y: 8, z: -10 }, size: [4, 1, 4], color: "#ff00ff" },
      { type: "box", position: { x: 15, y: 10, z: -10 }, size: [4, 1, 4], color: "#ff0000" },
      { type: "box", position: { x: 20, y: 12, z: -10 }, size: [4, 1, 4], color: "#0000ff" },

      { type: "box", position: { x: -10, y: 0, z: -20 }, size: [4, 1, 4], texture: "https://www.dailysummary.io/textures/hardwood2_diffuse.jpg" },
      { type: "box", position: { x: -5, y: 2, z: -20 }, size: [4, 1, 4], texture: "https://www.dailysummary.io/textures/hardwood2_diffuse.jpg" },
      { type: "box", position: { x: 0, y: 4, z: -20 }, size: [4, 1, 4], texture: "https://www.dailysummary.io/textures/hardwood2_diffuse.jpg" },
      { type: "box", position: { x: 5, y: 6, z: -20 }, size: [4, 1, 4], texture: "https://www.dailysummary.io/textures/hardwood2_diffuse.jpg" },
      { type: "box", position: { x: 10, y: 8, z: -20 }, size: [4, 1, 4], texture: "https://www.dailysummary.io/textures/hardwood2_diffuse.jpg" },
      { type: "box", position: { x: 15, y: 10, z: -20 }, size: [4, 1, 4], texture: "https://www.dailysummary.io/textures/hardwood2_diffuse.jpg" },
      { type: "box", position: { x: 20, y: 12, z: -20 }, size: [4, 1, 4], texture: "https://www.dailysummary.io/textures/hardwood2_diffuse.jpg" },

      // Central tower platform
      { type: "box", position: { x: 0, y: 10, z: 0 }, size: [6, 1, 6], color: "#00ffff" },

      // House base
      { type: "box", position: { x: -30, y: 0, z: 20 }, size: [10, 2, 10], texture: "https://www.dailysummary.io/textures/brick_diffuse.jpg" }, // floor
      { type: "box", position: { x: -35, y: 3, z: 20 }, size: [1, 6, 10], texture: "https://www.dailysummary.io/textures/brick_diffuse.jpg" },    // left wall
      { type: "box", position: { x: -25, y: 3, z: 20 }, size: [1, 6, 10], texture: "https://www.dailysummary.io/textures/brick_diffuse.jpg" },    // right wall
      { type: "box", position: { x: -30, y: 3, z: 25 }, size: [10, 6, 1], texture: "https://www.dailysummary.io/textures/brick_diffuse.jpg" },    // back wall
      { type: "box", position: { x: -30, y: 7, z: 20 }, size: [10, 1, 10], texture: "https://www.dailysummary.io/textures/brick_diffuse.jpg" }     // roof
    ],
    healthPacks: [
      { id: 'hp1', position: { x: 0, y: 11, z: 0 }, available: true },
      { id: 'hp2', position: { x: -30, y: 8, z: 20 }, available: true }
    ]
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

function rayIntersectsAABB(origin, dir, maxDist, min, max) {
  let tmin = (min.x - origin.x) / dir.x;
  let tmax = (max.x - origin.x) / dir.x;
  if (tmin > tmax) [tmin, tmax] = [tmax, tmin];

  let tymin = (min.y - origin.y) / dir.y;
  let tymax = (max.y - origin.y) / dir.y;
  if (tymin > tymax) [tymin, tymax] = [tymax, tymin];

  if ((tmin > tymax) || (tymin > tmax)) return false;
  if (tymin > tmin) tmin = tymin;
  if (tymax < tmax) tmax = tymax;

  let tzmin = (min.z - origin.z) / dir.z;
  let tzmax = (max.z - origin.z) / dir.z;
  if (tzmin > tzmax) [tzmin, tzmax] = [tzmax, tzmin];

  if ((tmin > tzmax) || (tzmin > tmax)) return false;
  const hitDist = tzmin > tmin ? tzmin : tmin;
  return hitDist >= 0 && hitDist <= maxDist;
}

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  playerLastSeen[socket.id] = Date.now();

  socket.on('createRoom', ({ name }, callback) => {
    const roomId = `room-${Math.random().toString(36).substr(2, 6)}`;
    rooms[roomId] = {
      players: {},
      map: maps.default
    };
    socket.join(roomId);
    rooms[roomId].players[socket.id] = { name, position: { x: 0, y: 0, z: 0 }, health: 100 };
    console.warn("Player created room", socket.id);
    socket.emit("loadMap", rooms[roomId].map);
    callback({ roomId, health: 100 });
    io.to(roomId).emit('playerList', rooms[roomId].players);
  });

  socket.on('joinRoom', ({ roomId, name }, callback) => {
    if (!rooms[roomId]) return callback({ error: 'Room not found' });
    socket.join(roomId);
    rooms[roomId].players[socket.id] = { name, position: { x: 0, y: 0, z: 0 }, health: 100 };
    console.warn("Player joined room", socket.id);
    socket.emit("loadMap", rooms[roomId].map);
    callback({ success: true, health: 100 });
    io.to(roomId).emit('playerList', rooms[roomId].players);
  });

  socket.on('move', (data) => {
    try {
      const { roomId, position, rotation } = data;
      if (!roomId || !position) return;
      const room = rooms[roomId];
      if (room?.players[socket.id]) {
        room.players[socket.id].position = position;
        room.players[socket.id].rotation = rotation;
        socket.to(roomId).emit('playerMoved', {
          id: socket.id,
          position,
          rotation
        });
        tryPickupHealthPack(roomId, socket.id);
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

    const laser = {
      id,
      shooterId: socket.id,
      origin,
      direction,
      position: { ...origin },
      life: 2000, // ms to live
      speed: 100  // units/sec
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

  socket.on('disconnect', () => {
    handleDisconnect(socket);
  });

  socket.on('getRooms', (callback) => {
    const availableRooms = Object.entries(rooms).map(([id, room]) => ({
      id,
      count: Object.keys(room.players).length
    }));
    callback(availableRooms);
  });

  socket.on("heartbeat", () => {
    playerLastSeen[socket.id] = Date.now();
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
      delete rooms[roomId].players[socket.id];
      io.to(roomId).emit('playerDisconnected', socket.id);
      console.log(`Client disconnected: ${socket.id}`);
      if (Object.keys(rooms[roomId].players).length === 0) {
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
    if (now - playerLastSeen[id] > 15000) {
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
}, 10000);

function cleanupStalePlayer(id) {
  for (const roomId in rooms) {
    if (rooms[roomId].players[id]) {
      delete rooms[roomId].players[id];
      io.to(roomId).emit('playerDisconnected', id);
      console.log(`Client disconnected: ${socket.id}`);
      if (Object.keys(rooms[roomId].players).length === 0) {
        delete rooms[roomId];
        console.warn("Room deleted (stale cleanup):", roomId);
      }
      break;
    }
  }
  delete playerLastSeen[id];
}

function respawnPlayer(roomId, playerId) {
  const room = rooms[roomId];
  if (!room || !room.players[playerId]) return;

  // Reset data after delay
  setTimeout(() => {

    // Notify player (so they can update UI and visuals)
    io.to(roomId).emit('playerDied', {
      playerId: playerId,
      position: room.players[playerId].position
    });

    const spawnPosition = { x: 0, y: 0, z: 0 }; // change as needed
    room.players[playerId].position = spawnPosition;

    // Optionally, reset health too
    room.players[playerId].health = 100;

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
      rotation: { x: 0, y: 0, z: 0 }
    });
  }, 1000);
}

setInterval(() => {
  const now = Date.now();

  const delta = 1000 / 60.0; // ~16ms per tick
  for (const roomId in activeLasers) {
    const lasers = activeLasers[roomId];
    const room = rooms[roomId];
    if (!room) continue;

    for (let i = lasers.length - 1; i >= 0; i--) {
      const laser = lasers[i];
      const moveDistance = (laser.speed * delta) / 1000;

      // Track previous position for swept collision
      laser.prevPosition = { ...laser.position };

      // Check if laser hit a map object (using AABB)
      let blocked = false;
      for (const obj of room.map.objects) {
        const halfSize = {
          x: obj.size[0] / 2,
          y: obj.size[1] / 2,
          z: obj.size[2] / 2
        };
        const min = {
          x: obj.position.x - halfSize.x,
          y: obj.position.y - halfSize.y,
          z: obj.position.z - halfSize.z
        };
        const max = {
          x: obj.position.x + halfSize.x,
          y: obj.position.y + halfSize.y,
          z: obj.position.z + halfSize.z
        };

        if (rayIntersectsAABB(laser.prevPosition, laser.direction, moveDistance, min, max)) {
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
      laser.life -= delta;

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

          hitPlayer.health -= 10;
          if (hitPlayer.health <= 0) {
            respawnPlayer(roomId, hitId);
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
            health: hitPlayer.health
          });
        }
      }
    }
  }
}, 1000 / 60); // 60 FPS

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
