// C:\reactjs node mongodb\pharmacie-backend\src\app.js

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express(); // ✅ D'abord, on crée app

// Sécurité & Configuration
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));
app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ✅ Import des routes (après création d'app)
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');
const pharmaciesRoutes = require('./routes/pharmacies');
const medicamentsRoutes = require('./routes/medicaments'); // si existant
const commandesRoutes = require('./routes/commandes');

// ✅ Utilisation des routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/pharmacies', pharmaciesRoutes);
app.use('/api/medicaments', medicamentsRoutes);
app.use('/api/commandes', commandesRoutes);

// ✅ Route de test
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'API Pharmacie fonctionnelle',
    timestamp: new Date().toISOString()
  });
});

// ✅ 404
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route non trouvée'
  });
});

// ✅ Gestion des erreurs globales
app.use((err, req, res, next) => {
  console.error('❌ Erreur serveur:', err);
  res.status(500).json({
    success: false,
    message: 'Erreur interne du serveur'
  });
});

// pour voir d'ou viennent les erreurs les routes mal définies

const listEndpoints = require('express-list-endpoints');
console.log('📋 Liste des routes définies :');
console.log(listEndpoints(app));


module.exports = app;