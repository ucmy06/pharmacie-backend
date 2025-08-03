const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const Notification = require('../models/Notification');
const Commande = require('../models/Commande');
const { User } = require('../models/User');
const mongoose = require('mongoose');
const { createDetailedLog } = require('../utils/logUtils');
const { getIo } = require('../socket');
const webPush = require('web-push');

// Route pour récupérer les notifications
router.get('/', authenticate, async (req, res) => {
  try {
    const { showAll } = req.query;
    const filter = { userId: req.user._id };
    
    if (!showAll) {
      filter.lu = false;
    }

    const notifications = await Notification.find(filter)
      .sort({ date: -1 })
      .limit(50);

    console.log('✅ [getNotifications] Notifications récupérées:', { 
      userId: req.user._id, 
      total: notifications.length 
    });

    res.json({
      success: true,
      data: { notifications },
    });
  } catch (error) {
    console.error('❌ [getNotifications] Erreur:', error);
    createDetailedLog('ERREUR_GET_NOTIFICATIONS', {
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

// Route pour marquer une notification comme lue
router.put('/:id/marquer-lue', authenticate, async (req, res) => {
  try {
    const notificationId = req.params.id;
    const userId = req.user._id;
    const { pharmacyId } = req.body; // Pour le cas où c'est une pharmacie qui marque

    console.log('🔄 [marquerLue] Requête reçue:', { notificationId, userId, pharmacyId });

    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      console.warn('⚠️ [marquerLue] ID notification invalide:', notificationId);
      return res.status(400).json({ 
        success: false, 
        message: 'ID de notification invalide' 
      });
    }

    // Si c'est une pharmacie qui marque une notification comme lue
    if (pharmacyId && req.user.role === 'pharmacie') {
      return await handlePharmacyNotificationRead(req, res, notificationId, pharmacyId);
    }

    // Cas normal : utilisateur marque sa propre notification
    const notification = await Notification.findOne({ 
      _id: notificationId, 
      userId: userId 
    });

    if (!notification) {
      console.warn('⚠️ [marquerLue] Notification non trouvée:', notificationId);
      return res.status(404).json({
        success: false,
        message: 'Notification non trouvée',
      });
    }

    // Marquer comme lue
    notification.lu = true;
    await notification.save();

    console.log('✅ [marquerLue] Notification marquée comme lue:', notificationId);

    // Envoyer une notification WebSocket pour mettre à jour l'interface
    const io = getIo();
    if (io) {
      io.to(`user_${userId}`).emit('notificationMarqueLue', {
        notificationId: notificationId,
        userId: userId
      });
      console.log('📡 [marquerLue] Notification WebSocket envoyée:', `user_${userId}`);
    }

    res.json({
      success: true,
      message: 'Notification marquée comme lue',
      data: { notification }
    });
  } catch (error) {
    console.error('❌ [marquerLue] Erreur:', error);
    createDetailedLog('ERREUR_MARQUER_NOTIFICATION_LUE', {
      erreur: error.message,
      stack: error.stack,
      userId: req.user?._id,
      notificationId: req.params.id,
    });
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
    });
  }
});

// Fonction pour gérer le marquage par une pharmacie
async function handlePharmacyNotificationRead(req, res, notificationId, pharmacyId) {
  try {
    console.log('🏪 [handlePharmacyNotificationRead] Début traitement pharmacie');

    if (!mongoose.Types.ObjectId.isValid(pharmacyId)) {
      console.warn('⚠️ [handlePharmacyNotificationRead] pharmacyId invalide:', pharmacyId);
      return res.status(400).json({ success: false, message: 'ID de pharmacie invalide' });
    }

    const pharmacy = await User.findById(pharmacyId);
    if (!pharmacy || pharmacy.role !== 'pharmacie') {
      console.warn('⚠️ [handlePharmacyNotificationRead] Pharmacie non trouvée:', pharmacyId);
      return res.status(404).json({ success: false, message: 'Pharmacie non trouvée' });
    }

    const notification = await Notification.findOne({ _id: notificationId, userId: pharmacyId });
    if (!notification) {
      console.warn('⚠️ [handlePharmacyNotificationRead] Notification non trouvée:', notificationId);
      return res.status(404).json({ success: false, message: 'Notification non trouvée' });
    }

    // Marquer la notification comme lue
    notification.lu = true;
    await notification.save();
    console.log('✅ [handlePharmacyNotificationRead] Notification marquée comme lue:', notificationId);

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
      console.log('🔔 [handlePharmacyNotificationRead] Notification client créée:', clientNotification._id);

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
        console.log('📡 [handlePharmacyNotificationRead] Notification WebSocket envoyée à client:', `user_${commande.userId._id}`);
        
        // Envoyer aussi un événement spécifique pour le marquage comme lu
        io.to(`user_${commande.userId._id}`).emit('notificationPharmacieAction', {
          action: 'marque_comme_lu',
          pharmacyId: pharmacyId,
          commandeId: notification.commandeId,
          notification: notificationData.notification
        });

        // Mettre à jour l'interface de la pharmacie
        io.to(`user_${pharmacyId}`).emit('notificationMarqueLue', {
          notificationId: notificationId,
          userId: pharmacyId
        });
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
          console.log('📬 [handlePharmacyNotificationRead] Notification push envoyée à client:', commande.userId._id);
          createDetailedLog('NOTIFICATION_PUSH_REUSSI', { 
            userId: commande.userId._id, 
            pharmacyId, 
            commandeId: notification.commandeId 
          });
        } catch (pushError) {
          console.error('❌ [handlePharmacyNotificationRead] Erreur envoi notification push:', pushError);
          createDetailedLog('ERREUR_NOTIFICATION_PUSH', { 
            erreur: pushError.message, 
            userId: commande.userId._id,
            pharmacyId 
          });
        }
      } else {
        console.warn('⚠️ [handlePharmacyNotificationRead] Pas d\'abonnement push pour le client:', commande.userId._id);
      }
    } else {
      console.warn('⚠️ [handlePharmacyNotificationRead] Commande ou utilisateur non trouvé:', notification.commandeId);
    }

    return res.json({
      success: true,
      message: 'Notification marquée comme lue et client informé',
      data: { notification }
    });
  } catch (error) {
    console.error('❌ [handlePharmacyNotificationRead] Erreur:', error);
    createDetailedLog('ERREUR_PHARMACY_NOTIFICATION_READ', {
      erreur: error.message,
      stack: error.stack,
      pharmacyId,
      notificationId,
    });
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur',
    });
  }
}

