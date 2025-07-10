// C:\reactjs node mongodb\pharmacie-backend\src\routes\admin.js

const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Import des controllers
const { 
  getAllUsers, 
  getUserById, 
  updateUserRole, 
  toggleUserStatus, 
  deleteUser, 
  getUserStats 
} = require('../controllers/userController');

const { 
  getSearchStats, 
  getPharmacieStats, 
  getDashboardStats 
} = require('../controllers/statsController');

// Middlewares
const { authenticate } = require('../middlewares/auth');
const { requireAdmin } = require('../middlewares/roleCheck');

// Toutes les routes nécessitent l'authentification et le rôle admin
router.use(authenticate);
router.use(requireAdmin); // vérifie que l'utilisateur est admin

// ===== GESTION DES UTILISATEURS =====

/**
 * GET /api/admin/users
 * Obtenir tous les utilisateurs avec pagination et filtres
 */
router.get('/users', getAllUsers);

/**
 * GET /api/admin/users/stats
 * Statistiques des utilisateurs
 */
router.get('/users/stats', getUserStats);

/**
 * GET /api/admin/users/:userId
 * Obtenir un utilisateur spécifique
 */
router.get('/users/:userId', getUserById);

/**
 * PUT /api/admin/users/:userId/role
 * Changer le rôle d'un utilisateur
 */
router.put('/users/:userId/role', updateUserRole);

/**
 * PUT /api/admin/users/:userId/status
 * Activer/Désactiver un compte utilisateur
 */
router.put('/users/:userId/status', toggleUserStatus);

/**
 * DELETE /api/admin/users/:userId
 * Supprimer un utilisateur
 */
router.delete('/users/:userId', deleteUser);

// ===== GESTION DES DEMANDES DE PHARMACIES =====

/**
 * GET /api/admin/pharmacy-requests
 * Obtenir toutes les demandes de pharmacies
 */
