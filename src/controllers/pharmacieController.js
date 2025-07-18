// C:\reactjs node mongodb\pharmacie-backend\src\controllers\pharmacieController.js


const { User, ConnexionPharmacie } = require('../models/User');
const { sendPharmacyConnectionNotification } = require('../utils/emailUtils');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../utils/tokenUtils');
const { sendEmailToAdmin } = require('../utils/emailUtils');
const { sendSuppressionRequestEmail } = require('../utils/emailUtils');
const { sendPharmacyAccessNotification } = require('../utils/emailUtils');
const jwt = require('jsonwebtoken');
const axios = require('axios');



// Connexion pharmacie
const createDetailedLog = (action, data, additionalInfo = {}) => {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    action,
    data: JSON.parse(JSON.stringify(data)),
    additionalInfo,
    mongodbOperation: null,
  };
  console.log('🔍 LOG DÉTAILLÉ:', JSON.stringify(logEntry, null, 2));
  return logEntry;
};

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

exports.loginPharmacie = async (req, res) => {
  try {
    const { email, motDePasse, clientConnecte } = req.body;

    createDetailedLog('CONNEXION_PHARMACIE_DEBUT', {
      email,
      motDePasse: motDePasse ? `[MASQUÉ - ${motDePasse.length} caractères]` : null,
      clientConnecte,
      headers: req.headers,
      body: {
        ...req.body,
        motDePasse: motDePasse ? `[MASQUÉ - ${motDePasse.length} caractères]` : null,
      },
    });

    console.log('🔍 RECHERCHE PHARMACIE DANS MONGODB...');
    const mongoQuery = { email, role: 'pharmacie' };
    logMongoOperation('FIND_PHARMACIE', mongoQuery);

    const pharmacie = await User.findOne(mongoQuery);

    if (!pharmacie) {
      logMongoOperation('FIND_PHARMACIE', mongoQuery, null, new Error('Pharmacie non trouvée'));
      createDetailedLog('CONNEXION_PHARMACIE_ECHEC', {
        raison: 'PHARMACIE_NON_TROUVEE',
        emailRecherche: email,
      });
      return res.status(400).json({ message: 'Email incorrect' });
    }

    logMongoOperation('FIND_PHARMACIE', mongoQuery, {
      _id: pharmacie._id,
      email: pharmacie.email,
      role: pharmacie.role,
      motDePasseTemporaire: pharmacie.motDePasseTemporaire,
      pharmacieInfo: pharmacie.pharmacieInfo,
    });

    createDetailedLog('PHARMACIE_TROUVEE', {
      pharmacieId: pharmacie._id,
      email: pharmacie.email,
      motDePasseTemporaire: pharmacie.motDePasseTemporaire,
      statutDemande: pharmacie.pharmacieInfo?.statutDemande,
      motDePasseHashe: pharmacie.motDePasse ? `[HASH - ${pharmacie.motDePasse.length} caractères]` : null,
    });

    if (!pharmacie.pharmacieInfo || pharmacie.pharmacieInfo.statutDemande !== 'approuvee') {
      createDetailedLog('CONNEXION_PHARMACIE_ECHEC', {
        raison: 'PHARMACIE_NON_APPROUVEE',
        statutActuel: pharmacie.pharmacieInfo?.statutDemande,
      });
      return res.status(400).json({ message: 'Pharmacie non approuvée' });
    }

    console.log('🔐 VÉRIFICATION MOT DE PASSE...');
    createDetailedLog('VERIFICATION_MOT_DE_PASSE', {
      motDePasseSaisi: motDePasse ? `[MASQUÉ - ${motDePasse.length} caractères]` : null,
      motDePasseHasheDB: pharmacie.motDePasse ? `[HASH - ${pharmacie.motDePasse.length} caractères]` : null,
    });

    const isMatch = await pharmacie.comparePassword(motDePasse); // Use schema method

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

    createDetailedLog('TOKEN_GENERE', {
      payload: tokenPayload,
      token: token ? `[TOKEN - ${token.length} caractères]` : null,
    });

    if (clientConnecte) {
      if (!clientConnecte._id || !clientConnecte.nom || !clientConnecte.prenom || !clientConnecte.email || !clientConnecte.telephone) {
        createDetailedLog('CONNEXION_PHARMACIE_ECHEC', {
          raison: 'CLIENT_CONNECTE_INVALIDE',
          clientConnecte,
        });
        return res.status(400).json({ message: 'Données client connecté incomplètes' });
      }

      console.log('💾 SAUVEGARDE CONNEXION PHARMACIE...');
      const connexionData = {
        utilisateur: clientConnecte._id,
        pharmacie: pharmacie._id,
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

      logMongoOperation('CREATE_CONNEXION_PHARMACIE', connexionData, {
        _id: connexionSauvegardee._id,
        dateConnexion: connexionSauvegardee.dateConnexion,
      });

      createDetailedLog('CONNEXION_PHARMACIE_LOGGEE', {
        connexionId: connexionSauvegardee._id,
        clientId: clientConnecte._id,
        pharmacieId: pharmacie._id,
      });

      try {
        await sendPharmacyAccessNotification(pharmacie.email, clientConnecte);
        console.log('✅ Connexion loggée et notification envoyée');
      } catch (logError) {
        console.error('❌ Erreur lors du logging de la connexion:', logError);
        createDetailedLog('ERREUR_LOGGING_CONNEXION', {
          erreur: logError.message,
          stack: logError.stack,
        });
      }
    }

    const reponse = {
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
    };

    createDetailedLog('CONNEXION_PHARMACIE_REUSSIE', {
      reponse: {
        ...reponse,
        token: token ? `[TOKEN - ${token.length} caractères]` : null,
      },
    });

    res.json(reponse);
  } catch (error) {
    console.error('❌ Erreur loginPharmacie:', error);
    createDetailedLog('ERREUR_CONNEXION_PHARMACIE', {
      erreur: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

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

    createDetailedLog('CHANGEMENT_MOT_DE_PASSE_DEBUT', {
      userId: user._id,
      userEmail: user.email,
      nouveauMotDePasse: nouveauMotDePasse ? `[MASQUÉ - ${nouveauMotDePasse.length} caractères]` : null,
      motDePasseTemporaireActuel: user.motDePasseTemporaire,
      headers: req.headers,
      body: {
        ...req.body,
        nouveauMotDePasse: nouveauMotDePasse ? `[MASQUÉ - ${nouveauMotDePasse.length} caractères]` : null,
      },
    });

    console.log('🔐 VALIDATION NOUVEAU MOT DE PASSE...');
    if (!nouveauMotDePasse || nouveauMotDePasse.length < 6) {
      createDetailedLog('CHANGEMENT_MOT_DE_PASSE_ECHEC', {
        raison: 'MOT_DE_PASSE_TROP_COURT',
        longueur: nouveauMotDePasse ? nouveauMotDePasse.length : 0,
      });
      return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 6 caractères.' });
    }

    console.log('💾 MISE À JOUR DANS MONGODB...');
    const anciennesValeurs = {
      motDePasse: user.motDePasse,
      motDePasseTemporaire: user.motDePasseTemporaire,
    };

    user.motDePasse = nouveauMotDePasse;
    user.motDePasseTemporaire = false;

    const updateData = {
      userId: user._id,
      anciennesValeurs: {
        motDePasse: anciennesValeurs.motDePasse ? `[ANCIEN HASH - ${anciennesValeurs.motDePasse.length} caractères]` : null,
        motDePasseTemporaire: anciennesValeurs.motDePasseTemporaire,
      },
      nouvellesValeurs: {
        motDePasse: '[EN ATTENTE DE HACHAGE]',
        motDePasseTemporaire: false,
      },
    };

    logMongoOperation('UPDATE_MOT_DE_PASSE', updateData);

    await user.save();

    logMongoOperation('UPDATE_MOT_DE_PASSE', updateData, {
      success: true,
      userId: user._id,
      motDePasseTemporaire: user.motDePasseTemporaire,
    });

    createDetailedLog('CHANGEMENT_MOT_DE_PASSE_REUSSI', {
      userId: user._id,
      userEmail: user.email,
      motDePasseTemporaireApres: user.motDePasseTemporaire,
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

// Nouveau : Changer mot de passe dans le profil (avec ancien mot de passe)
exports.updateProfilePassword = async (req, res) => {
  try {
    const { ancienMotDePasse, nouveauMotDePasse } = req.body;
    const user = await User.findById(req.user._id);
    if (!user || user.role !== 'pharmacie') {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }
    const isMatch = await bcrypt.compare(ancienMotDePasse, user.motDePasse);
    if (!isMatch) {
      return res.status(400).json({ message: 'Ancien mot de passe incorrect' });
    }
    if (!nouveauMotDePasse || nouveauMotDePasse.length < 6) {
      return res.status(400).json({ message: 'Le nouveau mot de passe doit contenir au moins 6 caractères.' });
    }
    const salt = await bcrypt.genSalt(10);
    user.motDePasse = await bcrypt.hash(nouveauMotDePasse, salt);
    await user.save();
    res.json({ message: 'Mot de passe mis à jour avec succès' });
  } catch (error) {
    console.error('Erreur updateProfilePassword:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// exports.changePassword = async (req, res) => {
//   try {
//     const { nouveauMotDePasse } = req.body;
//     const pharmacieId = req.user.id; // Supposant que req.user est défini via un middleware d'authentification

//     const pharmacie = await Pharmacie.findById(pharmacieId);
//     if (!pharmacie) {
//       return res.status(404).json({ message: 'Pharmacie non trouvée' });
//     }

//     // Hacher le nouveau mot de passe
//     const salt = await bcrypt.genSalt(10);
//     pharmacie.motDePasse = await bcrypt.hash(nouveauMotDePasse, salt);
//     pharmacie.doitChangerMotDePasse = false; // Réinitialiser le drapeau
//     await pharmacie.save();

//     res.json({ message: 'Mot de passe changé avec succès' });
//   } catch (error) {
//     console.error('Erreur changePassword:', error);
//     res.status(500).json({ message: 'Erreur serveur' });
//   }
// };

// Changement du mot de passe temporaire



// Demande de suppression de compte
exports.demanderSuppression = async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user || user.role !== 'pharmacie') return res.status(403).json({ message: 'Non autorisé.' });

  if (user.demandeSuppression) return res.status(400).json({ message: 'Demande déjà envoyée.' });

  user.demandeSuppression = true;
  await user.save();

  await sendSuppressionRequestEmail(user);

  res.json({ message: 'Demande de suppression envoyée à l’administrateur.' });
};

exports.demanderModification = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user || user.role !== 'pharmacie') {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }

    const { nom, email, numero, positionGoogleMaps } = req.body;
    const photo = req.file ? req.file.path : null;

    // Enregistrer la demande de modification (par exemple, dans une collection séparée ou dans user)
    user.demandeModification = {
      nom: nom || user.nom,
      email: email || user.email,
      numero: numero || user.telephone,
      positionGoogleMaps: positionGoogleMaps || user.pharmacieInfo?.adresseGoogleMaps,
      photo: photo || user.pharmacieInfo?.photo,
      statut: 'en_attente',
      dateDemande: new Date()
    };
    await user.save();

    // Envoyer une notification à l'admin (optionnel)
    // await sendModificationRequestEmail(user, adminEmail);

    res.json({ message: 'Demande de modification envoyée avec succès' });
  } catch (error) {
    console.error('Erreur demanderModification:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Mise à jour du profil pharmacie
exports.updateProfilPharmacie = async (req, res) => {
  const { nom, localisation, telephone, emailPro, horaires, reseauxSociaux } = req.body;

  try {
    const pharmacie = await User.findByIdAndUpdate(req.user.id, {
      nom, localisation, telephone, emailPro, horaires, reseauxSociaux
    }, { new: true });

    res.status(200).json({ message: "Profil mis à jour", pharmacie });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
};





/**
 * Configuration multer pour l'upload de fichiers
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/pharmacies/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);      
    cb(null, `${req.user._id}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Type de fichier non autorisé'));
    }
  }
}).single('photo'); // Pour un seul fichier


/**
 * Obtenir toutes les pharmacies actives avec filtres
 */
const getPharmacies = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      ville,
      livraisonDisponible,
      estDeGarde,
      ouvertMaintenant
    } = req.query;

    const filter = {
      role: 'pharmacie',
      'pharmacieInfo.statutDemande': 'approuvee',
      isActive: true
    };

    // Filtres de recherche
    if (search) {
      filter.$or = [
        { 'pharmacieInfo.nomPharmacie': { $regex: search, $options: 'i' } },
        { 'pharmacieInfo.adresseGoogleMaps': { $regex: search, $options: 'i' } }
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

    // Filtre pour les pharmacies ouvertes maintenant
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
    console.error('❌ Erreur récupération pharmacies:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

/**
 * Obtenir une pharmacie par ID
 */
exports.getPharmacieById = async (req, res) => {
  try {
    const { pharmacieId } = req.params;
    console.log('🔍 [getPharmacieById] pharmacieId:', pharmacieId);

    // Valider que pharmacieId est un ObjectId valide
    if (!mongoose.Types.ObjectId.isValid(pharmacieId)) {
      createDetailedLog('GET_PHARMACIE_BY_ID_ECHEC', {
        raison: 'ID_INVALIDE',
        pharmacieId,
      });
      return res.status(400).json({ message: 'ID de pharmacie invalide' });
    }

    const pharmacie = await User.findById(pharmacieId).select('-motDePasse');
    console.log('🔍 [getPharmacieById] Pharmacie trouvée:', pharmacie ? { id: pharmacie._id, email: pharmacie.email, role: pharmacie.role } : 'NULL');

    if (!pharmacie || pharmacie.role !== 'pharmacie') {
      createDetailedLog('GET_PHARMACIE_BY_ID_ECHEC', {
        raison: 'PHARMACIE_NON_TROUVEE',
        pharmacieId,
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
      pharmacieId: req.params.pharmacieId,
    });
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

/**
 * Connexion utilisateur à une pharmacie (NOUVELLE FONCTION)
 * Enregistre la connexion et notifie la pharmacie
 */
const connexionPharmacie = async (req, res) => {
  try {
    const { pharmacieId, typeConnexion, message } = req.body;

    // Vérifier que la pharmacie existe et est approuvée
    const pharmacie = await User.findOne({
      _id: pharmacieId,
      role: 'pharmacie',
      'pharmacieInfo.statutDemande': 'approuvee',
      isActive: true
    });

    if (!pharmacie) {
      return res.status(404).json({
        success: false,
        message: 'Pharmacie non trouvée ou non approuvée'
      });
    }

    // Vérifier que l'utilisateur n'est pas déjà connecté récemment (éviter le spam)
    const connexionRecente = await ConnexionPharmacie.findOne({
      utilisateur: req.user._id,
      pharmacie: pharmacieId,
      dateConnexion: { $gte: new Date(Date.now() - 5 * 60 * 1000) } // 5 minutes
    });

    if (connexionRecente) {
      return res.status(400).json({
        success: false,
        message: 'Vous êtes déjà connecté à cette pharmacie récemment'
      });
    }

    // Enregistrer la connexion
    const connexion = new ConnexionPharmacie({
      utilisateur: req.user._id,
      pharmacie: pharmacieId,
      typeConnexion: typeConnexion || 'consultation',
      informationsUtilisateur: {
        nom: req.user.nom,
        prenom: req.user.prenom,
        email: req.user.email,
        telephone: req.user.telephone,
        adresse: req.user.adresse
      },
      message: message || ''
    });

    await connexion.save();

    // Envoyer notification par email à la pharmacie
    await sendPharmacyConnectionNotification(
      pharmacie.email,
      {
        nom: req.user.nom,
        prenom: req.user.prenom,
        email: req.user.email,
        telephone: req.user.telephone,
        adresse: req.user.adresse,
        typeConnexion: typeConnexion || 'consultation',
        message: message || ''
      },
      {
        nomPharmacie: pharmacie.pharmacieInfo.nomPharmacie,
        pharmacienNom: `${pharmacie.prenom} ${pharmacie.nom}`
      }
    );

    res.json({
      success: true,
      message: 'Connexion à la pharmacie enregistrée avec succès',
      data: {
        connexionId: connexion._id,
        pharmacie: {
          _id: pharmacie._id,
          nom: pharmacie.nom,
          prenom: pharmacie.prenom,
          nomPharmacie: pharmacie.pharmacieInfo.nomPharmacie,
          adresseGoogleMaps: pharmacie.pharmacieInfo.adresseGoogleMaps,
          livraisonDisponible: pharmacie.pharmacieInfo.livraisonDisponible,
          estDeGarde: pharmacie.pharmacieInfo.estDeGarde,
          heuresOuverture: pharmacie.pharmacieInfo.heuresOuverture,
          telephone: pharmacie.telephone
        }
      }
    });

  } catch (error) {
    console.error('❌ Erreur connexion pharmacie:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la connexion à la pharmacie'
    });
  }
};

/**
 * Obtenir l'historique des connexions de l'utilisateur
 */
const getMesConnexions = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const connexions = await ConnexionPharmacie.find({
      utilisateur: req.user._id
    })
    .populate('pharmacie', 'nom prenom pharmacieInfo.nomPharmacie pharmacieInfo.adresseGoogleMaps telephone')
    .sort({ dateConnexion: -1 })
    .skip(skip)
    .limit(parseInt(limit));

    const total = await ConnexionPharmacie.countDocuments({
      utilisateur: req.user._id
    });

    res.json({
      success: true,
      data: {
        connexions,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('❌ Erreur récupération connexions:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

/**
 * Obtenir les connexions des clients à ma pharmacie (pour les pharmacies)
 */
const getConnexionsClients = async (req, res) => {
  try {
    const { page = 1, limit = 10, dateDebut, dateFin } = req.query;
    const skip = (page - 1) * limit;

    const filter = { pharmacie: req.user._id };

    // Filtre par date si spécifié
    if (dateDebut && dateFin) {
      filter.dateConnexion = {
        $gte: new Date(dateDebut),
        $lte: new Date(dateFin)
      };
    }

    const connexions = await ConnexionPharmacie.find(filter)
      .populate('utilisateur', 'nom prenom email telephone')
      .sort({ dateConnexion: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ConnexionPharmacie.countDocuments(filter);

    // Statistiques supplémentaires
    const stats = await ConnexionPharmacie.aggregate([
      { $match: { pharmacie: req.user._id } },
      {
        $group: {
          _id: '$typeConnexion',
          count: { $sum: 1 }
        }
      }
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
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('❌ Erreur récupération connexions clients:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

/**
 * Mettre à jour les horaires d'ouverture (Pharmacie connectée)
 */
const updateHoraires = async (req, res) => {
  try {
    const { heuresOuverture } = req.body;

    if (!heuresOuverture) {
      return res.status(400).json({
        success: false,
        message: 'Horaires d\'ouverture requis'
      });
    }

    const pharmacie = await User.findByIdAndUpdate(
      req.user._id,
      { 'pharmacieInfo.heuresOuverture': heuresOuverture },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Horaires mis à jour avec succès',
      data: { 
        heuresOuverture: pharmacie.pharmacieInfo.heuresOuverture 
      }
    });

  } catch (error) {
    console.error('❌ Erreur mise à jour horaires:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

/**
 * Définir/Retirer le statut de garde
 */
const toggleGarde = async (req, res) => {
  try {
    const { estDeGarde, periodeGarde } = req.body;

    const updateData = { 'pharmacieInfo.estDeGarde': estDeGarde };
    
    if (estDeGarde && periodeGarde) {
      updateData['pharmacieInfo.periodeGarde'] = periodeGarde;
    } else if (!estDeGarde) {
      updateData['pharmacieInfo.periodeGarde'] = null;
    }

    const pharmacie = await User.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true }
    );

    res.json({
      success: true,
      message: estDeGarde ? 'Pharmacie mise en garde' : 'Pharmacie retirée de la garde',
      data: { 
        estDeGarde: pharmacie.pharmacieInfo.estDeGarde,
        periodeGarde: pharmacie.pharmacieInfo.periodeGarde
      }
    });

  } catch (error) {
    console.error('❌ Erreur modification statut garde:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

/**
 * Activer/Désactiver la livraison
 */
const toggleLivraison = async (req, res) => {
  try {
    const { livraisonDisponible } = req.body;

    const pharmacie = await User.findByIdAndUpdate(
      req.user._id,
      { 'pharmacieInfo.livraisonDisponible': livraisonDisponible },
      { new: true }
    );

    res.json({
      success: true,
      message: `Livraison ${livraisonDisponible ? 'activée' : 'désactivée'}`,
      data: { 
        livraisonDisponible: pharmacie.pharmacieInfo.livraisonDisponible 
      }
    });

  } catch (error) {
    console.error('❌ Erreur modification livraison:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

/**
 * Upload de documents de vérification
 */
const uploadDocuments = async (req, res) => {
  try {
    upload.array('documents', 5)(req, res, async (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Aucun fichier fourni'
        });
      }

      const documents = req.files.map(file => ({
        nomFichier: file.originalname,
        cheminFichier: file.path,
        typeFichier: file.mimetype,
        tailleFichier: file.size,
        dateUpload: new Date(),
        statutVerification: 'en_attente'
      }));

      const pharmacie = await User.findById(req.user._id);
      pharmacie.pharmacieInfo.documentsVerification.push(...documents);
      await pharmacie.save();

      res.json({
        success: true,
        message: 'Documents uploadés avec succès',
        data: { 
          documentsAjoutes: documents.length,
          totalDocuments: pharmacie.pharmacieInfo.documentsVerification.length
        }
      });
    });

  } catch (error) {
    console.error('❌ Erreur upload documents:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

/**
 * Obtenir les pharmacies de garde actuelles
 */
const getPharmaciesDeGarde = async (req, res) => {
  try {
    const pharmaciesDeGarde = await User.find({
      role: 'pharmacie',
      'pharmacieInfo.statutDemande': 'approuvee',
      'pharmacieInfo.estDeGarde': true,
      isActive: true
    })
    .select('nom prenom pharmacieInfo.nomPharmacie pharmacieInfo.adresseGoogleMaps pharmacieInfo.periodeGarde pharmacieInfo.livraisonDisponible telephone');

    res.json({
      success: true,
      data: { 
        pharmaciesDeGarde,
        count: pharmaciesDeGarde.length
      }
    });

  } catch (error) {
    console.error('❌ Erreur récupération pharmacies de garde:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

// Changer mot de passe initial


// Obtenir le profil pharmacie
exports.getMonProfil = async (req, res) => {
  try {
    console.log('🔍 [getMonProfil] req.user:', req.user ? { id: req.user._id, email: req.user.email, role: req.user.role } : 'NULL');
    if (!req.user || !req.user._id) {
      createDetailedLog('GET_MON_PROFIL_ECHEC', { raison: 'UTILISATEUR_NON_AUTHENTIFIE' });
      return res.status(401).json({ message: 'Utilisateur non authentifié' });
    }

    const user = await User.findById(req.user._id).select('-motDePasse');
    console.log('🔍 [getMonProfil] Utilisateur trouvé:', user ? { id: user._id, email: user.email, role: user.role } : 'NULL');

    if (!user) {
      createDetailedLog('GET_MON_PROFIL_ECHEC', { raison: 'UTILISATEUR_NON_TROUVE', userId: req.user._id });
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    if (user.role !== 'pharmacie') {
      createDetailedLog('GET_MON_PROFIL_ECHEC', { raison: 'ROLE_INCORRECT', role: user.role });
      return res.status(403).json({ message: 'Accès non autorisé' });
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
        role: user.role,
        pharmacieInfo: user.pharmacieInfo,
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

// Modifier le profil (champs modifiables librement)
exports.updateMonProfil = async (req, res) => {
  const { heureOuverture, heureFermeture, livraisonDisponible, joursGarde } = req.body;

  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });

  if (heureOuverture !== undefined) user.informationsPharmacie.heureOuverture = heureOuverture;
  if (heureFermeture !== undefined) user.informationsPharmacie.heureFermeture = heureFermeture;
  if (livraisonDisponible !== undefined) user.informationsPharmacie.livraisonDisponible = livraisonDisponible;
  if (joursGarde !== undefined) user.informationsPharmacie.joursGarde = joursGarde;

  await user.save();

  res.json({ message: 'Profil mis à jour.' });
};


/**
 * Recherche géolocalisée de pharmacies (à implémenter plus tard)
 */
const rechercheGeolocalisee = async (req, res) => {
  try {
    // TODO: Implémenter la recherche par géolocalisation
    // Nécessite l'ajout de coordonnées GPS dans le modèle
    
    res.status(501).json({
      success: false,
      message: 'Fonctionnalité en développement'
    });

  } catch (error) {
    console.error('❌ Erreur recherche géolocalisée:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};
// At the end of your pharmacieController.js file, replace the module.exports with this:


exports.uploadDemandeModification = upload;

module.exports = {
  // Existing exports
  getPharmacies,
  connexionPharmacie,
  getMesConnexions,
  getConnexionsClients,
  updateHoraires,
  toggleGarde,
  toggleLivraison,
  uploadDocuments,
  getPharmaciesDeGarde,
  rechercheGeolocalisee,
  
  // Add the missing exports (these are defined with exports.functionName)
  changerMotDePasseInitial: exports.changerMotDePasseInitial,
  demanderSuppression: exports.demanderSuppression,
  updateProfilPharmacie: exports.updateProfilPharmacie,
  getMonProfil: exports.getMonProfil,
  updateMonProfil: exports.updateMonProfil,
  updateProfilePassword: exports.updateProfilePassword, // Nouvelle fonction
  demanderModification: exports.demanderModification,
  uploadDemandeModification: exports.uploadDemandeModification,
  loginPharmacie: exports.loginPharmacie,
  getPharmacieById: exports.getPharmacieById // Ajoutez ceci
};