// Route alternative pour compatibilité (utilisée par les pharmacies)
router.put('/:id/lu', authenticate, async (req, res) => {
  try {
    const notificationId = req.params.id;
    const { pharmacyId } = req.body;
    
    console.log('🔄 [/lu] Redirection vers marquer-lue:', { notificationId, pharmacyId });
    
    // Rediriger vers la fonction principale
    if (pharmacyId && req.user.role === 'pharmacie') {
      return await handlePharmacyNotificationRead(req, res, notificationId, pharmacyId);
    }
    
    // Pour les autres cas, traiter comme une notification normale
    req.url = req.url.replace('/lu', '/marquer-lue');
    return router.handle(req, res);
  } catch (error) {
    console.error('❌ [/lu] Erreur:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
    });
  }
});

// Route pour marquer toutes les notifications comme lues
router.put('/marquer-toutes-lues', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    
    const result = await Notification.updateMany(
      { userId: userId, lu: false },
      { lu: true }
    );

    console.log('✅ [marquerToutesLues] Notifications mises à jour:', result.modifiedCount);

    // Envoyer une notification WebSocket
    const io = getIo();
    if (io) {
      io.to(`user_${userId}`).emit('toutesNotificationsMarqueesLues', {
        userId: userId,
        count: result.modifiedCount
      });
    }

    res.json({
      success: true,
      message: `${result.modifiedCount} notifications marquées comme lues`,
      data: { count: result.modifiedCount }
    });
  } catch (error) {
    console.error('❌ [marquerToutesLues] Erreur:', error);
    createDetailedLog('ERREUR_MARQUER_TOUTES_LUES', {
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

// Route pour supprimer une notification
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const notificationId = req.params.id;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID de notification invalide' 
      });
    }

    const notification = await Notification.findOneAndDelete({ 
      _id: notificationId, 
      userId: userId 
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification non trouvée',
      });
    }

    console.log('✅ [supprimerNotification] Notification supprimée:', notificationId);

    // Envoyer une notification WebSocket
    const io = getIo();
    if (io) {
      io.to(`user_${userId}`).emit('notificationSupprimee', {
        notificationId: notificationId,
        userId: userId
      });
    }

    res.json({
      success: true,
      message: 'Notification supprimée',
      data: { notification }
    });
  } catch (error) {
    console.error('❌ [supprimerNotification] Erreur:', error);
    createDetailedLog('ERREUR_SUPPRIMER_NOTIFICATION', {
      erreur: error.message,
      stack: error.stack,
      userId: req.user?._id,
      notificationId: req.params.id,
    });
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
    });
  }
});

// Route pour obtenir le nombre de notifications non lues
router.get('/count/non-lues', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    
    const count = await Notification.countDocuments({
      userId: userId,
      lu: false
    });

    res.json({
      success: true,
      data: { count }
    });
  } catch (error) {
    console.error('❌ [countNonLues] Erreur:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
    });
  }
});

module.exports = router;