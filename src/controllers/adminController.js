// C:\reactjs node mongodb\pharmacie-backend\src\controllers\adminController.js

const User = require('../models/User');

/**
 * Obtenir toutes les demandes de pharmacies en attente
 */
const getPharmacieRequests = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      statut = 'en_attente'
    } = req.query;

    const skip = (page - 1) * limit;

    const requests = await User.find({
      role: 'pharmacie',
      'pharmacieInfo.statutDemande': statut
    })
    .select('-motDePasse -resetPasswordToken -resetPasswordExpires')
    .sort({ 'pharmacieInfo.dateDemandeApprouvement': -1 })
    .skip(skip)
    .limit(parseInt(limit));

    const total = await User.countDocuments({
      role: 'pharmacie',
      'pharmacieInfo.statutDemande': statut
    });

    res.json({
      success: true,
      data: {
        requests,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('❌ Erreur récupération demandes pharmacies:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

/**
 * Approuver une demande de pharmacie
 */
const approvePharmacieRequest = async (req, res) => {
  try {
    const { pharmacieId } = req.params;
    const { commentaire } = req.body;

    const pharmacie = await User.findById(pharmacieId);
    
    if (!pharmacie || pharmacie.role !== 'pharmacie') {
      return res.status(404).json({
        success: false,
        message: 'Pharmacie non trouvée'
      });
    }

    if (pharmacie.pharmacieInfo.statutDemande !== 'en_attente') {
      return res.status(400).json({
        success: false,
        message: 'Cette demande a déjà été traitée'
      });
    }

    // Mise à jour du statut
    pharmacie.pharmacieInfo.statutDemande = 'approuvee';
    pharmacie.pharmacieInfo.dateApprobation = new Date();
    pharmacie.pharmacieInfo.commentaireApprobation = commentaire || 'Demande approuvée';
    pharmacie.pharmacieInfo.approuvePar = req.user._id;
    pharmacie.isVerified = true;
    pharmacie.isActive = true;

    await pharmacie.save();

    // TODO: Envoyer un email de confirmation à la pharmacie
    console.log(`✅ Pharmacie ${pharmacie.pharmacieInfo.nomPharmacie} approuvée par ${req.user.getNomComplet()}`);

    res.json({
      success: true,
      message: 'Demande de pharmacie approuvée avec succès',
      data: {
        pharmacie: pharmacie.toJSON()
      }
    });

  } catch (error) {
    console.error('❌ Erreur approbation pharmacie:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

/**
 * Rejeter une demande de pharmacie
 */
const rejectPharmacieRequest = async (req, res) => {
  try {
    const { pharmacieId } = req.params;
    const { commentaire } = req.body;

    if (!commentaire) {
      return res.status(400).json({
        success: false,
        message: 'Un commentaire est requis pour le rejet'
      });
    }

    const pharmacie = await User.findById(pharmacieId);
    
    if (!pharmacie || pharmacie.role !== 'pharmacie') {
      return res.status(404).json({
        success: false,
        message: 'Pharmacie non trouvée'
      });
    }

    if (pharmacie.pharmacieInfo.statutDemande !== 'en_attente') {
      return res.status(400).json({
        success: false,
        message: 'Cette demande a déjà été traitée'
      });
    }

    // Mise à jour du statut
    pharmacie.pharmacieInfo.statutDemande = 'rejetee';
    pharmacie.pharmacieInfo.dateApprobation = new Date();
    pharmacie.pharmacieInfo.commentaireApprobation = commentaire;
    pharmacie.pharmacieInfo.approuvePar = req.user._id;
    pharmacie.isActive = false;

    await pharmacie.save();

    // TODO: Envoyer un email d'explication du rejet
    console.log(`❌ Pharmacie ${pharmacie.pharmacieInfo.nomPharmacie} rejetée par ${req.user.getNomComplet()}`);

    res.json({
      success: true,
      message: 'Demande de pharmacie rejetée',
      data: {
        pharmacie: pharmacie.toJSON()
      }
    });

  } catch (error) {
    console.error('❌ Erreur rejet pharmacie:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

/**
 * Obtenir les détails d'une demande de pharmacie
 */
const getPharmacieRequestDetails = async (req, res) => {
  try {
    const { pharmacieId } = req.params;

    const pharmacie = await User.findById(pharmacieId)
      .select('-motDePasse -resetPasswordToken -resetPasswordExpires')
      .populate('pharmacieInfo.approuvePar', 'nom prenom email');

    if (!pharmacie || pharmacie.role !== 'pharmacie') {
      return res.status(404).json({
        success: false,
        message: 'Pharmacie non trouvée'
      });
    }

    res.json({
      success: true,
      data: {
        pharmacie
      }
    });

  } catch (error) {
    console.error('❌ Erreur détails pharmacie:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

/**
 * Mettre à jour les documents de vérification d'une pharmacie
 */
const updatePharmacieDocuments = async (req, res) => {
  try {
    const { pharmacieId } = req.params;
    const { documentId, statutVerification, commentaireAdmin } = req.body;

    const pharmacie = await User.findById(pharmacieId);
    
    if (!pharmacie || pharmacie.role !== 'pharmacie') {
      return res.status(404).json({
        success: false,
        message: 'Pharmacie non trouvée'
      });
    }

    const document = pharmacie.pharmacieInfo.documentsVerification.id(documentId);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document non trouvé'
      });
    }

    document.statutVerification = statutVerification;
    document.commentaireAdmin = commentaireAdmin;

    await pharmacie.save();

    res.json({
      success: true,
      message: 'Document mis à jour avec succès',
      data: {
        document
      }
    });

  } catch (error) {
    console.error('❌ Erreur mise à jour document:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

/**
 * Obtenir le tableau de bord administrateur
 */
const getAdminDashboard = async (req, res) => {
  try {
    // Statistiques générales
    const totalUsers = await User.countDocuments();
    const totalClients = await User.countDocuments({ role: 'client' });
    const totalPharmacies = await User.countDocuments({ role: 'pharmacie' });
    const pharmaciesEnAttente = await User.countDocuments({
      role: 'pharmacie',
      'pharmacieInfo.statutDemande': 'en_attente'
    });
    const pharmaciesApprouvees = await User.countDocuments({
      role: 'pharmacie',
      'pharmacieInfo.statutDemande': 'approuvee'
    });

    // Utilisateurs récents (7 derniers jours)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const newUsersThisWeek = await User.countDocuments({
      createdAt: { $gte: sevenDaysAgo }
    });

    // Dernières demandes de pharmacies
    const latestRequests = await User.find({
      role: 'pharmacie',
      'pharmacieInfo.statutDemande': 'en_attente'
    })
    .select('nom prenom pharmacieInfo.nomPharmacie pharmacieInfo.dateDemandeApprouvement')
    .sort({ 'pharmacieInfo.dateDemandeApprouvement': -1 })
    .limit(5);

    // Utilisateurs les plus actifs
    const activeUsers = await User.find({
      role: 'client',
      'statistiques.derniereActivite': { $gte: sevenDaysAgo }
    })
    .select('nom prenom statistiques.derniereActivite statistiques.nombreCommandes')
    .sort({ 'statistiques.derniereActivite': -1 })
    .limit(5);

    res.json({
      success: true,
      data: {
        stats: {
          totalUsers,
          totalClients,
          totalPharmacies,
          pharmaciesEnAttente,
          pharmaciesApprouvees,
          newUsersThisWeek
        },
        latestRequests,
        activeUsers
      }
    });

  } catch (error) {
    console.error('❌ Erreur tableau de bord admin:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

/**
 * Obtenir toutes les pharmacies approuvées
 */
const getApprovedPharmacies = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      livraisonDisponible,
      estDeGarde
    } = req.query;

    const filter = {
      role: 'pharmacie',
      'pharmacieInfo.statutDemande': 'approuvee',
      isActive: true
    };

    if (search) {
      filter.$or = [
        { 'pharmacieInfo.nomPharmacie': { $regex: search, $options: 'i' } },
        { nom: { $regex: search, $options: 'i' } },
        { prenom: { $regex: search, $options: 'i' } }
      ];
    }

    if (livraisonDisponible !== undefined) {
      filter['pharmacieInfo.livraisonDisponible'] = livraisonDisponible === 'true';
    }

    if (estDeGarde !== undefined) {
      filter['pharmacieInfo.estDeGarde'] = estDeGarde === 'true';
    }

    const skip = (page - 1) * limit;

    const pharmacies = await User.find(filter)
      .select('-motDePasse -resetPasswordToken -resetPasswordExpires')
      .sort({ 'pharmacieInfo.dateApprobation': -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(filter);

    res.json({
      success: true,
      data: {
        pharmacies,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('❌ Erreur récupération pharmacies approuvées:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

module.exports = {
  getPharmacieRequests,
  approvePharmacieRequest,
  rejectPharmacieRequest,
  getPharmacieRequestDetails,
  updatePharmacieDocuments,
  getAdminDashboard,
  getApprovedPharmacies
};