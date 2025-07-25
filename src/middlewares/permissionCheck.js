// C:\reactjs node mongodb\pharmacie-backend\src\middlewares\permissionCheck.js
const checkPermission = (permission) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentification requise' });
      }
      if (req.user.role === 'admin' || req.user.permissions.includes(permission)) {
        return next();
      }
      return res.status(403).json({ success: false, message: 'Permission refusée' });
    } catch (error) {
      console.error('❌ Erreur vérification permission:', error);
      return res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
  };
};

module.exports = { checkPermission };
