// C:\reactjs node mongodb\pharmacie-backend\src\middlewares\auth.js

const { verifyToken, extractTokenFromHeader } = require('../utils/tokenUtils');
const User = require('../models/User');

/**
 * Middleware d'authentification
 * Vérifie si l'utilisateur est connecté
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token d\'authentification manquant'
      });
    }
    
    // Vérifier le token
    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Token invalide ou expiré'
      });
    }
    
    // Récupérer l'utilisateur complet
    const user = await User.findById(decoded.id).select('-motDePasse');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }
    
    // Vérifier si le compte est actif
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Compte désactivé'
      });
    }
    
    // Ajouter l'utilisateur à la requête
    req.user = user;
    next();
    
  } catch (error) {
    console.error('❌ Erreur middleware auth:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'authentification'
    });
  }
};

/**
 * Middleware optionnel d'authentification
 * N'interrompt pas la requête si pas de token
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);
    
    if (token) {
      const decoded = verifyToken(token);
      if (decoded) {
        const user = await User.findById(decoded.id).select('-motDePasse');
        if (user && user.isActive) {
          req.user = user;
        }
      }
    }
    
    next();
  } catch (error) {
    console.error('⚠️  Erreur middleware auth optionnel:', error);
    next(); // Continue même en cas d'erreur
  }
};

module.exports = {
  authenticate,
  optionalAuth
};