// C:\reactjs node mongodb\pharmacie-backend\src\routes\commandes.js

// commandes.js
const express = require('express');
const router = express.Router();

// Tu ajouteras tes vraies routes ici plus tard
router.get('/', (req, res) => {
  res.json({ message: 'Commandes route OK' });
});

module.exports = router;
