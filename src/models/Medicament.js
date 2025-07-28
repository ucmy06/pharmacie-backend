// C:\reactjs node mongodb\pharmacie-backend\src\models\Medicament.js
const mongoose = require('mongoose');

const medicamentSchema = new mongoose.Schema({
  nom: { type: String, required: true, trim: true },
  nom_generique: { type: String, trim: true },
  description: { type: String, trim: true },
  categorie: { type: String, trim: true },
  prix: { type: Number, required: true, min: 0 },
  quantite_stock: { type: Number, required: true, min: 0 },
  date_peremption: { type: Date },
  dosage: { type: String, trim: true }, 
  forme: { type: String, trim: true },
  est_sur_ordonnance: { type: Boolean, default: false },
  code_barre: { type: String, trim: true },
  pharmacie: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  image: {
    nomFichier: { type: String },
    cheminFichier: { type: String },
    typeFichier: { type: String },
    tailleFichier: { type: Number },
    dateUpload: { type: Date }
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Medicament', medicamentSchema);