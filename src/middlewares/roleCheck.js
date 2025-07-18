//C:\reactjs node mongodb\pharmacie-backend\src\middlewares\roleCheck.js

/**
 * Middleware pour vérifier les rôles d'accès
 * @param {Array|String} allowedRoles - Rôles autorisés
 * @returns {Function} Middleware function
 */

  
const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentification requise' });
      }

      const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

      if (!roles.includes(req.user.role)) {
        return res.status(403).json({ success: false, message: 'Accès refusé pour ce rôle' });
      }

      next();
    } catch (error) {
      console.error('❌ Erreur checkRole:', error);
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  };
};


/**
 * Middleware spécifique pour les administrateurs
 */
const requireAdmin = checkRole('admin');

/**
 * Middleware spécifique pour les pharmacies
 */
const requirePharmacie = checkRole('pharmacie');

/**
 * Middleware pour pharmacies approuvées uniquement
 */
const requireApprovedPharmacie = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentification requise'
      });
    }
    
    if (req.user.role !== 'pharmacie') {
      return res.status(403).json({
        success: false,
        message: 'Accès réservé aux pharmacies'
      });
    }
    
    if (!req.user.pharmacieInfo || req.user.pharmacieInfo.statutDemande !== 'approuvee') {
      return res.status(403).json({
        success: false,
        message: 'Votre demande de pharmacie doit être approuvée par un administrateur'
      });
    }
    
    next();
  } catch (error) {
    console.error('❌ Erreur middleware pharmacie approuvée:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

/**
 * Middleware pour admin ou pharmacie propriétaire
 */
const requireAdminOrOwner = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentification requise'
      });
    }
    
    const isAdmin = req.user.role === 'admin';
    const isOwner = req.user._id.toString() === req.params.userId;
    
    if (!isAdmin && !isOwner) {
      return res.status(403).json({
        success: false,
        message: 'Vous ne pouvez accéder qu\'à vos propres informations'
      });
    }
    
    next();
  } catch (error) {
    console.error('❌ Erreur middleware admin/propriétaire:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

/**
 * Middleware pour vérifier les rôles multiples
 */
const requireAnyRole = (...roles) => checkRole(roles);

module.exports = {
  checkRole,
  requireAdmin,
  requirePharmacie,
  requireApprovedPharmacie,
  requireAdminOrOwner,
  requireAnyRole
};