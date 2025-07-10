// C:\reactjs node mongodb\pharmacie-backend\src\models\User.js

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * Schéma pour les informations de pharmacie
 */
const pharmacieInfoSchema = new mongoose.Schema({
  nomPharmacie: {
    type: String,
    required: function() { return this.parent().role === 'pharmacie'; }
  },
  adresseGoogleMaps: {
    type: String,
    required: function() { return this.parent().role === 'pharmacie'; }
  },
  livraisonDisponible: {
    type: Boolean,
    default: false
  },
  estDeGarde: {
    type: Boolean,
    default: false
  },
  periodeGarde: {
    debut: Date,
    fin: Date
  },
  heuresOuverture: {
    lundi: { ouvert: Boolean, debut: String, fin: String },
    mardi: { ouvert: Boolean, debut: String, fin: String },
    mercredi: { ouvert: Boolean, debut: String, fin: String },
    jeudi: { ouvert: Boolean, debut: String, fin: String },
    vendredi: { ouvert: Boolean, debut: String, fin: String },
    samedi: { ouvert: Boolean, debut: String, fin: String },
    dimanche: { ouvert: Boolean, debut: String, fin: String }
  },
  documentsVerification: [{
    nomFichier: String,
    cheminFichier: String,
    typeFichier: String,
    tailleFichier: Number,
    dateUpload: { type: Date, default: Date.now },
    statutVerification: {
      type: String,
      enum: ['en_attente', 'verifie', 'rejete'],
      default: 'en_attente'
    }
  }],
  statutDemande: {
    type: String,
    enum: ['en_attente', 'approuvee', 'rejetee'],
    default: 'en_attente'
  },
  motifRejet: String,
  dateApprobation: Date,
  dateRejet: Date
});

/**
 * Schéma pour les connexions utilisateur-pharmacie
 */
const connexionPharmacieSchema = new mongoose.Schema({
  utilisateurId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  pharmacieId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  dateConnexion: {
    type: Date,
    default: Date.now
  },
  informationsUtilisateur: {
    nom: String,
    prenom: String,
    email: String,
    telephone: String,
    adresse: String
  }
});

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
    enum: ['client', 'pharmacie', 'admin'],
    default: 'client'
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
  lastLogin: {
    type: Date
  },
  // Informations spécifiques aux pharmacies
  pharmacieInfo: {
    type: pharmacieInfoSchema,
    default: null
  },
  // Nouvelle propriété pour les demandes de pharmacie
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
      livraisonDisponible: Boolean,
      documentsVerification: [{
        nomFichier: String,
        cheminFichier: String,
        typeFichier: String,
        tailleFichier: Number,
        dateUpload: { type: Date, default: Date.now }
      }]
    },
    motifRejet: String,
    dateApprobation: Date,
    dateRejet: Date
  }
}, {
  timestamps: true
});

/**
 * Middleware de hachage du mot de passe avant sauvegarde
 */
userSchema.pre('save', async function(next) {
  if (!this.isModified('motDePasse')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.motDePasse = await bcrypt.hash(this.motDePasse, salt);
    next();
  } catch (error) {
    next(error);
  }
});

/**
 * Méthode pour comparer les mots de passe
 */
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.motDePasse);
  } catch (error) {
    throw new Error('Erreur lors de la comparaison des mots de passe');
  }
};


/**
 * Méthode pour obtenir les informations publiques
 */
userSchema.methods.getPublicProfile = function() {
  const userObject = this.toObject();
  delete userObject.motDePasse;
  delete userObject.resetPasswordToken;
  delete userObject.resetPasswordExpires;
  delete userObject.verificationToken;
  delete userObject.verificationTokenExpires;
  return userObject;
};

/**
 * Méthode pour générer un token de vérification
 */
userSchema.methods.generateVerificationToken = function() {
  const crypto = require('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  this.verificationToken = token;
  this.verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 heures
  return token;
};

/**
 * Méthode pour vérifier le token de vérification
 */
userSchema.methods.verifyToken = function(token) {
  return this.verificationToken === token && 
         this.verificationTokenExpires > Date.now();
};

/**
 * Schéma pour les connexions utilisateur-pharmacie (collection séparée)
 */
const connexionPharmacieSchemaModel = new mongoose.Schema({
  utilisateur: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  pharmacie: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  dateConnexion: {
    type: Date,
    default: Date.now
  },
  informationsUtilisateur: {
    nom: String,
    prenom: String,
    email: String,
    telephone: String,
    adresse: String
  },
  typeConnexion: {
    type: String,
    enum: ['consultation', 'commande', 'information'],
    default: 'consultation'
  }
}, {
  timestamps: true
});

const User = mongoose.model('User', userSchema);
const ConnexionPharmacie = mongoose.model('ConnexionPharmacie', connexionPharmacieSchemaModel);

module.exports = { User, ConnexionPharmacie };