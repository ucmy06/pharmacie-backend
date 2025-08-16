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
router.get('/demandes-integration', authenticate, requirePharmacie, pharmacieController.getDemandesIntegration);
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
router.post('/pharmacie/connexion', pharmacieController.connexionPharmacie);
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

// Routes dynamiques
router.get('/by-id/:pharmacyId', authenticate, pharmacieController.getPharmacyById); // Nouvelle route
router.get('/:pharmacyId', authenticate, pharmacieController.getPharmacieById);
router.post('/demande-integration', authenticate, pharmacieController.demanderIntegration);
router.post('/valider-demande-integration', authenticate, pharmacieController.validerDemandeIntegration);
router.get('/check-created-by', authenticate, pharmacieController.checkCreatedByStatus);
router.get('/check-association', authenticate, pharmacieController.checkAssociation);
router.post('/login-by-password', pharmacieController.loginByPassword);




router.put('/medicaments/:id/stock', authenticate, checkRole(['pharmacie']), async (req, res) => {
  try {
    const { id } = req.params;
    const { newStock } = req.body;
    if (newStock === undefined || newStock < 0) {
      return res.status(400).json({ success: false, message: 'Stock invalide' });
    }
    const medicament = await Medicament.findById(id);
    if (!medicament) {
      return res.status(404).json({ success: false, message: 'Médicament non trouvé' });
    }
    const oldStock = medicament.quantite_stock;
    medicament.quantite_stock = newStock;
    await medicament.save();
    if (newStock > 0 && oldStock === 0) {
      const subscriptions = await AlertSubscription.find({ medicamentId: id, pharmacyId: req.user.id });
      for (const sub of subscriptions) {
        const subscriber = await User.findById(sub.userId).select('pushSubscription');
        if (subscriber.pushSubscription) {
          try {
            await webPush.sendNotification(subscriber.pushSubscription, JSON.stringify({
              title: 'Produit disponible',
              message: `Le produit ${medicament.nom} est maintenant disponible à ${req.user.pharmacieInfo.nomPharmacie}`,
              icon: '/favicon.ico'
            }));
            console.log('✅ Notification push envoyée à:', sub.userId);
          } catch (error) {
            console.error('❌ Erreur notification push:', error);
          }
        }
        // Optionnellement, notifier via WebSocket
        const io = getIo();
        if (io) {
          io.to(`user_${sub.userId}`).emit('stockAlert', {
            medicamentId: id,
            pharmacyId: req.user.id,
            message: `Le produit ${medicament.nom} est disponible`
          });
        }
        // Supprimer la subscription après notification
        await sub.remove();
      }
    }
    res.json({ success: true, message: 'Stock mis à jour' });
  } catch (error) {
    console.error('❌ Erreur mise à jour stock:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});
module.exports = router;