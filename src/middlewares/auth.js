// C:\reactjs node mongodb\pharmacie-backend\src\middlewares\auth.js

const { verifyToken, extractTokenFromHeader } = require('../utils/tokenUtils');
const { User } = require('../models/User');

/**
 * Middleware d'authentification
 * Vérifie si l'utilisateur est connecté
 */
// Dans auth.js, ajoutez plus de logs
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    console.log("🔐 [auth middleware] Header reçu :", authHeader);
    console.log("🔐 [auth middleware] Toutes les headers :", req.headers);
    console.log("🔐 [auth middleware] URL demandée :", req.url);
    console.log("🔐 [auth middleware] Méthode :", req.method);

    const token = extractTokenFromHeader(authHeader);
    console.log("🔑 [auth middleware] Token extrait :", token);

    if (!token) {
      console.log("❌ Token manquant - Headers disponibles:", Object.keys(req.headers));
      return res.status(401).json({
        success: false,
        message: 'Token d\'authentification manquant'
      });
    }

    const decoded = verifyToken(token);
    console.log("📦 [auth middleware] Token décodé :", decoded);

    if (!decoded || !decoded.id) {
      console.log("❌ Token invalide ou expiré");
      return res.status(401).json({
        success: false,
        message: 'Token invalide ou expiré'
      });
    }

    const user = await User.findById(decoded.id).select('-motDePasse');
    console.log("👤 [auth middleware] Utilisateur trouvé :", user ? {
      id: user._id,
      email: user.email,
      role: user.role
    } : 'NULL');

    if (!user) {
      console.log("❌ Utilisateur non trouvé avec ID:", decoded.id);
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    if (!user.isActive) {
      console.log("🚫 Compte désactivé pour:", user.email);
      return res.status(401).json({
        success: false,
        message: 'Compte désactivé'
      });
    }

    req.user = user;
    console.log("✅ Authentification réussie pour:", user.email, "Role:", user.role);
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
      console.log("🧪 decoded:", decoded);

      if (decoded) {
        const user = await User.findById(decoded.id).select('-motDePasse');
        console.log("🔍 Utilisateur trouvé:", user);

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