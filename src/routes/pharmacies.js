// C:\reactjs node mongodb\pharmacie-backend\src\routes\pharmacies.js

const express = require('express');
const router = express.Router();
const pharmacieController = require('../controllers/pharmacieController'); // Assurez-vous que c'est le bon chemin
const { authenticate } = require('../middlewares/auth');
const { checkRole, requirePharmacie } = require('../middlewares/roleCheck');
/**
 * ROUTES PUBLIQUES - Consultation des pharmacies
 */
router.get('/', pharmacieController.getPharmacies);
router.get('/garde', pharmacieController.getPharmaciesDeGarde);
router.get('/recherche-geo', pharmacieController.rechercheGeolocalisee);
/**
 * ROUTES PRIVÉES - Nécessitent une authentification
 */
router.post('/login', pharmacieController.loginPharmacie); // Publique, pas d'authentification
router.post('/changer-mot-de-passe', authenticate, checkRole(['pharmacie']), pharmacieController.changerMotDePasseInitial);
router.put('/profile/change-password', authenticate, checkRole(['pharmacie']), pharmacieController.updateProfilePassword);
router.post('/pharmacie/connexion', authenticate, pharmacieController.connexionPharmacie);
router.get('/mes-connexions', authenticate, pharmacieController.getMesConnexions);
router.put('/horaires', authenticate, checkRole(['pharmacie']), pharmacieController.updateHoraires);
router.put('/garde', authenticate, requirePharmacie, pharmacieController.toggleGarde);
router.put('/livraison', authenticate, checkRole(['pharmacie']), pharmacieController.toggleLivraison);
router.post('/documents', authenticate, checkRole(['pharmacie']), pharmacieController.uploadDocuments);
router.get('/connexions-clients', authenticate, checkRole(['pharmacie']), pharmacieController.getConnexionsClients);
router.post('/demande-suppression', authenticate, checkRole(['pharmacie']), pharmacieController.demanderSuppression);
router.put('/update-profile', authenticate, checkRole(['pharmacie']), pharmacieController.updateProfilPharmacie);
router.get('/mon-profil', authenticate, checkRole(['pharmacie']), pharmacieController.getMonProfil);
router.post('/demande-modification', authenticate, checkRole(['pharmacie']), pharmacieController.uploadDemandeModification, pharmacieController.demanderModification);
router.get('/:pharmacieId', pharmacieController.getPharmacieById); // Placé après /mon-profil
module.exports = router;