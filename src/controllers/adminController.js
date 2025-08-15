// C:\reactjs node mongodb\pharmacie-backend\src\controllers\adminController.js

const mongoose = require('mongoose');
const Counter = require('../models/Counter');
const { User } = require('../models/User');
const Medicament = require('../models/Medicament');
const jwt = require('jsonwebtoken');
const { generateRandomPassword } = require('../utils/passwordUtils');
const { sendVerificationEmail, sendGeneratedPasswordToPharmacy, sendPharmacyApprovalEmail, sendPharmacyRequestStatusEmail } = require('../utils/emailUtils');
const crypto = require('crypto');
const { uploadMedicamentImage: upload } = require('../middlewares/multerConfig');
const { createDetailedLog } = require('../utils/logUtils');
const { DrugImage } = require('../models/DrugImage');
const DrugImageModel = mongoose.connection.useDb('pharmacies').model('DrugImage', require('../models/DrugImage').schema);

async function getNextPharmacyNumber() {
  try {
    const counter = await Counter.findOneAndUpdate(
      { name: 'pharmacyNumber' },
      { $inc: { value: 1 } },
      { new: true, upsert: true }
    );
    return counter.value;
  } catch (error) {
    console.error('❌ Erreur getNextPharmacyNumber:', error);
    throw new Error('Erreur lors de la génération du numéro de pharmacie');
  }
}

