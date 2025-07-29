// Fichier : src/routes/client.js
const express = require('express');
const router = express.Router();
const { User } = require('../models/User');
const Commande = require('../models/Commande');
const { server, io } = require('../server');
const { authenticate } = require('../middlewares/auth');
const { uploadDemandePharmacie } = require('../middlewares/multerConfig');
const mongoose = require('mongoose');
const { getApprovedPharmacies, searchMedicaments } = require('../controllers/adminController');
const {
  creerDemandePharmacie,
  getMaDemandePharmacie,
} = require('../controllers/demandePharmacieController');

router.post('/commandes', authenticate, async (req, res) => {
  try {
    const { pharmacieId, medicaments, livraison, adresseLivraison } = req.body;
    console.log('📝 Création commande pour:', { pharmacieId, clientId: req.user.id });

    const pharmacie = await User.findById(pharmacieId);
    if (!pharmacie || pharmacie.role !== 'pharmacie' || !pharmacie.pharmacieInfo.baseMedicament) {
      console.log('❌ Pharmacie non trouvée:', pharmacieId);
      return res.status(404).json({ success: false, message: 'Pharmacie ou base non trouvée' });
    }

    const connection = mongoose.connection.useDb(pharmacie.pharmacieInfo.baseMedicament);
    const Medicament = connection.model('Medicament', require('../models/Medicament').schema, 'medicaments');
    let total = 0;
    const commandeMedicaments = [];

    for (const item of medicaments) {
      const medicament = await Medicament.findById(item.medicamentId);
      if (!medicament || medicament.quantite_stock < item.quantite) {
        console.log('❌ Stock insuffisant pour:', medicament?.nom || item.medicamentId);
        return res.status(400).json({ success: false, message: `Stock insuffisant pour ${medicament?.nom || 'médicament'}` });
      }
      total += medicament.prix * item.quantite;
      commandeMedicaments.push({
        medicamentId: item.medicamentId,
        quantite: item.quantite,
        prixUnitaire: medicament.prix,
      });
    }

    const commande = await Commande.create({
      clientId: req.user.id,
      pharmacieId,
      medicaments: commandeMedicaments,
      total,
      livraison,
      adresseLivraison: livraison ? adresseLivraison : undefined,
    });
    console.log('✅ Commande créée:', commande._id);

    io.to(pharmacieId).emit('nouvelleCommande', commande);
    console.log('📡 Notification envoyée à:', pharmacieId);

    res.json({ success: true, commande });
  } catch (error) {
    console.error('❌ Erreur création commande:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

router.get('/commandes', authenticate, async (req, res) => {
  try {
    console.log('📋 Récupération commandes pour:', req.user.id);
    const commandes = await Commande.find({ clientId: req.user.id })
      .populate('pharmacieId', 'nom pharmacieInfo')
      .lean();
    res.json({ success: true, commandes });
  } catch (error) {
    console.error('❌ Erreur récupération commandes:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

router.get('/pharmacies/:pharmacyId', authenticate, async (req, res) => {
  try {
    const pharmacy = await User.findById(req.params.pharmacyId).select('nom prenom email telephone pharmacieInfo');
    if (!pharmacy || pharmacy.role !== 'pharmacie') {
      return res.status(404).json({ success: false, message: 'Pharmacie non trouvée' });
    }
    res.json({ success: true, pharmacie: pharmacy });
  } catch (error) {
    console.error('❌ Erreur récupération pharmacie:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

router.post('/demande-pharmacie', authenticate, uploadDemandePharmacie, creerDemandePharmacie);
router.get('/ma-demande-pharmacie', authenticate, getMaDemandePharmacie);
router.get('/medicaments/search', authenticate, searchMedicaments);

router.get('/pharmacies', authenticate, async (req, res, next) => {
  try {
    const result = await getApprovedPharmacies(req, res, next);
    res.json({
      success: true,
      data: { pharmacies: result.data.pharmacies },
      pagination: result.data.pagination
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;