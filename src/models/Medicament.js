// C:\reactjs node mongodb\pharmacie-backend\src\models\Medicament.js
const mongoose = require('mongoose');

const medicamentSchema = new mongoose.Schema({
  nom: { type: String, required: true },
  nom_generique: { type: String },
  description: { type: String },
  categorie: { type: String },
  prix: { type: Number, required: true },
  quantite_stock: { type: Number, required: true }, // Changed to match example
  date_peremption: { type: Date },
  dosage: { type: String },
  forme: { type: String },
  est_sur_ordonnance: { type: Boolean, default: false },
  code_barre: { type: String },
  pharmacie: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // pharmacieId
    required: true
  },
  image: { // Added for image support
    nomFichier: { type: String },
    cheminFichier: { type: String },
    typeFichier: { type: String },
    tailleFichier: { type: Number },
    dateUpload: { type: Date, default: Date.now }
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Medicament', medicamentSchema);