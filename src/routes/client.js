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
const webPush = require('web-push');
const AlertSubscription = require('../models/AlertSubscription');

router.get('/vapid-public-key', authenticate, (req, res) => {
  res.json({ success: true, publicKey: process.env.VAPID_PUBLIC_KEY });
});

// Configurer web-push avec vos clés VAPID
webPush.setVapidDetails(
  'mailto:julienguenoukpati825@gmail.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);


// Route pour enregistrer l'abonnement push
router.post('/subscribe', authenticate, async (req, res) => {
  try {
    const subscription = req.body;
    console.log('📥 [Subscribe] Abonnement reçu:', subscription);

    if (!subscription.endpoint || !subscription.keys?.auth || !subscription.keys?.p256dh) {
      createDetailedLog('SUBSCRIBE_ECHEC', { raison: 'SUBSCRIPTION_INVALIDE', subscription });
      return res.status(400).json({ success: false, message: 'Abonnement invalide' });
    }

    await User.findByIdAndUpdate(req.user.id, { pushSubscription: subscription });
    createDetailedLog('SUBSCRIBE_REUSSI', { userId: req.user.id });
    res.json({ success: true, message: 'Abonnement enregistré' });
  } catch (error) {
    console.error('❌ Erreur enregistrement abonnement:', error);
    createDetailedLog('ERREUR_SUBSCRIBE', {
      erreur: error.message,
      stack: error.stack,
      userId: req.user?.id,
    });
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});




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

    const pharmacie = await User.findById(pharmacyObjectId);
    if (!pharmacie || pharmacie.role !== 'pharmacie' || !pharmacie.pharmacieInfo?.baseMedicament) {
      console.log('❌ Pharmacie non trouvée ou invalide:', pharmacyId);
      createDetailedLog('CREER_COMMANDE_ECHEC', { raison: 'PHARMACIE_NON_TROUVEE', pharmacyId });
      return res.status(404).json({ success: false, message: 'Pharmacie ou base non trouvée' });
    }

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

    const notificationPharmacie = await Notification.create({
      userId: pharmacyObjectId,
      type: 'commande',
      message: `Nouvelle commande de medicaments de ${req.user.nom} ${req.user.prenom}`,
      commandeId: commande._id,
    });
    console.log('🔔 Notification créée pour pharmacie:', notificationPharmacie._id);

    const pharmacieUser = await User.findById(pharmacyId).select('pushSubscription');
    if (pharmacieUser && pharmacieUser.pushSubscription) {
      try {
        await webPush.sendNotification(pharmacieUser.pushSubscription, JSON.stringify({
          title: 'Nouvelle commande',
          message: `Nouvelle commande de medicaments de ${req.user.nom} ${req.user.prenom}`,
          icon: '/favicon.ico',
        }));
        console.log('📬 Notification push envoyée à la pharmacie:', pharmacyId);
      } catch (error) {
        console.error('❌ Erreur envoi notification push:', error);
        createDetailedLog('ERREUR_NOTIFICATION_PUSH', {
          erreur: error.message,
          pharmacyId,
        });
      }
    }

    const notificationClient = await Notification.create({
      userId: req.user.id,
      type: 'commande',
      message: `Votre commande (#${commande._id}) a été reçue par ${pharmacie.pharmacieInfo.nomPharmacie}`,
      commandeId: commande._id,
    });
    console.log('🔔 Notification créée pour client:', notificationClient._id);

    const io = getIo();
    if (io) {
      io.to(`user_${pharmacyId}`).emit('nouvelleCommande', {
        commande,
        notification: {
          _id: notificationPharmacie._id,
          message: notificationPharmacie.message,
          date: notificationPharmacie.date,
          commandeId: commande._id,
        },
      });
      console.log('📡 Notification WebSocket envoyée à pharmacie:', `user_${pharmacyId}`);

      io.to(`user_${req.user.id}`).emit('nouvelleCommande', {
        commande,
        notification: {
          _id: notificationClient._id,
          message: notificationClient.message,
          date: notificationClient.date,
          commandeId: commande._id,
        },
      });
      console.log('📡 Notification WebSocket envoyée à client:', `user_${req.user.id}`);

      const admins = await User.find({ role: 'admin' }).select('_id');
      for (const admin of admins) {
        const adminNotification = await Notification.create({
          userId: admin._id,
          type: 'commande',
          message: `Nouvelle commande de medicaments passée pour la pharmacie ${pharmacie.pharmacieInfo.nomPharmacie}`,
          commandeId: commande._id,
        });
        io.to(`user_${admin._id}`).emit('nouvelleCommande', {
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
      .populate('userId', 'nom prenom email') // Changé de clientId à userId
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

router.get('/commandes/:id', authenticate, checkRole(['client']), async (req, res) => {
  try {
    const commande = await Commande.findOne({ 
      _id: req.params.id, 
      userId: req.user.id // Vérifier que la commande appartient au client
    })
      .populate('userId', 'nom prenom email')
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

// Route pour marquer une notification comme lue avec notifications push/websocket
router.put('/notifications/:id/lu', authenticate, async (req, res) => {
  try {
    const { pharmacyId } = req.body;
    const notificationId = req.params.id;

    console.log('🔄 [updateNotification] Début traitement:', { notificationId, pharmacyId, userId: req.user.id });

    if (!pharmacyId || !mongoose.Types.ObjectId.isValid(pharmacyId)) {
      console.warn('⚠️ [updateNotification] pharmacyId invalide:', pharmacyId);
      createDetailedLog('UPDATE_NOTIFICATION_ECHEC', { raison: 'PHARMACIE_ID_INVALIDE', pharmacyId });
      return res.status(400).json({ success: false, message: 'ID de pharmacie invalide' });
    }

    const pharmacy = await User.findById(pharmacyId);
    if (!pharmacy || pharmacy.role !== 'pharmacie') {
      console.warn('⚠️ [updateNotification] Pharmacie non trouvée:', pharmacyId);
      createDetailedLog('UPDATE_NOTIFICATION_ECHEC', { raison: 'PHARMACIE_NON_TROUVEE', pharmacyId });
      return res.status(404).json({ success: false, message: 'Pharmacie non trouvée' });
    }

    const notification = await Notification.findOne({ _id: notificationId, userId: pharmacyId });
    if (!notification) {
      console.warn('⚠️ [updateNotification] Notification non trouvée:', notificationId);
      createDetailedLog('UPDATE_NOTIFICATION_ECHEC', { raison: 'NOTIFICATION_NON_TROUVEE', notificationId });
      return res.status(404).json({ success: false, message: 'Notification non trouvée' });
    }

    // Marquer la notification comme lue
    notification.lu = true;
    await notification.save();
    console.log('✅ [updateNotification] Notification marquée comme lue:', notificationId);

    // Trouver la commande associée pour obtenir l'userId du client
    const commande = await Commande.findById(notification.commandeId).populate('userId', 'pushSubscription nom prenom email');
    
    if (commande && commande.userId) {
      // Créer une notification pour le client
      const clientNotification = await Notification.create({
        userId: commande.userId._id,
        type: 'commande',
        message: `La pharmacie ${pharmacy.pharmacieInfo?.nomPharmacie || 'inconnue'} a consulté votre commande #${notification.commandeId}`,
        commandeId: notification.commandeId,
        lu: false,
      });
      console.log('🔔 [updateNotification] Notification client créée:', clientNotification._id);

      const io = getIo();
      
      // Envoyer une notification WebSocket au client
      if (io) {
        const notificationData = {
          notification: {
            _id: clientNotification._id,
            message: clientNotification.message,
            date: clientNotification.createdAt,
            commandeId: notification.commandeId,
            type: 'commande',
            lu: false
          },
        };

        io.to(`user_${commande.userId._id}`).emit('nouvelleNotification', notificationData);
        console.log('📡 [updateNotification] Notification WebSocket envoyée à client:', `user_${commande.userId._id}`);
        
        // Envoyer aussi un événement spécifique pour le marquage comme lu
        io.to(`user_${commande.userId._id}`).emit('notificationPharmacieAction', {
          action: 'marque_comme_lu',
          pharmacyId: pharmacyId,
          commandeId: notification.commandeId,
          notification: notificationData.notification
        });
      } else {
        console.warn('⚠️ [updateNotification] Socket.IO non disponible');
        createDetailedLog('WEBSOCKET_ECHEC', { raison: 'IO_UNDEFINED', pharmacyId, clientId: commande.userId._id });
      }

      // Envoyer une notification push au client
      if (commande.userId.pushSubscription) {
        try {
          const pushPayload = {
            type: 'NOTIFICATION_PHARMACIE',
            notificationId: clientNotification._id,
            title: 'Activité sur votre commande',
            message: `La pharmacie ${pharmacy.pharmacieInfo?.nomPharmacie || 'inconnue'} a consulté votre commande #${notification.commandeId}`,
            icon: '/favicon.ico',
            url: `http://localhost:3000/commandes`,
            timestamp: new Date().toISOString()
          };

          await webPush.sendNotification(
            commande.userId.pushSubscription,
            JSON.stringify(pushPayload)
          );
          console.log('📬 [updateNotification] Notification push envoyée à client:', commande.userId._id);
          createDetailedLog('NOTIFICATION_PUSH_REUSSI', { 
            userId: commande.userId._id, 
            pharmacyId, 
            commandeId: notification.commandeId 
          });
        } catch (pushError) {
          console.error('❌ [updateNotification] Erreur envoi notification push:', pushError);
          createDetailedLog('ERREUR_NOTIFICATION_PUSH', { 
            erreur: pushError.message, 
            userId: commande.userId._id,
            pharmacyId 
          });
        }
      } else {
        console.warn('⚠️ [updateNotification] Pas d\'abonnement push pour le client:', commande.userId._id);
      }
    } else {
      console.warn('⚠️ [updateNotification] Commande ou utilisateur non trouvé:', notification.commandeId);
    }

    res.json({
      success: true,
      message: 'Notification marquée comme lue',
      data: { notification }
    });
  } catch (error) {
    console.error('❌ [updateNotification] Erreur:', error);
    createDetailedLog('ERREUR_UPDATE_NOTIFICATION', {
      erreur: error.message,
      stack: error.stack,
      userId: req.user?._id,
      pharmacyId: req.body.pharmacyId,
      notificationId: req.params.id
    });
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
    });
  }
});

// Route pour mettre à jour le statut d'une commande avec notifications améliorées
router.put(
  '/commandes/statut',
  authenticate,
  checkRole(['pharmacie']),
  async (req, res) => {
    try {
      const { commandeId, statut, pharmacyId } = req.body;
      const validStatuts = ['en_attente', 'en_cours', 'terminée', 'annulée'];
      console.log('🔄 [PUT /commandes/statut] Mise à jour statut:', { commandeId, statut, pharmacyId });

      // Validations
      if (!commandeId || !mongoose.Types.ObjectId.isValid(commandeId)) {
        console.warn('⚠️ [PUT /commandes/statut] commandeId invalide:', commandeId);
        createDetailedLog('UPDATE_STATUT_ECHEC', { raison: 'COMMANDE_ID_INVALIDE', commandeId });
        return res.status(400).json({ success: false, message: 'ID de commande invalide' });
      }

      if (!pharmacyId || !mongoose.Types.ObjectId.isValid(pharmacyId)) {
        console.warn('⚠️ [PUT /commandes/statut] pharmacyId invalide:', pharmacyId);
        createDetailedLog('UPDATE_STATUT_ECHEC', { raison: 'PHARMACY_ID_INVALIDE', pharmacyId });
        return res.status(400).json({ success: false, message: 'ID de pharmacie invalide' });
      }

      if (!statut || !validStatuts.includes(statut)) {
        console.warn('⚠️ [PUT /commandes/statut] Statut invalide:', statut);
        createDetailedLog('UPDATE_STATUT_ECHEC', { raison: 'STATUT_INVALIDE', statut });
        return res.status(400).json({ success: false, message: 'Statut invalide' });
      }

      const pharmacy = await User.findById(pharmacyId);
      if (!pharmacy || pharmacy.role !== 'pharmacie') {
        console.warn('⚠️ [PUT /commandes/statut] Pharmacie non trouvée:', pharmacyId);
        createDetailedLog('UPDATE_STATUT_ECHEC', { raison: 'PHARMACIE_NON_TROUVEE', pharmacyId });
        return res.status(404).json({ success: false, message: 'Pharmacie non trouvée' });
      }

      const commande = await Commande.findOne({ _id: commandeId, pharmacyId })
        .populate('userId', 'pushSubscription nom prenom email')
        .populate('pharmacyId', 'pharmacieInfo.nomPharmacie');
      if (!commande) {
        console.warn('⚠️ [PUT /commandes/statut] Commande non trouvée:', commandeId);
        createDetailedLog('UPDATE_STATUT_ECHEC', { raison: 'COMMANDE_NON_TROUVEE', commandeId });
        return res.status(404).json({ success: false, message: 'Commande non trouvée ou non autorisée' });
      }

      // Sauvegarder l'ancien statut pour comparaison
      const ancienStatut = commande.statut;
      commande.statut = statut;
      await commande.save();

      // Messages personnalisés selon le statut
      const getMessageStatut = (statut) => {
        switch (statut) {
          case 'en_cours':
            return 'Votre commande est en cours de préparation';
          case 'terminée':
            return 'Votre commande est prête ! Vous pouvez venir la récupérer';
          case 'annulée':
            return 'Votre commande a été annulée';
          default:
            return `Votre commande est maintenant ${statut.replace('_', ' ')}`;
        }
      };

      // Créer une notification pour le client
      const messageClient = `${getMessageStatut(statut)} (#${commande._id})`;
      const notificationClient = await Notification.create({
        userId: commande.userId._id,
        type: 'commande',
        message: messageClient,
        commandeId: commande._id,
        lu: false,
      });
      console.log('🔔 [PUT /commandes/statut] Notification client créée:', notificationClient._id);

      // Créer une notification pour la pharmacie
      const notificationPharmacie = await Notification.create({
        userId: pharmacyId,
        type: 'commande',
        message: `Commande #${commande._id} mise à jour de "${ancienStatut}" vers "${statut}"`,
        commandeId: commande._id,
        lu: false,
      });
      console.log('🔔 [PUT /commandes/statut] Notification pharmacie créée:', notificationPharmacie._id);

      const io = getIo();
      if (io) {
        // Données de la commande mise à jour
        const commandeData = {
          ...commande.toObject(),
          statut: commande.statut,
        };

        // Notifier le client avec WebSocket
        const clientNotificationData = {
          commande: commandeData,
          notification: {
            _id: notificationClient._id,
            message: notificationClient.message,
            date: notificationClient.createdAt,
            commandeId: commande._id,
            type: 'commande',
            lu: false
          },
          ancienStatut,
          nouveauStatut: statut
        };

        io.to(`user_${commande.userId._id}`).emit('changementStatutCommande', clientNotificationData);
        io.to(`user_${commande.userId._id}`).emit('nouvelleNotification', {
          notification: clientNotificationData.notification
        });
        console.log('📡 [PUT /commandes/statut] Notification WebSocket envoyée à client:', `user_${commande.userId._id}`);

        // Notifier la pharmacie avec WebSocket
        const pharmacieNotificationData = {
          commande: commandeData,
          notification: {
            _id: notificationPharmacie._id,
            message: notificationPharmacie.message,
            date: notificationPharmacie.createdAt,
            commandeId: commande._id,
            type: 'commande',
            lu: false
          },
          ancienStatut,
          nouveauStatut: statut
        };

        io.to(`user_${pharmacyId}`).emit('changementStatutCommande', pharmacieNotificationData);
        console.log('📡 [PUT /commandes/statut] Notification WebSocket envoyée à pharmacie:', `user_${pharmacyId}`);

        // Notifier les admins
        const admins = await User.find({ role: 'admin' }).select('_id');
        for (const admin of admins) {
          const adminNotification = await Notification.create({
            userId: admin._id,
            type: 'commande',
            message: `Statut de la commande #${commande._id} modifié par ${pharmacy.pharmacieInfo?.nomPharmacie || 'une pharmacie'} : ${ancienStatut} → ${statut}`,
            commandeId: commande._id,
          });
          
          io.to(`user_${admin._id}`).emit('nouvelleNotification', {
            notification: {
              _id: adminNotification._id,
              message: adminNotification.message,
              date: adminNotification.createdAt,
              commandeId: commande._id,
              type: 'commande',
              lu: false
            }
          });
          console.log('🔔 [PUT /commandes/statut] Notification admin créée:', adminNotification._id);
        }
      } else {
        console.warn('⚠️ [PUT /commandes/statut] Socket.IO non initialisé');
        createDetailedLog('WEBSOCKET_ECHEC', { raison: 'IO_UNDEFINED', pharmacyId, clientId: commande.userId._id });
      }

      // Envoyer une notification push au client
      if (commande.userId.pushSubscription) {
        try {
          const pushPayload = {
            type: 'CHANGEMENT_STATUT',
            notificationId: notificationClient._id,
            title: 'Mise à jour de votre commande',
            message: messageClient,
            icon: '/favicon.ico',
            url: `http://localhost:3000/commandes`,
            commandeId: commande._id,
            statut: statut,
            pharmacie: commande.pharmacyId?.pharmacieInfo?.nomPharmacie || 'Pharmacie',
            timestamp: new Date().toISOString()
          };

          await webPush.sendNotification(
            commande.userId.pushSubscription,
            JSON.stringify(pushPayload)
          );
          console.log('📬 [PUT /commandes/statut] Notification push envoyée à client:', commande.userId.email);
          createDetailedLog('NOTIFICATION_PUSH_STATUT_REUSSI', { 
            userId: commande.userId._id, 
            commandeId, 
            statut, 
            pharmacyId 
          });
        } catch (pushError) {
          console.error('❌ [PUT /commandes/statut] Erreur envoi notification push client:', pushError);
          createDetailedLog('ERREUR_NOTIFICATION_PUSH', { 
            erreur: pushError.message, 
            userId: commande.userId._id,
            type: 'client_statut'
          });
        }
      } else {
        console.warn('⚠️ [PUT /commandes/statut] Pas d\'abonnement push pour le client:', commande.userId._id);
      }

      // Envoyer une notification push à la pharmacie
      const pharmacieUser = await User.findById(pharmacyId).select('pushSubscription');
      if (pharmacieUser && pharmacieUser.pushSubscription) {
        try {
          const pushPayloadPharmacie = {
            type: 'CONFIRMATION_STATUT',
            notificationId: notificationPharmacie._id,
            title: 'Statut de commande mis à jour',
            message: `Commande #${commande._id} : ${ancienStatut} → ${statut}`,
            icon: '/favicon.ico',
            url: `http://localhost:3000/pharmacie/commandes`,
            commandeId: commande._id,
            statut: statut,
            timestamp: new Date().toISOString()
          };

          await webPush.sendNotification(
            pharmacieUser.pushSubscription,
            JSON.stringify(pushPayloadPharmacie)
          );
          console.log('📬 [PUT /commandes/statut] Notification push envoyée à pharmacie:', pharmacyId);
          createDetailedLog('NOTIFICATION_PUSH_PHARMACIE_REUSSI', { pharmacyId, commandeId, statut });
        } catch (pushError) {
          console.error('❌ [PUT /commandes/statut] Erreur envoi notification push pharmacie:', pushError);
          createDetailedLog('ERREUR_NOTIFICATION_PUSH', { 
            erreur: pushError.message, 
            pharmacyId,
            type: 'pharmacie_statut'
          });
        }
      } else {
        console.warn('⚠️ [PUT /commandes/statut] Pas d\'abonnement push pour la pharmacie:', pharmacyId);
      }

      console.log('✅ [PUT /commandes/statut] Statut mis à jour avec succès:', { commandeId, ancienStatut, nouveauStatut: statut });
      createDetailedLog('UPDATE_STATUT_REUSSI', { commandeId, ancienStatut, nouveauStatut: statut, pharmacyId });
      
      res.json({ 
        success: true, 
        message: 'Statut mis à jour avec succès', 
        commande: {
          ...commande.toObject(),
          statut: commande.statut
        },
        ancienStatut,
        nouveauStatut: statut
      });
    } catch (error) {
      console.error('❌ [PUT /commandes/statut] Erreur:', error);
      createDetailedLog('ERREUR_UPDATE_STATUT_COMMANDE', {
        erreur: error.message,
        stack: error.stack,
        pharmacyId: req.body.pharmacyId,
        commandeId: req.body.commandeId,
      });
      res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
    }
  }
);

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


router.post('/alerts/subscribe', authenticate, checkRole(['client']), async (req, res) => {
  try {
    const { medicamentId, pharmacyId } = req.body;
    if (!medicamentId || !pharmacyId) {
      return res.status(400).json({ success: false, message: 'medicamentId et pharmacyId requis' });
    }
    const AlertSubscription = require('../models/AlertSubscription');
    const alert = new AlertSubscription({
      userId: req.user.id,
      medicamentId,
      pharmacyId
    });
    await alert.save();
    res.json({ success: true, message: 'Abonné à l\'alerte avec succès' });
  } catch (error) {
    console.error('❌ Erreur abonnement alerte:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

module.exports = router;