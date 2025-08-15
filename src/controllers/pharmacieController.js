// C:\reactjs node mongodb\pharmacie-backend\src\controllers\pharmacieController.js
const { User, ConnexionPharmacie } = require('../models/User');
const { 
  sendPharmacyAccessNotification, 
  sendSuppressionRequestEmail,
  sendPharmacyAccessPassword,
  sendIntegrationRequestNotification,
  sendPharmacyModificationRequestNotification,
  sendClientIntegrationRequestConfirmation
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
const Pharmacie = require('../models/Pharmacie');
const { login } = require('./authController');
// Log MongoDB operations
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
// C:\reactjs node mongodb\pharmacie-backend\src\controllers\pharmacieController.js
// Connexion pharmacie

// Récupérer les informations d'une pharmacie par ID
exports.getPharmacyById = async (req, res) => {
  try {
    const { pharmacyId } = req.params;

    createDetailedLog('RECHERCHE_PHARMACIE_PAR_ID', { pharmacyId });

    const mongoQuery = { _id: pharmacyId, role: 'pharmacie' };
    logMongoOperation('FIND_PHARMACIE_BY_ID', mongoQuery);

    const pharmacie = await User.findOne(mongoQuery).select('email nom prenom pharmacieInfo');

    if (!pharmacie) {
      logMongoOperation('FIND_PHARMACIE_BY_ID', mongoQuery, null, new Error('Pharmacie non trouvée'));
      createDetailedLog('RECHERCHE_PHARMACIE_ECHEC', {
        raison: 'PHARMACIE_NON_TROUVEE',
        pharmacyId,
      });
      return res.status(404).json({ message: 'Pharmacie non trouvée' });
    }

    if (!pharmacie.pharmacieInfo || pharmacie.pharmacieInfo.statutDemande !== 'approuvee') {
      createDetailedLog('RECHERCHE_PHARMACIE_ECHEC', {
        raison: 'PHARMACIE_NON_APPROUVEE',
        statutActuel: pharmacie.pharmacieInfo?.statutDemande,
      });
      return res.status(400).json({ message: 'Pharmacie non approuvée' });
    }

    createDetailedLog('RECHERCHE_PHARMACIE_REUSSIE', {
      pharmacyId,
      email: pharmacie.email,
    });

    res.json({
      email: pharmacie.email,
      nom: pharmacie.nom,
      prenom: pharmacie.prenom,
      pharmacieInfo: pharmacie.pharmacieInfo,
    });
  } catch (error) {
    console.error('❌ Erreur getPharmacyById:', error);
    createDetailedLog('ERREUR_RECHERCHE_PHARMACIE', {
      erreur: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

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

    // Vérifier si le client est autorisé à se connecter à cette pharmacie
    if (clientConnecte) {
      const client = await User.findById(clientConnecte._id);
      if (!client || !client.pharmaciesAssociees.some(assoc => assoc.pharmacyId.toString() === pharmacie._id.toString())) {
        createDetailedLog('CONNEXION_PHARMACIE_ECHEC', {
          raison: 'CLIENT_NON_AUTORISE',
          clientId: clientConnecte._id,
          pharmacyId: pharmacie._id,
        });
        return res.status(403).json({ message: 'Client non autorisé pour cette pharmacie' });
      }
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
      return res.status(400).json({ message: 'Mot de passe incorect' });
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
        utilisateurId: clientConnecte._id,
        pharmacyId: pharmacie._id,
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

// Connexion pharmacie
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
exports.connexionPharmacie = async (req, res) => {
  try {
    const { pharmacyId, typeConnexion, motDePasse, accessToken } = req.body;

    if (!req.user) {
      createDetailedLog('CONNEXION_PHARMACIE_ECHEC', {
        raison: 'UTILISATEUR_NON_AUTHENTIFIE',
        pharmacyId,
      });
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié',
      });
    }

    // Vérifier le token d'accès
    const client = await User.findById(req.user._id);
    const isAuthorizedToken = client.pharmaciesAssociees.some(
      assoc => assoc.pharmacyId.toString() === pharmacyId && assoc.accessToken === accessToken
    );
    if (!isAuthorizedToken) {
      createDetailedLog('CONNEXION_PHARMACIE_ECHEC', {
        raison: 'TOKEN_INVALIDE',
        userId: req.user._id,
        pharmacyId,
      });
      return res.status(403).json({
        success: false,
        message: 'Token d\'accès invalide',
      });
    }

    const pharmacie = await User.findOne({
      _id: pharmacyId,
      role: 'pharmacie',
      'pharmacieInfo.statutDemande': 'approuvee',
      isActive: true,
    }).select('+motDePasse');

    if (!pharmacie) {
      createDetailedLog('CONNEXION_PHARMACIE_ECHEC', {
        raison: 'PHARMACIE_NON_TROUVEE',
        pharmacyId,
      });
      return res.status(404).json({
        success: false,
        message: 'Pharmacie non trouvée ou non approuvée',
      });
    }

    if (!pharmacie.pharmacieInfo.employesAutorises.includes(req.user._id)) {
      createDetailedLog('CONNEXION_PHARMACIE_ECHEC', {
        raison: 'ACCES_NON_AUTORISE',
        userId: req.user._id,
        pharmacyId,
      });
      return res.status(403).json({
        success: false,
        message: 'Vous n\'êtes pas autorisé à accéder à cette pharmacie',
      });
    }

    const isMatch = await pharmacie.comparePassword(motDePasse);
    if (!isMatch) {
      createDetailedLog('CONNEXION_PHARMACIE_ECHEC', {
        raison: 'MOT_DE_PASSE_INCORRECT',
        pharmacyId,
      });
      return res.status(401).json({
        success: false,
        message: 'Mot de passe incorrect',
      });
    }

    const connexion = new ConnexionPharmacie({
      utilisateurId: req.user._id, // À ajuster selon le schéma
      pharmacyId: pharmacyId,     // À ajuster selon le schéma
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

    const token = jwt.sign(
      { id: req.user._id, role: 'pharmacie', pharmacyId },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );

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
        token,
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
// pharmacieController.js
exports.getConnexionsClients = async (req, res) => {
  try {
    const { page = 1, limit = 50, dateDebut, dateFin } = req.query;
    const skip = (page - 1) * limit;

    const filter = { pharmacyId: req.user._id }; // Corrigé : utiliser pharmacyId au lieu de pharmacie

    if (dateDebut && dateFin) {
      filter.dateConnexion = {
        $gte: new Date(dateDebut),
        $lte: new Date(dateFin),
      };
    }

    console.log('🔍 [getConnexionsClients] Filtre:', filter); // Ajouté pour débogage

    const connexions = await ConnexionPharmacie.find(filter)
      .populate('utilisateurId', 'nom prenom email telephone') // Corrigé : utiliser utilisateurId
      .sort({ dateConnexion: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ConnexionPharmacie.countDocuments(filter);

    const stats = await ConnexionPharmacie.aggregate([
      { $match: { pharmacyId: new mongoose.Types.ObjectId(req.user._id) } }, // Corrigé : utiliser pharmacyId
      {
        $group: {
          _id: '$typeConnexion',
          count: { $sum: 1 },
        },
      },
    ]);

    console.log('🔍 [getConnexionsClients] Connexions trouvées:', connexions.length); // Ajouté pour débogage

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

    if (!['en_attente', 'en_cours', 'terminée', 'annulée'].includes(statut)) {
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

exports.listerDemandesIntegration = async (req, res) => {
  try {
    const pharmacie = await User.findById(req.user._id);  // Doit être connecté en mode pharmacie
    if (!pharmacie || pharmacie.role !== 'pharmacie' || pharmacie.pharmacieInfo.createdBy.toString() !== req.user._id.toString()) {  // Vérif createdBy
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    res.json({ success: true, data: pharmacie.pharmacieInfo.demandesIntegration });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

exports.validerDemandeIntegration = async (req, res) => {
  try {
    const userId = req.user._id;
    const { demandeId, statut, password, motifRejet } = req.body;
    const { pharmacyId } = req.query;
    console.log('🔍 [validerDemandeIntegration] Début pour userId:', userId, 'demandeId:', demandeId, 'statut:', statut, 'pharmacyId:', pharmacyId);

    // Étape 1 : Valider le payload
    if (!demandeId || !statut || !['approuvee', 'rejetee'].includes(statut)) {
      console.log('❌ [validerDemandeIntegration] Payload invalide:', { demandeId, statut });
      createDetailedLog('VALIDER_DEMANDE_INTEGRATION_ECHEC', {
        raison: 'PAYLOAD_INVALIDE',
        userId,
        demandeId,
        statut,
      });
      return res.status(400).json({
        success: false,
        message: 'Identifiant de demande ou statut invalide',
      });
    }

    if (statut === 'approuvee' && !password) {
      console.log('❌ [validerDemandeIntegration] Mot de passe requis pour approbation');
      createDetailedLog('VALIDER_DEMANDE_INTEGRATION_ECHEC', {
        raison: 'MOT_DE_PASSE_REQUIS',
        userId,
        demandeId,
      });
      return res.status(400).json({
        success: false,
        message: 'Mot de passe requis pour approbation',
      });
    }

    if (statut === 'rejetee' && !motifRejet) {
      console.log('❌ [validerDemandeIntegration] Motif de rejet requis');
      createDetailedLog('VALIDER_DEMANDE_INTEGRATION_ECHEC', {
        raison: 'MOTIF_REJET_REQUIS',
        userId,
        demandeId,
      });
      return res.status(400).json({
        success: false,
        message: 'Motif de rejet requis',
      });
    }

    // Étape 2 : Valider le pharmacyId
    if (!pharmacyId || !mongoose.Types.ObjectId.isValid(pharmacyId)) {
      console.log('❌ [validerDemandeIntegration] pharmacyId invalide:', pharmacyId);
      createDetailedLog('VALIDER_DEMANDE_INTEGRATION_ECHEC', {
        raison: 'PHARMACY_ID_INVALIDE',
        pharmacyId,
        userId,
      });
      return res.status(400).json({
        success: false,
        message: 'Identifiant de pharmacie invalide',
      });
    }

    // Étape 3 : Trouver la pharmacie
    const pharmacie = await User.findOne({
      _id: pharmacyId,
      role: 'pharmacie',
    }).select('pharmacieInfo');

    if (!pharmacie || !pharmacie.pharmacieInfo) {
      console.log('❌ [validerDemandeIntegration] Pharmacie non trouvée:', pharmacyId);
      createDetailedLog('VALIDER_DEMANDE_INTEGRATION_ECHEC', {
        raison: 'PHARMACIE_NON_TROUVEE',
        pharmacyId,
        userId,
      });
      return res.status(404).json({
        success: false,
        message: 'Pharmacie non trouvée',
      });
    }

    // Étape 4 : Trouver la demande d'intégration
    const demande = pharmacie.pharmacieInfo.demandesIntegration.find(
      (d) => d._id.toString() === demandeId
    );

    if (!demande) {
      console.log('❌ [validerDemandeIntegration] Demande non trouvée:', demandeId);
      createDetailedLog('VALIDER_DEMANDE_INTEGRATION_ECHEC', {
        raison: 'DEMANDE_NON_TROUVEE',
        demandeId,
        pharmacyId,
      });
      return res.status(404).json({
        success: false,
        message: 'Demande d’intégration non trouvée',
      });
    }

    // Étape 5 : Trouver le client associé
    if (!mongoose.Types.ObjectId.isValid(demande.clientId)) {
      console.log('❌ [validerDemandeIntegration] clientId invalide:', demande.clientId);
      createDetailedLog('VALIDER_DEMANDE_INTEGRATION_ECHEC', {
        raison: 'CLIENT_ID_INVALIDE',
        clientId: demande.clientId,
      });
      return res.status(400).json({
        success: false,
        message: 'Identifiant de client invalide',
      });
    }

    const client = await User.findById(demande.clientId).select('nom prenom email telephone pharmaciesAssociees');
    if (!client) {
      console.log('❌ [validerDemandeIntegration] Client non trouvé:', demande.clientId);
      createDetailedLog('VALIDER_DEMANDE_INTEGRATION_ECHEC', {
        raison: 'CLIENT_NON_TROUVE',
        clientId: demande.clientId,
      });
      return res.status(404).json({
        success: false,
        message: 'Client non trouvé',
      });
    }

    // Étape 6 : Mettre à jour la demande
    demande.statut = statut;
    demande.dateTraitement = new Date();

    if (statut === 'approuvee') {
      // Ajouter le client à employesAutorises
      pharmacie.pharmacieInfo.employesAutorises = pharmacie.pharmacieInfo.employesAutorises || [];
      if (!pharmacie.pharmacieInfo.employesAutorises.includes(demande.clientId)) {
        pharmacie.pharmacieInfo.employesAutorises.push(demande.clientId);
      }

      //**** */ Mettre à jour le mot de passe du client
      // const hashedPassword = await bcrypt.hash(password, 10);
      // client.motDePasse = hashedPassword;
      // client.motDePasseTemporaire = true;

      // Ajouter la pharmacie à pharmaciesAssociees du client
      client.pharmaciesAssociees = client.pharmaciesAssociees || [];
      if (!client.pharmaciesAssociees.some((assoc) => assoc.pharmacyId.toString() === pharmacie._id.toString())) {
        client.pharmaciesAssociees.push({
          pharmacyId: pharmacie._id,
          accessToken: '',
        });
      }

      // Envoyer l'email
      await sendPharmacyAccessPassword(
        client.email,
        pharmacie.pharmacieInfo.nomPharmacie,
        `${client.prenom} ${client.nom}`,
        password
      );
    } else if (statut === 'rejetee') {
      demande.motifRejet = motifRejet;
      await sendEmail(
        client.email,
        'Intégration rejetée',
        `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background: linear-gradient(135deg, #dc3545, #fd7e14); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="margin: 0; font-size: 28px;">❌ Demande rejetée</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 16px;">PharmOne</p>
          </div>
          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #333; margin-top: 0; font-size: 24px;">Bonjour ${client.prenom} ${client.nom},</h2>
            <p style="color: #666; line-height: 1.6; font-size: 16px;">
              Votre demande d'intégration à la pharmacie <strong>${pharmacie.pharmacieInfo.nomPharmacie}</strong> a été rejetée.
            </p>
            <p style="color: #666; line-height: 1.6; font-size: 16px;">
              <strong>Motif :</strong> ${motifRejet || 'Aucun motif spécifié'}
            </p>
          </div>
        </div>`
      );
    }

    // Étape 7 : Supprimer la demande
    pharmacie.pharmacieInfo.demandesIntegration = pharmacie.pharmacieInfo.demandesIntegration.filter(
      (d) => d._id.toString() !== demandeId
    );

    // Étape 8 : Sauvegarder les modifications
    await Promise.all([pharmacie.save(), client.save()]);

    createDetailedLog('VALIDER_DEMANDE_INTEGRATION_REUSSIE', {
      pharmacyId: pharmacie._id,
      clientId: client._id,
      demandeId,
      statut,
      userId,
    });

    // Étape 9 : Retourner la réponse
    res.json({
      success: true,
      message: `Demande ${statut === 'approuvee' ? 'approuvée' : 'rejetée'} avec succès`,
    });
  } catch (error) {
    console.error('❌ Erreur validerDemandeIntegration:', {
      message: error.message,
      stack: error.stack,
      userId: req.user?._id,
      demandeId,
      pharmacyId: req.query?.pharmacyId,
    });
    createDetailedLog('ERREUR_VALIDER_DEMANDE_INTEGRATION', {
      erreur: error.message,
      stack: error.stack,
      userId: req.user?._id,
      demandeId,
      pharmacyId: req.query?.pharmacyId,
    });
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la validation de la demande',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

exports.approuverDemandeIntegration = async (req, res) => {
  try {
    const { demandeId } = req.params;
    const { statut, messageApprobation, motifRejet } = req.body;

    const pharmacie = await User.findById(req.user._id);
    if (!pharmacie || pharmacie.role !== 'pharmacie' || pharmacie.pharmacieInfo.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    const demande = pharmacie.pharmacieInfo.demandesIntegration.id(demandeId);
    if (!demande) {
      return res.status(404).json({ success: false, message: 'Demande introuvable' });
    }

    demande.statut = statut;
    if (statut === 'approuvee') {
      pharmacie.pharmacieInfo.employesAutorises.push(demande.clientId);
      demande.messageApprobation = messageApprobation;  // Stocke le message

      // Envoyer email au client
      const client = await User.findById(demande.clientId);
      await sendEmail(client.email, 'Intégration approuvée', messageApprobation || 'Votre demande a été approuvée.');

    } else if (statut === 'rejetee') {
      demande.motifRejet = motifRejet;
      await sendEmail(client.email, 'Intégration rejetée', motifRejet || 'Votre demande a été rejetée.');
    }

    await pharmacie.save();
    res.json({ success: true, message: 'Demande traitée' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};
// C:\reactjs node mongodb\pharmacie-backend\src\controllers\pharmacieController.js
exports.demanderIntegration = async (req, res) => {
  try {
    const { pharmacyId, message } = req.body;

    if (!mongoose.Types.ObjectId.isValid(pharmacyId)) {
      createDetailedLog('DEMANDE_INTEGRATION_ECHEC', { raison: 'ID_PHARMACIE_INVALIDE', pharmacyId });
      return res.status(400).json({ success: false, message: 'ID de pharmacie invalide' });
    }

    const pharmacie = await User.findById(pharmacyId);
    if (!pharmacie || pharmacie.role !== 'pharmacie' || pharmacie.pharmacieInfo.statutDemande !== 'approuvee') {
      createDetailedLog('DEMANDE_INTEGRATION_ECHEC', { raison: 'PHARMACIE_NON_TROUVEE_OU_NON_APPROUVEE', pharmacyId });
      return res.status(404).json({ success: false, message: 'Pharmacie non trouvée ou non approuvée' });
    }

    const client = await User.findById(req.user._id);
    if (!client) {
      createDetailedLog('DEMANDE_INTEGRATION_ECHEC', { raison: 'CLIENT_NON_TROUVE', userId: req.user._id });
      return res.status(404).json({ success: false, message: 'Client non trouvé' });
    }

    // Vérifier si une demande existe déjà
    if (pharmacie.pharmacieInfo.demandesIntegration.some(d => d.clientId.toString() === req.user._id.toString())) {
      createDetailedLog('DEMANDE_INTEGRATION_ECHEC', { raison: 'DEMANDE_DEJA_ENVOYEE', userId: req.user._id });
      return res.status(400).json({ success: false, message: 'Vous avez déjà soumis une demande pour cette pharmacie' });
    }

    // Ajouter la demande
    const demande = {
      clientId: req.user._id,
      nom: client.nom,
      prenom: client.prenom,
      email: client.email,
      telephone: client.telephone,
      message: message || '',
      statut: 'en_attente',
      dateDemande: new Date(),
    };

    pharmacie.pharmacieInfo.demandesIntegration.push(demande);
    await pharmacie.save();

    // Notifier le createdBy
    const createdBy = await User.findById(pharmacie.pharmacieInfo.createdBy);
    if (createdBy) {
      await sendIntegrationRequestNotification({
        nomPharmacie: pharmacie.pharmacieInfo.nomPharmacie,
        nom: client.nom,
        prenom: client.prenom,
        email: client.email,
        telephone: client.telephone,
        message,
        recipientEmail: createdBy.email, // Add the createdBy email
      });
    } else {
      console.warn('⚠️ createdBy non trouvé pour la pharmacie:', pharmacyId);
      createDetailedLog('DEMANDE_INTEGRATION_WARNING', {
        raison: 'CREATEDBY_NON_TROUVE',
        pharmacyId,
        userId: req.user._id,
      });
    }

    createDetailedLog('DEMANDE_INTEGRATION_REUSSIE', {
      userId: req.user._id,
      pharmacyId,
      email: client.email,
    });

    res.json({
      success: true,
      message: 'Demande d\'intégration envoyée avec succès',
    });
  } catch (error) {
    console.error('❌ Erreur demanderIntegration:', error);
    createDetailedLog('ERREUR_DEMANDE_INTEGRATION', {
      erreur: error.message,
      stack: error.stack,
      userId: req.user?._id,
      pharmacyId: req.body.pharmacyId,
    });
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

// C:\reactjs node mongodb\pharmacie-backend\src\controllers\pharmacieController.js
// controllers/adminController.js
// C:\reactjs node mongodb\pharmacie-backend\src\controllers\pharmacieController.js
// Version alternative plus robuste
exports.getDemandesIntegration = async (req, res) => {
  try {
    const { pharmacyId } = req.query;
    console.log('🔍 [getDemandesIntegration] Début pour pharmacyId:', pharmacyId);

    // Étape 1 : Valider le pharmacyId
    if (!pharmacyId || !mongoose.Types.ObjectId.isValid(pharmacyId)) {
      console.log('❌ [getDemandesIntegration] pharmacyId invalide:', pharmacyId);
      createDetailedLog('GET_DEMANDES_INTEGRATION_ECHEC', {
        raison: 'PHARMACY_ID_INVALIDE',
        pharmacyId,
      });
      return res.status(400).json({
        success: false,
        message: 'Identifiant de pharmacie invalide',
      });
    }

    // Étape 2 : Trouver la pharmacie
    const pharmacie = await User.findOne({
      _id: pharmacyId,
      role: 'pharmacie',
    }).select('pharmacieInfo');

    if (!pharmacie || !pharmacie.pharmacieInfo) {
      console.log('❌ [getDemandesIntegration] Pharmacie non trouvée:', pharmacyId);
      createDetailedLog('GET_DEMANDES_INTEGRATION_ECHEC', {
        raison: 'PHARMACIE_NON_TROUVEE',
        pharmacyId,
      });
      return res.status(404).json({
        success: false,
        message: 'Pharmacie non trouvée',
      });
    }

    // Étape 3 : Récupérer les demandes d'intégration
    const demandes = pharmacie.pharmacieInfo.demandesIntegration || [];
    console.log('✅ [getDemandesIntegration] Pharmacie trouvée avec', demandes.length, 'demandes');

    // Étape 4 : Enrichir les demandes avec les informations client
    const demandesEnrichies = await Promise.all(
      demandes.map(async (demande) => {
        try {
          if (!mongoose.Types.ObjectId.isValid(demande.clientId)) {
            console.warn('⚠️ [getDemandesIntegration] clientId invalide:', demande.clientId);
            return demande.toObject();
          }
          const client = await User.findById(demande.clientId).select('nom prenom email telephone');
          return {
            ...demande.toObject(),
            nom: client?.nom || demande.nom,
            prenom: client?.prenom || demande.prenom,
            email: client?.email || demande.email,
            telephone: client?.telephone || demande.telephone,
          };
        } catch (err) {
          console.warn('⚠️ [getDemandesIntegration] Erreur enrichissement demande:', demande._id, err.message);
          return demande.toObject();
        }
      })
    );

    createDetailedLog('GET_DEMANDES_INTEGRATION_REUSSIE', {
      pharmacyId,
      nombreDemandes: demandesEnrichies.length,
    });

    // Étape 5 : Retourner la réponse
    res.json({
      success: true,
      data: demandesEnrichies,
      pharmacieInfo: {
        id: pharmacie._id,
        nom: pharmacie.pharmacieInfo.nomPharmacie,
      },
    });
  } catch (error) {
    console.error('❌ Erreur getDemandesIntegration:', {
      message: error.message,
      stack: error.stack,
      pharmacyId: req.query?.pharmacyId,
    });
    createDetailedLog('ERREUR_GET_DEMANDES_INTEGRATION', {
      erreur: error.message,
      stack: error.stack,
      pharmacyId: req.query?.pharmacyId,
    });
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des demandes',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};


// pharmacieController.js
// pharmacieController.js
exports.checkCreatedByStatus = async (req, res) => {
  try {
    const pharmacie = await User.findById(req.user._id);
    if (!pharmacie || pharmacie.role !== 'pharmacie') {
      return res.status(404).json({ success: false, message: 'Pharmacie non trouvée' });
    }

    // Vérifier si l'utilisateur est le createdBy
    if (pharmacie.pharmacieInfo.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Seul le créateur peut voir les demandes d\'intégration' });
    }

    const demandes = pharmacie.pharmacieInfo.demandesIntegration || [];
    res.json({
      success: true,
      data: demandes,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};


// Vérifier les associations de l'utilisateur
exports.checkAssociation = async (req, res) => {
  try {
    const clientId = req.user._id;
    console.log('🔍 [checkAssociation] Vérification pour client:', { clientId });

    const client = await User.findById(clientId).select('pharmaciesAssociees');
    if (!client) {
      console.log('❌ [checkAssociation] Client non trouvé:', { clientId });
      return res.status(404).json({ success: false, message: 'Client non trouvé' });
    }

    const pharmacyIds = client.pharmaciesAssociees
      .map((assoc) => {
        console.log('🔍 [checkAssociation] Analyse pharmacyId:', {
          pharmacyId: assoc.pharmacyId,
          isValid: mongoose.Types.ObjectId.isValid(assoc.pharmacyId),
        });
        return assoc.pharmacyId;
      })
      .filter((id) => mongoose.Types.ObjectId.isValid(id));

    console.log('🔍 [checkAssociation] Valid Pharmacy IDs:', pharmacyIds);

    if (pharmacyIds.length === 0) {
      console.log('⚠️ [checkAssociation] Aucune pharmacie valide trouvée pour:', { clientId });
      return res.status(200).json({
        success: true,
        pharmacies: [],
        message: 'Aucune pharmacie associée trouvée',
      });
    }

    const pharmacies = await User.find({
      _id: { $in: pharmacyIds },
      role: 'pharmacie',
      'pharmacieInfo.statutDemande': 'approuvee',
      isActive: true,
    }).select('pharmacieInfo');

    console.log('🔍 [checkAssociation] Pharmacies trouvées:', {
      count: pharmacies.length,
      pharmacies: pharmacies.map((p) => ({
        _id: p._id,
        nomPharmacie: p.pharmacieInfo.nomPharmacie,
      })),
    });

    if (pharmacies.length === 0) {
      console.log('⚠️ [checkAssociation] Aucune pharmacie approuvée trouvée pour:', { clientId });
      return res.status(200).json({
        success: true,
        pharmacies: [],
        message: 'Aucune pharmacie associée trouvée',
      });
    }

    const pharmaciesList = pharmacies.map((pharmacie) => ({
      _id: pharmacie._id,
      pharmacieInfo: pharmacie.pharmacieInfo,
    }));

    return res.json({
      success: true,
      pharmacies: pharmaciesList,
    });
  } catch (error) {
    console.error('❌ [checkAssociation] Erreur:', {
      message: error.message,
      stack: error.stack,
      clientId: req.user._id,
    });
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

exports.loginByPassword = async (req, res) => {
  try {
    console.log('🔍 [loginByPassword] Tentative:', req.body);
    const { emailPharmacie, motDePasse } = req.body;

    if (!emailPharmacie || !motDePasse) {
      console.warn('⚠️ [loginByPassword] Données manquantes:', { emailPharmacie, motDePasse });
      return res.status(400).json({
        success: false,
        message: 'Email et mot de passe requis',
      });
    }

    const pharmacie = await User.findOne({
      email: emailPharmacie,
      role: 'pharmacie',
      'pharmacieInfo.statutDemande': 'approuvee',
      isActive: true,
    }).select('+motDePasse +pharmacieInfo.messageApprobation +pharmacieInfo.commentaireApprobation');

    if (!pharmacie) {
      console.warn('❌ [loginByPassword] Pharmacie non trouvée:', { emailPharmacie });
      return res.status(404).json({
        success: false,
        message: 'Pharmacie non trouvée',
      });
    }

    console.log('🔍 [loginByPassword] Vérification mot de passe temporaire:', {
      motDePasse,
      messageApprobation: pharmacie.pharmacieInfo.messageApprobation,
      commentaireApprobation: pharmacie.pharmacieInfo.commentaireApprobation,
    });

    let isTemporaryPasswordValid = false;
    if (pharmacie.motDePasseTemporaire) {
      isTemporaryPasswordValid = motDePasse === (pharmacie.pharmacieInfo.messageApprobation || pharmacie.pharmacieInfo.commentaireApprobation);
    }

    let isPasswordValid = false;
    try {
      isPasswordValid = await pharmacie.comparePassword(motDePasse);
    } catch (err) {
      console.warn('⚠️ [loginByPassword] Erreur comparePassword:', { error: err.message });
    }

    if (!isTemporaryPasswordValid && !isPasswordValid) {
      console.warn('❌ [loginByPassword] Mot de passe incorrect:', { emailPharmacie });
      return res.status(401).json({
        success: false,
        message: 'Mot de passe incorrect',
      });
    }

    const token = generateToken({
      id: pharmacie._id,
      email: pharmacie.email,
      role: pharmacie.role,
      nom: pharmacie.nom,
      prenom: pharmacie.prenom,
    });

    console.log('✅ [loginByPassword] Connexion réussie:', {
      emailPharmacie,
      pharmacieId: pharmacie._id,
    });

    return res.status(200).json({
      success: true,
      token,
      pharmacie: {
        _id: pharmacie._id,
        nomPharmacie: pharmacie.pharmacieInfo.nomPharmacie,
        email: pharmacie.email,
      },
      doitChangerMotDePasse: isTemporaryPasswordValid,
    });
  } catch (error) {
    console.error('❌ [loginByPassword] Erreur:', {
      erreur: error.message,
      stack: error.stack,
      emailPharmacie: req.body.emailPharmacie,
    });
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur',
    });
  }
};

const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      nom: user.nom,
      prenom: user.prenom,
    },
    process.env.JWT_SECRET || 'your_jwt_secret',
    { expiresIn: '30d', issuer: 'PharmOne' }
  );
};

// exports.login = async (req, res) => {
//   try {
//     console.log('🔍 [login] Tentative:', req.body);
//     const { email, motDePasse, clientConnecte } = req.body;

//     if (!email || !motDePasse || !clientConnecte) {
//       console.warn('⚠️ [login] Données manquantes:', { email, motDePasse, clientConnecte });
//       return res.status(400).json({
//         success: false,
//         message: 'Email, mot de passe et informations du client requis',
//       });
//     }

//     // Vérifier que le client est connecté et a une pharmacie associée
//     const client = await User.findOne({
//       _id: clientConnecte._id,
//       email: clientConnecte.email,
//       role: 'client',
//       'pharmaciesAssociees.pharmacyId': { $in: [req.body.pharmacyId] },
//     });

//     if (!client) {
//       console.warn('❌ [login] Client non autorisé:', { clientId: clientConnecte._id, email });
//       return res.status(403).json({
//         success: false,
//         message: 'Client non autorisé ou pharmacie non associée',
//       });
//     }

//     const pharmacie = await User.findOne({
//       email,
//       role: 'pharmacie',
//       'pharmacieInfo.statutDemande': 'approuvee',
//       isActive: true,
//     }).select('+motDePasse +pharmacieInfo.messageApprobation +pharmacieInfo.commentaireApprobation');

//     if (!pharmacie) {
//       console.warn('❌ [login] Pharmacie non trouvée:', { email });
//       return res.status(404).json({
//         success: false,
//         message: 'Pharmacie non trouvée',
//       });
//     }

//     console.log('🔍 [login] Vérification mot de passe temporaire:', {
//       motDePasse,
//       messageApprobation: pharmacie.pharmacieInfo.messageApprobation,
//       commentaireApprobation: pharmacie.pharmacieInfo.commentaireApprobation,
//     });

//     let isTemporaryPasswordValid = false;
//     if (pharmacie.motDePasseTemporaire) {
//       isTemporaryPasswordValid = motDePasse === (pharmacie.pharmacieInfo.messageApprobation || pharmacie.pharmacieInfo.commentaireApprobation);
//     }

//     let isPasswordValid = false;
//     try {
//       isPasswordValid = await pharmacie.comparePassword(motDePasse);
//     } catch (err) {
//       console.warn('⚠️ [login] Erreur comparePassword:', { error: err.message });
//     }

//     if (!isTemporaryPasswordValid && !isPasswordValid) {
//       console.warn('❌ [login] Mot de passe incorrect:', { email });
//       return res.status(401).json({
//         success: false,
//         message: 'Mot de passe incorrect',
//       });
//     }

//     const token = generateToken({
//       id: pharmacie._id,
//       email: pharmacie.email,
//       role: 'pharmacie', // Forcer le rôle à pharmacie
//       nom: pharmacie.nom,
//       prenom: pharmacie.prenom,
//     });

//     console.log('✅ [login] Connexion réussie:', {
//       email,
//       pharmacieId: pharmacie._id,
//     });

//     return res.status(200).json({
//       success: true,
//       token,
//       pharmacie: {
//         _id: pharmacie._id,
//         nomPharmacie: pharmacie.pharmacieInfo.nomPharmacie,
//         email: pharmacie.email,
//       },
//       doitChangerMotDePasse: pharmacie.motDePasseTemporaire,
//     });
//   } catch (error) {
//     console.error('❌ [login] Erreur:', {
//       erreur: error.message,
//       stack: error.stack,
//       email: req.body.email,
//     });
//     return res.status(500).json({
//       success: false,
//       message: 'Erreur serveur',
//     });
//   }
// };

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
  connexionPharmacie: exports.connexionPharmacie, // Utilisez exports.connexionPharmacie explicitement 
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
  listerDemandesIntegration: exports.listerDemandesIntegration,
  approuverDemandeIntegration:exports.approuverDemandeIntegration,
  demanderIntegration:exports.demanderIntegration,
  getDemandesIntegration:exports.getDemandesIntegration,
  checkCreatedByStatus:exports.checkCreatedByStatus,
  checkAssociation: exports.checkAssociation,
  loginByPassword: exports.loginByPassword,
  validerDemandeIntegration:exports.validerDemandeIntegration,
  getPharmacyById: exports.getPharmacyById,

  // login: exports.login,
};
