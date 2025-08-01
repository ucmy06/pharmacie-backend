// C:\reactjs node mongodb\pharmacie-backend\src\controllers\pharmacieController.js
const { User, ConnexionPharmacie } = require('../models/User');
const { 
  sendPharmacyAccessNotification, 
  sendSuppressionRequestEmail,
  sendPharmacyModificationRequestNotification 
} = require('../utils/emailUtils');
const { uploadPharmacyPhoto, uploadDocuments } = require('../middlewares/multerConfig');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { createDetailedLog } = require('../utils/logUtils');
const axios = require('axios');
const Commande = require('../models/Commande');

// Log MongoDB operations
const logMongoOperation = (operation, query, result = null, error = null) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    operation,
    query: JSON.parse(JSON.stringify(query)),
    result: result ? JSON.parse(JSON.stringify(result)) : null,
    error: error ? error.message : null,
    success: !error,
  };
  console.log('📊 MONGODB OPERATION:', JSON.stringify(logEntry, null, 2));
  return logEntry;
};

// Middleware pour upload de documents
exports.uploadDocuments = uploadDocuments;

// Middleware pour upload de photo
exports.uploadPharmacyPhoto = uploadPharmacyPhoto;

// Connexion pharmacie
// Connexion pharmacie
exports.loginPharmacie = async (req, res) => {
  try {
    const { email, motDePasse, clientConnecte } = req.body;

    createDetailedLog('CONNEXION_PHARMACIE_DEBUT', {
      email,
      motDePasse: motDePasse ? `[MASQUÉ - ${motDePasse.length} caractères]` : null,
      clientConnecte,
    });

    const mongoQuery = { email, role: 'pharmacie' };
    logMongoOperation('FIND_PHARMACIE', mongoQuery);

    const pharmacie = await User.findOne(mongoQuery).select('+motDePasse');

    if (!pharmacie) {
      logMongoOperation('FIND_PHARMACIE', mongoQuery, null, new Error('Pharmacie non trouvée'));
      createDetailedLog('CONNEXION_PHARMACIE_ECHEC', {
        raison: 'PHARMACIE_NON_TROUVEE',
        emailRecherche: email,
      });
      return res.status(400).json({ message: 'Email incorrect' });
    }

    if (!pharmacie.pharmacieInfo || pharmacie.pharmacieInfo.statutDemande !== 'approuvee') {
      createDetailedLog('CONNEXION_PHARMACIE_ECHEC', {
        raison: 'PHARMACIE_NON_APPROUVEE',
        statutActuel: pharmacie.pharmacieInfo?.statutDemande,
      });
      return res.status(400).json({ message: 'Pharmacie non approuvée' });
    }

    const isMatch = await pharmacie.comparePassword(motDePasse);
    createDetailedLog('RESULTAT_VERIFICATION_MOT_DE_PASSE', {
      motDePasseValide: isMatch,
      motDePasseTemporaire: pharmacie.motDePasseTemporaire,
    });

    if (!isMatch) {
      createDetailedLog('CONNEXION_PHARMACIE_ECHEC', {
        raison: 'MOT_DE_PASSE_INCORRECT',
        tentativeEmail: email,
      });
      return res.status(400).json({ message: 'Mot de passe incorrect' });
    }

    const tokenPayload = { id: pharmacie._id, role: 'pharmacie' };
    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE });

    if (clientConnecte) {
      if (!clientConnecte._id || !clientConnecte.nom || !clientConnecte.prenom || !clientConnecte.email || !clientConnecte.telephone) {
        createDetailedLog('CONNEXION_PHARMACIE_ECHEC', {
          raison: 'CLIENT_CONNECTE_INVALIDE',
          clientConnecte,
        });
        return res.status(400).json({ message: 'Données client connecté incomplètes' });
      }

      const connexionData = {
        utilisateurId: clientConnecte._id, // Corrigé : utiliser utilisateurId
        pharmacyId: pharmacie._id,        // Corrigé : utiliser pharmacyId
        dateConnexion: new Date(),
        informationsUtilisateur: {
          nom: clientConnecte.nom,
          prenom: clientConnecte.prenom,
          email: clientConnecte.email,
          telephone: clientConnecte.telephone,
          adresse: clientConnecte.adresse || null,
        },
        typeConnexion: 'consultation',
      };

      logMongoOperation('CREATE_CONNEXION_PHARMACIE', connexionData);

      const connexionSauvegardee = await ConnexionPharmacie.create(connexionData);

      await sendPharmacyAccessNotification(pharmacie.email, clientConnecte);
    }

    createDetailedLog('CONNEXION_PHARMACIE_REUSSIE', {
      pharmacyId: pharmacie._id,
      email: pharmacie.email,
    });

    res.json({
      token,
      doitChangerMotDePasse: pharmacie.motDePasseTemporaire || false,
      pharmacie: {
        _id: pharmacie._id,
        nom: pharmacie.nom,
        prenom: pharmacie.prenom,
        email: pharmacie.email,
        role: pharmacie.role,
        pharmacieInfo: pharmacie.pharmacieInfo,
      },
    });
  } catch (error) {
    console.error('❌ Erreur loginPharmacie:', error);
    createDetailedLog('ERREUR_CONNEXION_PHARMACIE', {
      erreur: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Changer mot de passe initial
exports.changerMotDePasseInitial = async (req, res) => {
  try {
    const { nouveauMotDePasse } = req.body;
    const user = req.user;

    if (!user) {
      createDetailedLog('CHANGEMENT_MOT_DE_PASSE_ECHEC', {
        raison: 'UTILISATEUR_NON_AUTHENTIFIE',
      });
      return res.status(401).json({ message: 'Utilisateur non authentifié' });
    }

    if (!nouveauMotDePasse || nouveauMotDePasse.length < 6) {
      createDetailedLog('CHANGEMENT_MOT_DE_PASSE_ECHEC', {
        raison: 'MOT_DE_PASSE_TROP_COURT',
        longueur: nouveauMotDePasse ? nouveauMotDePasse.length : 0,
      });
      return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 6 caractères.' });
    }

    user.motDePasse = nouveauMotDePasse;
    user.motDePasseTemporaire = false;

    await user.save();

    createDetailedLog('CHANGEMENT_MOT_DE_PASSE_REUSSI', {
      userId: user._id,
      userEmail: user.email,
    });

    res.json({ message: 'Mot de passe mis à jour avec succès.' });
  } catch (error) {
    console.error('❌ Erreur changerMotDePasseInitial:', error);
    createDetailedLog('ERREUR_CHANGEMENT_MOT_DE_PASSE', {
      erreur: error.message,
      stack: error.stack,
      userId: req.user?._id,
    });
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Changer mot de passe dans le profil (avec ancien mot de passe)
exports.updateProfilePassword = async (req, res) => {
  try {
    const { ancienMotDePasse, nouveauMotDePasse } = req.body;

    const user = await User.findById(req.user._id);
    if (!user || user.role !== 'pharmacie') {
      createDetailedLog('UPDATE_PROFILE_PASSWORD_ECHEC', {
        raison: 'ACCES_NON_AUTORISE',
        userId: req.user._id,
      });
      return res.status(403).json({ message: 'Accès non autorisé' });
    }

    const isMatch = await user.comparePassword(ancienMotDePasse);
    if (!isMatch) {
      createDetailedLog('UPDATE_PROFILE_PASSWORD_ECHEC', {
        raison: 'ANCIEN_MOT_DE_PASSE_INCORRECT',
        userId: user._id,
      });
      return res.status(400).json({ message: 'Ancien mot de passe incorrect' });
    }

    if (!nouveauMotDePasse || nouveauMotDePasse.length < 6) {
      createDetailedLog('UPDATE_PROFILE_PASSWORD_ECHEC', {
        raison: 'NOUVEAU_MOT_DE_PASSE_INVALIDE',
        longueur: nouveauMotDePasse?.length || 0,
      });
      return res.status(400).json({ message: 'Le nouveau mot de passe doit contenir au moins 6 caractères.' });
    }

    user.motDePasse = nouveauMotDePasse;
    user.motDePasseTemporaire = false;

    await user.save();

    createDetailedLog('UPDATE_PROFILE_PASSWORD_REUSSI', {
      userId: user._id,
      email: user.email,
    });

    res.json({ message: 'Mot de passe mis à jour avec succès' });
  } catch (error) {
    console.error('❌ Erreur updateProfilePassword:', error);
    createDetailedLog('ERREUR_UPDATE_PROFILE_PASSWORD', {
      erreur: error.message,
      stack: error.stack,
      userId: req.user?._id,
    });
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Demande de suppression de compte
exports.demanderSuppression = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user || user.role !== 'pharmacie') {
      createDetailedLog('DEMANDE_SUPPRESSION_ECHEC', {
        raison: 'ACCES_NON_AUTORISE',
        userId: req.user._id,
      });
      return res.status(403).json({ message: 'Accès non autorisé' });
    }

    if (user.demandeSuppression) {
      createDetailedLog('DEMANDE_SUPPRESSION_ECHEC', {
        raison: 'DEMANDE_DEJA_ENVOYEE',
        userId: user._id,
      });
      return res.status(400).json({ message: 'Demande déjà envoyée.' });
    }

    user.demandeSuppression = {
      statut: 'en_attente',
      dateDemande: new Date(),
    };
    await user.save();

    await sendSuppressionRequestEmail(user);

    createDetailedLog('DEMANDE_SUPPRESSION_REUSSIE', {
      userId: user._id,
      email: user.email,
    });

    res.json({ message: 'Demande de suppression envoyée à l’administrateur.' });
  } catch (error) {
    console.error('❌ Erreur demanderSuppression:', error);
    createDetailedLog('ERREUR_DEMANDE_SUPPRESSION', {
      erreur: error.message,
      stack: error.stack,
      userId: req.user?._id,
    });
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Demande de modification de profil
exports.demanderModification = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user || user.role !== 'pharmacie') {
      createDetailedLog('DEMANDE_MODIFICATION_ECHEC', {
        raison: 'ACCES_NON_AUTORISE',
        userId: req.user?._id,
      });
      return res.status(403).json({ message: 'Accès non autorisé' });
    }

    const { nom, email, numero, positionGoogleMaps } = req.body;
    if (!nom && !email && !numero && !positionGoogleMaps && !req.file) {
      createDetailedLog('DEMANDE_MODIFICATION_ECHEC', {
        raison: 'AUCUNE_DONNEE_FOURNIE',
        userId: user._id,
      });
      return res.status(400).json({ message: 'Aucune donnée à modifier fournie' });
    }

    if (req.file && (!req.file.mimetype.startsWith('image/') || req.file.size > 5 * 1024 * 1024)) {
      createDetailedLog('DEMANDE_MODIFICATION_ECHEC', {
        raison: 'FICHIER_INVALIDE',
        userId: user._id,
        mimetype: req.file.mimetype,
        size: req.file.size,
      });
      return res.status(400).json({ message: 'Le fichier doit être une image de moins de 5MB' });
    }

    const photo = req.file
      ? {
          nomFichier: req.file.originalname,
          cheminFichier: `Uploads/pharmacies/${req.file.filename}`,
          typeFichier: req.file.mimetype,
          tailleFichier: req.file.size,
          dateUpload: new Date(),
        }
      : null; // ✅ Ne pas réutiliser user.pharmacieInfo.photoPharmacie

    user.demandePharmacie = user.demandePharmacie || {};
    user.demandePharmacie.demandeModification = {
      nom: nom || user.nom,
      email: email || user.email,
      numero: numero || user.telephone,
      positionGoogleMaps: positionGoogleMaps || user.pharmacieInfo?.adresseGoogleMaps || '',
      photo: photo || null, // ✅ Utiliser null si aucune photo
      statut: 'en_attente',
      dateDemande: new Date(),
    };

    await user.save();

    await sendPharmacyModificationRequestNotification({
      nomPharmacie: user.pharmacieInfo.nomPharmacie,
      prenom: user.prenom,
      nom: user.nom,
      email: email || user.email,
      telephone: numero || user.telephone,
      adresseGoogleMaps: positionGoogleMaps || user.pharmacieInfo.adresseGoogleMaps,
      photo: photo || null,
    });

    createDetailedLog('DEMANDE_MODIFICATION_REUSSIE', {
      userId: user._id,
      email: user.email,
      demandeModification: user.demandePharmacie.demandeModification,
    });

    res.json({ message: 'Demande de modification envoyée avec succès' });
  } catch (error) {
    console.error('❌ Erreur demanderModification:', error);
    createDetailedLog('ERREUR_DEMANDE_MODIFICATION', {
      erreur: error.message,
      stack: error.stack,
      userId: req.user?._id,
    });
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Mise à jour du profil pharmacie
exports.updateProfilPharmacie = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user || user.role !== 'pharmacie') {
      createDetailedLog('UPDATE_PROFILE_ECHEC', {
        raison: 'ACCES_NON_AUTORISE',
        userId: req.user?._id,
      });
      return res.status(403).json({ message: 'Accès non autorisé' });
    }

    const { nomPharmacie, adresseGoogleMaps, telephone, emailPro, horaires, reseauxSociaux } = req.body;
    let photo = user.pharmacieInfo?.photoPharmacie;

    if (req.file) {
      if (photo && photo.cheminFichier) {
        const oldPhotoPath = path.join(__dirname, '../../', photo.cheminFichier);
        if (fs.existsSync(oldPhotoPath)) {
          fs.unlinkSync(oldPhotoPath);
        }
      }

      photo = {
        nomFichier: req.file.originalname,
        cheminFichier: `Uploads/pharmacies/${req.file.filename}`,
        typeFichier: req.file.mimetype,
        tailleFichier: req.file.size,
        dateUpload: new Date(),
      };
    }

    user.pharmacieInfo.nomPharmacie = nomPharmacie || user.pharmacieInfo.nomPharmacie;
    user.pharmacieInfo.adresseGoogleMaps = adresseGoogleMaps || user.pharmacieInfo.adresseGoogleMaps;
    user.telephone = telephone || user.telephone;
    user.email = emailPro || user.email;
    if (horaires) user.pharmacieInfo.heuresOuverture = horaires;
    if (reseauxSociaux) user.pharmacieInfo.reseauxSociaux = reseauxSociaux;
    if (photo) user.pharmacieInfo.photoPharmacie = photo;

    await user.save();

    createDetailedLog('UPDATE_PROFILE_REUSSI', {
      userId: user._id,
      email: user.email,
      pharmacieInfo: user.pharmacieInfo,
    });

    res.json({
      message: 'Profil mis à jour avec succès',
      data: {
        _id: user._id,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        telephone: user.telephone,
        pharmacieInfo: user.pharmacieInfo,
      },
    });
  } catch (error) {
    console.error('❌ Erreur updateProfilPharmacie:', error);
    createDetailedLog('ERREUR_UPDATE_PROFILE', {
      erreur: error.message,
      stack: error.stack,
      userId: req.user?._id,
    });
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Sauvegarder les documents de vérification
exports.saveDocuments = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      createDetailedLog('SAVE_DOCUMENTS_ECHEC', {
        raison: 'AUCUN_FICHIER_FOURNI',
        userId: req.user._id,
      });
      return res.status(400).json({
        success: false,
        message: 'Aucun fichier fourni',
      });
    }

    const pharmacie = await User.findById(req.user._id);
    if (!pharmacie || pharmacie.role !== 'pharmacie') {
      createDetailedLog('SAVE_DOCUMENTS_ECHEC', {
        raison: 'ACCES_NON_AUTORISE',
        userId: req.user._id,
      });
      return res.status(403).json({ message: 'Accès non autorisé' });
    }

    const documents = req.files.map(file => ({
      nomFichier: file.originalname,
      cheminFichier: `Uploads/documents/${file.filename}`,
      typeFichier: file.mimetype,
      tailleFichier: file.size,
      dateUpload: new Date(),
      statutVerification: 'en_attente',
    }));

    pharmacie.pharmacieInfo.documentsVerification.push(...documents);
    await pharmacie.save();

    createDetailedLog('SAVE_DOCUMENTS_REUSSI', {
      userId: pharmacie._id,
      documentsAjoutes: documents.length,
      totalDocuments: pharmacie.pharmacieInfo.documentsVerification.length,
    });

    res.json({
      success: true,
      message: 'Documents uploadés avec succès',
      data: {
        documentsAjoutes: documents.length,
        totalDocuments: pharmacie.pharmacieInfo.documentsVerification.length,
      },
    });
  } catch (error) {
    console.error('❌ Erreur saveDocuments:', error);
    createDetailedLog('ERREUR_SAVE_DOCUMENTS', {
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



const resolveGoogleMapsUrl = async (url) => {
  if (!url.includes('maps.app.goo.gl')) return url;

  try {
    const response = await axios.get(url, {
      maxRedirects: 0,
      validateStatus: (status) => status === 302 || status === 301,
    });

    const redirectUrl = response.headers.location;

    // Exemple : https://www.google.com/maps?q=6.1378,1.2125&...
    const match = redirectUrl.match(/q=([-.\d]+),([-.\d]+)/);
    if (match) {
      return `https://www.google.com/maps?q=${match[1]},${match[2]}`;
    }

    // Tentative secondaire (format embed parfois redirigé)
    const matchEmbed = redirectUrl.match(/!3d([-.\d]+)!4d([-.\d]+)/);
    if (matchEmbed) {
      return `https://www.google.com/maps?q=${matchEmbed[1]},${matchEmbed[2]}`;
    }

    return url; // si aucune coordonnée trouvée
  } catch (error) {
    console.error('❌ Erreur résolution URL:', error);
    return url;
  }
};

// Obtenir toutes les pharmacies actives avec filtres
exports.getPharmacies = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 100,
      search,
      ville,
      livraisonDisponible,
      estDeGarde,
      ouvertMaintenant,
    } = req.query;

    const filter = {
      role: 'pharmacie',
      'pharmacieInfo.statutDemande': 'approuvee',
      isActive: true,
    };

    if (search) {
      filter.$or = [
        { 'pharmacieInfo.nomPharmacie': { $regex: search, $options: 'i' } },
        { 'pharmacieInfo.adresseGoogleMaps': { $regex: search, $options: 'i' } },
      ];
    }

    if (ville) {
      filter['pharmacieInfo.adresseGoogleMaps'] = { $regex: ville, $options: 'i' };
    }

    if (livraisonDisponible === 'true') {
      filter['pharmacieInfo.livraisonDisponible'] = true;
    }

    if (estDeGarde === 'true') {
      filter['pharmacieInfo.estDeGarde'] = true;
    }

    if (ouvertMaintenant === 'true') {
      const now = new Date();
      const jour = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][now.getDay()];
      const heureActuelle = now.toTimeString().slice(0, 5);

      filter[`pharmacieInfo.heuresOuverture.${jour}.ouvert`] = true;
      filter[`pharmacieInfo.heuresOuverture.${jour}.debut`] = { $lte: heureActuelle };
      filter[`pharmacieInfo.heuresOuverture.${jour}.fin`] = { $gte: heureActuelle };
    }

    const skip = (page - 1) * limit;

    const pharmacies = await User.find(filter)
      .select('nom prenom pharmacieInfo createdAt')
      .sort({ 'pharmacieInfo.dateApprobation': -1 })
      .skip(skip)
      .limit(parseInt(limit));

    for (let pharmacy of pharmacies) {
      pharmacy.pharmacieInfo.adresseGoogleMaps = await resolveGoogleMapsUrl(pharmacy.pharmacieInfo.adresseGoogleMaps);
    }

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
    console.error('❌ Erreur récupération pharmacies:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
    });
  }
};

