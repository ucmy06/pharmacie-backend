// C:\reactjs node mongodb\pharmacie-backend\src\routes\medicaments.js

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// Route INDIVIDUELLE (pour une pharmacie spécifique)
router.get('/', async (req, res) => {
  try {
    const { pharmacie } = req.query;
    if (!pharmacie) return res.status(400).json({ error: "Paramètre 'pharmacie' requis" });

    const db = mongoose.connection.useDb(`pharmacie_${pharmacie}`);
    const medicaments = await db.collection('medicaments').find({}).toArray();
    res.json(medicaments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route pour rechercher des médicaments
router.get('/search', async (req, res) => {
  try {
    const { nom, categorie, prixMax } = req.query;
    const query = {};
    
    if (nom) query.nom = new RegExp(nom, 'i');
    if (categorie) query.categorie = categorie;
    if (prixMax) query.prix = { $lte: Number(prixMax) };

    const pharmacies = ['alpha', 'beta', 'nova', 'omega'];

    const results = await Promise.all(
      pharmacies.map(async (pharma) => {
        const db = mongoose.connection.useDb(`pharmacie_${pharma}`);
        const meds = await db.collection('medicaments').find(query).toArray();
        return meds.map(m => ({ ...m, pharmacie: pharma }));
      })
    );

    res.json(results.flat());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route pour toutes les pharmacies
router.get('/all', async (req, res) => {
  try {
    const pharmacies = ['alpha', 'beta', 'nova', 'omega']; // Liste à adapter
    
    const allMedicaments = await Promise.all(
      pharmacies.map(async (pharma) => {
        const db = mongoose.connection.useDb(`pharmacie_${pharma}`);
        const medicaments = await db.collection('medicaments').find({}).toArray();
        return medicaments.map(m => ({ ...m, pharmacie: pharma }));
      })
    );

    res.json(allMedicaments.flat());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;