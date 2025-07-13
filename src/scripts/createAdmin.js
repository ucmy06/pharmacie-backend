//C:\reactjs node mongodb\pharmacie-backend\src\scripts\createAdmin.js
const mongoose = require('mongoose');
const { User } = require('../models/User');
const { connectDB } = require('../config/database');

const createDefaultAdmin = async () => {
  try {
    // Connexion à la base de données
    await connectDB();
    
    // Vérifier si l'admin existe déjà
    const existingAdmin = await User.findOne({ 
      email: 'julienguenoukpati825@gmail.com' 
    });
    
    if (existingAdmin) {
      console.log('⚠️  L\'administrateur par défaut existe déjà');
      return;
    }
    
    // Créer l'administrateur par défaut
    const defaultAdmin = new User({
        nom: "GUENOUKPATI",
        prenom: "malike",
        telephone: "+22898350449",  // ✅ Nom correct
        email: "julienguenoukpati825@gmail.com",
        motDePasse: "Jul26531",  // ✅ Nom correct
        role: "admin",
        isActive: true,  // ✅ Nom correct
        isVerified: true
    });
    
    await defaultAdmin.save();
    
    console.log('✅ Administrateur par défaut créé avec succès !');
    console.log('📧 Email: julienguenoukpati825@gmail.com');
    console.log('🔐 Mot de passe: Jul26531');
    console.log('👤 Rôle: Administrateur');
    
  } catch (error) {
    console.error('❌ Erreur lors de la création de l\'admin:', error.message);
  } finally {
    mongoose.connection.close();
  }
};

// Exécuter le script si appelé directement
if (require.main === module) {
  createDefaultAdmin();
}

module.exports = createDefaultAdmin;