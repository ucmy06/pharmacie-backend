// C:\reactjs node mongodb\pharmacie-backend\src\utils\testDB.js
const mongoose = require('mongoose');
const { User } = require('../models/User');

const testDatabaseConnection = async () => {
  try {
    console.log('🔍 =====  TEST DE LA BASE DE DONNÉES =====');
    
    // Connexion à la base
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pharmacies');
    console.log('✅ Connexion à MongoDB réussie');

    // Test de recherche d'utilisateurs
    const users = await User.find({});
    console.log('👥 Nombre d\'utilisateurs dans la base:', users.length);

    // Afficher les tokens de vérification actifs
    const usersWithTokens = await User.find({
      verificationToken: { $exists: true, $ne: null }
    });
    
    console.log('🔑 Utilisateurs avec tokens de vérification:', usersWithTokens.length);
    
    usersWithTokens.forEach(user => {
      console.log('📧 Email:', user.email);
      console.log('🔑 Token:', user.verificationToken);
      console.log('⏰ Expire le:', user.verificationTokenExpires);
      console.log('✅ Vérifié:', user.isVerified);
      console.log('---');
    });

    // Test de recherche par token (utilisez un token réel de votre base)
    const token = 'VOTRE_TOKEN_ICI'; // Remplacez par un token réel
    const userByToken = await User.findOne({
      verificationToken: token,
      verificationTokenExpires: { $gt: Date.now() }
    });
    
    console.log('🔍 Utilisateur trouvé par token:', userByToken ? 'OUI' : 'NON');
    
    console.log('🔍 =====  FIN TEST =====');
    
  } catch (error) {
    console.error('❌ Erreur test base de données:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Déconnexion de MongoDB');
  }
};

// Exécuter le test si ce fichier est appelé directement
if (require.main === module) {
  require('dotenv').config();
  testDatabaseConnection();
}

module.exports = testDatabaseConnection;