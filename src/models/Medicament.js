// src/models/Medicament.js
const mongoose = require('mongoose');

const medicamentSchema = new mongoose.Schema({
  nom: { type: String, required: true, trim: true },
  nom_generique: { type: String, trim: true },
  description: { type: String },
  prix: { type: Number, required: true },
  quantite_stock: { type: Number, required: true },
  est_sur_ordonnance: { type: Boolean, default: false },
  pharmacie: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Changé en ObjectId
  categorie: { type: String },
  forme: { type: String },
  date_peremption: { type: Date },
  dosage: { type: String },
  code_barre: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Medicament', medicamentSchema);