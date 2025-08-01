const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const { checkRole } = require('../middlewares/roleCheck');
const { User } = require('../models/User');
const Commande = require('../models/Commande');

/**
 * Statistiques générales de l'application
 */
router.get('/general', authenticate, checkRole(['admin']), async (req, res) => {
  try {
    // Statistiques des utilisateurs
    const userStats = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 },
        },
      },
    ]);

    // Total des utilisateurs
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const verifiedUsers = await User.countDocuments({ isVerified: true });

    // Utilisateurs récents (7 derniers jours)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentUsers = await User.countDocuments({
      createdAt: { $gte: sevenDaysAgo },
    });

    // Statistiques des pharmacies
    const pharmacieStats = await User.aggregate([
      { $match: { role: 'pharmacie' } },
      {
        $group: {
          _id: '$pharmacieInfo.statutDemande',
          count: { $sum: 1 },
        },
      },
    ]);

    // Pharmacies par ville (basé sur adresse Google Maps)
    const pharmaciesParVille = await User.aggregate([
      { $match: { role: 'pharmacie', 'pharmacieInfo.statutDemande': 'approuvee' } },
      {
        $group: {
          _id: { $substr: ['$pharmacieInfo.adresseGoogleMaps', 0, 20] },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    // Évolution des inscriptions par mois
    const evolutionInscriptions = await User.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 12 },
    ]);

    res.json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        verifiedUsers,
        recentUsers,
        userStats,
        pharmacieStats,
        pharmaciesParVille,
        evolutionInscriptions,
      },
    });
  } catch (error) {
    console.error('❌ Erreur statistiques générales:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des statistiques',
    });
  }
});

/**
 * Statistiques des pharmacies
 */
router.get('/pharmacies', authenticate, checkRole(['admin']), async (req, res) => {
  try {
    const totalPharmacies = await User.countDocuments({ role: 'pharmacie' });
    const pharmaciesApprouvees = await User.countDocuments({
      role: 'pharmacie',
      'pharmacieInfo.statutDemande': 'approuvee',
    });
    const pharmaciesEnAttente = await User.countDocuments({
      role: 'pharmacie',
      'pharmacieInfo.statutDemande': 'en_attente',
    });
    const pharmaciesRejetees = await User.countDocuments({
      role: 'pharmacie',
      'pharmacieInfo.statutDemande': 'rejetee',
    });

    // Pharmacies avec livraison
    const pharmaciesAvecLivraison = await User.countDocuments({
      role: 'pharmacie',
      'pharmacieInfo.statutDemande': 'approuvee',
      'pharmacieInfo.livraisonDisponible': true,
    });

    // Pharmacies de garde actuellement
    const pharmaciesDeGarde = await User.countDocuments({
      role: 'pharmacie',
      'pharmacieInfo.statutDemande': 'approuvee',
      'pharmacieInfo.estDeGarde': true,
    });

    // Répartition par statut de demande
    const repartitionStatuts = await User.aggregate([
      { $match: { role: 'pharmacie' } },
      {
        $group: {
          _id: '$pharmacieInfo.statutDemande',
          count: { $sum: 1 },
        },
      },
    ]);

    // Pharmacies récemment inscrites (30 jours)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const pharmaciesRecentes = await User.countDocuments({
      role: 'pharmacie',
      createdAt: { $gte: thirtyDaysAgo },
    });

    // Temps moyen d'approbation
    const tempsApprobation = await User.aggregate([
      {
        $match: {
          role: 'pharmacie',
          'pharmacieInfo.statutDemande': 'approuvee',
          'pharmacieInfo.dateApprobation': { $exists: true },
        },
      },
      {
        $project: {
          tempsApprobation: {
            $divide: [
              { $subtract: ['$pharmacieInfo.dateApprobation', '$pharmacieInfo.dateDemandeApprouvement'] },
              1000 * 60 * 60 * 24, // Convertir en jours
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          tempsApprobationMoyen: { $avg: '$tempsApprobation' },
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        totalPharmacies,
        pharmaciesApprouvees,
        pharmaciesEnAttente,
        pharmaciesRejetees,
        pharmaciesAvecLivraison,
        pharmaciesDeGarde,
        pharmaciesRecentes,
        repartitionStatuts,
        tempsApprobationMoyen: tempsApprobation[0]?.tempsApprobationMoyen || 0,
      },
    });
  } catch (error) {
    console.error('❌ Erreur statistiques pharmacies:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des statistiques pharmacies',
    });
  }
});

