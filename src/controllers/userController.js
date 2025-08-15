// C:\reactjs node mongodb\pharmacie-backend\src\controllers\userController.js

const mongoose = require('mongoose');
const medicamentSchema = require('../models/Medicament'); // Assurez-vous que le chemin est correct
const { authenticate, checkRole } = require('../middlewares/auth');
const { User } = require('../models/User');

/**
 * Obtenir tous les utilisateurs (Admin seulement)
 */
const getAllUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      role,
      search,
      isActive
    } = req.query;
    
    // Construire le filtre
    const filter = {};
    
    if (role) filter.role = role;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (search) {
      filter.$or = [
        { nom: { $regex: search, $options: 'i' } },
        { prenom: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { 'pharmacieInfo.nomPharmacie': { $regex: search, $options: 'i' } }
      ];
    }
    
    // Pagination
    const skip = (page - 1) * limit;
    
    const users = await User.find(filter)
      .select('-motDePasse -resetPasswordToken -resetPasswordExpires')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await User.countDocuments(filter);
    
    res.json({
      success: true,
      data: {
        users,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
          limit: parseInt(limit)
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Erreur récupération utilisateurs:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

/**
 * Obtenir un utilisateur par ID
 */
const getUserById = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId)
      .select('-motDePasse -resetPasswordToken -resetPasswordExpires');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }
    
    res.json({
      success: true,
      data: { user }
    });
    
  } catch (error) {
    console.error('❌ Erreur récupération utilisateur:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};



/**
 * Mettre à jour le rôle d'un utilisateur (Admin seulement)
 */
const updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    
    const validRoles = ['client', 'pharmacie', 'admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Rôle invalide'
      });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }
    
    // Empêcher la modification de son propre rôle
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Vous ne pouvez pas modifier votre propre rôle'
      });
    }
    
    user.role = role;
    await user.save();
    
    res.json({
      success: true,
      message: 'Rôle mis à jour avec succès',
      data: { user: user.toJSON() }
    });
    
  } catch (error) {
    console.error('❌ Erreur mise à jour rôle:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

/**
 * Activer/Désactiver un compte utilisateur
 */
const toggleUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive } = req.body;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }
    
    // Empêcher la désactivation de son propre compte
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Vous ne pouvez pas désactiver votre propre compte'
      });
    }
    
    user.isActive = isActive;
    await user.save();
    
    res.json({
      success: true,
      message: `Compte ${isActive ? 'activé' : 'désactivé'} avec succès`,
      data: { user: user.toJSON() }
    });
    
  } catch (error) {
    console.error('❌ Erreur activation/désactivation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

/**
 * Supprimer un utilisateur
 */
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }
    
    // Empêcher la suppression de son propre compte
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Vous ne pouvez pas supprimer votre propre compte'
      });
    }
    
    await User.findByIdAndDelete(userId);
    
    res.json({
      success: true,
      message: 'Utilisateur supprimé avec succès'
    });
    
  } catch (error) {
    console.error('❌ Erreur suppression utilisateur:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

/**
 * Obtenir les statistiques des utilisateurs
 */
const getUserStats = async (req, res) => {
  try {
    const stats = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const verifiedUsers = await User.countDocuments({ isVerified: true });
    
    // Statistiques des pharmacies
    const pharmacieStats = await User.aggregate([
      { $match: { role: 'pharmacie' } },
      {
        $group: {
          _id: '$pharmacieInfo.statutDemande',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Utilisateurs récents (7 derniers jours)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentUsers = await User.countDocuments({
      createdAt: { $gte: sevenDaysAgo }
    });
    
    res.json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        verifiedUsers,
        recentUsers,
        roleDistribution: stats,
        pharmacieStats
      }
    });
    
  } catch (error) {
    console.error('❌ Erreur statistiques utilisateurs:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};



module.exports = {
  getAllUsers,
  getUserById,
  updateUserRole,
  toggleUserStatus,
  deleteUser,
  getUserStats,
};