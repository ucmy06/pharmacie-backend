// C:\reactjs node mongodb\pharmacie-backend\src\routes\notifications.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const Notification = require('../models/Notification');
const mongoose = require('mongoose');
const { createDetailedLog } = require('../utils/logUtils');
const { User } = require('../models/User');

router.get('/notifications', authenticate, async (req, res) => {
  try {
    const { pharmacyId } = req.query;

    if (!pharmacyId || !mongoose.Types.ObjectId.isValid(pharmacyId)) {
      console.warn('⚠️ [getNotifications] pharmacyId invalide:', pharmacyId);
      createDetailedLog('GET_NOTIFICATIONS_ECHEC', { raison: 'PHARMACIE_ID_INVALIDE', pharmacyId });
      return res.status(400).json({ success: false, message: 'ID de pharmacie invalide' });
    }

    const pharmacy = await User.findById(pharmacyId);
    if (!pharmacy || pharmacy.role !== 'pharmacie') {
      console.warn('⚠️ [getNotifications] Pharmacie non trouvée:', pharmacyId);
      createDetailedLog('GET_NOTIFICATIONS_ECHEC', { raison: 'PHARMACIE_NON_TROUVEE', pharmacyId });
      return res.status(404).json({ success: false, message: 'Pharmacie non trouvée' });
    }

    console.log('🔍 [getNotifications] Requête reçue:', {
      pharmacyId,
      userId: req.user._id,
      userRole: req.user.role,
    });

    const notifications = await Notification.find({ userId: pharmacyId, lu: false }).sort({ date: -1 });

    console.log('✅ [getNotifications] Notifications récupérées:', { total: notifications.length });

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
      pharmacyId: req.query.pharmacyId,
    });
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
    });
  }
});

router.put('/notifications/:id/lu', authenticate, async (req, res) => {
  try {
    const { pharmacyId } = req.body;

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

    const notification = await Notification.findOne({ _id: req.params.id, userId: pharmacyId });
    if (!notification) {
      console.warn('⚠️ [updateNotification] Notification non trouvée:', req.params.id);
      createDetailedLog('UPDATE_NOTIFICATION_ECHEC', { raison: 'NOTIFICATION_NON_TROUVEE', notificationId: req.params.id });
      return res.status(404).json({
        success: false,
        message: 'Notification non trouvée',
      });
    }

    notification.lu = true;
    await notification.save();

    console.log('✅ [updateNotification] Notification marquée comme lue:', req.params.id);
    res.json({
      success: true,
      message: 'Notification marquée comme lue',
    });
  } catch (error) {
    console.error('❌ [updateNotification] Erreur:', error);
    createDetailedLog('ERREUR_UPDATE_NOTIFICATION', {
      erreur: error.message,
      stack: error.stack,
      userId: req.user?._id,
      pharmacyId: req.body.pharmacyId,
    });
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
    });
  }
});

module.exports = router;