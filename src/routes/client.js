// C:\reactjs node mongodb\pharmacie-backend\src\routes\client.js

const express = require('express');
const router = express.Router();
const { User } = require('../models/User');
const Commande = require('../models/Commande');
const Notification = require('../models/Notification');
const { getIo } = require('../socket'); // Importer getIo depuis socket.js
const { authenticate } = require('../middlewares/auth');
const { checkRole } = require('../middlewares/roleCheck');
const { uploadDemandePharmacie } = require('../middlewares/multerConfig');
const mongoose = require('mongoose');
const { getApprovedPharmacies, searchMedicaments } = require('../controllers/adminController');
const { creerDemandePharmacie, getMaDemandePharmacie } = require('../controllers/demandePharmacieController');
const { createDetailedLog } = require('../utils/logUtils');

router.post('/commandes', authenticate, async (req, res) => {
  try {
    const { pharmacyId, medicaments, livraison, adresseLivraison } = req.body;
    console.log('📝 Création commande pour:', {
      pharmacyId,
      clientId: req.user?.id,
      medicaments,
      livraison,
      adresseLivraison,
    });

    // Validate input
    if (!pharmacyId || !mongoose.Types.ObjectId.isValid(pharmacyId)) {
      console.log('❌ pharmacyId invalide:', pharmacyId);
      createDetailedLog('CREER_COMMANDE_ECHEC', { raison: 'PHARMACIE_ID_INVALIDE', pharmacyId });
      return res.status(400).json({ success: false, message: 'ID de pharmacie invalide' });
    }
    const pharmacyObjectId = new mongoose.Types.ObjectId(pharmacyId);

    if (!medicaments || !Array.isArray(medicaments) || medicaments.length === 0) {
      console.log('❌ Medicaments invalides:', medicaments);
      createDetailedLog('CREER_COMMANDE_ECHEC', { raison: 'MEDICAMENTS_INVALIDE', medicaments });
      return res.status(400).json({ success: false, message: 'Liste de médicaments invalide ou vide' });
    }
    if (livraison && !adresseLivraison) {
      console.log('❌ Adresse de livraison manquante pour livraison:', livraison);
      createDetailedLog('CREER_COMMANDE_ECHEC', { raison: 'ADRESSE_LIVRAISON_MANQUANTE', livraison });
      return res.status(400).json({ success: false, message: 'Adresse de livraison requise pour livraison' });
    }

    // Vérifier la pharmacie
    const pharmacie = await User.findById(pharmacyObjectId);
    if (!pharmacie || pharmacie.role !== 'pharmacie' || !pharmacie.pharmacieInfo?.baseMedicament) {
      console.log('❌ Pharmacie non trouvée ou invalide:', pharmacyId);
      createDetailedLog('CREER_COMMANDE_ECHEC', { raison: 'PHARMACIE_NON_TROUVEE', pharmacyId });
      return res.status(404).json({ success: false, message: 'Pharmacie ou base non trouvée' });
    }

    // Vérifier les stocks
    const connection = mongoose.connection.useDb(pharmacie.pharmacieInfo.baseMedicament);
    const Medicament = connection.model('Medicament', require('../models/Medicament').schema, 'medicaments');
    let total = 0;
    const commandeMedicaments = [];

    for (const item of medicaments) {
      if (!item.medicamentId || !mongoose.Types.ObjectId.isValid(item.medicamentId) || !item.quantite || item.quantite <= 0) {
        console.log('❌ Item médicament invalide:', item);
        createDetailedLog('CREER_COMMANDE_ECHEC', {
          raison: 'ITEM_MEDICAMENT_INVALIDE',
          item,
        });
        return res.status(400).json({ success: false, message: 'Données de médicament invalides' });
      }
      if (!item.prix || typeof item.prix !== 'number' || item.prix <= 0) {
        console.log('❌ Prix invalide pour le médicament:', item);
        createDetailedLog('CREER_COMMANDE_ECHEC', {
          raison: 'PRIX_INVALIDE',
          item,
        });
        return res.status(400).json({ success: false, message: 'Prix du médicament invalide' });
      }

      const medicament = await Medicament.findById(item.medicamentId);
      if (!medicament) {
        console.log('❌ Médicament non trouvé:', item.medicamentId);
        createDetailedLog('CREER_COMMANDE_ECHEC', {
          raison: 'MEDICAMENT_NON_TROUVE',
          medicamentId: item.medicamentId,
        });
        return res.status(404).json({ success: false, message: `Médicament ${item.medicamentId} non trouvé` });
      }
      if (medicament.quantite_stock < item.quantite) {
        console.log('❌ Stock insuffisant pour:', medicament.nom);
        createDetailedLog('CREER_COMMANDE_ECHEC', {
          raison: 'STOCK_INSUFFISANT',
          medicamentId: item.medicamentId,
          stock: medicament.quantite_stock,
          demande: item.quantite,
        });
        return res.status(400).json({
          success: false,
          message: `Stock insuffisant pour ${medicament.nom}`,
        });
      }
      total += item.prix * item.quantite;
      commandeMedicaments.push({
        medicamentId: new mongoose.Types.ObjectId(item.medicamentId),
        quantite: item.quantite,
        prix: item.prix,
        nom: medicament.nom,
        image: medicament.image,
      });
    }

    // Créer la commande
    const commande = await Commande.create({
      userId: new mongoose.Types.ObjectId(req.user.id),
      pharmacyId: pharmacyObjectId,
      medicaments: commandeMedicaments,
      total,
      livraison,
      adresseLivraison: livraison ? adresseLivraison : undefined,
      statut: 'en_attente',
    });
    console.log('✅ Commande créée:', commande._id);
    createDetailedLog('CREER_COMMANDE_REUSSI', {
      commandeId: commande._id,
      userId: req.user.id,
      pharmacyId,
      total,
    });

    // Créer une notification pour la pharmacie
    const notificationPharmacie = await Notification.create({
      userId: pharmacyObjectId,
      type: 'commande',
      message: `Nouvelle commande (#${commande._id}) de ${req.user.nom} ${req.user.prenom}`,
      commandeId: commande._id,
    });
    console.log('🔔 Notification créée pour pharmacie:', notificationPharmacie._id);

    // Créer une notification pour le client
    const notificationClient = await Notification.create({
      userId: req.user.id,
      type: 'commande',
      message: `Votre commande (#${commande._id}) a été reçue par ${pharmacie.pharmacieInfo.nomPharmacie}`,
      commandeId: commande._id,
    });
    console.log('🔔 Notification créée pour client:', notificationClient._id);

    // Émettre les notifications via WebSocket
    const io = getIo();
    if (io) {
      // Notification pour la pharmacie
      io.to(pharmacyId.toString()).emit('nouvelleCommande', {
        commande,
        notification: {
          _id: notificationPharmacie._id,
          message: notificationPharmacie.message,
          date: notificationPharmacie.date,
          commandeId: commande._id,
        },
      });
      console.log('📡 Notification WebSocket envoyée à pharmacie:', pharmacyId);

      // Notification pour le client
      io.to(req.user.id.toString()).emit('nouvelleCommande', {
        commande,
        notification: {
          _id: notificationClient._id,
          message: notificationClient.message,
          date: notificationClient.date,
          commandeId: commande._id,
        },
      });
      console.log('📡 Notification WebSocket envoyée à client:', req.user.id);

      // Notifier les administrateurs
      const admins = await User.find({ role: 'admin' }).select('_id');
      for (const admin of admins) {
        const adminNotification = await Notification.create({
          userId: admin._id,
          type: 'commande',
          message: `Nouvelle commande (#${commande._id}) passée pour la pharmacie ${pharmacie.pharmacieInfo.nomPharmacie}`,
          commandeId: commande._id,
        });
        io.to(admin._id.toString()).emit('nouvelleCommande', {
          commande,
          notification: {
            _id: adminNotification._id,
            message: adminNotification.message,
            date: adminNotification.date,
            commandeId: commande._id,
          },
        });
        console.log('🔔 Notification admin créée:', adminNotification._id);
      }
    } else {
      console.warn('⚠️ Socket.IO non initialisé, notifications WebSocket non envoyées');
      createDetailedLog('WEBSOCKET_ECHEC', {
        raison: 'IO_UNDEFINED',
        pharmacyId,
        clientId: req.user.id,
      });
    }

    res.json({ success: true, commande });
  } catch (error) {
    console.error('❌ Erreur création commande:', {
      message: error.message,
      stack: error.stack,
      pharmacyId: req.body.pharmacyId,
      clientId: req.user?.id,
    });
    createDetailedLog('ERREUR_CREER_COMMANDE', {
      erreur: error.message,
      stack: error.stack,
      clientId: req.user?.id,
      pharmacyId: req.body.pharmacyId,
      medicaments: req.body.medicaments,
    });
    res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
  }
});

