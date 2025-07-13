// C:\reactjs node mongodb\pharmacie-backend\src\routes\demandePharmacie.js

const express = require('express');
const router = express.Router();
const demandePharmacieController = require('../controllers/demandePharmacieController');
console.log('🔍 Controleur chargé :', demandePharmacieController);
const { authenticate } = require('../middlewares/auth');
const multer = require('multer');
const path = require('path');

// Configuration du stockage pour les fichiers (images / PDF)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/documents/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // max 5 Mo
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers image et PDF sont autorisés.'));
    }
  }
});

// 🔒 Routes sécurisées
router.post(
  '/creer',
  authenticate,
  upload.fields([
    { name: 'photoPharmacie', maxCount: 1 },
    { name: 'documentsVerification', maxCount: 5 }
  ]),
  demandePharmacieController.creerDemandePharmacie
);

router.get(
  '/ma-demande',
  authenticate,
  demandePharmacieController.getMaDemandePharmacie
);

module.exports = router;
