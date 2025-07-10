// C:\reactjs node mongodb\pharmacie-backend\src\routes\commandes.js

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// Route pour créer une commande
router.post('/', async (req, res) => {
  try {
    const { pharmacie, medicaments, client } = req.body;
    
    // Validation des données
    if (!pharmacie || !medicaments || !client) {
      return res.status(400).json({ 
        error: "Données manquantes : pharmacie, medicaments et client sont requis" 
      });
    }

    const db = mongoose.connection.useDb(`pharmacie_${pharmacie}`);

    // Vérifier le stock
    const stockOk = await Promise.all(
      medicaments.map(async ({ id, quantite }) => {
        const med = await db.collection('medicaments').findOne({ 
          _id: new mongoose.Types.ObjectId(id) 
        });
        return med && med.quantite_stock >= quantite;
      })
    );

    if (stockOk.includes(false)) {
      return res.status(400).json({ 
        error: "Stock insuffisant pour certains médicaments" 
      });
    }

    // Enregistrer la commande
    const commande = await db.collection('commandes').insertOne({ 
      client, 
      medicaments, 
      date: new Date(),
      statut: 'en_attente'
    });

    // Mettre à jour les stocks
    await Promise.all(
      medicaments.map(({ id, quantite }) =>
        db.collection('medicaments').updateOne(
          { _id: new mongoose.Types.ObjectId(id) },
          { $inc: { quantite_stock: -quantite } }
        )
      )
    );

    res.json({ 
      success: true, 
      commandeId: commande.insertedId,
      message: "Commande créée avec succès"
    });

  } catch (err) {
    console.error('Erreur lors de la création de la commande:', err);
    res.status(500).json({ error: err.message });
  }
});

// Route pour obtenir les commandes
router.get('/', async (req, res) => {
  try {
    const { pharmacie } = req.query;
    
    if (!pharmacie) {
      return res.status(400).json({ 
        error: "Paramètre 'pharmacie' requis" 
      });
    }

    const db = mongoose.connection.useDb(`pharmacie_${pharmacie}`);
    const commandes = await db.collection('commandes')
      .find({})
      .sort({ date: -1 })
      .toArray();

    res.json(commandes);
  } catch (err) {
    console.error('Erreur lors de la récupération des commandes:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;