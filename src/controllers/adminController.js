// C:\reactjs node mongodb\pharmacie-backend\src\controllers\adminController.js
const mongoose = require('mongoose'); // ✅ Keep for database operations
const Counter = require('../models/Counter');
const { User } = require('../models/User');
const jwt = require('jsonwebtoken');
const { generateRandomPassword } = require('../utils/passwordUtils');
const { sendVerificationEmail, sendGeneratedPasswordToPharmacy, sendPharmacyApprovalEmail, sendPharmacyRequestStatusEmail} = require('../utils/emailUtils');
const crypto = require('crypto');
const { uploadMedicamentImage: upload } = require('../middlewares/multerConfig'); // ✅ Import Multer middleware
const { createDetailedLog } = require('../utils/logUtils'); // ✅ Importer depuis logUtils


async function getNextPharmacyNumber() {
  try {
    const counter = await Counter.findOneAndUpdate(
      { name: 'pharmacyNumber' }, // Changé de _id à name
      { $inc: { value: 1 } }, // Changé de seq à value
      { new: true, upsert: true }
    );
    return counter.value; // Changé de seq à value
  } catch (error) {
    console.error('❌ Erreur getNextPharmacyNumber:', error);
    throw new Error('Erreur lors de la génération du numéro de pharmacie');
  }
}
/**
 * Obtenir toutes les demandes de pharmacies en attente
 */
const getPharmacieDemandeCreationRequests = async (req, res) => {
  try {
    const { page = 1, limit = 10, statut = 'en_attente' } = req.query;
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

const getPharmacyModifDeleteRequests = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      type = 'all', // 'suppression', 'modification', 'all'
      statut = 'en_attente',
    } = req.query;

    if (!req.user || req.user.role !== 'admin') {
      createDetailedLog('GET_PHARMACY_REQUESTS_ECHEC', {
        raison: 'ACCES_NON_AUTORISE',
        userId: req.user?._id,
        role: req.user?.role,
      });
      return res.status(403).json({ message: 'Accès non autorisé' });
    }

    const skip = (page - 1) * limit;

    let filter = { role: 'pharmacie' };

    if (type === 'suppression') {
      filter['demandeSuppression.statut'] = statut;
    } else if (type === 'modification') {
      filter['demandePharmacie.demandeModification.statut'] = statut;
    } else {
      filter.$or = [
        { 'demandeSuppression.statut': statut },
        { 'demandePharmacie.demandeModification.statut': statut },
      ];
    }

    const requests = await User.find(filter)
      .select('nom prenom email pharmacieInfo.nomPharmacie demandeSuppression demandePharmacie.demandeModification')
      .sort({
        'demandePharmacie.demandeModification.dateDemande': -1,
        'demandeSuppression.dateDemande': -1
      })
      .skip(skip)
      .limit(parseInt(limit));

    console.log('Raw requests:', JSON.stringify(requests, null, 2));

    const total = await User.countDocuments(filter);

    const formattedRequests = requests.map(user => ({
      _id: user._id,
      nom: user.nom,
      prenom: user.prenom,
      email: user.email,
      nomPharmacie: user.pharmacieInfo?.nomPharmacie || '',
      demandeSuppression: user.demandeSuppression && typeof user.demandeSuppression === 'object' ? user.demandeSuppression : null,
      demandeModification: user.demandePharmacie?.demandeModification || null,
    }));

    createDetailedLog('GET_PHARMACY_REQUESTS_REUSSI', {
      userId: req.user._id,
      type,
      statut,
      total,
      requests: formattedRequests,
    });

    res.json({
      success: true,
      data: {
        requests: formattedRequests,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
          limit: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error('❌ Erreur getPharmacyModifDeleteRequests:', error);
    createDetailedLog('ERREUR_GET_PHARMACY_REQUESTS', {
      erreur: error.message,
      stack: error.stack,
      userId: req.user?._id,
    });
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
    });
  }
};


