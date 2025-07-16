// C:\reactjs node mongodb\pharmacie-backend\src\controllers\adminController.js
const Counter = require('../models/Counter');

const {User} = require('../models/User');
const jwt = require('jsonwebtoken');
const { generateRandomPassword } = require('../utils/passwordUtils');
const { sendVerificationEmail, sendGeneratedPasswordToPharmacy, sendPharmacyApprovalEmail, sendPharmacyRequestStatusEmail } = require('../utils/emailUtils');
const crypto = require('crypto');



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
      role: 'client',
      'demandePharmacie.statutDemande': statut
    })
      .select('-motDePasse -resetPasswordToken -resetPasswordExpires')
      .sort({ 'demandePharmacie.dateDemande': -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments({
      role: 'client',
      'demandePharmacie.statutDemande': statut
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
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

    // Générer un numéro de pharmacie unique


// Générer un identifiant incrémental unique
async function getNextPharmacyNumber() {
  const counter = await Counter.findOneAndUpdate(
    { name: 'numeroPharmacie' },
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  );
  return `PHARM-${counter.value}`; // ex: PHARM-1001
}

/**
 * Approuver une demande de pharmacie
 */
// Dans adminController.js, corrigez l'appel à sendPharmacyApprovalEmail

const approvePharmacieRequest = async (req, res) => {
  try {
    const { userId } = req.params;
    const { commentaire } = req.body;

    const demandeur = await User.findById(userId);

    if (!demandeur || demandeur.role !== 'client' || !demandeur.demandePharmacie) {
      return res.status(404).json({ success: false, message: 'Demande introuvable' });
    }

    if (demandeur.demandePharmacie.statutDemande !== 'en_attente') {
      return res.status(400).json({ success: false, message: 'Demande déjà traitée' });
    }
    
    const motDePasseGenere = generateRandomPassword();
    const numeroPharmacie = await getNextPharmacyNumber();

    const info = demandeur.demandePharmacie.informationsPharmacie;

    const pharmacie = new User({
      nom: info.nomPharmacie,
      prenom: 'Pharmacie',
      email: info.emailPharmacie,
      telephone: info.telephonePharmacie,
      role: 'pharmacie',
      motDePasse: motDePasseGenere,
      motDePasseTemporaire: true,

      pharmacieInfo: {
        nomPharmacie: info.nomPharmacie,
        numeroPharmacie: numeroPharmacie,
        adresseGoogleMaps: info.adresseGoogleMaps,
        photoPharmacie: info.photoPharmacie,
        documentsVerification: info.documentsVerification || [],
        statutDemande: 'approuvee',
        dateApprobation: new Date(),
        commentaireApprobation: commentaire || 'Demande approuvee',
        approuvePar: req.user._id
      },
      isVerified: false,
      isActive: true
    });

    const token = jwt.sign({ userId: pharmacie._id }, process.env.JWT_SECRET, { expiresIn: '2d' });
    pharmacie.verificationToken = token;

    await pharmacie.save();

    // Mettre à jour la demande du client
    demandeur.demandePharmacie.statutDemande = 'approuvee';
    demandeur.demandePharmacie.dateApprobation = new Date();
    await demandeur.save();

    // Envois des emails
    await sendVerificationEmail(info.emailPharmacie, token, info.nomPharmacie);
    await sendGeneratedPasswordToPharmacy(info.emailPharmacie, motDePasseGenere);
    await sendPharmacyRequestStatusEmail(info.emailPharmacie, 'approuvee');
    await sendPharmacyRequestStatusEmail(demandeur.email, 'approuvee');

    // CORRECTION : Passez les bons paramètres à sendPharmacyApprovalEmail
    await sendPharmacyApprovalEmail(info.emailPharmacie, {
      nom: info.nomPharmacie, // Utilisez 'nom' au lieu de 'nomPharmacie'
      motDePasse: motDePasseGenere
    });

    res.json({
      success: true,
      message: 'Pharmacie approuvée et compte créé avec succès',
      data: { pharmacie: pharmacie.toJSON() }
    });
    
  } catch (error) {
    console.error('❌ Erreur approbation pharmacie:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

/**
 * Rejeter une demande de pharmacie
 */
// Dans adminController.js, corrigez la fonction rejectPharmacieRequest

const rejectPharmacieRequest = async (req, res) => {
  try {
    const { userId } = req.params;
    const { commentaire } = req.body;

    if (!commentaire) {
      return res.status(400).json({ success: false, message: 'Commentaire requis pour le rejet' });
    }

    const demandeur = await User.findById(userId);

    if (!demandeur || demandeur.role !== 'client' || !demandeur.demandePharmacie) {
      return res.status(404).json({ success: false, message: 'Demande introuvable' });
    }

    if (demandeur.demandePharmacie.statutDemande !== 'en_attente') {
      return res.status(400).json({ success: false, message: 'Demande déjà traitée' });
    }

    demandeur.demandePharmacie.statutDemande = 'rejetee';
    demandeur.demandePharmacie.dateApprobation = new Date();
    demandeur.demandePharmacie.commentaireApprobation = commentaire;
    demandeur.demandePharmacie.approuvePar = req.user._id;
    await demandeur.save();

    // CORRECTION : Déplacez l'envoi d'email AVANT le return
    await sendPharmacyRequestStatusEmail(
      demandeur.demandePharmacie.informationsPharmacie?.emailPharmacie || demandeur.email, 
      'rejetée'
    );

    res.json({ success: true, message: 'Demande rejetée avec succès' });
    
  } catch (error) {
    console.error('❌ Erreur rejet demande pharmacie:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
  
  // SUPPRIMEZ cette ligne qui est après le } catch et qui ne sera jamais exécutée
  // await sendPharmacyRequestStatusEmail(demandeur.demandePharmacie.informationsPharmacie?.emailPharmacie || demandeur.email, 'rejetée');
};

/** * Mettre à jour le statut d'une demande de pharmacie
 */

/**
 * Mettre à jour le statut d'une demande de pharmacie
 * CORRECTION : Récupérer userId depuis req.body au lieu de req.params
 */
const updatePharmacyRequestStatus = async (req, res) => {
  try {
    // CORRECTION : Récupérer userId depuis le body
    const { userId, statut, commentaire } = req.body;

    // Validation des paramètres
    if (!userId) {
      return res.status(400).json({ success: false, message: 'ID utilisateur requis' });
    }

    if (!['approuvee', 'rejetee'].includes(statut)) {
      return res.status(400).json({ success: false, message: 'Statut invalide' });
    }

    // Créer un objet request temporaire pour les fonctions existantes
    const tempReq = {
      ...req,
      params: { userId },
      body: { commentaire }
    };

    if (statut === 'approuvee') {
      return approvePharmacieRequest(tempReq, res);
    } else {
      return rejectPharmacieRequest(tempReq, res);
    }
  } catch (error) {
    console.error('❌ Erreur mise à jour statut:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};


/**
 * Obtenir les détails d'une pharmacie
 */
const getPharmacieRequestDetails = async (req, res) => {
  try {
    const { pharmacieId } = req.params;

    const pharmacie = await User.findById(pharmacieId)
      .select('-motDePasse -resetPasswordToken -resetPasswordExpires')
      .populate('pharmacieInfo.approuvePar', 'nom prenom email');

    if (!pharmacie || pharmacie.role !== 'pharmacie') {
      return res.status(404).json({ success: false, message: 'Pharmacie non trouvée' });
    }

    res.json({ success: true, data: { pharmacie } });
  } catch (error) {
    console.error('❌ Erreur détails pharmacie:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

/**
 * Mettre à jour un document de vérification d'une pharmacie
 */
const updatePharmacieDocuments = async (req, res) => {
  try {
    const { pharmacieId } = req.params;
    const { documentId, statutVerification, commentaireAdmin } = req.body;

    const pharmacie = await User.findById(pharmacieId);

    if (!pharmacie || pharmacie.role !== 'pharmacie') {
      return res.status(404).json({ success: false, message: 'Pharmacie non trouvée' });
    }

    const document = pharmacie.pharmacieInfo.documentsVerification.id(documentId);
    if (!document) {
      return res.status(404).json({ success: false, message: 'Document non trouvé' });
    }

    document.statutVerification = statutVerification;
    document.commentaireAdmin = commentaireAdmin;
    await pharmacie.save();

    res.json({ success: true, message: 'Document mis à jour avec succès', data: { document } });
  } catch (error) {
    console.error('❌ Erreur mise à jour document:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};
// GET /api/admin/pharmacy-requests

/**
 * Obtenir les statistiques pour le tableau de bord admin
 */
const getAdminDashboard = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalClients = await User.countDocuments({ role: 'client' });
    const totalPharmacies = await User.countDocuments({ role: 'pharmacie' });
    const pharmaciesEnAttente = await User.countDocuments({
      role: 'client',
      'demandePharmacie.statutDemande': 'en_attente'
    });
    const pharmaciesApprouvees = await User.countDocuments({
      role: 'pharmacie',
      'pharmacieInfo.statutDemande': 'approuvee'
    });

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const newUsersThisWeek = await User.countDocuments({ createdAt: { $gte: sevenDaysAgo } });

    const latestRequests = await User.find({
      role: 'client',
      'demandePharmacie.statutDemande': 'en_attente'
    })
      .select('nom prenom demandePharmacie.nomPharmacie demandePharmacie.dateDemande')
      .sort({ 'demandePharmacie.dateDemande': -1 })
      .limit(5);

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
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

/**
 * Obtenir toutes les pharmacies approuvées (recherche et filtre)
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
        { nom: { $regex: search, $options: 'i' } }
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
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

module.exports = {
  getPharmacieRequests,
  approvePharmacieRequest,
  rejectPharmacieRequest,
  getPharmacieRequestDetails,
  updatePharmacieDocuments,
  getAdminDashboard,
  getApprovedPharmacies,
  sendPharmacyRequestStatusEmail,
  updatePharmacyRequestStatus // ✅ Ajout ici aussi

};
