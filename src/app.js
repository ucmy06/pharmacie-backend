// C:\reactjs node mongodb\pharmacie-backend\src\app.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const listEndpoints = require('express-list-endpoints');
const mongoose = require('mongoose');
const { mongodbLogger, httpLogger, initializeMongoLogging } = require('./middlewares/mongodbLogger');

const app = express(); // Création de l'application Express

// 🌐 Sécurité & limites de requêtes
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));
app.use(helmet());
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 📂 Fichiers statiques
const uploadsPath = path.join(__dirname, '../uploads');
app.use('/uploads', express.static(uploadsPath));
console.log('🛠️ Fichiers statiques servis depuis :', uploadsPath);

// ✅ Initialiser le logging MongoDB
initializeMongoLogging();

// ✅ Appliquer le plugin globalement (optionnel mais recommandé)
const { User, ConnexionPharmacie } = require('./models/User');
const loggerPlugin = mongodbLogger();
User.schema.plugin(loggerPlugin);
ConnexionPharmacie.schema.plugin(loggerPlugin);
mongoose.plugin(loggerPlugin); // Optionnel : appliquer à tous les modèles

// ✅ Logging des requêtes HTTP
app.use(httpLogger);

// ✅ Logging spécifique pour connexion pharmacie
app.use('/api/pharmacies/login', (req, res, next) => {
  console.log('🔐 === DÉBUT CONNEXION PHARMACIE ===');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Body reçu:', {
    ...req.body,
    motDePasse: req.body.motDePasse ? `[MASQUÉ - ${req.body.motDePasse.length} caractères]` : null
  });
  console.log('Headers:', req.headers);
  next();
});

// ✅ Logging spécifique pour changement de mot de passe
app.use('/api/pharmacies/changer-mot-de-passe', (req, res, next) => {
  console.log('🔄 === DÉBUT CHANGEMENT MOT DE PASSE ===');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Body reçu:', {
    ...req.body,
    nouveauMotDePasse: req.body.nouveauMotDePasse ? `[MASQUÉ - ${req.body.nouveauMotDePasse.length} caractères]` : null
  });
  console.log('Headers:', req.headers);
  next();
});

// ✅ Logging de fin de requête
const logResponseEnd = (label) => (req, res, next) => {
  const originalSend = res.send;
  res.send = function (body) {
    console.log(`${label} ===`);
    console.log('Status:', res.statusCode);
    console.log('Response:', typeof body === 'string' ? body : JSON.stringify(body));
    console.log('==========================================');
    return originalSend.call(this, body);
  };
  next();
};

app.use('/api/pharmacies/login', logResponseEnd('🔐 FIN CONNEXION PHARMACIE'));
app.use('/api/pharmacies/changer-mot-de-passe', logResponseEnd('🔄 FIN CHANGEMENT MOT DE PASSE'));


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

// ❌ 404 Not Found
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route non trouvée'
  });
});

// ❌ Erreur serveur
app.use((err, req, res, next) => {
  console.error('❌ ERREUR SERVEUR :', {
    timestamp: new Date().toISOString(),
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    body: req.body
  });
  res.status(500).json({
    success: false,
    message: 'Erreur interne du serveur'
  });
});

// 📋 Affichage des routes
console.log('📋 Routes définies dans l’API :');
console.log(listEndpoints(app));

module.exports = app;
