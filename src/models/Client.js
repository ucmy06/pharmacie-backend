// C:\reactjs node mongodb\pharmacie-backend\src\models\Admin.js
const mongoose = require('mongoose');

/**
 * Schéma principal de l'utilisateur
 */
const userSchema = new mongoose.Schema({
  nom: {
    type: String,
    required: [true, 'Le nom est requis'],
    trim: true
  },
  prenom: {
    type: String,
    required: [true, 'Le prénom est requis'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'L\'email est requis'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Email invalide']
  },
  telephone: {
    type: String,
    required: [true, 'Le téléphone est requis'],
    trim: true
  },
  motDePasse: {
    type: String,
    required: [true, 'Le mot de passe est requis'],
    minlength: [6, 'Le mot de passe doit contenir au moins 6 caractères']
  },
  motDePasseTemporaire: {
    type: Boolean,
    default: false
  },
  adresse: {
    type: String,
    trim: true
  },
  dateNaissance: {
    type: Date
  },
  sexe: {
    type: String,
    enum: ['homme', 'femme', 'autre']
  },
  role: {
    type: String,
    enum: ['Admin'],
    default: 'Admin'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: {
    type: String
  },
  verificationTokenExpires: {
    type: Date
  },
  resetPasswordToken: {
    type: String
  },
  resetPasswordExpires: {
    type: Date
  },
  pushSubscription: {
    type: Object, // Stocke l'abonnement push (endpoint, keys.auth, keys.p256dh)
    default: null
  }, // AJOUTER ICI
  lastLogin: {
    type: Date
  },
  pharmacieInfo: {
    type: pharmacieInfoSchema,
    default: null
  },
  demandePharmacie: {
    statutDemande: {
      type: String,
      enum: ['aucune', 'en_attente', 'approuvee', 'rejetee'],
      default: 'aucune'
    },
    dateDemande: Date,
    informationsPharmacie: {
      nomPharmacie: String,
      adresseGoogleMaps: String,
      emailPharmacie: String,
      telephonePharmacie: String,
      photoPharmacie: {
        nomFichier: { type: String, required: false },
        cheminFichier: { type: String, required: false },
        typeFichier: { type: String, required: false },
        tailleFichier: { type: Number, required: false },
        dateUpload: { type: Date, default: Date.now }
      },
      documentsVerification: [{
        nomFichier: String,
        cheminFichier: String,
        typeFichier: String,
        tailleFichier: Number,
        dateUpload: { type: Date, default: Date.now }
      }]
    },
    demandeModification: {
      nom: String,
      email: String,
      numero: String,
      positionGoogleMaps: String,
      photoPharmacie: {
        nomFichier: { type: String, required: false },
        cheminFichier: { type: String, required: false },
        typeFichier: { type: String, required: false },
        tailleFichier: { type: Number, required: false },
        dateUpload: { type: Date, default: Date.now }
      },
      statut: { type: String, enum: ['en_attente', 'approuvee', 'rejetee'], default: 'en_attente' },
      dateDemande: Date
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    motifRejet: String,
    dateApprobation: Date,
    dateRejet: Date
  }
}, {
  timestamps: true
});
