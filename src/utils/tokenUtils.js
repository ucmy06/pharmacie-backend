const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Clé secrète pour JWT
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
  
  console.log('🔑 [tokenUtils] Génération token pour:', payload);
  const token = jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRE,
    issuer: 'PharmOne'
  });
  console.log('✅ [tokenUtils] Token généré:', token.slice(0, 10) + '...');
  return token;
};

/**
 * Vérifie et décode un token JWT
 * @param {String} token - Token à vérifier
 * @returns {Object} Payload décodé ou null si invalide
 */
const verifyToken = (token) => {
  console.log('🔑 [tokenUtils] Vérification token:', token ? token.slice(0, 10) + '...' : 'NULL');
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('✅ [tokenUtils] Token vérifié:', decoded);
    return decoded;
  } catch (error) {
    console.error('❌ [tokenUtils] Erreur vérification token:', error.message, error.stack);
    return null;
  }
};

/**
 * Génère un token de réinitialisation de mot de passe
 * @returns {String} Token de réinitialisation
 */
const generateResetToken = () => {
  const token = crypto.randomBytes(32).toString('hex');
  console.log('🔑 [tokenUtils] Token réinitialisation généré:', token.slice(0, 10) + '...');
  return token;
};

/**
 * Extrait le token du header Authorization
 * @param {String} authHeader - Header Authorization
 * @returns {String|null} Token ou null
 */
const extractTokenFromHeader = (authHeader) => {
  console.log('🔑 [tokenUtils] Extraction token depuis header:', authHeader);
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn('⚠️ [tokenUtils] Header invalide ou manquant');
    return null;
  }
  
  const token = authHeader.substring(7);
  console.log('✅ [tokenUtils] Token extrait:', token.slice(0, 10) + '...');
  return token;
};

/**
 * Vérifie si un token est expiré
 * @param {Object} decoded - Token décodé
 * @returns {Boolean} True si expiré
 */
const isTokenExpired = (decoded) => {
  console.log('🔑 [tokenUtils] Vérification expiration:', decoded);
  if (!decoded || !decoded.exp) return true;
  
  const currentTime = Math.floor(Date.now() / 1000);
  const isExpired = decoded.exp < currentTime;
  console.log('✅ [tokenUtils] Token expiré:', isExpired);
  return isExpired;
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
  
  console.log('🔑 [tokenUtils] Génération refresh token pour:', payload);
  const token = jwt.sign(payload, JWT_SECRET, {
    expiresIn: '7d',
    issuer: 'PharmOne'
  });
  console.log('✅ [tokenUtils] Refresh token généré:', token.slice(0, 10) + '...');
  return token;
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