const uploadMedicamentImage = async (req, res) => {
  try {
    upload(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ success: false, message: err.message });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Aucun fichier téléchargé' });
      }

      const { pharmacieId, medicamentId } = req.params;
      const pharmacie = await User.findById(pharmacieId);
      if (!pharmacie || pharmacie.role !== 'pharmacie' || !pharmacie.pharmacieInfo.baseMedicament) {
        return res.status(404).json({ success: false, message: 'Pharmacie ou base de données non trouvée' });
      }

      const connection = mongoose.connection.useDb(pharmacie.pharmacieInfo.baseMedicament);
      const Medicament = connection.model('Medicament', require('../models/Medicament'), 'medocs');

      const medicament = await Medicament.findById(medicamentId);
      if (!medicament) {
        return res.status(404).json({ success: false, message: 'Médicament non trouvé' });
      }

      medicament.image = {
        nomFichier: req.file.filename,
        cheminFichier: `/Uploads/medicaments/${req.file.filename}`, // ✅ Updated to lowercase 'uploads'
        typeFichier: req.file.mimetype,
        tailleFichier: req.file.size,
        dateUpload: new Date()
      };

      await medicament.save();

      res.json({
        success: true,
        message: 'Image du médicament téléchargée avec succès',
        data: medicament.image
      });
    });
  } catch (error) {
    console.error('❌ Erreur upload image médicament:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};



const getMedicaments = async (req, res) => {
  try {
    const { pharmacieId } = req.params;
    const { page = 1, limit = 10, search } = req.query;

    const pharmacie = await User.findById(pharmacieId);
    if (!pharmacie || pharmacie.role !== 'pharmacie' || !pharmacie.pharmacieInfo.baseMedicament) {
      return res.status(404).json({ success: false, message: 'Pharmacie ou base de données non trouvée' });
    }

    const connection = mongoose.connection.useDb(pharmacie.pharmacieInfo.baseMedicament);
    const Medicament = connection.model('Medicament', require('../models/Medicament'), 'medocs');

    const filter = {};
    if (search) {
      filter.$or = [
        { nom: { $regex: search, $options: 'i' } },
        { nom_generique: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;
    const medicaments = await Medicament.find(filter)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Medicament.countDocuments(filter);

    res.json({
      success: true,
      data: {
        medicaments,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('❌ Erreur récupération médicaments:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

/**
 * Approuver une demande de pharmacie
 */
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
      createdBy: demandeur._id,
      pharmacieInfo: {
        nomPharmacie: info.nomPharmacie,
        numeroPharmacie: numeroPharmacie,
        adresseGoogleMaps: info.adresseGoogleMaps,
        photoPharmacie: info.photoPharmacie || null,
        documentsVerification: info.documentsVerification || [],
        statutDemande: 'approuvee',
        dateApprobation: new Date(),
        commentaireApprobation: commentaire || 'Demande approuvee',
        approuvePar: req.user._id,
        heuresOuverture: {
          lundi: { ouvert: false, debut: '', fin: '' },
          mardi: { ouvert: false, debut: '', fin: '' },
          mercredi: { ouvert: false, debut: '', fin: '' },
          jeudi: { ouvert: false, debut: '', fin: '' },
          vendredi: { ouvert: false, debut: '', fin: '' },
          samedi: { ouvert: false, debut: '', fin: '' },
          dimanche: { ouvert: false, debut: '', fin: '' }
        },
        periodeGarde: { debut: null, fin: null }
      },
      isVerified: true,
      isActive: true,
      createdBy: demandeur._id,
    });

    const token = jwt.sign({ userId: pharmacie._id }, process.env.JWT_SECRET, { expiresIn: '2d' });
    pharmacie.verificationToken = token;

    await pharmacie.save();

    // Mettre à jour la demande du client
    demandeur.demandePharmacie.statutDemande = 'approuvee';
    demandeur.demandePharmacie.dateApprobation = new Date();
    await demandeur.save();

    // Envois des emails
    // await sendVerificationEmail(info.emailPharmacie, token, info.nomPharmacie);
    // await sendGeneratedPasswordToPharmacy(info.emailPharmacie, motDePasseGenere);

    const pharmacyInfoForEmail = {
      prenom: demandeur.prenom,
      nom: demandeur.nom,
      nomPharmacie: info.nomPharmacie
    };

    // await sendPharmacyRequestStatusEmail(info.emailPharmacie, 'approuvee', pharmacyInfoForEmail, motDePasseGenere);
    // await sendPharmacyRequestStatusEmail(demandeur.email, 'approuvee', pharmacyInfoForEmail, motDePasseGenere);

    await sendPharmacyApprovalEmail(info.emailPharmacie, {
      nom: info.nomPharmacie,
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

    const pharmacyInfoForEmail = {
      prenom: demandeur.prenom,
      nom: demandeur.nom,
      nomPharmacie: demandeur.demandePharmacie.informationsPharmacie?.nomPharmacie || 'Pharmacie'
    };

    await sendPharmacyRequestStatusEmail(
      demandeur.demandePharmacie.informationsPharmacie?.emailPharmacie || demandeur.email, 
      'rejetee',
      pharmacyInfoForEmail
    );

    res.json({ success: true, message: 'Demande rejetée avec succès' });
    
  } catch (error) {
    console.error('❌ Erreur rejet demande pharmacie:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};




const approveModificationRequest = async (req, res) => {
  try {
    const { userId } = req.params; // Changed from req.body
    const { commentaire } = req.body;

    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    }

    const pharmacie = await User.findById(userId);
    if (!pharmacie || pharmacie.role !== 'pharmacie' || !pharmacie.demandePharmacie?.demandeModification) {
      return res.status(404).json({ success: false, message: 'Demande de modification introuvable' });
    }

    if (pharmacie.demandePharmacie.demandeModification.statut !== 'en_attente') {
      return res.status(400).json({ success: false, message: 'Demande déjà traitée' });
    }

    const { nom, email, numero, positionGoogleMaps, photo } = pharmacie.demandePharmacie.demandeModification;

    pharmacie.nom = nom || pharmacie.nom;
    pharmacie.email = email || pharmacie.email;
    pharmacie.telephone = numero || pharmacie.telephone;
    pharmacie.pharmacieInfo.adresseGoogleMaps = positionGoogleMaps || pharmacie.pharmacieInfo.adresseGoogleMaps;
    if (photo) pharmacie.pharmacieInfo.photoPharmacie = photo;

    pharmacie.demandePharmacie.demandeModification.statut = 'approuvee';
    pharmacie.demandePharmacie.demandeModification.dateApprobation = new Date();
    pharmacie.demandePharmacie.demandeModification.commentaireApprobation = commentaire || 'Modification approuvée';
    pharmacie.demandePharmacie.demandeModification.approuvePar = req.user._id;

    await pharmacie.save();

    await sendPharmacyRequestStatusEmail(pharmacie.email, 'approuvee', {
      prenom: pharmacie.prenom,
      nom: pharmacie.nom,
      nomPharmacie: pharmacie.pharmacieInfo.nomPharmacie,
    });

    res.json({
      success: true,
      message: 'Demande de modification approuvée avec succès',
    });
  } catch (error) {
    console.error('❌ Erreur approbation modification:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

const rejectModificationRequest = async (req, res) => {
  try {
    const { userId } = req.params; // Changed from req.body
    const { commentaire } = req.body;

    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    }

    if (!commentaire) {
      return res.status(400).json({ success: false, message: 'Commentaire requis pour le rejet' });
    }

    const pharmacie = await User.findById(userId);
    if (!pharmacie || pharmacie.role !== 'pharmacie' || !pharmacie.demandePharmacie?.demandeModification) {
      return res.status(404).json({ success: false, message: 'Demande de modification introuvable' });
    }

    if (pharmacie.demandePharmacie.demandeModification.statut !== 'en_attente') {
      return res.status(400).json({ success: false, message: 'Demande déjà traitée' });
    }

    pharmacie.demandePharmacie.demandeModification.statut = 'rejetee';
    pharmacie.demandePharmacie.demandeModification.dateApprobation = new Date();
    pharmacie.demandePharmacie.demandeModification.commentaireApprobation = commentaire;
    pharmacie.demandePharmacie.demandeModification.approuvePar = req.user._id;

    await pharmacie.save();

    await sendPharmacyRequestStatusEmail(pharmacie.email, 'rejetee', {
      prenom: pharmacie.prenom,
      nom: pharmacie.nom,
      nomPharmacie: pharmacie.pharmacieInfo.nomPharmacie,
    });

    res.json({
      success: true,
      message: 'Demande de modification rejetée avec succès',
    });
  } catch (error) {
    console.error('❌ Erreur rejet modification:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

const approveSuppressionRequest = async (req, res) => {
  try {
    const { userId } = req.params; // Changed from req.body
    const { commentaire } = req.body;

    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    }

    const pharmacie = await User.findById(userId);
    if (!pharmacie || pharmacie.role !== 'pharmacie' || !pharmacie.demandeSuppression) {
      return res.status(404).json({ success: false, message: 'Demande de suppression introuvable' });
    }

    if (pharmacie.demandeSuppression.statut !== 'en_attente') {
      return res.status(400).json({ success: false, message: 'Demande déjà traitée' });
    }

    pharmacie.isActive = false;
    pharmacie.demandeSuppression.statut = 'approuvee';
    pharmacie.demandeSuppression.dateApprobation = new Date();
    pharmacie.demandeSuppression.commentaireApprobation = commentaire || 'Suppression approuvée';
    pharmacie.demandeSuppression.approuvePar = req.user._id;

    await pharmacie.save();

    await sendPharmacyRequestStatusEmail(pharmacie.email, 'approuvee', {
      prenom: pharmacie.prenom,
      nom: pharmacie.nom,
      nomPharmacie: pharmacie.pharmacieInfo.nomPharmacie,
    });

    res.json({
      success: true,
      message: 'Demande de suppression approuvée avec succès',
    });
  } catch (error) {
    console.error('❌ Erreur approbation suppression:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

const rejectSuppressionRequest = async (req, res) => {
  try {
    const { userId } = req.params; // Changed from req.body
    const { commentaire } = req.body;

    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    }

    if (!commentaire) {
      return res.status(400).json({ success: false, message: 'Commentaire requis pour le rejet' });
    }

    const pharmacie = await User.findById(userId);
    if (!pharmacie || pharmacie.role !== 'pharmacie' || !pharmacie.demandeSuppression) {
      return res.status(404).json({ success: false, message: 'Demande de suppression introuvable' });
    }

    if (pharmacie.demandeSuppression.statut !== 'en_attente') {
      return res.status(400).json({ success: false, message: 'Demande déjà traitée' });
    }

    pharmacie.demandeSuppression.statut = 'rejetee';
    pharmacie.demandeSuppression.dateApprobation = new Date();
    pharmacie.demandeSuppression.commentaireApprobation = commentaire;
    pharmacie.demandeSuppression.approuvePar = req.user._id;

    await pharmacie.save();

    await sendPharmacyRequestStatusEmail(pharmacie.email, 'rejetee', {
      prenom: pharmacie.prenom,
      nom: pharmacie.nom,
      nomPharmacie: pharmacie.pharmacieInfo.nomPharmacie,
    });

    res.json({
      success: true,
      message: 'Demande de suppression rejetée avec succès',
    });
  } catch (error) {
    console.error('❌ Erreur rejet suppression:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

/**
 * Mettre à jour le statut d'une demande de pharmacie
 */
const updatePharmacyRequestStatus = async (req, res) => {
  try {
    const { userId, statut, commentaire } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'ID utilisateur requis' });
    }

    if (!['approuvee', 'rejetee'].includes(statut)) {
      return res.status(400).json({ success: false, message: 'Statut invalide' });
    }

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
 * Associer une pharmacie à une base de médicaments
 */
const associerBaseMedicament = async (req, res) => {
  const { pharmacyId } = req.params;
  const { nomBaseMedicament } = req.body;

  if (!pharmacyId || !nomBaseMedicament) {
    return res.status(400).json({
      success: false,
      message: 'pharmacyId et nomBaseMedicament sont requis.'
    });
  }

  const validDatabases = ['pharmacie_alpha', 'pharmacie_beta', 'pharmacie_nova', 'pharmacie_omega'];
  if (!validDatabases.includes(nomBaseMedicament)) {
    return res.status(400).json({ success: false, message: 'Base de données invalide' });
  }

  try {
    const user = await User.findById(pharmacyId);
    if (!user || user.role !== 'pharmacie') {
      return res.status(404).json({ success: false, message: 'Pharmacie non trouvée.' });
    }

    user.pharmacieInfo.baseMedicament = nomBaseMedicament;
    await user.save();

    return res.status(200).json({
      success: true,
      message: `✅ Pharmacie liée à la base ${nomBaseMedicament}`,
      pharmacie: {
        id: user._id,
        nom: user.nom,
        base: user.pharmacieInfo.baseMedicament
      }
    });
  } catch (error) {
    console.error('❌ Erreur liaison base:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

/**
 * Obtenir toutes les pharmacies approuvées (recherche et filtre)
 */
const getApprovedPharmacies = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, livraisonDisponible, estDeGarde } = req.query;

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
  getPharmacieDemandeCreationRequests,
  getPharmacyModifDeleteRequests,
  approvePharmacieRequest,
  rejectPharmacieRequest,
  approveModificationRequest,
  rejectModificationRequest,
  approveSuppressionRequest,
  rejectSuppressionRequest,
  getPharmacieRequestDetails,
  updatePharmacieDocuments,
  getAdminDashboard,
  getApprovedPharmacies,
  updatePharmacyRequestStatus,
  associerBaseMedicament,
  uploadMedicamentImage,
  getMedicaments
};
