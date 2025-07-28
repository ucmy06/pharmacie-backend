const mongoose = require('mongoose');

const commandeSchema = new mongoose.Schema({
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  pharmacieId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  medicaments: [{
    medicamentId: { type: mongoose.Schema.Types.ObjectId, required: true },
    quantite: { type: Number, required: true },
    prixUnitaire: { type: Number, required: true }
  }],
  total: { type: Number, required: true },
  livraison: { type: Boolean, default: false },
  adresseLivraison: {
    latitude: String,
    longitude: String,
    adresseTexte: String
  },
  statut: { type: String, enum: ['en_attente', 'prete', 'livree', 'annulee'], default: 'en_attente' },
  dateCreation: { type: Date, default: Date.now }
}, {
  timestamps: true
});

module.exports = mongoose.model('Commande', commandeSchema);