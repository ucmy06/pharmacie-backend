const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const listEndpoints = require('express-list-endpoints');

const app = express(); // Création de l'application Express

// ⚙️ Middleware de sécurité
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));
app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // Limite à 100 requêtes
});
app.use(limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 📂 Fichiers statiques (uploads : images, documents)
const uploadsPath = path.join(__dirname, '../uploads');
app.use('/uploads', express.static(uploadsPath));
console.log('🛠️ Fichiers statiques servis depuis :', uploadsPath);

// 📦 Import des routes
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');
const pharmaciesRoutes = require('./routes/pharmacies');
const medicamentsRoutes = require('./routes/medicaments');
const demandePharmacieRoutes = require('./routes/demandePharmacie');
// const commandesRoutes = require('./routes/commandes');

// 🔗 Utilisation des routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/pharmacies', pharmaciesRoutes);
app.use('/api/medicaments', medicamentsRoutes);
app.use('/api/demande-pharmacie', demandePharmacieRoutes);
// app.use('/api/commandes', commandesRoutes);

// 🧪 Route de test
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'API Pharmacie fonctionnelle',
    timestamp: new Date().toISOString()
  });
});

// ❌ 404 Not Found (doit venir APRÈS les routes valides !)
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route non trouvée'
  });
});

// ❌ Gestion des erreurs serveur
app.use((err, req, res, next) => {
  console.error('❌ Erreur serveur :', err);
  res.status(500).json({
    success: false,
    message: 'Erreur interne du serveur'
  });
});

// 📋 Affiche les routes définies au démarrage
console.log('📋 Routes définies dans l’API :');
console.log(listEndpoints(app));

module.exports = app;
