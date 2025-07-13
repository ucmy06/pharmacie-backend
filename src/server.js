// src/server.js
require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');
const { User } = require('./models/User');

// 🔐 Création du compte administrateur par défaut
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

// 🌐 Connexion à MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/pharmacie_db';
const PORT = process.env.PORT || 3001;

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('✅ Connecté à MongoDB');
    await createDefaultAdmin();

    // 🚀 Lancement du serveur
    app.listen(PORT, () => {
      console.log(`🚀 API en écoute sur http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ Erreur de connexion MongoDB :', err);
    process.exit(1);
  });

// 🔁 Gestion de l’arrêt propre du serveur
process.on('SIGINT', () => {
  console.log('\n🔄 Arrêt du serveur...');
  mongoose.connection.close(() => {
    console.log('🔌 Déconnecté de MongoDB');
    process.exit(0);
  });
});
