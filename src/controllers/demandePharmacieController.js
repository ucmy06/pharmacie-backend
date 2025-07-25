const { User } = require('../models/User');
const path = require('path');
const { sendPharmacyRequestNotification } = require('../utils/emailUtils');
const { verifyToken, extractTokenFromHeader } = require('../utils/tokenUtils');
const { uploadDemandePharmacie } = require('../middlewares/multerConfig');

const creerDemandePharmacie = async (req, res) => {
  try {
    console.log('🟢 Fichiers reçus :', {
      photoPharmacie: req.files?.photoPharmacie?.[0],
      documentsVerification: req.files?.documentsVerification,
    });
    console.log('🟢 Données reçues :', req.body);
    console.log('🟢 Utilisateur :', req.user);

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    const { nomPharmacie, adresseGoogleMaps, emailPharmacie, telephonePharmacie } = req.body;
    const documentsVerification = req.files['documentsVerification'] || [];
    const photoPharmacieFile = req.files['photoPharmacie']?.[0] || null;

    if (
      !nomPharmacie ||
      !adresseGoogleMaps ||
      !emailPharmacie ||
      !telephonePharmacie ||
      documentsVerification.length === 0 ||
      !photoPharmacieFile
    ) {
      return res.status(400).json({
        success: false,
        message: 'Tous les champs requis doivent être remplis, y compris la photo de la pharmacie.',
      });
    }

    const docs = documentsVerification.map((file) => ({
      nomFichier: file.originalname,
      cheminFichier: `Uploads/documents/${file.filename}`,
      typeFichier: file.mimetype,
      tailleFichier: file.size,
      dateUpload: new Date(),
    }));

    const photoPharmacie = {
      nomFichier: photoPharmacieFile.originalname,
      cheminFichier: `Uploads/pharmacies/${photoPharmacieFile.filename}`,
      typeFichier: photoPharmacieFile.mimetype,
      tailleFichier: photoPharmacieFile.size,
      dateUpload: new Date(),
    };

    console.log('📁 Chemins enregistrés :', {
      photoPharmacie: photoPharmacie.cheminFichier,
      documentsVerification: docs.map((d) => d.cheminFichier),
    });

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

    console.log('✅ Demande enregistrée:', user.demandePharmacie);

    await sendPharmacyRequestNotification({
      nomPharmacie,
      adresseGoogleMaps,
      nom: user.nom,
      prenom: user.prenom,
      email: user.email,
      telephone: user.telephone,
      livraisonDisponible: false,
    });

    return res.status(201).json({
      success: true,
      message: 'Demande de création de pharmacie envoyée avec succès',
      data: {
        statutDemande: user.demandePharmacie.statutDemande,
        dateDemande: user.demandePharmacie.dateDemande,
      },
    });
  } catch (error) {
    console.error('❌ Erreur demande pharmacie:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la demande',
      error: error.message,
    });
  }
};

const getMaDemandePharmacie = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user || !user.demandePharmacie || user.demandePharmacie.statutDemande === 'aucune') {
      return res.status(404).json({
        success: false,
        message: 'Aucune demande trouvée.',
      });
    }

    res.json({
      success: true,
      data: user.demandePharmacie,
    });
  } catch (error) {
    console.error('❌ Erreur récupération demande pharmacie :', error);
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