//C:\reactjs node mongodb\pharmacie-backend\src\routes\auth.js
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
  demandeComptePharmacie,
  connexionPharmacie
} = require('../controllers/authController');
const { authenticate } = require('../middlewares/auth');

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
router.post('/demande-pharmacie', authenticate, demandeComptePharmacie);
router.post('/connexion-pharmacie', authenticate, connexionPharmacie);

module.exports = router;