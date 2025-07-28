// C:\reactjs node mongodb\pharmacie-backend\src\models\DrugImage.js

const mongoose = require('mongoose');

const drugImageSchema = new mongoose.Schema({
  nom: {
    type: String,
    required: true,
    index: true,
    trim: true,
    lowercase: true
  },
  images: [{
    nomFichier: { type: String, required: true },
    cheminFichier: { type: String, required: true },
    typeFichier: { type: String, required: true },
    tailleFichier: { type: Number, required: true },
    dateUpload: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true,
  indexes: [{ key: { nom: 1 }, unique: true }],
  validate: {
    validator: function(v) {
      return v.images.length <= 3;
    },
    message: 'Un maximum de 3 images est autorisé par médicament.'
  }
});

module.exports = mongoose.model('DrugImage', drugImageSchema);