// Obtenir une pharmacie par ID
exports.getPharmacieById = async (req, res) => {
  try {
    const { pharmacyId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(pharmacyId)) {
      createDetailedLog('GET_PHARMACIE_BY_ID_ECHEC', {
        raison: 'ID_INVALIDE',
        pharmacyId,
      });
      return res.status(400).json({ message: 'ID de pharmacie invalide' });
    }

    const pharmacie = await User.findById(pharmacyId).select('-motDePasse');
    if (!pharmacie || pharmacie.role !== 'pharmacie') {
      createDetailedLog('GET_PHARMACIE_BY_ID_ECHEC', {
        raison: 'PHARMACIE_NON_TROUVEE',
        pharmacyId,
      });
      return res.status(404).json({ message: 'Pharmacie non trouvée' });
    }

    res.json({
      success: true,
      pharmacie: {
        _id: pharmacie._id,
        nom: pharmacie.nom,
        prenom: pharmacie.prenom,
        email: pharmacie.email,
        role: pharmacie.role,
        pharmacieInfo: pharmacie.pharmacieInfo,
      },
    });
  } catch (error) {
    console.error('❌ Erreur getPharmacieById:', error);
    createDetailedLog('ERREUR_GET_PHARMACIE_BY_ID', {
      erreur: error.message,
      stack: error.stack,
      pharmacyId: req.params.pharmacyId,
    });
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Connexion utilisateur à une pharmacie
// Connexion utilisateur à une pharmacie (enregistre la connexion et génère un nouveau token)
const connexionPharmacie = async (req, res) => {
  try {
    const { pharmacyId, typeConnexion, motDePasse } = req.body;

    // Vérifier que l'utilisateur est authentifié
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié',
      });
    }

    // Vérifier que la pharmacie existe et est approuvée
    const pharmacie = await User.findOne({
      _id: pharmacyId,
      role: 'pharmacie',
      'pharmacieInfo.statutDemande': 'approuvee',
      isActive: true,
    }).select('+motDePasse');

    if (!pharmacie) {
      return res.status(404).json({
        success: false,
        message: 'Pharmacie non trouvée ou non approuvée',
      });
    }

    // Vérifier le mot de passe de la pharmacie
    const isMatch = await pharmacie.comparePassword(motDePasse);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Mot de passe incorrect',
      });
    }

    // Enregistrer la connexion
    const connexion = new ConnexionPharmacie({
      utilisateurId: req.user._id, // Corrigé : utiliser utilisateurId
      pharmacyId: pharmacyId,     // Corrigé : utiliser pharmacyId
      typeConnexion: typeConnexion || 'consultation',
      informationsUtilisateur: {
        nom: req.user.nom,
        prenom: req.user.prenom,
        email: req.user.email,
        telephone: req.user.telephone,
        adresse: req.user.adresse,
      },
    });

    await connexion.save();

    // Générer un nouveau token avec le rôle pharmacie
    const token = generateToken(pharmacie);

    // Enregistrer un log détaillé
    createDetailedLog('CONNEXION_PHARMACIE_REUSSIE', {
      userId: req.user._id,
      pharmacyId,
      email: pharmacie.email,
      typeConnexion,
      token: `[TOKEN - ${token.length} caractères]`,
    });

    res.json({
      success: true,
      message: 'Connexion à la pharmacie réussie',
      data: {
        token, // Nouveau token avec rôle pharmacie
        pharmacie: {
          _id: pharmacie._id,
          nom: pharmacie.nom,
          prenom: pharmacie.prenom,
          email: pharmacie.email,
          role: pharmacie.role,
          nomPharmacie: pharmacie.pharmacieInfo.nomPharmacie,
          adresseGoogleMaps: pharmacie.pharmacieInfo.adresseGoogleMaps,
          livraisonDisponible: pharmacie.pharmacieInfo.livraisonDisponible,
          estDeGarde: pharmacie.pharmacieInfo.estDeGarde,
          heuresOuverture: pharmacie.pharmacieInfo.heuresOuverture,
        },
        connexionId: connexion._id,
      },
    });
  } catch (error) {
    console.error('❌ Erreur connexion pharmacie:', error);
    createDetailedLog('CONNEXION_PHARMACIE_ECHEC', {
      erreur: error.message,
      stack: error.stack,
      pharmacyId: req.body.pharmacyId,
      userId: req.user?._id,
    });
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la connexion à la pharmacie',
    });
  }
};

