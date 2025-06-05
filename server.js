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

const maps = {
  default: {
    name: "Default Arena",
    objects: [
      { type: "box", position: { x: 0, y: 0, z: -5 }, size: [2, 2, 2], color: "#ff0000" },
      { type: "ground", position: { x: 0, y: -1, z: 0 }, size: [50, 1, 50], color: "#444444" }
    ]
  }
};

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
    rooms[roomId].players[socket.id] = { name, position: { x: 0, y: 0, z: 0 } };
    console.warn("Player created room", socket.id);
    socket.emit("loadMap", rooms[roomId].map);
    callback({ roomId });
    io.to(roomId).emit('playerList', rooms[roomId].players);
  });

  socket.on('joinRoom', ({ roomId, name }, callback) => {
    if (!rooms[roomId]) return callback({ error: 'Room not found' });
    socket.join(roomId);
    rooms[roomId].players[socket.id] = { name, position: { x: 0, y: 0, z: 0 } };
    console.warn("Player joined room", socket.id);
    socket.emit("loadMap", rooms[roomId].map);
    callback({ success: true });
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