/**
 * Statistiques des utilisateurs clients
 */
router.get('/clients', authenticate, checkRole(['admin']), async (req, res) => {
  try {
    const totalClients = await User.countDocuments({ role: 'client' });
    const clientsActifs = await User.countDocuments({
      role: 'client',
      isActive: true,
    });
    const clientsVerifies = await User.countDocuments({
      role: 'client',
      isVerified: true,
    });

    // Clients récents (30 jours)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const clientsRecents = await User.countDocuments({
      role: 'client',
      createdAt: { $gte: thirtyDaysAgo },
    });

    // Évolution des inscriptions clients par mois
    const evolutionClients = await User.aggregate([
      { $match: { role: 'client' } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 12 },
    ]);

    // Clients avec commandes
    const clientsAvecCommandes = await User.countDocuments({
      role: 'client',
      'statistiques.nombreCommandes': { $gt: 0 },
    });

    res.json({
      success: true,
      data: {
        totalClients,
        clientsActifs,
        clientsVerifies,
        clientsRecents,
        clientsAvecCommandes,
        evolutionClients,
      },
    });
  } catch (error) {
    console.error('❌ Erreur statistiques clients:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des statistiques clients',
    });
  }
});

/**
 * Statistiques des commandes
 */
router.get('/commandes', authenticate, checkRole(['admin']), async (req, res) => {
  try {
    const totalCommandes = await Commande.countDocuments();
    const commandesEnAttente = await Commande.countDocuments({ statut: 'en_attente' });
    const commandesLivrees = await Commande.countDocuments({ statut: 'livree' });

    const evolutionCommandes = await Commande.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$dateCommande' },
            month: { $month: '$dateCommande' },
          },
          count: { $sum: 1 },
          total: { $sum: '$total' },
        },
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 12 },
    ]);

    const commandesParPharmacie = await Commande.aggregate([
      {
        $group: {
          _id: '$pharmacyId',
          count: { $sum: 1 },
          total: { $sum: '$total' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'pharmacie',
        },
      },
      { $unwind: '$pharmacie' },
      {
        $project: {
          pharmacieNom: '$pharmacie.pharmacieInfo.nomPharmacie',
          count: 1,
          total: 1,
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        totalCommandes,
        commandesEnAttente,
        commandesLivrees,
        evolutionCommandes,
        commandesParPharmacie,
      },
    });
  } catch (error) {
    console.error('❌ Erreur statistiques commandes:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des statistiques commandes',
    });
  }
});

/**
 * Export des données pour rapports
 */
router.get('/export', authenticate, checkRole(['admin']), async (req, res) => {
  try {
    const { type, format = 'json' } = req.query;

    let data = {};

    switch (type) {
      case 'users':
        data = await User.find({})
          .select('-motDePasse -resetPasswordToken -resetPasswordExpires')
          .sort({ createdAt: -1 });
        break;

      case 'pharmacies':
        data = await User.find({ role: 'pharmacie' })
          .select('-motDePasse -resetPasswordToken -resetPasswordExpires')
          .sort({ createdAt: -1 });
        break;

      case 'clients':
        data = await User.find({ role: 'client' })
          .select('-motDePasse -resetPasswordToken -resetPasswordExpires')
          .sort({ createdAt: -1 });
        break;

      default:
        return res.status(400).json({
          success: false,
          message: 'Type d\'export non supporté',
        });
    }

    if (format === 'csv') {
      // TODO: Implémenter la conversion CSV
      return res.status(501).json({
        success: false,
        message: 'Export CSV non encore implémenté',
      });
    }

    res.json({
      success: true,
      data,
      exportInfo: {
        type,
        format,
        count: data.length,
        generatedAt: new Date(),
      },
    });
  } catch (error) {
    console.error('❌ Erreur export données:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'export',
    });
  }
});

// Recherche statistiques (non implémenté)
router.get('/searches', authenticate, checkRole(['admin']), (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Statistiques de recherche non encore implémentées',
  });
});

module.exports = router;