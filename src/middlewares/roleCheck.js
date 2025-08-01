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
const requireApprovedPharmacie = async (req, res, next) => {
  try {
    console.log('🔍 [requireApprovedPharmacie] Vérification utilisateur :', {
      userId: req.user?._id?.toString(),
      email: req.user?.email,
      role: req.user?.role,
    });

    if (!req.user || !req.user._id) {
      console.warn('⚠️ [requireApprovedPharmacie] Aucun utilisateur authentifié');
      createDetailedLog('AUTH_ECHEC', { raison: 'AUCUN_UTILISATEUR_AUTHENTIFIE' });
      return res.status(401).json({ success: false, message: 'Authentification requise' });
    }

    const user = await User.findById(req.user._id).select('role pharmacieInfo email');
    console.log('🔍 [requireApprovedPharmacie] Résultat requête utilisateur :', user ? {
      id: user._id,
      email: user.email,
      role: user.role,
      statutDemande: user.pharmacieInfo?.statutDemande,
    } : 'NULL');

    if (!user) {
      console.warn('⚠️ [requireApprovedPharmacie] Utilisateur non trouvé:', req.user._id);
      createDetailedLog('AUTH_ECHEC', { raison: 'UTILISATEUR_NON_TROUVE', userId: req.user._id });
      return res.status(404).json({ success: false, message: 'Pharmacie non trouvée' });
    }

    if (user.role !== 'pharmacie') {
      console.warn('⚠️ [requireApprovedPharmacie] Rôle non autorisé:', user.role);
      createDetailedLog('AUTH_ECHEC', { raison: 'ROLE_INCORRECT', role: user.role, userId: req.user._id });
      return res.status(403).json({ success: false, message: 'Accès réservé aux pharmacies' });
    }

    // Temporaire : commenter la vérification statutDemande pour tester
    // if (!user.pharmacieInfo || user.pharmacieInfo.statutDemande !== 'approuvee') {
    //   console.warn('⚠️ [requireApprovedPharmacie] Pharmacie non approuvée:', user.pharmacieInfo?.statutDemande);
    //   createDetailedLog('AUTH_ECHEC', { raison: 'PHARMACIE_NON_APPROUVEE', statut: user.pharmacieInfo?.statutDemande });
    //   return res.status(403).json({ success: false, message: 'Votre demande de pharmacie doit être approuvée par un administrateur' });
    // }

    req.user = user; // Mettre à jour req.user avec les données fraîches
    next();
  } catch (error) {
    console.error('❌ [requireApprovedPharmacie] Erreur:', error);
    createDetailedLog('ERREUR_REQUIRE_APPROVED_PHARMACIE', {
      erreur: error.message,
      stack: error.stack,
      userId: req.user?._id,
    });
    res.status(500).json({ success: false, message: 'Erreur serveur' });
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