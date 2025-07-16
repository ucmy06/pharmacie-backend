// C:\reactjs node mongodb\pharmacie-backend\src\controllers\pharmacieController.js


const { User, ConnexionPharmacie } = require('../models/User');
const { sendPharmacyConnectionNotification } = require('../utils/emailUtils');
const multer = require('multer');
const path = require('path');

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
});

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
const getPharmacieById = async (req, res) => {
  try {
    const { pharmacieId } = req.params;

    const pharmacie = await User.findById(pharmacieId)
      .select('nom prenom pharmacieInfo createdAt')
      .where('role').equals('pharmacie')
      .where('pharmacieInfo.statutDemande').equals('approuvee')
      .where('isActive').equals(true);

    if (!pharmacie) {
      return res.status(404).json({
        success: false,
        message: 'Pharmacie non trouvée'
      });
    }

    res.json({
      success: true,
      data: { pharmacie }
    });

  } catch (error) {
    console.error('❌ Erreur récupération pharmacie:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
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

module.exports = {
  getPharmacies,
  getPharmacieById,
  connexionPharmacie,
  getMesConnexions,
  getConnexionsClients,
  updateHoraires,
  toggleGarde,
  toggleLivraison,
  uploadDocuments,
  getPharmaciesDeGarde,
  rechercheGeolocalisee
};