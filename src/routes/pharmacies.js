// C:\reactjs node mongodb\pharmacie-backend\src\routes\pharmacies.js
const express = require('express');
const router = express.Router();
const pharmacieController = require('../controllers/pharmacieController');
const { authenticate } = require('../middlewares/auth');
const { checkRole } = require('../middlewares/roleCheck');
const { requirePharmacie } = require('../middlewares/roleCheck');

/**
 * ROUTES PUBLIQUES - Consultation des pharmacies
 */

/**
 * @route GET /api/pharmacies
 * @desc Obtenir toutes les pharmacies actives avec filtres
 * @access Public
 */
router.get('/', pharmacieController.getPharmacies);

/**
 * @route GET /api/pharmacies/garde
 * @desc Obtenir les pharmacies de garde actuelles
 * @access Public
 */
router.get('/garde', pharmacieController.getPharmaciesDeGarde);

/**
 * @route GET /api/pharmacies/recherche-geo
 * @desc Recherche géolocalisée de pharmacies
 * @access Public
 */
router.get('/recherche-geo', pharmacieController.rechercheGeolocalisee);

/**
 * @route GET /api/pharmacies/:pharmacieId
 * @desc Obtenir une pharmacie par ID
 * @access Public
 */
router.get('/:pharmacieId', pharmacieController.getPharmacieById);

/**
 * ROUTES PRIVÉES - Nécessitent une authentification
 * Middleware : Authentification requise pour toutes les routes suivantes
 */
router.use(authenticate);

/**
 * @route POST /api/pharmacies/connexion
 * @desc Se connecter à une pharmacie spécifique (enregistre la connexion)
 * @access Private (Utilisateur connecté)
 */
router.post('/connexion', pharmacieController.connexionPharmacie);

/**
 * @route GET /api/pharmacies/mes-connexions
 * @desc Obtenir l'historique des connexions de l'utilisateur
 * @access Private (Utilisateur connecté)
 */
router.get('/mes-connexions', pharmacieController.getMesConnexions);

/**
 * ROUTES SPÉCIFIQUES AUX PHARMACIES
 * Middleware : Rôle pharmacie requis
 */

/**
 * @route PUT /api/pharmacies/horaires
 * @desc Mettre à jour les horaires d'ouverture
 * @access Private (Pharmacie)
 */
router.put('/horaires', checkRole(['pharmacie']), pharmacieController.updateHoraires);

/**
 * @route PUT /api/pharmacies/garde
 * @desc Définir/Retirer le statut de garde
 * @access Private (Pharmacie)
 */
router.put('/garde', requirePharmacie, pharmacieController.toggleGarde);

/**
 * @route PUT /api/pharmacies/livraison
 * @desc Activer/Désactiver la livraison
 * @access Private (Pharmacie)
 */
router.put('/livraison', checkRole(['pharmacie']), pharmacieController.toggleLivraison);

/**
 * @route POST /api/pharmacies/documents
 * @desc Upload de documents de vérification
 * @access Private (Pharmacie)
 */
router.post('/documents', checkRole(['pharmacie']), pharmacieController.uploadDocuments);

/**
 * @route GET /api/pharmacies/connexions-clients
 * @desc Obtenir les connexions des clients à ma pharmacie
 * @access Private (Pharmacie)
 */
router.get('/connexions-clients', checkRole(['pharmacie']), pharmacieController.getConnexionsClients);

module.exports = router;