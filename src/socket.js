// C:\reactjs node mongodb\pharmacie-backend\src\socket.js

const { Server } = require('socket.io');
const http = require('http');

let io;

const initializeSocket = (app) => {
  const server = http.createServer(app);
  io = new Server(server, {
    cors: {
      origin: 'http://localhost:3000',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    console.log('🔗 Client WebSocket connecté:', socket.id);
    socket.on('joinPharmacie', (userId) => {
      socket.join(userId);
      console.log(`🔗 Client rejoint la salle: ${userId}`);
    });
    socket.on('disconnect', () => {
      console.log('🔗 Client WebSocket déconnecté:', socket.id);
    });
  });

  return { server, io };
};

module.exports = { initializeSocket, getIo: () => io };