// C:\reactjs node mongodb\pharmacie-backend\src\models\Notification.js
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  type: {
    type: String,
    enum: ['commande', 'connexion', 'autre'],
    required: true,
  },
  message: { type: String, required: true },
  commandeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Commande',
    required: false,
  },
  lu: { type: Boolean, default: false },
  date: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Notification', notificationSchema);