router.get('/pharmacy-requests', async (req, res) => {
  try {
    const { status = 'en_attente', page = 1, limit = 10 } = req.query;
    
    const filter = { 
      role: 'pharmacie',
      'pharmacieInfo.statutDemande': status
    };
    
    const skip = (page - 1) * limit;
    
    const demandes = await User.find(filter)
      .select('-motDePasse -resetPasswordToken -resetPasswordExpires')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await User.countDocuments(filter);
    
    res.json({
      success: true,
      data: {
        demandes,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
          limit: parseInt(limit)
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Erreur récupération demandes:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

/**
 * PUT /api/admin/pharmacy-requests/:userId/approve
 * Approuver une demande de pharmacie
 */
router.put('/pharmacy-requests/:userId/approve', async (req, res) => {
  try {
    const { userId } = req.params;
    const { commentaire } = req.body;
    
    const pharmacie = await User.findById(userId);
    if (!pharmacie || pharmacie.role !== 'pharmacie') {
      return res.status(404).json({
        success: false,
        message: 'Demande de pharmacie non trouvée'
      });
    }
    
    if (pharmacie.pharmacieInfo.statutDemande !== 'en_attente') {
      return res.status(400).json({
        success: false,
        message: 'Cette demande a déjà été traitée'
      });
    }
    
    // Approuver la demande
    pharmacie.pharmacieInfo.statutDemande = 'approuvee';
    pharmacie.pharmacieInfo.dateApprobation = new Date();
    pharmacie.pharmacieInfo.commentaireAdmin = commentaire;
    pharmacie.isActive = true;
    
    await pharmacie.save();
    
    // TODO: Envoyer un email de confirmation à la pharmacie
    console.log(`✅ Pharmacie approuvée: ${pharmacie.pharmacieInfo.nomPharmacie}`);
    
    res.json({
      success: true,
      message: 'Demande de pharmacie approuvée avec succès',
      data: { pharmacie: pharmacie.toJSON() }
    });
    
  } catch (error) {
    console.error('❌ Erreur approbation pharmacie:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

/**
 * PUT /api/admin/pharmacy-requests/:userId/reject
 * Rejeter une demande de pharmacie
 */
router.put('/pharmacy-requests/:userId/reject', async (req, res) => {
  try {
    const { userId } = req.params;
    const { commentaire, motif } = req.body;
    
    if (!motif) {
      return res.status(400).json({
        success: false,
        message: 'Le motif de rejet est requis'
      });
    }
    
    const pharmacie = await User.findById(userId);
    if (!pharmacie || pharmacie.role !== 'pharmacie') {
      return res.status(404).json({
        success: false,
        message: 'Demande de pharmacie non trouvée'
      });
    }
    
    if (pharmacie.pharmacieInfo.statutDemande !== 'en_attente') {
      return res.status(400).json({
        success: false,
        message: 'Cette demande a déjà été traitée'
      });
    }
    
    // Rejeter la demande
    pharmacie.pharmacieInfo.statutDemande = 'rejetee';
    pharmacie.pharmacieInfo.dateRejet = new Date();
    pharmacie.pharmacieInfo.motifRejet = motif;
    pharmacie.pharmacieInfo.commentaireAdmin = commentaire;
    pharmacie.isActive = false;
    
    await pharmacie.save();
    
    // TODO: Envoyer un email de notification à la pharmacie
    console.log(`❌ Pharmacie rejetée: ${pharmacie.pharmacieInfo.nomPharmacie} - Motif: ${motif}`);
    
    res.json({
      success: true,
      message: 'Demande de pharmacie rejetée',
      data: { pharmacie: pharmacie.toJSON() }
    });
    
  } catch (error) {
    console.error('❌ Erreur rejet pharmacie:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

// ===== STATISTIQUES =====

/**
 * GET /api/admin/dashboard
 * Statistiques du tableau de bord
 */
router.get('/dashboard', getDashboardStats);

/**
 * GET /api/admin/stats/searches
 * Statistiques des recherches
 */
router.get('/stats/searches', getSearchStats);

/**
 * GET /api/admin/stats/pharmacies
 * Statistiques des pharmacies
 */
router.get('/stats/pharmacies', getPharmacieStats);

/**
 * GET /api/admin/stats/global
 * Statistiques globales combinées
 */
router.get('/stats/global', async (req, res) => {
  try {
    // Statistiques générales
    const totalUtilisateurs = await User.countDocuments();
    const totalClients = await User.countDocuments({ role: 'client' });
    const totalPharmacies = await User.countDocuments({ role: 'pharmacie' });
    const totalAdmins = await User.countDocuments({ role: 'admin' });
    
    // Comptes actifs
    const comptesActifs = await User.countDocuments({ isActive: true });
    const comptesInactifs = await User.countDocuments({ isActive: false });
    
    // Demandes de pharmacies
    const demandesEnAttente = await User.countDocuments({
      role: 'pharmacie',
      'pharmacieInfo.statutDemande': 'en_attente'
    });
    
    const demandesApprouvees = await User.countDocuments({
      role: 'pharmacie',
      'pharmacieInfo.statutDemande': 'approuvee'
    });
    
    const demandesRejetees = await User.countDocuments({
      role: 'pharmacie',
      'pharmacieInfo.statutDemande': 'rejetee'
    });
    
    // Activité récente (7 derniers jours)
    const septJoursAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const activiteRecente = await User.countDocuments({
      'statistiques.derniereActivite': { $gte: septJoursAgo }
    });
    
    // Nouveaux utilisateurs (30 derniers jours)
    const trenteJoursAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const nouveauxUtilisateurs = await User.countDocuments({
      createdAt: { $gte: trenteJoursAgo }
    });
    
    res.json({
      success: true,
      data: {
        utilisateurs: {
          total: totalUtilisateurs,
          clients: totalClients,
          pharmacies: totalPharmacies,
          admins: totalAdmins,
          actifs: comptesActifs,
          inactifs: comptesInactifs,
          nouveaux: nouveauxUtilisateurs
        },
        pharmacies: {
          enAttente: demandesEnAttente,
          approuvees: demandesApprouvees,
          rejetees: demandesRejetees
        },
        activite: {
          recente: activiteRecente
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Erreur statistiques globales:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

// ===== GESTION SYSTÈME =====

/**
 * POST /api/admin/system/backup
 * Créer une sauvegarde des données importantes
 */
router.post('/system/backup', async (req, res) => {
  try {
    // TODO: Implémenter la logique de sauvegarde
    // Ceci pourrait inclure l'export des données utilisateurs, statistiques, etc.
    
    res.json({
      success: true,
      message: 'Fonctionnalité de sauvegarde à implémenter'
    });
    
  } catch (error) {
    console.error('❌ Erreur sauvegarde:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

/**
 * GET /api/admin/system/health
 * Vérifier l'état du système
 */
router.get('/system/health', async (req, res) => {
  try {
    const dbConnection = require('mongoose').connection.readyState === 1;
    const totalUsers = await User.countDocuments();
    
    res.json({
      success: true,
      data: {
        database: dbConnection ? 'Connecté' : 'Déconnecté',
        totalUsers,
        serverTime: new Date(),
        uptime: process.uptime()
      }
    });
    
  } catch (error) {
    console.error('❌ Erreur vérification système:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

module.exports = router;