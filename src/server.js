require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const mongoose = require('mongoose');
const { mongodbLogger, httpLogger, initializeMongoLogging } = require('./middlewares/mongodbLogger');
const listEndpoints = require('express-list-endpoints');
const { User, ConnexionPharmacie } = require('./models/User');

const app = express();

// Sécurité & limites de requêtes
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  exposedHeaders: ['Content-Type', 'Authorization']
}));
app.use(helmet({
  crossOriginResourcePolicy: false,
  crossOriginEmbedderPolicy: false
}));
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Fichiers statiques avec CORS
const uploadsPath = path.join(__dirname, '../Uploads');
app.use('/Uploads', cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}), (req, res, next) => {
  console.log('📷 Requête pour fichier statique:', {
    url: req.url,
    method: req.method,
    headers: req.headers
  });
  const originalSendFile = res.sendFile;
  res.sendFile = function (...args) {
    console.log('📷 Envoi fichier:', {
      url: req.url,
      headersSent: res.getHeaders()
    });
    return originalSendFile.apply(this, args);
  };
  next();
}, express.static(uploadsPath));
app.use('/Uploads/medicaments', cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}), express.static(path.join(__dirname, '../Uploads/medicaments')));
console.log('🛠️ Fichiers statiques servis depuis :', uploadsPath);

// Endpoint pour servir les images avec CORS
app.get('/api/images/:type/:filename', (req, res) => {
  const { type, filename } = req.params;
  const validTypes = ['pharmacies', 'documents', 'medicaments'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ success: false, message: 'Type de fichier invalide' });
  }
  const filePath = path.join(__dirname, '../Uploads', type, filename);
  console.log('📷 Envoi image via API:', { filePath, headers: res.getHeaders() });
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('❌ Erreur envoi image:', err);
      res.status(404).json({ success: false, message: 'Image non trouvée' });
    }
  });
});

// Initialiser le logging MongoDB
initializeMongoLogging();

// Appliquer le plugin de logging
const loggerPlugin = mongodbLogger();
User.schema.plugin(loggerPlugin);
ConnexionPharmacie.schema.plugin(loggerPlugin);
mongoose.plugin(loggerPlugin);

// Logging des requêtes HTTP
app.use(httpLogger);

// Logging spécifique pour connexion pharmacie
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

// Logging spécifique pour changement de mot de passe
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

// Logging de fin de requête
const logResponseEnd = (label) => (req, res, next) => {
  const originalSend = res.send;
  res.send = function (body) {
    console.log(`${label} ===`);
    console.log('Status:', res.statusCode);
    console.log('Response:', typeof body === 'string' ? body : JSON.stringify(body));
    console.log('Headers envoyés:', res.getHeaders());
    console.log('==========================================');
    return originalSend.call(this, body);
  };
  next();
};

app.use('/api/pharmacies/login', logResponseEnd('🔐 FIN CONNEXION PHARMACIE'));
app.use('/api/pharmacies/changer-mot-de-passe', logResponseEnd('🔄 FIN CHANGEMENT MOT DE PASSE'));

// Import des routes
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');
const pharmaciesRoutes = require('./routes/pharmacies');
const medicamentsRoutes = require('./routes/medicaments');
const demandePharmacieRoutes = require('./routes/demandePharmacie');
const clientRoutes = require('./routes/client');

// Utilisation des routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/pharmacies', pharmaciesRoutes);
app.use('/api/medicaments', medicamentsRoutes);
app.use('/api/demande-pharmacie', demandePharmacieRoutes);
app.use('/api/client', clientRoutes);

// Route de test
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'API Pharmacie fonctionnelle',
    timestamp: new Date().toISOString()
  });
});

// 404 Not Found
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route non trouvée'
  });
});

// Gestion des erreurs serveur
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

// Créer un admin par défaut
const createDefaultAdmin = async () => {
  try {
    const exists = await User.findOne({ email: "julienguenoukpati825@gmail.com" });
    if (!exists) {
      await User.create({
        nom: "GUENOUKPATI",
        prenom: "malike",
        telephone: "+22898350449",
        email: "julienguenoukpati825@gmail.com",
        motDePasse: "Jul26531",
        role: "admin",
        isActive: true,
        isVerified: true
      });
      console.log("✅ Compte administrateur créé.");
    } else {
      console.log("⚠️ Compte administrateur existe déjà.");
    }
  } catch (error) {
    console.error("❌ Erreur création admin :", error);
  }
};

// Connexion à MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/pharmacie_db';
const PORT = process.env.PORT || 3001;

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  console.log('✅ Connecté à MongoDB');
  await createDefaultAdmin();
  app.listen(PORT, () => {
    console.log(`🚀 API en écoute sur http://localhost:${PORT}`);
    console.log('📋 Routes définies :', listEndpoints(app));
  });
}).catch(err => {
  console.error('❌ Erreur de connexion MongoDB :', err);
  process.exit(1);
});

// Gestion de l'arrêt du serveur
process.on('SIGINT', () => {
  console.log('\n🔄 Arrêt du serveur...');
  mongoose.connection.close(() => {
    console.log('🔌 Déconnecté de MongoDB');
    process.exit(0);
  });
});