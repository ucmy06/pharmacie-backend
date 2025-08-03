// C:\reactjs node mongodb\pharmacie-backend\src\routes\commandes.js

const express = require('express');
const router = express.Router();
const pharmacyCommandesRouter = express.Router();
const mongoose = require('mongoose');
const { authenticate } = require('../middlewares/auth');
const { checkRole } = require('../middlewares/roleCheck');
const Commande = require('../models/Commande');
const { User } = require('../models/User');
const Notification = require('../models/Notification');
const { getIo } = require('../socket');
const { createDetailedLog } = require('../utils/logUtils');
const webPush = require('web-push');

pharmacyCommandesRouter.get('/', authenticate, checkRole(['pharmacie']), async (req, res) => {
  try {
    const { page = 1, limit = 50, statut } = req.query;
    const skip = (page - 1) * limit;

    const filter = { pharmacyId: req.user._id };
    if (statut) {
      filter.statut = statut;
    }

    const commandes = await Commande.find(filter)
      .populate('userId', 'nom prenom email telephone')
      .populate('pharmacyId', 'pharmacieInfo.nomPharmacie')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Commande.countDocuments(filter);

    console.log('✅ [GET /pharmacies/commandes] Commandes trouvées:', commandes.length);
    createDetailedLog('GET_COMMANDES_PHARMACIE_REUSSI', {
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
    console.error('❌ Erreur récupération commandes pharmacie:', error);
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
});

pharmacyCommandesRouter.put('/statut', authenticate, checkRole(['pharmacie']), async (req, res) => {
  try {
    const { commandeId, statut, pharmacyId } = req.body;
    const validStatuts = ['en_attente', 'en_cours', 'terminée', 'annulée'];
    console.log('🔄 [PUT /pharmacies/statut] Mise à jour statut:', { commandeId, statut, pharmacyId });

    if (!commandeId || !mongoose.Types.ObjectId.isValid(commandeId)) {
      console.warn('⚠️ [PUT /pharmacies/statut] commandeId invalide:', commandeId);
      createDetailedLog('UPDATE_STATUT_ECHEC', { raison: 'COMMANDE_ID_INVALIDE', commandeId });
      return res.status(400).json({ success: false, message: 'ID de commande invalide' });
    }

    if (!pharmacyId || !mongoose.Types.ObjectId.isValid(pharmacyId)) {
      console.warn('⚠️ [PUT /pharmacies/statut] pharmacyId invalide:', pharmacyId);
      createDetailedLog('UPDATE_STATUT_ECHEC', { raison: 'PHARMACY_ID_INVALIDE', pharmacyId });
      return res.status(400).json({ success: false, message: 'ID de pharmacie invalide' });
    }

    if (!statut || !validStatuts.includes(statut)) {
      console.warn('⚠️ [PUT /pharmacies/statut] Statut invalide:', statut);
      createDetailedLog('UPDATE_STATUT_ECHEC', { raison: 'STATUT_INVALIDE', statut });
      return res.status(400).json({ success: false, message: 'Statut invalide' });
    }

    const pharmacy = await User.findById(pharmacyId);
    if (!pharmacy || pharmacy.role !== 'pharmacie') {
      console.warn('⚠️ [PUT /pharmacies/statut] Pharmacie non trouvée:', pharmacyId);
      createDetailedLog('UPDATE_STATUT_ECHEC', { raison: 'PHARMACIE_NON_TROUVEE', pharmacyId });
      return res.status(404).json({ success: false, message: 'Pharmacie non trouvée' });
    }

    const commande = await Commande.findOne({ _id: commandeId, pharmacyId })
      .populate('userId', 'pushSubscription nom prenom email')
      .populate('pharmacyId', 'pharmacieInfo.nomPharmacie');
    if (!commande) {
      console.warn('⚠️ [PUT /pharmacies/statut] Commande non trouvée:', commandeId);
      createDetailedLog('UPDATE_STATUT_ECHEC', { raison: 'COMMANDE_NON_TROUVEE', commandeId });
      return res.status(404).json({ success: false, message: 'Commande non trouvée ou non autorisée' });
    }

    commande.statut = statut;
    await commande.save();

    const notificationClient = await Notification.create({
      userId: commande.userId._id,
      type: 'commande',
      message: `Votre commande #${commande._id} est maintenant ${statut.replace('_', ' ')}`,
      commandeId: commande._id,
      lu: false,
    });
    console.log('🔔 [PUT /pharmacies/statut] Notification client créée:', notificationClient._id);

    const notificationPharmacie = await Notification.create({
      userId: pharmacyId,
      type: 'commande',
      message: `Commande #${commande._id} mise à jour à "${statut.replace('_', ' ')}"`,
      commandeId: commande._id,
      lu: false,
    });
    console.log('🔔 [PUT /pharmacies/statut] Notification pharmacie créée:', notificationPharmacie._id);

    const io = getIo();
    if (io) {
      io.to(`user_${commande.userId._id}`).emit('changementStatutCommande', {
        commande: {
          ...commande.toObject(),
          statut: commande.statut,
        },
        notification: {
          _id: notificationClient._id,
          message: notificationClient.message,
          date: notificationClient.createdAt,
          commandeId: commande._id,
        },
      });
      console.log('📡 [PUT /pharmacies/statut] Notification WebSocket envoyée à client:', `user_${commande.userId._id}`);

      io.to(`user_${pharmacyId}`).emit('changementStatutCommande', {
        commande: {
          ...commande.toObject(),
          statut: commande.statut,
        },
        notification: {
          _id: notificationPharmacie._id,
          message: notificationPharmacie.message,
          date: notificationPharmacie.createdAt,
          commandeId: commande._id,
        },
      });
      console.log('📡 [PUT /pharmacies/statut] Notification WebSocket envoyée à pharmacie:', `user_${pharmacyId}`);
    } else {
      console.warn('⚠️ [PUT /pharmacies/statut] Socket.IO non initialisé');
      createDetailedLog('WEBSOCKET_ECHEC', { raison: 'IO_UNDEFINED', pharmacyId, clientId: commande.userId._id });
    }

    if (commande.userId.pushSubscription) {
      try {
        await webPush.sendNotification(
          commande.userId.pushSubscription,
          JSON.stringify({
            type: 'PUSH_NOTIFICATION',
            notificationId: notificationClient._id,
            title: 'Mise à jour de votre commande',
            message: `Votre commande #${commande._id} est maintenant ${statut.replace('_', ' ')}`,
            icon: '/favicon.ico',
            url: `http://localhost:3000/commandes`,
          })
        );
        console.log('📬 [PUT /pharmacies/statut] Notification push envoyée à client:', commande.userId.email);
      } catch (pushError) {
        console.error('❌ [PUT /pharmacies/statut] Erreur envoi notification push client:', pushError);
        createDetailedLog('ERREUR_NOTIFICATION_PUSH', { erreur: pushError.message, userId: commande.userId._id });
      }
    }

    const pharmacieUser = await User.findById(pharmacyId).select('pushSubscription');
    if (pharmacieUser && pharmacieUser.pushSubscription) {
      try {
        await webPush.sendNotification(
          pharmacieUser.pushSubscription,
          JSON.stringify({
            type: 'PUSH_NOTIFICATION',
            notificationId: notificationPharmacie._id,
            title: 'Mise à jour de commande',
            message: `Commande #${commande._id} mise à jour à ${statut.replace('_', ' ')}`,
            icon: '/favicon.ico',
            url: `http://localhost:3000/pharmacie/commandes`,
          })
        );
        console.log('📬 [PUT /pharmacies/statut] Notification push envoyée à pharmacie:', pharmacyId);
      } catch (pushError) {
        console.error('❌ [PUT /pharmacies/statut] Erreur envoi notification push pharmacie:', pushError);
        createDetailedLog('ERREUR_NOTIFICATION_PUSH', { erreur: pushError.message, pharmacyId });
      }
    }

    console.log('✅ [PUT /pharmacies/statut] Statut mis à jour:', { commandeId, statut });
    createDetailedLog('UPDATE_STATUT_REUSSI', { commandeId, statut, pharmacyId });
    res.json({ success: true, message: 'Statut mis à jour avec succès', commande });
  } catch (error) {
    console.error('❌ [PUT /pharmacies/statut] Erreur:', error);
    createDetailedLog('ERREUR_UPDATE_STATUT_COMMANDE', {
      erreur: error.message,
      stack: error.stack,
      pharmacyId: req.body.pharmacyId,
      commandeId: req.body.commandeId,
    });
    res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
  }
});

router.use('/pharmacies', pharmacyCommandesRouter);

module.exports = router;