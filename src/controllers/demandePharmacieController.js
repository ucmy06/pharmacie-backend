// C:\reactjs node mongodb\pharmacie-backend\src\controllers\demandePharmacieController.js
const { User } = require('../models/User');
const path = require('path');
const fs = require('fs');
const { sendPharmacyRequestNotification } = require('../utils/emailUtils');
const { uploadDemandePharmacie } = require('../middlewares/multerConfig');

const creerDemandePharmacie = async (req, res) => {
  try {
    console.log('🟢 [creerDemandePharmacie] Début traitement pour utilisateur:', req.user.email);
    console.log('📥 [creerDemandePharmacie] Données reçues:', req.body);
    console.log('📂 [creerDemandePharmacie] Fichiers reçus:', {
      photoPharmacie: req.files?.photoPharmacie?.[0]?.originalname,
      documentsVerification: req.files?.documentsVerification?.map(f => f.originalname),
    });

    const user = await User.findById(req.user._id);
    if (!user) {
      console.error('❌ [creerDemandePharmacie] Utilisateur non trouvé:', req.user._id);
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    const { nomPharmacie, adresseGoogleMaps, emailPharmacie, telephonePharmacie } = req.body;
    const documentsVerification = req.files['documentsVerification'] || [];
    const photoPharmacieFile = req.files['photoPharmacie']?.[0] || null;

    console.log('📋 [creerDemandePharmacie] Vérification des champs:', {
      nomPharmacie,
      adresseGoogleMaps,
      emailPharmacie,
      telephonePharmacie,
      hasPhoto: !!photoPharmacieFile,
      documentsCount: documentsVerification.length,
    });

    if (
      !nomPharmacie ||
      !adresseGoogleMaps ||
      !emailPharmacie ||
      !telephonePharmacie ||
      documentsVerification.length === 0 ||
      !photoPharmacieFile
    ) {
      console.error('❌ [creerDemandePharmacie] Champs manquants détectés');
      return res.status(400).json({
        success: false,
        message: 'Tous les champs requis doivent être remplis, y compris la photo et les documents.',
      });
    }

    const docs = documentsVerification.map((file) => {
      const filePath = path.join('Uploads', 'documents', file.filename).replace(/\\/g, '/');
      console.log('📄 [creerDemandePharmacie] Document traité:', filePath);
      return {
        nomFichier: file.originalname,
        cheminFichier: filePath,
        typeFichier: file.mimetype,
        tailleFichier: file.size,
        dateUpload: new Date(),
      };
    });

    const photoPath = path.join('Uploads', 'pharmacies', photoPharmacieFile.filename).replace(/\\/g, '/');
    console.log('📸 [creerDemandePharmacie] Photo traitée:', photoPath);
    const photoPharmacie = {
      nomFichier: photoPharmacieFile.originalname,
      cheminFichier: photoPath,
      typeFichier: photoPharmacieFile.mimetype,
      tailleFichier: photoPharmacieFile.size,
      dateUpload: new Date(),
    };

    user.demandePharmacie = {
      statutDemande: 'en_attente',
      dateDemande: new Date(),
      createdBy: user._id,
      informationsPharmacie: {
        nomPharmacie,
        adresseGoogleMaps,
        emailPharmacie,
        telephonePharmacie,
        photoPharmacie,
        documentsVerification: docs,
      },
    };

    await user.save();
    console.log('✅ [creerDemandePharmacie] Demande enregistrée:', {
      statutDemande: user.demandePharmacie.statutDemande,
      nomPharmacie: user.demandePharmacie.informationsPharmacie.nomPharmacie,
    });

    try {
      await sendPharmacyRequestNotification({
        nomPharmacie,
        adresseGoogleMaps,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        telephone: user.telephone,
        livraisonDisponible: false,
      });
      console.log('📧 [creerDemandePharmacie] Notification email envoyée pour:', nomPharmacie);
    } catch (emailError) {
      console.error('⚠️ [creerDemandePharmacie] Erreur envoi email:', emailError);
    }

    return res.status(201).json({
      success: true,
      message: 'Demande de création de pharmacie envoyée avec succès',
      data: {
        statutDemande: user.demandePharmacie.statutDemande,
        dateDemande: user.demandePharmacie.dateDemande,
      },
    });
  } catch (error) {
    console.error('❌ [creerDemandePharmacie] Erreur:', error.message, error.stack);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la demande',
      error: error.message,
    });
  }
};

const getMaDemandePharmacie = async (req, res) => {
  try {
    console.log('🟢 [getMaDemandePharmacie] Récupération pour utilisateur:', req.user.email);
    const user = await User.findById(req.user._id);

    if (!user || !user.demandePharmacie || user.demandePharmacie.statutDemande === 'aucune') {
      console.log('❌ [getMaDemandePharmacie] Aucune demande trouvée pour:', req.user._id);
      return res.status(404).json({
        success: false,
        message: 'Aucune demande trouvée.',
      });
    }

    console.log('✅ [getMaDemandePharmacie] Demande récupérée:', {
      statutDemande: user.demandePharmacie.statutDemande,
      nomPharmacie: user.demandePharmacie.informationsPharmacie.nomPharmacie,
    });
    res.json({
      success: true,
      data: user.demandePharmacie,
    });
  } catch (error) {
    console.error('❌ [getMaDemandePharmacie] Erreur:', error.message, error.stack);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

module.exports = {
  creerDemandePharmacie,
  getMaDemandePharmacie,
  uploadDemandePharmacie,
};

// Vérifier si une demande existe déjà (décommenter si nécessaire)
    // if (user.demandePharmacie && user.demandePharmacie.statutDemande !== 'aucune') {
    //   return res.status(400).json({
    //     success: false,
    //     message: 'Une demande est déjà en cours ou traitée.'
    //   });
    // }