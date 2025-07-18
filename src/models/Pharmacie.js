// C:\reactjs node mongodb\pharmacie-backend\src\models\Pharmacie.js
const mongoose = require('mongoose');

const connexionLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  email: String,
  dateConnexion: { type: Date, default: Date.now },
});

const documentSchema = new mongoose.Schema({
  nomFichier: String,
  cheminFichier: String,
  typeFichier: String,
  tailleFichier: Number,
  dateUpload: { type: Date, default: Date.now }
});

const pharmacieSchema = new mongoose.Schema({
  nomPharmacie: { type: String, required: true },
  numeroPharmacie: { type: String, required: true, unique: true }, // Ajouté
  adresseGoogleMaps: { type: String, required: true },
  emailPharmacie: { type: String, required: true, unique: true },
  telephonePharmacie: { type: String, required: true },
  motDePassePharmacie: { type: String, required: true },
  motDePasseTemporaire: { type: Boolean, default: true }, // Ajouté
  photoPharmacie: { type: String },

  // Champs éditables librement
  heureOuverture: { type: String },
  heureFermeture: { type: String },
  livraisonDisponible: { type: Boolean, default: false },
  periodeDeGarde: { type: String },

  // Champs système
  statut: { type: String, enum: ['en_attente', 'approuvee', 'rejettee'], default: 'en_attente' },
  demandeSuppression: { type: Boolean, default: false }, // Ajouté

  // Références
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  documentsVerification: [documentSchema],
  historiqueConnexions: [connexionLogSchema]
}, { timestamps: true });

module.exports = mongoose.model('Pharmacie', pharmacieSchema);
