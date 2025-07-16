// C:\reactjs node mongodb\pharmacie-backend\src\models\Counter.js
const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  value: { type: Number, default: 1000 }
});

module.exports = mongoose.model('Counter', counterSchema);
