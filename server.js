import http from 'http';
import { Server } from 'socket.io';

const server = http.createServer();
const io = new Server(server, {
  cors: {
    origin: '*'
  }
});

const rooms = {};

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('createRoom', ({ name }, callback) => {
    const roomId = `room-${Math.random().toString(36).substr(2, 6)}`;
    rooms[roomId] = { players: {} };
    socket.join(roomId);
    rooms[roomId].players[socket.id] = { name, position: { x: 0, y: 0, z: 0 } };
    callback({ roomId });
    io.to(roomId).emit('playerList', rooms[roomId].players);
  });

  socket.on('joinRoom', ({ roomId, name }, callback) => {
    if (!rooms[roomId]) return callback({ error: 'Room not found' });
    socket.join(roomId);
    rooms[roomId].players[socket.id] = { name, position: { x: 0, y: 0, z: 0 } };
    callback({ success: true });
    io.to(roomId).emit('playerList', rooms[roomId].players);
  });

  socket.on('move', ({ roomId, position }) => {
    const room = rooms[roomId];
    if (room && room.players[socket.id]) {
      room.players[socket.id].position = position;
      socket.to(roomId).emit('playerMoved', { id: socket.id, position });
    }
  });

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      if (rooms[roomId].players[socket.id]) {
        delete rooms[roomId].players[socket.id];
        socket.to(roomId).emit('playerDisconnected', socket.id);
        if (Object.keys(rooms[roomId].players).length === 0) {
          delete rooms[roomId];
        }
        break;
      }
    }
    console.log(`Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
