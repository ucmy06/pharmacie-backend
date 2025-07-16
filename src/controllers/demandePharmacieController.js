// src/controllers/demandePharmacieController.js

const { User } = require('../models/User');
const path = require('path');
const multer = require('multer');
const { sendPharmacyRequestNotification } = require('../utils/emailUtils');
const { verifyToken, extractTokenFromHeader } = require('../utils/tokenUtils');
const { authenticate } = require('../middlewares/auth');

// Configuration de stockage des fichiers de vérification
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/documents/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers images ou PDF sont autorisés'));
    }
  }
});

// Middleware exporté
const uploadDocuments = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers images ou PDF sont autorisés'));
    }
  }
}).fields([
  { name: 'photoPharmacie', maxCount: 1 },
  { name: 'documentsVerification', maxCount: 5 }
]);

// POST /api/demandes-pharmacie
const creerDemandePharmacie = async (req, res) => {
  try {
      console.log("🟢 Fichiers reçus :", req.files);
    console.log("🟢 Données reçues :", req.body);
    console.log("🟢 Utilisateur :", req.user);


    const user = await User.findById(req.user._id);

    // if (user.demandePharmacie && user.demandePharmacie.statutDemande !== 'aucune') {
    //   return res.status(400).json({
    //     success: false,
    //     message: 'Une demande est déjà en cours ou traitée.'
    //   });
    // }

    
     const {
      nomPharmacie,
      adresseGoogleMaps,
      emailPharmacie,
      telephonePharmacie
    } = req.body;

    const documentsVerification = req.files['documentsVerification'] || [];
    const photoPharmacieFile = req.files['photoPharmacie']?.[0] || null;

    if (!nomPharmacie || !adresseGoogleMaps || !emailPharmacie || !telephonePharmacie || documentsVerification.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Tous les champs requis doivent être remplis.'
      });
    }

    const docs = documentsVerification.map(file => ({
      nomFichier: file.originalname,
      cheminFichier: file.path,
      typeFichier: file.mimetype,
      tailleFichier: file.size,
      dateUpload: new Date()
    }));

const photoPharmacie = photoPharmacieFile
  ? {
      nomFichier: photoPharmacieFile.originalname,
      cheminFichier: photoPharmacieFile.path.replace(/\\/g, '/'),
      typeFichier: photoPharmacieFile.mimetype,
      tailleFichier: photoPharmacieFile.size,
      dateUpload: new Date()
    }
  : null;

    user.demandePharmacie = {
        statutDemande: 'en_attente',
        dateDemande: new Date(),
        createdBy: user._id, // ✅ C'est ici la correction importante

      informationsPharmacie: {
        nomPharmacie,
        adresseGoogleMaps,
        emailPharmacie,
        telephonePharmacie,
        photoPharmacie,
        documentsVerification: docs
      }
    };

    await user.save();

    // ✉️ Envoi de notification à l’administrateur
    await sendPharmacyRequestNotification({
      nomPharmacie,
      adresseGoogleMaps,
      nom: user.nom,
      prenom: user.prenom,
      email: user.email,
      telephone: user.telephone,
      livraisonDisponible: false
    });

    return res.status(201).json({
      success: true,
      message: 'Demande de création de pharmacie envoyée avec succès',
      data: {
        statutDemande: user.demandePharmacie.statutDemande,
        dateDemande: user.demandePharmacie.dateDemande
      }
    });

  } catch (error) {
    console.error('❌ Erreur demande pharmacie:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la demande',
      error: error.message
    });
  }
};

// GET /api/demandes-pharmacie/me
const getMaDemandePharmacie = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user || !user.demandePharmacie || user.demandePharmacie.statutDemande === 'aucune') {
      return res.status(404).json({
        success: false,
        message: 'Aucune demande trouvée.'
      });
    }

    res.json({
      success: true,
      data: user.demandePharmacie
    });

  } catch (error) {
    console.error('❌ Erreur récupération demande pharmacie :', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

module.exports = {
  creerDemandePharmacie,
  getMaDemandePharmacie,
  uploadDocuments
};