// Obtenir l'historique des connexions de l'utilisateur
exports.getMesConnexions = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;

    const connexions = await ConnexionPharmacie.find({
      utilisateur: req.user._id,
    })
      .populate('pharmacie', 'nom prenom pharmacieInfo.nomPharmacie pharmacieInfo.adresseGoogleMaps telephone')
      .sort({ dateConnexion: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ConnexionPharmacie.countDocuments({
      utilisateur: req.user._id,
    });

    res.json({
      success: true,
      data: {
        connexions,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
          limit: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error('❌ Erreur récupération connexions:', error);
    createDetailedLog('ERREUR_GET_MES_CONNEXIONS', {
      erreur: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
    });
  }
};

// Obtenir les connexions des clients à ma pharmacie
exports.getConnexionsClients = async (req, res) => {
  try {
    const { page = 1, limit = 50, dateDebut, dateFin } = req.query;
    const skip = (page - 1) * limit;

    const filter = { pharmacie: req.user._id };

    if (dateDebut && dateFin) {
      filter.dateConnexion = {
        $gte: new Date(dateDebut),
        $lte: new Date(dateFin),
      };
    }

    const connexions = await ConnexionPharmacie.find(filter)
      .populate('utilisateur', 'nom prenom email telephone')
      .sort({ dateConnexion: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ConnexionPharmacie.countDocuments(filter);

    const stats = await ConnexionPharmacie.aggregate([
      { $match: { pharmacie: new mongoose.Types.ObjectId(req.user._id) } },
      {
        $group: {
          _id: '$typeConnexion',
          count: { $sum: 1 },
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        connexions,
        stats,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
          limit: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error('❌ Erreur récupération connexions clients:', error);
    createDetailedLog('ERREUR_GET_CONNEXIONS_CLIENTS', {
      erreur: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
    });
  }
};

// Mettre à jour les horaires d'ouverture
exports.updateHoraires = async (req, res) => {
  try {
    const { heuresOuverture } = req.body;

    if (!heuresOuverture) {
      createDetailedLog('UPDATE_HORAIRES_ECHEC', {
        raison: 'HORAIRES_REQUIS',
        userId: req.user._id,
      });
      return res.status(400).json({
        success: false,
        message: 'Horaires d\'ouverture requis',
      });
    }

    const pharmacie = await User.findByIdAndUpdate(
      req.user._id,
      { 'pharmacieInfo.heuresOuverture': heuresOuverture },
      { new: true, runValidators: true }
    );

    createDetailedLog('UPDATE_HORAIRES_REUSSI', {
      userId: pharmacie._id,
      heuresOuverture: pharmacie.pharmacieInfo.heuresOuverture,
    });

    res.json({
      success: true,
      message: 'Horaires mis à jour avec succès',
      data: {
        heuresOuverture: pharmacie.pharmacieInfo.heuresOuverture,
      },
    });
  } catch (error) {
    console.error('❌ Erreur mise à jour horaires:', error);
    createDetailedLog('ERREUR_UPDATE_HORAIRES', {
      erreur: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
    });
  }
};

// Définir/Retirer le statut de garde
exports.toggleGarde = async (req, res) => {
  try {
    const { estDeGarde, periodeGarde } = req.body;

    const updateData = { 'pharmacieInfo.estDeGarde': estDeGarde };
    if (estDeGarde && periodeGarde) {
      updateData['pharmacieInfo.periodeGarde'] = periodeGarde;
    } else if (!estDeGarde) {
      updateData['pharmacieInfo.periodeGarde'] = null;
    }

    const pharmacie = await User.findByIdAndUpdate(req.user._id, updateData, { new: true });

    createDetailedLog('TOGGLE_GARDE_REUSSI', {
      userId: pharmacie._id,
      estDeGarde: pharmacie.pharmacieInfo.estDeGarde,
    });

    res.json({
      success: true,
      message: estDeGarde ? 'Pharmacie mise en garde' : 'Pharmacie retirée de la garde',
      data: {
        estDeGarde: pharmacie.pharmacieInfo.estDeGarde,
        periodeGarde: pharmacie.pharmacieInfo.periodeGarde,
      },
    });
  } catch (error) {
    console.error('❌ Erreur modification statut garde:', error);
    createDetailedLog('ERREUR_TOGGLE_GARDE', {
      erreur: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
    });
  }
};

// Activer/Désactiver la livraison
exports.toggleLivraison = async (req, res) => {
  try {
    const { livraisonDisponible } = req.body;

    const pharmacie = await User.findByIdAndUpdate(
      req.user._id,
      { 'pharmacieInfo.livraisonDisponible': livraisonDisponible },
      { new: true }
    );

    createDetailedLog('TOGGLE_LIVRAISON_REUSSI', {
      userId: pharmacie._id,
      livraisonDisponible: pharmacie.pharmacieInfo.livraisonDisponible,
    });

    res.json({
      success: true,
      message: `Livraison ${livraisonDisponible ? 'activée' : 'désactivée'}`,
      data: {
        livraisonDisponible: pharmacie.pharmacieInfo.livraisonDisponible,
      },
    });
  } catch (error) {
    console.error('❌ Erreur modification livraison:', error);
    createDetailedLog('ERREUR_TOGGLE_LIVRAISON', {
      erreur: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
    });
  }
};

// Obtenir les pharmacies de garde actuelles
exports.getPharmaciesDeGarde = async (req, res) => {
  try {
    const pharmaciesDeGarde = await User.find({
      role: 'pharmacie',
      'pharmacieInfo.statutDemande': 'approuvee',
      'pharmacieInfo.estDeGarde': true,
      isActive: true,
    }).select('nom prenom pharmacieInfo.nomPharmacie pharmacieInfo.adresseGoogleMaps pharmacieInfo.periodeGarde pharmacieInfo.livraisonDisponible telephone');

    res.json({
      success: true,
      data: {
        pharmaciesDeGarde,
        count: pharmaciesDeGarde.length,
      },
    });
  } catch (error) {
    console.error('❌ Erreur récupération pharmacies de garde:', error);
    createDetailedLog('ERREUR_GET_PHARMACIES_DE_GARDE', {
      erreur: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
    });
  }
};

// Obtenir le profil pharmacie
exports.getMonProfil = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      createDetailedLog('GET_MON_PROFIL_ECHEC', { raison: 'UTILISATEUR_NON_AUTHENTIFIE' });
      return res.status(401).json({ message: 'Utilisateur non authentifié' });
    }

    const user = await User.findById(req.user._id).select('-motDePasse');
    if (!user || user.role !== 'pharmacie') {
      createDetailedLog('GET_MON_PROFIL_ECHEC', {
        raison: user ? 'ROLE_INCORRECT' : 'UTILISATEUR_NON_TROUVE',
        role: user?.role,
        userId: req.user._id,
      });
      return res.status(user ? 403 : 404).json({
        message: user ? 'Accès non autorisé' : 'Utilisateur non trouvé',
      });
    }

    createDetailedLog('GET_MON_PROFIL_REUSSI', {
      userId: user._id,
      email: user.email,
      pharmacieInfo: user.pharmacieInfo,
    });

    res.json({
      success: true,
      pharmacie: {
        _id: user._id,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        telephone: user.telephone,
        role: user.role,
        pharmacieInfo: {
          nomPharmacie: user.pharmacieInfo?.nomPharmacie || '',
          adresseGoogleMaps: user.pharmacieInfo?.adresseGoogleMaps || '',
          livraisonDisponible: user.pharmacieInfo?.livraisonDisponible || false,
          estDeGarde: user.pharmacieInfo?.estDeGarde || false,
          periodeGarde: user.pharmacieInfo?.periodeGarde || { debut: null, fin: null },
          heuresOuverture: user.pharmacieInfo?.heuresOuverture || {},
          photoPharmacie: user.pharmacieInfo?.photoPharmacie
            ? {
                ...user.pharmacieInfo.photoPharmacie,
                cheminFichier: user.pharmacieInfo.photoPharmacie.cheminFichier?.replace(/\\/g, '/') || null,
              }
            : null,
          documentsVerification: user.pharmacieInfo?.documentsVerification || [],
          statutDemande: user.pharmacieInfo?.statutDemande || 'en_attente',
          dateApprobation: user.pharmacieInfo?.dateApprobation || null,
          commentaireApprobation: user.pharmacieInfo?.commentaireApprobation || '',
          approuvePar: user.pharmacieInfo?.approuvePar || null,
        },
      },
    });
  } catch (error) {
    console.error('❌ Erreur getMonProfil:', error);
    createDetailedLog('ERREUR_GET_MON_PROFIL', {
      erreur: error.message,
      stack: error.stack,
      userId: req.user?._id,
    });
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Recherche géolocalisée de pharmacies
exports.rechercheGeolocalisee = async (req, res) => {
  try {
    res.status(501).json({
      success: false,
      message: 'Fonctionnalité en développement',
    });
  } catch (error) {
    console.error('❌ Erreur recherche géolocalisée:', error);
    createDetailedLog('ERREUR_RECHERCHE_GEOLOCALISEE', {
      erreur: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
    });
  }
};

exports.creerCommande = async (req, res) => {
  try {

    console.log('📥 req.body brut:', JSON.stringify(req.body, null, 2));
    const { pharmacyId, medicaments, livraison, adresseLivraison } = req.body;
    console.log('🔍 pharmacyId extrait:', pharmacyId);
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(pharmacyId)) {
      createDetailedLog('CREER_COMMANDE_ECHEC', { raison: 'ID_PHARMACIE_INVALIDE', pharmacyId });
      return res.status(400).json({ success: false, message: 'ID de pharmacie invalide' });
    }

    const pharmacie = await User.findById(pharmacyId);
    if (!pharmacie || pharmacie.role !== 'pharmacie' || pharmacie.pharmacieInfo.statutDemande !== 'approuvee') {
      createDetailedLog('CREER_COMMANDE_ECHEC', { raison: 'PHARMACIE_NON_TROUVEE_OU_NON_APPROUVEE', pharmacyId });
      return res.status(404).json({ success: false, message: 'Pharmacie non trouvée ou non approuvée' });
    }

    const client = await User.findById(userId);
    if (!client) {
      createDetailedLog('CREER_COMMANDE_ECHEC', { raison: 'CLIENT_NON_TROUVE', userId });
      return res.status(404).json({ success: false, message: 'Client non trouvé' });
    }

    // Calculer le total
    const total = medicaments.reduce((sum, item) => sum + item.prix * item.quantite, 0);

    const commande = new Commande({
      userId,
      pharmacyId,
      medicaments,
      total,
      livraison,
      adresseLivraison: livraison ? adresseLivraison : undefined,
    });

    await commande.save();

    // Supprimer le panier après création de la commande
    await Cart.deleteOne({ userId, pharmacyId });

    // Envoyer une notification à la pharmacie
    await sendCommandeNotification(pharmacie, commande, client);

    createDetailedLog('CREER_COMMANDE_REUSSI', {
      commandeId: commande._id,
      userId,
      pharmacyId,
      total,
    });

    res.json({
      success: true,
      message: 'Commande créée avec succès',
      data: { commandeId: commande._id },
    });
  } catch (error) {
    console.error('❌ Erreur création commande:', error);
    createDetailedLog('ERREUR_CREER_COMMANDE', {
      erreur: error.message,
      stack: error.stack,
      userId: req.user?._id,
    });
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

// Obtenir les commandes d'une pharmacie
exports.getCommandesPharmacie = async (req, res) => {
  try {
    const { page = 1, limit = 50, statut, dateDebut, dateFin } = req.query;
    const skip = (page - 1) * limit;

    const filter = { pharmacyId: req.user._id };

    if (statut) {
      filter.statut = statut;
    }
    if (dateDebut && dateFin) {
      filter.dateCommande = {
        $gte: new Date(dateDebut),
        $lte: new Date(dateFin),
      };
    }

    const commandes = await Commande.find(filter)
      .populate('userId', 'nom prenom email telephone')
      .sort({ dateCommande: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Commande.countDocuments(filter);

    res.json({
      success: true,
      data: {
        commandes,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
          limit: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error('❌ Erreur récupération commandes:', error);
    createDetailedLog('ERREUR_GET_COMMANDES_PHARMACIE', {
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

// Mettre à jour le statut d'une commande
exports.updateStatutCommande = async (req, res) => {
  try {
    const { commandeId, statut } = req.body;

    if (!mongoose.Types.ObjectId.isValid(commandeId)) {
      createDetailedLog('UPDATE_STATUT_COMMANDE_ECHEC', { raison: 'ID_COMMANDE_INVALIDE', commandeId });
      return res.status(400).json({ success: false, message: 'ID de commande invalide' });
    }

    if (!['en_attente', 'en_preparation', 'prete', 'livree', 'annulee'].includes(statut)) {
      createDetailedLog('UPDATE_STATUT_COMMANDE_ECHEC', { raison: 'STATUT_INVALIDE', statut });
      return res.status(400).json({ success: false, message: 'Statut invalide' });
    }

    const commande = await Commande.findOneAndUpdate(
      { _id: commandeId, pharmacyId: req.user._id },
      { statut, dateMiseAJour: new Date() },
      { new: true }
    );

    if (!commande) {
      createDetailedLog('UPDATE_STATUT_COMMANDE_ECHEC', { raison: 'COMMANDE_NON_TROUVEE', commandeId });
      return res.status(404).json({ success: false, message: 'Commande non trouvée' });
    }

    createDetailedLog('UPDATE_STATUT_COMMANDE_REUSSI', {
      commandeId,
      statut,
      userId: req.user._id,
    });

    res.json({
      success: true,
      message: `Statut de la commande mis à jour à "${statut}"`,
      data: { commande },
    });
  } catch (error) {
    console.error('❌ Erreur mise à jour statut commande:', error);
    createDetailedLog('ERREUR_UPDATE_STATUT_COMMANDE', {
      erreur: error.message,
      stack: error.stack,
      userId: req.user?._id,
    });
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};



module.exports = {
getMonProfil: exports.getMonProfil, // Use exports.getMonProfil
  loginPharmacie: exports.loginPharmacie,
  changerMotDePasseInitial: exports.changerMotDePasseInitial,
  updateProfilePassword: exports.updateProfilePassword,
  demanderSuppression: exports.demanderSuppression,
  demanderModification: exports.demanderModification,
  updateProfilPharmacie: exports.updateProfilPharmacie,
  saveDocuments: exports.saveDocuments,
  uploadDocuments: exports.uploadDocuments,
  uploadPharmacyPhoto: exports.uploadPharmacyPhoto,
  getPharmacies: exports.getPharmacies,
  getPharmacieById: exports.getPharmacieById,
  connexionPharmacie: exports.connexionPharmacie,
  getMesConnexions: exports.getMesConnexions,
  getConnexionsClients: exports.getConnexionsClients,
  updateHoraires: exports.updateHoraires,
  toggleGarde: exports.toggleGarde,
  toggleLivraison: exports.toggleLivraison,
  getPharmaciesDeGarde: exports.getPharmaciesDeGarde,
  rechercheGeolocalisee: exports.rechercheGeolocalisee,
  creerCommande: exports.creerCommande,
  getCommandesPharmacie: exports.getCommandesPharmacie,
  updateStatutCommande: exports.updateStatutCommande,
};