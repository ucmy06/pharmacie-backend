// C:\reactjs node mongodb\pharmacie-backend\src\models\Commande.js

const mongoose = require('mongoose');

const commandeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  pharmacyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  medicaments: [{
    medicamentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicament', required: true }, // Ajouté ref: 'Medicament'
    nom: { type: String, required: true },
    quantite: { type: Number, required: true },
    prix: { type: Number, required: true },
    image: { type: String }, // Ajouté pour correspondre à client.js
  }],
  total: { type: Number, required: true },
  livraison: { type: Boolean, default: false },
  adresseLivraison: {
    latitude: Number,
    longitude: Number,
    adresseTexte: String,
  },
  statut: { 
    type: String, 
    enum: ['en_attente', 'en_cours', 'terminée', 'annulée'], // Ajouté enum pour valider les valeurs
    default: 'en_attente' // Aligné avec client.js
  },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Commande', commandeSchema);