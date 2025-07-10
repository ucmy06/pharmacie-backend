// C:\reactjs node mongodb\pharmacie-backend\src\utils\tokenUtils.js

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Clé secrète pour JWT (en production, utilise une variable d'environnement)
const JWT_SECRET = process.env.JWT_SECRET || 'pharmone_secret_key_2024_very_secure';
const JWT_EXPIRE = process.env.JWT_EXPIRE || '30d';

/**
 * Génère un token JWT pour un utilisateur
 * @param {Object} user - Objet utilisateur
 * @returns {String} Token JWT
 */
const generateToken = (user) => {
  const payload = {
    id: user._id,
    email: user.email,
    role: user.role,
    nom: user.nom,
    prenom: user.prenom
  };
  
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRE,
    issuer: 'PharmOne'
  });
};

/**
 * Vérifie et décode un token JWT
 * @param {String} token - Token à vérifier
 * @returns {Object} Payload décodé ou null si invalide
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    console.error('❌ Token invalide:', error.message);
    return null;
  }
};

/**
 * Génère un token de réinitialisation de mot de passe
 * @returns {String} Token de réinitialisation
 */
const generateResetToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Extrait le token du header Authorization
 * @param {String} authHeader - Header Authorization
 * @returns {String|null} Token ou null
 */
const extractTokenFromHeader = (authHeader) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  return authHeader.substring(7); // Remove 'Bearer ' prefix
};

/**
 * Vérifie si un token est expiré
 * @param {Object} decoded - Token décodé
 * @returns {Boolean} True si expiré
 */
const isTokenExpired = (decoded) => {
  if (!decoded || !decoded.exp) return true;
  
  const currentTime = Math.floor(Date.now() / 1000);
  return decoded.exp < currentTime;
};

/**
 * Génère un refresh token
 * @param {Object} user - Objet utilisateur
 * @returns {String} Refresh token
 */
const generateRefreshToken = (user) => {
  const payload = {
    id: user._id,
    type: 'refresh'
  };
  
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '7d',
    issuer: 'PharmOne'
  });
};

module.exports = {
  generateToken,
  verifyToken,
  generateResetToken,
  extractTokenFromHeader,
  isTokenExpired,
  generateRefreshToken,
  JWT_SECRET
};