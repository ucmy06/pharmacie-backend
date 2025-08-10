const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const pharmacieSchema = new mongoose.Schema({
  nomPharmacie: { type: String, required: true },
  adresseGoogleMaps: { type: String, required: true },
  emailPharmacie: { type: String, required: true, unique: true },
  telephonePharmacie: { type: String, required: true },
  numeroPharmacie: { type: String, required: true, unique: true, trim: true },
  livraisonDisponible: { type: Boolean, default: false },
  estDeGarde: { type: Boolean, default: false },
  periodeGarde: {
    debut: { type: Date },
    fin: { type: Date },
  },
  heuresOuverture: {
    lundi: { ouvert: Boolean, debut: String, fin: String },
    mardi: { ouvert: Boolean, debut: String, fin: String },
    mercredi: { ouvert: Boolean, debut: String, fin: String },
    jeudi: { ouvert: Boolean, debut: String, fin: String },
    vendredi: { ouvert: Boolean, debut: String, fin: String },
    samedi: { ouvert: Boolean, debut: String, fin: String },
    dimanche: { ouvert: Boolean, debut: String, fin: String },
  },
  demandeSuppression: { type: Boolean, default: false },
  photoPharmacie: {
    nomFichier: { type: String },
    cheminFichier: { type: String },
    typeFichier: { type: String },
    tailleFichier: { type: Number },
    dateUpload: { type: Date, default: Date.now },
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
      default: 'en_attente',
    },
  }],
  statutDemande: {
    type: String,
    enum: ['en_attente', 'approuvee', 'rejetee'],
    default: 'en_attente',
  },
  baseMedicament: { type: String, default: null },
  motifRejet: { type: String },
  dateApprobation: { type: Date },
  dateRejet: { type: Date },
  commentaireApprobation: { type: String },
  approuvePar: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  employesAutorises: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: [] }],
  demandesIntegration: [{
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    statut: { type: String, enum: ['en_attente', 'approuvee', 'rejetee'], default: 'en_attente' },
    dateDemande: { type: Date, default: Date.now },
    motifRejet: { type: String },
    messageApprobation: { type: String },
  }],
  motDePasse: {
    type: String,
    required: true,
    minlength: 6,
    select: false,
  },
  motDePasseTemporaire: {
    type: String,
    select: false,
  },
  doitChangerMotDePasse: {
    type: Boolean,
    default: false,
  },
  isActive: { type: Boolean, default: true },
  isVerified: { type: Boolean, default: false },
}, { timestamps: true });

pharmacieSchema.pre('save', async function(next) {
  try {
    const salt = await bcrypt.genSalt(12);
    if (this.isModified('motDePasse') && this.motDePasse) {
      this.motDePasse = await bcrypt.hash(this.motDePasse, salt);
    }
    if (this.isModified('motDePasseTemporaire') && this.motDePasseTemporaire) {
      this.motDePasseTemporaire = await bcrypt.hash(this.motDePasseTemporaire, salt);
    }
    next();
  } catch (error) {
    next(error);
  }
});

pharmacieSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    if (this.motDePasseTemporaire) {
      return await bcrypt.compare(candidatePassword, this.motDePasseTemporaire);
    }
    return await bcrypt.compare(candidatePassword, this.motDePasse);
  } catch (error) {
    throw new Error('Erreur lors de la comparaison des mots de passe');
  }
};

module.exports = mongoose.model('Pharmacie', pharmacieSchema);