router.get('/commandes', authenticate, checkRole(['client']), async (req, res) => {
  try {
    const { page = 1, limit = 50, statut, dateDebut, dateFin } = req.query;
    const skip = (page - 1) * limit;

    const filter = { userId: req.user._id };

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
      .populate('pharmacyId', 'nom prenom pharmacieInfo.nomPharmacie pharmacieInfo.adresseGoogleMaps')
      .sort({ dateCommande: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Commande.countDocuments(filter);

    createDetailedLog('GET_COMMANDES_CLIENT_REUSSI', {
      userId: req.user._id,
      totalCommandes: total,
    });

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
    console.error('❌ Erreur récupération commandes client:', error);
    createDetailedLog('ERREUR_GET_COMMANDES_CLIENT', {
      erreur: error.message,
      stack: error.stack,
      userId: req.user?._id,
    });
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
    });
  }
  });

// Récupérer les détails d'une commande
router.get('/commandes/:id', authenticate, checkRole(['admin', 'pharmacie']), async (req, res) => {
  try {
    const commande = await Commande.findById(req.params.id)
      .populate('clientId', 'nom prenom email')
      .populate('pharmacyId', 'pharmacieInfo.nomPharmacie');
    if (!commande) {
      return res.status(404).json({ success: false, message: 'Commande non trouvée' });
    }
    res.json({ success: true, commande });
  } catch (error) {
    console.error('❌ Erreur récupération commande:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// Récupérer les notifications
router.get('/notifications', authenticate, checkRole(['client', 'pharmacie']), async (req, res) => {
    try {
    const notifications = await Notification.find({ userId: req.user.id, lu: false })
      .sort({ date: -1 })
      .limit(50);
    res.json({ success: true, data: { notifications } });
  } catch (error) {
    console.error('❌ Erreur récupération notifications:', error);
    createDetailedLog('ERREUR_GET_NOTIFICATIONS', {
      erreur: error.message,
      stack: error.stack,
      userId: req.user?.id,
    });
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// Marquer une notification comme lue
router.put('/notifications/:id/lu', authenticate, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { lu: true },
      { new: true }
    );
    if (!notification) {
      createDetailedLog('MARQUER_NOTIFICATION_LUE_ECHEC', {
        raison: 'NOTIFICATION_NON_TROUVEE',
        notificationId: req.params.id,
      });
      return res.status(404).json({ success: false, message: 'Notification non trouvée' });
    }
    createDetailedLog('MARQUER_NOTIFICATION_LUE_REUSSI', {
      notificationId: req.params.id,
      userId: req.user.id,
    });
    res.json({ success: true, message: 'Notification marquée comme lue' });
  } catch (error) {
    console.error('❌ Erreur marquage notification:', error);
    createDetailedLog('ERREUR_MARQUER_NOTIFICATION_LUE', {
      erreur: error.message,
      stack: error.stack,
      userId: req.user?.id,
    });
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// Autres routes
router.get('/pharmacies/:pharmacyId', authenticate, async (req, res) => {
  try {
    const pharmacy = await User.findById(req.params.pharmacyId).select('nom prenom email telephone pharmacieInfo');
    if (!pharmacy || pharmacy.role !== 'pharmacie') {
      return res.status(404).json({ success: false, message: 'Pharmacie non trouvée' });
    }
    res.json({ success: true, pharmacie: pharmacy });
  } catch (error) {
    console.error('❌ Erreur récupération pharmacie:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

router.post('/demande-pharmacie', authenticate, uploadDemandePharmacie, creerDemandePharmacie);
router.get('/ma-demande-pharmacie', authenticate, getMaDemandePharmacie);
router.get('/medicaments/search', authenticate, searchMedicaments);

router.get('/pharmacies', authenticate, async (req, res, next) => {
  try {
    const result = await getApprovedPharmacies(req, res, next);
    res.json({
      success: true,
      data: { pharmacies: result.data.pharmacies },
      pagination: result.data.pagination,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;