async function getPharmacieDemandeCreationRequests(req, res) {
  try {
    console.log('🟢 [getPharmacyRequests] Récupération des demandes pour:', req.user.email);
    const { statut = 'en_attente', page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const users = await User.find({
      'demandePharmacie.statutDemande': statut,
    })
      .select('nom prenom email telephone demandePharmacie createdBy')
      .skip(skip)
      .limit(parseInt(limit));

    console.log('✅ [getPharmacyRequests] Demandes trouvées:', users.length);
    const total = await User.countDocuments({
      'demandePharmacie.statutDemande': statut,
    });

    const formattedData = users.map(user => {
      if (!user.email || !user.telephone) {
        console.warn(`⚠️ [getPharmacyRequests] Données incomplètes pour l'utilisateur ${user._id}:`, {
          email: user.email,
          telephone: user.telephone,
        });
      }
      return {
        _id: user._id,
        nom: user.nom || 'N/A',
        prenom: user.prenom || 'N/A',
        email: user.email || 'N/A',
        telephone: user.telephone || 'N/A',
        informationsPharmacie: user.demandePharmacie.informationsPharmacie || {},
        statutDemande: user.demandePharmacie.statutDemande,
        dateDemande: user.demandePharmacie.dateDemande,
        createdBy: user.createdBy,
      };
    });

    res.json({
      success: true,
      data: formattedData,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error('❌ [getPharmacyRequests] Erreur:', error.message, error.stack);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
}

async function handlePharmacyRequest(req, res) {
  try {
    const { requestId, action } = req.params;
    const { commentaire } = req.body;
    console.log(`🟢 [handlePharmacyRequest] Action ${action} pour demande:`, requestId);

    if (!['approve', 'reject'].includes(action)) {
      console.error('❌ [handlePharmacyRequest] Action invalide:', action);
      return res.status(400).json({ success: false, message: 'Action invalide' });
    }

    const tempReq = {
      ...req,
      params: { userId: requestId },
      body: { commentaire },
    };

    if (action === 'approve') {
      return await approvePharmacieRequest(tempReq, res);
    } else {
      return await rejectPharmacieRequest(tempReq, res);
    }
  } catch (error) {
    console.error('❌ [handlePharmacyRequest] Erreur:', error.message, error.stack);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
}

async function getPharmacyModifDeleteRequests(req, res) {
  try {
    const {
      page = 1,
      limit = 10,
      type = 'all',
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
        'demandeSuppression.dateDemande': -1,
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
}

// Fichier : src/controllers/adminController.js
// Fichier : src/controllers/adminController.js
async function getPharmacyMedicaments(req, res) {
  try {
    const { pharmacyId } = req.params;
    const { nom } = req.query;
    if (!req.user) {
      console.log('❌ [getPharmacyMedicaments] Utilisateur non authentifié');
      return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    }

    console.log(`🔍 [getPharmacyMedicaments] Recherche pour pharmacyId: ${pharmacyId}, nom: ${nom || 'aucun'}`);

    const pharmacie = await User.findById(pharmacyId).lean();
    if (!pharmacie) {
      console.log(`❌ [getPharmacyMedicaments] Pharmacie ${pharmacyId} non trouvée`);
      return res.status(404).json({ success: false, message: 'Pharmacie non trouvée' });
    }
    if (pharmacie.role !== 'pharmacie') {
      console.log(`❌ [getPharmacyMedicaments] Rôle non valide pour ${pharmacyId}: ${pharmacie.role}`);
      return res.status(404).json({ success: false, message: 'Entité non valide (pas une pharmacie)' });
    }
    if (!pharmacie.pharmacieInfo?.baseMedicament) {
      console.log(`❌ [getPharmacyMedicaments] baseMedicament manquant pour ${pharmacyId}`);
      return res.status(404).json({ success: false, message: 'Base de données des médicaments non configurée' });
    }

    console.log(`🔍 [getPharmacyMedicaments] Connexion à la base: ${pharmacie.pharmacieInfo.baseMedicament}`);
    const connection = mongoose.connection.useDb(pharmacie.pharmacieInfo.baseMedicament);
    const MedicamentModel = connection.model('Medicament', Medicament.schema, 'medicaments');

    const query = { pharmacie: new mongoose.Types.ObjectId(pharmacyId) };
    if (nom) {
      query.$or = [
        { nom: { $regex: nom, $options: 'i' } },
        { nom_generique: { $regex: nom, $options: 'i' } }
      ];
    }

    const medicaments = await MedicamentModel.find(query)
      .select('nom nom_generique description prix quantite_stock est_sur_ordonnance categorie forme date_peremption dosage code_barre')
      .lean();

    console.log(`🔍 [getPharmacyMedicaments] Médicaments trouvés: ${medicaments.length}`);

    const medicamentsWithImages = await Promise.all(
      medicaments.map(async (med) => {
        const image = await DrugImageModel.findOne({
          nom: { $in: [med.nom.toLowerCase(), med.nom_generique?.toLowerCase()].filter(Boolean) },
        }).lean();
        console.log(`🔍 [getPharmacyMedicaments] Image trouvée pour ${med.nom}:`, image ? JSON.stringify(image.images) : 'Aucune');
        return {
          ...med,
          image: image && image.images.length > 0 ? image.images[0] : null,
          images: image && image.images ? image.images : [],
        };
      })
    );

    console.log(`🔍 [getPharmacyMedicaments] Médicaments avec images: ${medicamentsWithImages.length}`);

    res.json({
      success: true,
      data: { medicaments: medicamentsWithImages },
    });
  } catch (error) {
    console.error(`❌ [getPharmacyMedicaments] Erreur pour ${pharmacyId}:`, error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
}
async function uploadMedicamentImageHandler(req, res) {
  try {
    uploadDrugImages(req, res, async (err) => {
      if (err) {
        console.error('❌ [multer] Erreur upload:', err.message);
        return res.status(400).json({ success: false, message: err.message });
      }
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ success: false, message: 'Aucune image téléchargée' });
      }

      const { pharmacyId, medicamentId } = req.params;
      if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Accès non autorisé' });
      }

      const pharmacie = await User.findById(pharmacyId);
      if (!pharmacie || pharmacie.role !== 'pharmacie' || !pharmacie.pharmacieInfo.baseMedicament) {
        return res.status(404).json({ success: false, message: 'Pharmacie ou base de données non trouvée' });
      }

      const connection = mongoose.connection.useDb(pharmacie.pharmacieInfo.baseMedicament);
      const MedicamentModel = connection.model('Medicament', Medicament.schema, 'medicaments');

      const medicament = await MedicamentModel.findOne({ _id: medicamentId, pharmacie: pharmacyId });
      if (!medicament) {
        return res.status(404).json({ success: false, message: 'Médicament non trouvé ou non associé à cette pharmacie' });
      }

      const imageData = req.files.map(file => ({
        nomFichier: file.filename,
        cheminFichier: `/Uploads/medicaments/${file.filename}`,
        typeFichier: file.mimetype,
        tailleFichier: file.size,
        dateUpload: new Date(),
      }));

      let drugImage = await DrugImageModel.findOne({ nom: medicament.nom.toLowerCase() });
      if (drugImage) {
        if (drugImage.images.length + req.files.length > 3) {
          return res.status(400).json({ 
            success: false, 
            message: `Ce médicament a déjà ${drugImage.images.length} image(s). Le total ne peut pas dépasser 3 images.` 
          });
        }
        drugImage.images = [...drugImage.images, ...imageData];
        await drugImage.save();
      } else {
        drugImage = new DrugImageModel({
          nom: medicament.nom.toLowerCase(),
          images: imageData,
        });
        await drugImage.save();
      }

      // Supprimer le champ image de Medicament
      medicament.image = undefined;
      await medicament.save();

      res.json({
        success: true,
        message: `${req.files.length} image(s) téléchargée(s) avec succès pour ${medicament.nom}`,
        data: imageData,
      });
    });
  } catch (error) {
    console.error('❌ Erreur upload image médicament:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
}
async function approvePharmacieRequest(req, res) {
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
      createdBy: demandeur._id,
      employesAutorises: [demandeur._id], // Ajouter le créateur comme employé autorisé
      demandesIntegration: [],
        heuresOuverture: {
          lundi: { ouvert: false, debut: '', fin: '' },
          mardi: { ouvert: false, debut: '', fin: '' },
          mercredi: { ouvert: false, debut: '', fin: '' },
          jeudi: { ouvert: false, debut: '', fin: '' },
          vendredi: { ouvert: false, debut: '', fin: '' },
          samedi: { ouvert: false, debut: '', fin: '' },
          dimanche: { ouvert: false, debut: '', fin: '' },
        },
        periodeGarde: { debut: null, fin: null },
      },
      isVerified: true,
      isActive: true,
      createdBy: demandeur._id,
    });

    const token = jwt.sign({ userId: pharmacie._id }, process.env.JWT_SECRET, { expiresIn: '2d' });
    pharmacie.verificationToken = token;

    await pharmacie.save();

    demandeur.demandePharmacie.statutDemande = 'approuvee';
    demandeur.demandePharmacie.dateApprobation = new Date();
    demandeur.demandePharmacie.commentaireApprobation = commentaire || 'Demande approuvée';
    demandeur.demandePharmacie.approuvePar = req.user._id;
    demandeur.pharmaciesAssociees = demandeur.pharmaciesAssociees || [];
    demandeur.pharmaciesAssociees.push({ pharmacyId: pharmacie._id, accessToken: '' });
    await demandeur.save();

    await sendPharmacyApprovalEmail(info.emailPharmacie, {
      nom: info.nomPharmacie,
      motDePasse: motDePasseGenere,
    });

    res.json({
      success: true,
      message: 'Pharmacie approuvée et compte créé avec succès',
      data: { pharmacie: pharmacie.toJSON() },
    });
  } catch (error) {
    console.error('❌ Erreur approbation pharmacie:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
}

async function rejectPharmacieRequest(req, res) {
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
      nomPharmacie: demandeur.demandePharmacie.informationsPharmacie?.nomPharmacie || 'Pharmacie',
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
}

async function approveModificationRequest(req, res) {
  try {
    const { userId } = req.params;
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
}

async function rejectModificationRequest(req, res) {
  try {
    const { userId } = req.params;
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
}

async function approveSuppressionRequest(req, res) {
  try {
    const { userId } = req.params;
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
}

async function rejectSuppressionRequest(req, res) {
  try {
    const { userId } = req.params;
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
}

async function updatePharmacyRequestStatus(req, res) {
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
      body: { commentaire },
    };

    if (statut === 'approuvee') {
      return await approvePharmacieRequest(tempReq, res);
    } else {
      return await rejectPharmacieRequest(tempReq, res);
    }
  } catch (error) {
    console.error('❌ Erreur mise à jour statut:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
}

async function getPharmacieRequestDetails(req, res) {
  try {
    const { pharmacyId } = req.params;

    const pharmacie = await User.findById(pharmacyId)
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
}

async function updatePharmacieDocuments(req, res) {
  try {
    const { pharmacyId } = req.params;
    const { documentId, statutVerification, commentaireAdmin } = req.body;

    const pharmacie = await User.findById(pharmacyId);

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

    res.json({
      success: true,
      message: 'Document mis à jour avec succès',
      data: { document },
    });
  } catch (error) {
    console.error('❌ Erreur mise à jour document:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
}

// Remplacez la fonction getAdminDashboard par cette version corrigée :
const getAdminDashboard = async (req, res) => {
  try {
    console.log('🟢 [getAdminDashboard] Début récupération tableau de bord');

    // Récupération directe des statistiques depuis la base de données
    const [
      totalUsers,
      totalPharmacies,
      totalClients,
      totalAdmins,
      pharmaciesApprouvees,
      pharmaciesEnAttente,
      pharmaciesRejetees,
      activeUsers,
      activiteRecente,
      pharmaciesParStatut,
      userStats,
      evolutionInscriptions
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'pharmacie' }),
      User.countDocuments({ role: 'client' }),
      User.countDocuments({ role: 'admin' }),
      User.countDocuments({ role: 'pharmacie', 'pharmacieInfo.statutDemande': 'approuvee' }),
      User.countDocuments({ role: 'pharmacie', 'pharmacieInfo.statutDemande': 'en_attente' }),
      User.countDocuments({ role: 'pharmacie', 'pharmacieInfo.statutDemande': 'rejetee' }),
      User.countDocuments({ isActive: true }),
      User.find({})
        .select('nom prenom email role createdAt pharmacieInfo.nomPharmacie')
        .sort({ createdAt: -1 })
        .limit(10),
      User.aggregate([
        { $match: { role: 'pharmacie' } },
        {
          $group: {
            _id: '$pharmacieInfo.statutDemande',
            count: { $sum: 1 }
          }
        }
      ]),
      User.aggregate([
        {
          $group: {
            _id: '$role',
            count: { $sum: 1 }
          }
        }
      ]),
      User.aggregate([
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': -1, '_id.month': -1 } },
        { $limit: 12 }
      ])
    ]);

    // Utilisateurs récents (7 derniers jours)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentUsers = await User.countDocuments({
      createdAt: { $gte: sevenDaysAgo }
    });

    // Statistiques des commandes (si le modèle Commande existe)
    let commandeStats = {
      totalCommandes: 0,
      commandesEnAttente: 0,
      commandesEnCours: 0,
      commandesLivrees: 0,
      commandesAnnulees: 0,
      evolutionCommandes: [],
      commandesParPharmacie: []
    };

    try {
      const Commande = require('../models/Commande');
      const [
        totalCommandes,
        commandesEnAttente,
        commandesEnCours,
        commandesLivrees,
        commandesAnnulees,
        evolutionCommandes,
        commandesParPharmacie
      ] = await Promise.all([
        Commande.countDocuments(),
        Commande.countDocuments({ statut: 'en_attente' }),
        Commande.countDocuments({ statut: 'en_cours' }),
        Commande.countDocuments({ statut: 'terminée' }),
        Commande.countDocuments({ statut: 'annulée' }),
        Commande.aggregate([
          {
            $group: {
              _id: {
                year: { $year: '$dateCommande' },
                month: { $month: '$dateCommande' }
              },
              count: { $sum: 1 },
              total: { $sum: '$total' }
            }
          },
          { $sort: { '_id.year': -1, '_id.month': -1 } },
          { $limit: 12 }
        ]),
        Commande.aggregate([
          {
            $group: {
              _id: '$pharmacyId',
              count: { $sum: 1 },
              total: { $sum: '$total' }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 10 },
          {
            $lookup: {
              from: 'users',
              localField: '_id',
              foreignField: '_id',
              as: 'pharmacie'
            }
          },
          { $unwind: '$pharmacie' },
          {
            $project: {
              pharmacieNom: '$pharmacie.pharmacieInfo.nomPharmacie',
              count: 1,
              total: 1
            }
          }
        ])
      ]);

      commandeStats = {
        totalCommandes,
        commandesEnAttente,
        commandesEnCours,
        commandesLivrees,
        commandesAnnulees,
        evolutionCommandes,
        commandesParPharmacie
      };
    } catch (commandeError) {
      console.warn('⚠️ [getAdminDashboard] Modèle Commande non disponible:', commandeError.message);
    }

    // Génération des alertes
    const alertes = [];
    if (pharmaciesEnAttente > 0) {
      alertes.push({
        type: 'warning',
        message: `${pharmaciesEnAttente} demande(s) de pharmacie en attente d'approbation`,
        link: '/admin/pharmacy-requests',
        action: 'Voir les demandes',
      });
    }
    if (recentUsers > 50) {
      alertes.push({
        type: 'info',
        message: `${recentUsers} nouvelles inscriptions cette semaine`,
        link: '/admin/users',
        action: 'Voir les utilisateurs',
      });
    }
    if (commandeStats.commandesEnAttente > 0) {
      alertes.push({
        type: 'warning',
        message: `${commandeStats.commandesEnAttente} commande(s) en attente de traitement`,
        link: '/admin/commandes',
        action: 'Voir les commandes',
      });
    }
    if (commandeStats.commandesEnCours > 0) {
      alertes.push({
        type: 'warning',
        message: `${commandeStats.commandesEnCours} commande(s) en cours de traitement`,
        link: '/admin/commandes',
        action: 'Voir les commandes',
      });
    }

    console.log('🟢 [getAdminDashboard] Données récupérées avec succès');

    res.json({
      success: true,
      data: {
        resume: {
          totalUsers,
          totalPharmacies,
          totalClients,
          totalAdmins,
          demandesEnAttente: pharmaciesEnAttente,
          utilisateursActifsAujourdhui: activeUsers,
          nouvellesInscriptions: recentUsers,
          totalCommandes: commandeStats.totalCommandes,
          commandesEnAttente: commandeStats.commandesEnAttente,
          commandesEnCours: commandeStats.commandesEnCours,
          commandesLivrees: commandeStats.commandesLivrees,
          commandesAnnulees: commandeStats.commandesAnnulees,
        },
        pharmaciesParStatut,
        activiteRecente,
        alertes,
        evolutionInscriptions,
        evolutionCommandes: commandeStats.evolutionCommandes,
        commandesParPharmacie: commandeStats.commandesParPharmacie,
        userStats
      },
    });

    console.log('🟢 [getAdminDashboard] Réponse envoyée');
  } catch (error) {
    console.error('❌ [getAdminDashboard] Erreur détaillée:', error.message, error.stack);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération du tableau de bord',
      error: error.message,
    });
  }
};

async function associerBaseMedicament(req, res) {
  const { pharmacyId } = req.params;
  const { nomBaseMedicament } = req.body;

  if (!pharmacyId || !nomBaseMedicament) {
    return res.status(400).json({
      success: false,
      message: 'pharmacyId et nomBaseMedicament sont requis.',
    });
  }

  const validDatabases = ['pharmacie_alpha', 'pharmacie_beta', 'pharmacie_nova', 'pharmacie_omega', 'pharmacie_test','pharmacie_first'];
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
        base: user.pharmacieInfo.baseMedicament,
      },
    });
  } catch (error) {
    console.error('❌ Erreur liaison base:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
}

async function disconnectDatabase(req, res) {
  const { pharmacyId } = req.params;

  if (!pharmacyId) {
    console.log('❌ [disconnectDatabase] pharmacyId manquant');
    return res.status(400).json({
      success: false,
      message: 'pharmacyId est requis.',
    });
  }

  try {
    const user = await User.findById(pharmacyId);
    if (!user || user.role !== 'pharmacie') {
      console.log(`❌ [disconnectDatabase] Pharmacie ${pharmacyId} non trouvée ou rôle invalide`);
      return res.status(404).json({ success: false, message: 'Pharmacie non trouvée.' });
    }

    if (!user.pharmacieInfo.baseMedicament) {
      console.log(`❌ [disconnectDatabase] Aucune base de données associée à la pharmacie ${pharmacyId}`);
      return res.status(400).json({ success: false, message: 'Aucune base de données associée à cette pharmacie.' });
    }

    user.pharmacieInfo.baseMedicament = null;
    await user.save();

    console.log(`✅ [disconnectDatabase] Base de données déconnectée pour la pharmacie ${pharmacyId}`);
    return res.status(200).json({
      success: true,
      message: 'Base de données déconnectée avec succès',
      pharmacie: {
        id: user._id,
        nom: user.nom,
        base: null,
      },
    });
  } catch (error) {
    console.error('❌ [disconnectDatabase] Erreur:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
}

async function getApprovedPharmacies(req, res) {
  try {
    const { page = 1, limit = 10, search, livraisonDisponible, estDeGarde } = req.query;

    const filter = {
      role: 'pharmacie',
      'pharmacieInfo.statutDemande': 'approuvee',
      isActive: true,
    };

    if (search) {
      filter.$or = [
        { 'pharmacieInfo.nomPharmacie': { $regex: search, $options: 'i' } },
        { nom: { $regex: search, $options: 'i' } },
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
          limit: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error('❌ Erreur récupération pharmacies approuvées:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
}

async function uploadDrugImageHandler(req, res) {
  try {
    console.log('🔍 [uploadDrugImage] Début traitement');
    console.log('🔍 [uploadDrugImage] req.body:', req.body);
    console.log('🔍 [uploadDrugImage] req.files:', req.files);
    console.log('🔍 [uploadDrugImage] req.file:', req.file);

    const { nom } = req.body;
    
    if (!nom) {
      console.log('❌ [uploadDrugImage] Nom du médicament manquant');
      return res.status(400).json({ 
        success: false, 
        message: 'Nom du médicament requis' 
      });
    }

    if (!req.files || req.files.length === 0) {
      console.log('❌ [uploadDrugImage] Aucune image fournie');
      return res.status(400).json({ 
        success: false, 
        message: 'Au moins une image est requise' 
      });
    }

    console.log(`✅ [uploadDrugImage] Traitement pour médicament: ${nom}`);
    console.log(`✅ [uploadDrugImage] Nombre d'images: ${req.files.length}`);

    if (req.files.length > 3) {
      return res.status(400).json({ 
        success: false, 
        message: 'Un maximum de 3 images est autorisé par médicament' 
      });
    }

    const DrugImageModel = mongoose.connection.useDb('pharmacies').model('DrugImage', require('../models/DrugImage').schema);

    const imageData = req.files.map(file => ({
      nomFichier: file.filename,
      cheminFichier: `/Uploads/medicaments/${file.filename}`,
      typeFichier: file.mimetype,
      tailleFichier: file.size,
      dateUpload: new Date()
    }));

    console.log('🔍 [uploadDrugImage] Images à sauvegarder:', imageData);

    const nomRecherche = nom.trim().toLowerCase();
    
    let drugImage = await DrugImageModel.findOne({ nom: nomRecherche });
    
    if (drugImage) {
      if (drugImage.images.length + req.files.length > 3) {
        return res.status(400).json({ 
          success: false, 
          message: `Ce médicament a déjà ${drugImage.images.length} image(s). Le total ne peut pas dépasser 3 images.` 
        });
      }
      
      drugImage.images = [...drugImage.images, ...imageData];
      await drugImage.save();
      
      console.log(`✅ [uploadDrugImage] Images ajoutées au médicament existant: ${nom}`);
    } else {
      drugImage = new DrugImageModel({
        nom: nomRecherche,
        images: imageData
      });
      await drugImage.save();
      
      console.log(`✅ [uploadDrugImage] Nouveau médicament créé avec images: ${nom}`);
    }

    res.status(201).json({
      success: true,
      message: `${req.files.length} image(s) téléchargée(s) avec succès pour ${nom}`,
      data: drugImage.images
    });
  } catch (error) {
    console.error('❌ [uploadDrugImage] Erreur:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur serveur lors du téléchargement des images' 
    });
  }
}

async function getAllMedicaments(req, res) {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    }

    const { page = 1, limit = 100, search = '' } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const pharmacies = await User.find({
      role: 'pharmacie',
      isActive: true,
      'pharmacieInfo.baseMedicament': { $exists: true, $ne: null }
    }).lean();

    if (!pharmacies.length) {
      return res.status(200).json({
        success: true,
        data: { pharmacies: [], totalPages: 0, currentPage: pageNum, totalMedicaments: 0 }
      });
    }

    const query = search
      ? {
          $or: [
            { nom: { $regex: search, $options: 'i' } },
            { nom_generique: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { categorie: { $regex: search, $options: 'i' } }
          ]
        }
      : {};

    let totalGlobalMedicaments = 0;
    const pharmacyResults = await Promise.all(
      pharmacies.map(async (pharmacy) => {
        const pharmacyName = pharmacy.pharmacieInfo.nomPharmacie;
        const pharmacyBase = pharmacy.pharmacieInfo.baseMedicament;

        try {
          const connection = mongoose.connection.useDb(pharmacyBase);
          const MedicamentModel = connection.model('Medicament', Medicament.schema, 'medicaments');

          const medicaments = await MedicamentModel.find(query).limit(limitNum).skip(skip).lean();
          for (const medicament of medicaments) {
            const images = await DrugImage.find({
              nom: { $in: [medicament.nom.toLowerCase(), medicament.nom_generique?.toLowerCase()] }
            }).lean();
            medicament.images = images.length ? images[0].images : [];
          }

          const totalMedicaments = await MedicamentModel.countDocuments(query);
          totalGlobalMedicaments += totalMedicaments;

          return {
            pharmacie: { id: pharmacy._id, nom: pharmacyName, base: pharmacyBase },
            medicaments,
            totalMedicaments
          };
        } catch (error) {
          console.error(`❌ Erreur pour pharmacie ${pharmacyName}:`, error);
          return {
            pharmacie: { id: pharmacy._id, nom: pharmacyName, base: pharmacyBase },
            medicaments: [],
            totalMedicaments: 0
          };
        }
      })
    );

    const totalPages = Math.ceil(totalGlobalMedicaments / limitNum);

    res.status(200).json({
      success: true,
      data: {
        pharmacies: pharmacyResults,
        totalPages,
        currentPage: pageNum,
        totalMedicaments: totalGlobalMedicaments
      }
    });
  } catch (error) {
    console.error('❌ Erreur récupération tous médicaments:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
}

async function searchMedicaments(req, res) {
  try {
    const { nom } = req.query;
    console.log(`🔍 [searchMedicaments] Recherche pour nom: ${nom || 'aucun'}`);

    const pharmacies = await User.find({ role: 'pharmacie' })
      .select('pharmacieInfo.baseMedicament pharmacieInfo.nomPharmacie')
      .lean();

    const result = await Promise.all(
      pharmacies.map(async (pharma) => {
        if (!pharma.pharmacieInfo?.baseMedicament) {
          return null;
        }
        const connection = mongoose.connection.useDb(pharma.pharmacieInfo.baseMedicament);
        const MedicamentModel = connection.model('Medicament', Medicament.schema, 'medicaments');

        const query = {};
        if (nom) {
          query.$or = [
            { nom: { $regex: nom, $options: 'i' } },
            { nom_generique: { $regex: nom, $options: 'i' } }
          ];
        }

        const medicaments = await MedicamentModel.find(query)
          .select('nom nom_generique description prix quantite_stock est_sur_ordonnance categorie forme date_peremption dosage code_barre')
          .lean();

        const normalizeDrugName = (name) => {
          if (!name) return null;
          const normalized = name.toLowerCase().replace(/\s*\d+\s*(mg|ui|mcg|%)?/gi, '').replace(/\s+/g, ' ').trim();
          return normalized;
        };

        const medicamentsWithImages = await Promise.all(
          medicaments.map(async (med) => {
            const normalizedName = normalizeDrugName(med.nom);
            const normalizedGenericName = normalizeDrugName(med.nom_generique);
            const image = await DrugImageModel.findOne({
              nom: { $in: [normalizedName, normalizedGenericName].filter(Boolean) },
            }).lean();
            return {
              ...med,
              images: image && image.images ? image.images : [],
            };
          })
        );

        return {
          pharmacyId: pharma._id,
          nomPharmacie: pharma.pharmacieInfo.nomPharmacie,
          medicaments: medicamentsWithImages,
        };
      })
    );

    const filteredResult = result.filter((r) => r !== null);
    console.log(`🔍 [searchMedicaments] Résultat: ${filteredResult.length} pharmacies trouvées`);

    res.json({
      success: true,
      data: { pharmacies: filteredResult },
    });
  } catch (error) {
    console.error('❌ [searchMedicaments] Erreur:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
}
/**
 * Activer/Désactiver un compte utilisateur
 */
const toggleUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;

    // Find the user by ID
    const user = await User.findById(userId);
    if (!user) {
      console.log(`❌ [toggleUserStatus] Utilisateur ${userId} non trouvé`);
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé',
      });
    }

    // Prevent disabling own account
    if (user._id.toString() === req.user._id.toString()) {
      console.log(`❌ [toggleUserStatus] Tentative de désactivation du propre compte par ${req.user._id}`);
      return res.status(400).json({
        success: false,
        message: 'Vous ne pouvez pas désactiver votre propre compte',
      });
    }

    // Toggle the isActive field
    user.isActive = !user.isActive;
    await user.save();

    console.log(`✅ [toggleUserStatus] Statut utilisateur ${userId} mis à jour: isActive=${user.isActive}`);
    res.json({
      success: true,
      message: `Compte ${user.isActive ? 'activé' : 'désactivé'} avec succès`,
      data: {
        userId: user._id,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    console.error('❌ [toggleUserStatus] Erreur:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message,
    });
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
  updatePharmacyRequestStatus,
  updatePharmacieDocuments,
  getAdminDashboard,
  getApprovedPharmacies,
  associerBaseMedicament,
  disconnectDatabase,
  uploadMedicamentImage: uploadMedicamentImageHandler,
  handlePharmacyRequest,
  getPharmacyMedicaments,
  uploadDrugImageHandler,
  getAllMedicaments,
  searchMedicaments,
  toggleUserStatus, // Add this line
};