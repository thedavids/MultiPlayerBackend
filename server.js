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
    name: "Jump Arena",
    objects: [
      // Ground
      { type: "ground", position: { x: 0, y: -1, z: 0 }, size: [50, 1, 50], color: "#444444" },

      // Jump boxes (like steps or platforms)
      { type: "box", position: { x: 0, y: 0, z: -5 }, size: [2, 1, 2], color: "#ff0000" },
      { type: "box", position: { x: 3, y: 2, z: -5 }, size: [2, 1, 2], color: "#00ff00" },
      { type: "box", position: { x: 6, y: 4, z: -5 }, size: [2, 1, 2], color: "#0000ff" },
      { type: "box", position: { x: 9, y: 6, z: -5 }, size: [2, 1, 2], color: "#ffff00" },
      { type: "box", position: { x: 12, y: 8, z: -5 }, size: [2, 1, 2], color: "#ff00ff" },

      // Optional: a small top platform
      { type: "box", position: { x: 12, y: 10, z: -5 }, size: [3, 0.5, 3], color: "#00ffff" }
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

function socketToRoom(roomId, excludeSocketId) {
  return io.to(roomId).except(excludeSocketId);
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
});

function handleDisconnect(socket) {
  for (const roomId in rooms) {
    if (rooms[roomId].players[socket.id]) {
      delete rooms[roomId].players[socket.id];
      io.to(roomId).emit('playerDisconnected', socket.id);
      if (Object.keys(rooms[roomId].players).length === 0) {
        delete rooms[roomId];
        console.warn("Room deleted", roomId);
      }
      break;
    }
  }
  delete playerLastSeen[socket.id];
  console.log(`Client disconnected: ${socket.id}`);
}

setInterval(() => {
  const now = Date.now();
  for (const id in playerLastSeen) {
    if (now - playerLastSeen[id] > 15000) {
      const sock = io.sockets.sockets.get(id);
      if (sock) {
        console.warn("Client timeout disconnecting:", id);
        handleDisconnect(sock);
        sock.disconnect(); // Optional, just closes the socket cleanly
      }
    }
  }
}, 10000);

function respawnPlayer(roomId, playerId) {
  const room = rooms[roomId];
  if (!room || !room.players[playerId]) return;

  // Reset data after delay
  setTimeout(() => {
    const spawnPosition = { x: 0, y: 2, z: 0 }; // change as needed
    room.players[playerId].position = spawnPosition;

    // Optionally, reset health too
    room.players[playerId].health = 100;

    // Notify player (so they can update UI and visuals)
    io.to(playerId).emit('respawn', {
      position: spawnPosition,
      health: 100
    });

    // Also notify other players about position reset
    socketToRoom(roomId, playerId).emit('playerMoved', {
      id: playerId,
      position: spawnPosition,
      rotation: { x: 0, y: 0, z: 0 }
    });
  }, 1000);
}

setInterval(() => {
  const now = Date.now();

  for (const roomId in activeLasers) {
    const lasers = activeLasers[roomId];
    const room = rooms[roomId];
    if (!room) continue;

    for (let i = lasers.length - 1; i >= 0; i--) {
      const laser = lasers[i];
      const delta = 1000 / 60; // ~16ms per tick
      const moveDistance = (laser.speed * delta) / 1000;

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
        const dist = distanceVec3(laser.position, player.position);
        if (dist < hitRadius) {
          hitId = pid;
          hitPlayer = player;
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
