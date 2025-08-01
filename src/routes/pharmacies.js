// C:\reactjs node mongodb\pharmacie-backend\src\routes\pharmacies.js
const express = require('express');
const router = express.Router();
const pharmacieController = require('../controllers/pharmacieController');
const authController = require('../controllers/authController');
const { authenticate } = require('../middlewares/auth');
const { checkRole, requirePharmacie } = require('../middlewares/roleCheck');
const Notification = require('../models/Notification');
const { createDetailedLog } = require('../utils/logUtils');

console.log('🔍 authController:', Object.keys(authController));
console.log('🔍 authController.connexionPharmacie:', typeof authController.connexionPharmacie);
console.log('🔍 pharmacieController:', Object.keys(pharmacieController));
console.log('🔍 pharmacieController.connexionPharmacie:', typeof pharmacieController.connexionPharmacie);

// Routes statiques en premier
router.get('/', authenticate, pharmacieController.getPharmacies);
router.get('/garde', pharmacieController.getPharmaciesDeGarde);
router.get('/recherche-geo', pharmacieController.rechercheGeolocalisee);
router.get('/commandes', authenticate, checkRole(['pharmacie']), pharmacieController.getCommandesPharmacie);
router.get('/notifications', authenticate, checkRole(['pharmacie']), async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user._id, lu: false })
      .sort({ date: -1 })
      .limit(50);
    createDetailedLog('GET_NOTIFICATIONS_PHARMACIE_REUSSI', {
      userId: req.user._id,
      totalNotifications: notifications.length,
    });
    res.json({ success: true, data: { notifications } });
  } catch (error) {
    console.error('❌ Erreur récupération notifications pharmacie:', error);
    createDetailedLog('ERREUR_GET_NOTIFICATIONS_PHARMACIE', {
      erreur: error.message,
      stack: error.stack,
      userId: req.user?._id,
    });
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
    });
  }
});
router.get('/mes-connexions', authenticate, pharmacieController.getMesConnexions);
router.get('/connexions-clients', authenticate, checkRole(['pharmacie']), pharmacieController.getConnexionsClients);
router.get('/mon-profil', authenticate, checkRole(['pharmacie']), pharmacieController.getMonProfil);
router.post('/login', pharmacieController.loginPharmacie);
router.post('/pharmacie/connexion', authController.connexionPharmacie);
router.post('/changer-mot-de-passe', authenticate, checkRole(['pharmacie']), pharmacieController.changerMotDePasseInitial);
router.post('/demande-suppression', authenticate, checkRole(['pharmacie']), pharmacieController.demanderSuppression);
router.post('/demande-modification', authenticate, checkRole(['pharmacie']), pharmacieController.uploadPharmacyPhoto, pharmacieController.demanderModification);
router.post('/documents', authenticate, checkRole(['pharmacie']), pharmacieController.uploadDocuments, pharmacieController.saveDocuments);
router.put('/horaires', authenticate, checkRole(['pharmacie']), pharmacieController.updateHoraires);
router.put('/garde', authenticate, requirePharmacie, pharmacieController.toggleGarde);
router.put('/livraison', authenticate, checkRole(['pharmacie']), pharmacieController.toggleLivraison);
router.put('/profile/change-password', authenticate, checkRole(['pharmacie']), pharmacieController.updateProfilePassword);
router.put('/update-profile', authenticate, checkRole(['pharmacie']), pharmacieController.uploadPharmacyPhoto, pharmacieController.updateProfilPharmacie);
router.put('/commandes/statut', authenticate, checkRole(['pharmacie']), pharmacieController.updateStatutCommande);

// Route dynamique en dernier
router.get('/:pharmacyId', authenticate, pharmacieController.getPharmacieById);

module.exports = router;