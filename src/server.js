// Fichier : C:\reactjs-node-mongodb\pharmacie-backend\src\server.js
require('dotenv').config();
const app = require('./app'); // Importe la configuration Express
const mongoose = require('mongoose');

// Port par défaut
const PORT = process.env.PORT || 3001;

// Import correct du modèle User
const { User } = require('./models/User');

const createDefaultAdmin = async () => {
  try {
    const exists = await User.findOne({ email: "julienguenoukpati825@gmail.com" });
    if (!exists) {
      await User.create({
        nom: "GUENOUKPATI",
        prenom: "malike",
        telephone: "+22898350449",  // Nom correct du champ
        email: "julienguenoukpati825@gmail.com",
        motDePasse: "Jul26531",  // Nom correct du champ
        role: "admin",
        isActive: true,  // Nom correct du champ
        isVerified: true
      });
      console.log("✅ Compte administrateur créé.");
    } else {
      console.log("⚠️ Compte administrateur existe déjà.");
    }
  } catch (error) {
    console.error("❌ Erreur création admin:", error);
  }
};

// Connexion MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pharmacie_db')
  .then(async () => {
    console.log('✅ Connecté à MongoDB');
    
    // Créer l'admin par défaut après connexion
    await createDefaultAdmin();
    
    // Démarrage du serveur après connexion DB
    app.listen(PORT, () => {
      console.log(`🚀 API en écoute sur http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ Erreur de connexion MongoDB:', err);
    process.exit(1); // Arrête l'application en cas d'erreur
  });

// Gestion des arrêts propres
process.on('SIGINT', () => {
  console.log('\n🔄 Arrêt du serveur...');
  mongoose.connection.close(() => {
    console.log('🔌 Déconnecté de MongoDB');
    process.exit(0);
  });
});
const listEndpoints = require('express-list-endpoints');
console.log(listEndpoints(app));
