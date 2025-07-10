//C:\reactjs node mongodb\pharmacie-backend\src\config\database.js

const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Connexion à la base principale des utilisateurs
    const conn = await mongoose.connect('mongodb://localhost:27017/pharmone_users', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(`✅ MongoDB Users Connected: ${conn.connection.host}`);
    
    return conn;
  } catch (error) {
    console.error('❌ Erreur de connexion MongoDB:', error.message);
    process.exit(1);
  }
};

// Fonction pour se connecter aux bases de pharmacies existantes
const connectToPharmacyDB = (pharmacyName) => {
  try {
    const pharmacyDB = mongoose.connection.useDb(`pharmacie_${pharmacyName}`);
    return pharmacyDB;
  } catch (error) {
    console.error(`❌ Erreur connexion pharmacie ${pharmacyName}:`, error.message);
    throw error;
  }
};

module.exports = {
  connectDB,
  connectToPharmacyDB
};