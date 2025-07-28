// const express = require('express');
// const router = express.Router();
// const demandePharmacieController = require('../controllers/demandePharmacieController');
// const { authenticate } = require('../middlewares/auth');
// const { uploadDemandePharmacie } = require('../middlewares/multerConfig');

// console.log('🔍 Contrôleur chargé :', demandePharmacieController);

// // 🔒 Routes sécurisées
// router.post(
//   '/creer',
//   authenticate,
//   uploadDemandePharmacie,
//   demandePharmacieController.creerDemandePharmacie
// );

// router.get(
//   '/ma-demande',
//   authenticate,
//   demandePharmacieController.getMaDemandePharmacie
// );

// module.exports = router;