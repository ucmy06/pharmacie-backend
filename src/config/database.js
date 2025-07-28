// C:\reactjs node mongodb\pharmacie-backend\src\config\database.js

const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    mongoose.set('debug', true); // Activer le débogage Mongoose
    const conn = await mongoose.connect('mongodb://127.0.0.1:27017/pharmacies', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host} (base: pharmacies)`);
    return conn;
  } catch (error) {
    console.error('❌ Erreur de connexion MongoDB:', error.message);
    process.exit(1);
  }
};

// Fonction pour se connecter aux bases de pharmacies existantes
const connectToPharmacyDB = (pharmacyName) => {
  try {
    const pharmacyDB = mongoose.connection.useDb(pharmacyName, { useCache: false });
    console.log(`✅ Connecté à la base pharmacie: ${pharmacyName}`);
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