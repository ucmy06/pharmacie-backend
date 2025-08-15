//C:\reactjs node mongodb\pharmacie-backend\src\routes\auth.js
// const multer = require('multer');
const path = require('path');

const express = require('express');
const router = express.Router();
const {
  register,
  login,
  getProfile,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerificationEmail,
  updateProfile, // AJOUT
  updatePassword, // AJOUT
  // demandeComptePharmacie,
  connexionPharmacie
} = require('../controllers/authController');
const { authenticate } = require('../middlewares/auth');


// Configuration de Multer (tu peux l’externaliser dans un fichier uploadConfig.js)
// const storage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null, 'uploads/documents/'); // Assure-toi que ce dossier existe
//   },
//   filename: function (req, file, cb) {
//     const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
//     cb(null, uniqueSuffix + '-' + file.originalname);
//   }
// });
// const upload = multer({ storage });

// Routes publiques
router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Routes de vérification email
router.get('/verify-email/:token', verifyEmail);
router.post('/resend-verification', resendVerificationEmail);

// Routes protégées (nécessitent une authentification)
router.get('/profile', authenticate, getProfile);


router.get('/me', authenticate, getProfile); // Nouvelle route pour /api/auth/me

router.put('/profile', authenticate, updateProfile);
router.put('/password', authenticate, updatePassword);

// router.post(
//   '/demande-pharmacie',
//   authenticate,
//   upload.fields([
//     { name: 'documentsVerification', maxCount: 10 },
//     { name: 'photoPharmacie', maxCount: 1 }
//   ]),
//   demandeComptePharmacie
// );

module.exports = router;