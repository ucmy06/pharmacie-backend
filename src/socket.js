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
    
    // Événement unifié pour rejoindre une salle
    socket.on('joinRoom', (userId) => {
      socket.join(userId);
      console.log(`🔗 Socket ${socket.id} a rejoint la salle: ${userId}`);
      
      // Confirmer la connexion
      socket.emit('roomJoined', { 
        room: userId, 
        socketId: socket.id,
        timestamp: new Date().toISOString()
      });
    });
    
    // Compatibilité avec l'ancien système
    socket.on('join', (userId) => {
      socket.join(userId);
      console.log(`🔗 Socket ${socket.id} a rejoint la salle (join): ${userId}`);
    });
    
    socket.on('joinPharmacie', (userId) => {
      socket.join(userId);
      console.log(`🔗 Pharmacie ${socket.id} a rejoint la salle: ${userId}`);
    });
    
    // Événement de test pour vérifier la connexion
    socket.on('ping', (data) => {
      console.log('🏓 Ping reçu:', data);
      socket.emit('pong', { 
        message: 'Connexion active', 
        timestamp: new Date().toISOString(),
        socketId: socket.id 
      });
    });
    
    socket.on('disconnect', (reason) => {
      console.log('🔗 Client WebSocket déconnecté:', socket.id, 'Raison:', reason);
    });
  });

  return { server, io };
};

const getIo = () => {
  if (!io) {
    console.warn('⚠️ Socket.IO non initialisé!');
    return null;
  }
  return io;
};

module.exports = { initializeSocket, getIo };