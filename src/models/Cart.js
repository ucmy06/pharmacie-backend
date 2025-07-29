const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  pharmacyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [
    {
      medicamentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Medicament',
        required: true
      },
      nom: { type: String, required: true },
      prix: { type: Number, required: true },
      quantity: { type: Number, required: true, min: 1 },
      image: {
        nomFichier: { type: String },
        cheminFichier: { type: String }
      }
    }
  ],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Cart', cartSchema);