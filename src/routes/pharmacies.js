// C:\reactjs node mongodb\pharmacie-backend\src\routes\pharmacies.js
const express = require('express');
const router = express.Router();
const pharmacieController = require('../controllers/pharmacieController');
const { authenticate } = require('../middlewares/auth');
const { checkRole, requirePharmacie } = require('../middlewares/roleCheck');


router.get('/', pharmacieController.getPharmacies);
router.get('/garde', pharmacieController.getPharmaciesDeGarde);
router.get('/recherche-geo', pharmacieController.rechercheGeolocalisee);
router.post('/login', pharmacieController.loginPharmacie);
router.post('/changer-mot-de-passe', authenticate, checkRole(['pharmacie']), pharmacieController.changerMotDePasseInitial);
router.put('/profile/change-password', authenticate, checkRole(['pharmacie']), pharmacieController.updateProfilePassword);
router.post('/pharmacie/connexion', pharmacieController.connexionPharmacie);
router.get('/mes-connexions', authenticate, pharmacieController.getMesConnexions);
router.put('/horaires', authenticate, checkRole(['pharmacie']), pharmacieController.updateHoraires);
router.put('/garde', authenticate, requirePharmacie, pharmacieController.toggleGarde);
router.put('/livraison', authenticate, checkRole(['pharmacie']), pharmacieController.toggleLivraison);
router.post('/documents', authenticate, checkRole(['pharmacie']), pharmacieController.uploadDocuments, pharmacieController.saveDocuments);
router.get('/connexions-clients', authenticate, checkRole(['pharmacie']), pharmacieController.getConnexionsClients);
router.post('/demande-suppression', authenticate, checkRole(['pharmacie']), pharmacieController.demanderSuppression);
router.put('/update-profile', authenticate, checkRole(['pharmacie']), pharmacieController.uploadPharmacyPhoto, pharmacieController.updateProfilPharmacie);
router.get('/mon-profil', authenticate, checkRole(['pharmacie']), pharmacieController.getMonProfil);
router.post('/demande-modification', authenticate, checkRole(['pharmacie']), pharmacieController.uploadPharmacyPhoto, pharmacieController.demanderModification);
router.get('/:pharmacieId', pharmacieController.getPharmacieById);

module.exports = router;
