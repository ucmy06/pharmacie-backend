// C:\reactjs node mongodb\pharmacie-backend\src\routes\commandes.js
const express = require('express');
const router = express.Router();
const pharmacyCommandesRouter = express.Router();
const mongoose = require('mongoose');
const { authenticate } = require('../middlewares/auth');
const Commande = mongoose.connection.useDb('pharmacies').model('Commande', require('../models/Commande').schema);
const { User } = require('../models/User');
const Notification = require('../models/Notification');
const { getIo } = require('../socket');
const { createDetailedLog } = require('../utils/logUtils');

// Routes pour les clients (montées sous /api/commandes)
router.post('/', authenticate, async (req, res) => {
  try {
    const { pharmacyId, medicaments, livraison, adresseLivraison } = req.body;
    const userId = req.user._id;

    console.log('🔍 [createCommande] Requête reçue:', { pharmacyId, medicaments, livraison, userId });

    if (!pharmacyId || !mongoose.Types.ObjectId.isValid(pharmacyId)) {
      console.warn('⚠️ [createCommande] pharmacyId invalide:', pharmacyId);
      createDetailedLog('CREER_COMMANDE_ECHEC', { raison: 'PHARMACIE_ID_INVALIDE', pharmacyId });
      return res.status(400).json({ success: false, message: 'ID de pharmacie invalide' });
    }

    if (!medicaments || !Array.isArray(medicaments) || medicaments.length === 0) {
      console.warn('⚠️ [createCommande] Medicaments invalides:', medicaments);
      createDetailedLog('CREER_COMMANDE_ECHEC', { raison: 'MEDICAMENTS_INVALIDE', medicaments });
      return res.status(400).json({ success: false, message: 'Liste de médicaments invalide ou vide' });
    }

    const pharmacy = await User.findById(pharmacyId);
    if (!pharmacy || pharmacy.role !== 'pharmacie') {
      console.warn('⚠️ [createCommande] Pharmacie non trouvée:', pharmacyId);
      createDetailedLog('CREER_COMMANDE_ECHEC', { raison: 'PHARMACIE_NON_TROUVEE', pharmacyId });
      return res.status(404).json({ success: false, message: 'Pharmacie non trouvée' });
    }

    if (!pharmacy.pharmacieInfo?.baseMedicament) {
      console.warn('⚠️ [createCommande] Base de données des médicaments non configurée pour pharmacie:', pharmacyId);
      createDetailedLog('CREER_COMMANDE_ECHEC', { raison: 'BASE_MEDICAMENT_NON_CONFIGUREE', pharmacyId });
      return res.status(400).json({ success: false, message: 'Base de données des médicaments non configurée' });
    }

    if (livraison && !pharmacy.pharmacieInfo.livraisonDisponible) {
      console.warn('⚠️ [createCommande] Livraison non disponible pour pharmacie:', pharmacyId);
      createDetailedLog('CREER_COMMANDE_ECHEC', { raison: 'LIVRAISON_NON_DISPONIBLE', pharmacyId });
      return res.status(400).json({ success: false, message: 'Livraison non disponible pour cette pharmacie' });
    }

    const connection = mongoose.connection.useDb(pharmacy.pharmacieInfo.baseMedicament);
    const MedicamentModel = connection.model('Medicament', require('../models/Medicament').schema, 'medicaments');

    const invalidItems = [];
    const validMedicaments = [];
    for (const item of medicaments) {
      console.log('🔍 [createCommande] Vérification médicament:', item);
      if (!item.medicamentId || !mongoose.Types.ObjectId.isValid(item.medicamentId) || !item.quantite || item.quantite <= 0 || !item.prix) {
        invalidItems.push({
          medicamentId: item.medicamentId || 'inconnu',
          message: 'Données manquantes ou invalides pour le médicament',
        });
        continue;
      }
      const medicament = await MedicamentModel.findById(item.medicamentId);
      if (!medicament) {
        invalidItems.push({
          medicamentId: item.medicamentId,
          message: 'Médicament non trouvé',
        });
      } else if (medicament.quantite_stock < item.quantite) {
        invalidItems.push({
          medicamentId: item.medicamentId,
          message: `Stock insuffisant pour ${medicament.nom}`,
        });
      } else if (item.prix !== medicament.prix) {
        invalidItems.push({
          medicamentId: item.medicamentId,
          message: `Prix incohérent pour ${medicament.nom} (attendu: ${medicament.prix}, reçu: ${item.prix})`,
        });
      } else {
        validMedicaments.push({
          medicamentId: item.medicamentId,
          nom: medicament.nom,
          quantite: item.quantite,
          prix: medicament.prix,
          image: medicament.image,
        });
      }
    }

    if (invalidItems.length > 0) {
      console.warn('⚠️ [createCommande] Médicaments invalides:', invalidItems);
      createDetailedLog('CREER_COMMANDE_ECHEC', { raison: 'MEDICAMENTS_INVALIDES', invalidItems });
      return res.status(400).json({ success: false, message: 'Certains médicaments sont invalides', invalidItems });
    }

    if (validMedicaments.length === 0) {
      console.warn('⚠️ [createCommande] Aucun médicament valide');
      createDetailedLog('CREER_COMMANDE_ECHEC', { raison: 'AUCUN_MEDICAMENT_VALIDE' });
      return res.status(400).json({ success: false, message: 'Aucun médicament valide dans la commande' });
    }

    const total = validMedicaments.reduce((sum, item) => sum + item.prix * item.quantite, 0);

    const commande = new Commande({
      userId,
      pharmacyId,
      medicaments: validMedicaments,
      total,
      livraison,
      adresseLivraison: livraison ? adresseLivraison : undefined,
      statut: 'en_attente',
      createdAt: new Date(),
    });

    await commande.save();

    // Mettre à jour le stock
    for (const item of validMedicaments) {
      await MedicamentModel.findByIdAndUpdate(item.medicamentId, {
        $inc: { quantite_stock: -item.quantite },
      });
    }

    // Supprimer le panier
    await mongoose.connection.useDb('pharmacies').model('Cart').deleteOne({ userId, pharmacyId });

    // Créer des notifications
    const notificationPharmacie = await Notification.create({
      userId: pharmacyId,
      type: 'commande',
      message: `Nouvelle commande (#${commande._id}) de ${req.user.nom} ${req.user.prenom}`,
      commandeId: commande._id,
    });
    console.log('🔔 [createCommande] Notification créée pour pharmacie:', notificationPharmacie._id);

    const notificationClient = await Notification.create({
      userId: userId,
      type: 'commande',
      message: `Votre commande (#${commande._id}) a été reçue par ${pharmacy.pharmacieInfo.nomPharmacie}`,
      commandeId: commande._id,
    });
    console.log('🔔 [createCommande] Notification créée pour client:', notificationClient._id);

    const admins = await User.find({ role: 'admin' }).select('_id');
    const adminNotifications = [];
    for (const admin of admins) {
      const adminNotification = await Notification.create({
        userId: admin._id,
        type: 'commande',
        message: `Nouvelle commande (#${commande._id}) passée pour la pharmacie ${pharmacy.pharmacieInfo.nomPharmacie}`,
        commandeId: commande._id,
      });
      adminNotifications.push(adminNotification);
      console.log('🔔 [createCommande] Notification admin créée:', adminNotification._id);
    }

    // Émettre les notifications via WebSocket
    const io = getIo();
    if (io) {
      const commandePopulatee = await Commande.findById(commande._id)
        .populate('userId', 'nom prenom email telephone')
        .populate('pharmacyId', 'pharmacieInfo.nomPharmacie');

      io.to(pharmacyId.toString()).emit('nouvelleCommande', {
        commande: commandePopulatee,
        notification: {
          _id: notificationPharmacie._id,
          message: notificationPharmacie.message,
          date: notificationPharmacie.createdAt,
          commandeId: commande._id,
        },
      });
      console.log('📡 [createCommande] Notification WebSocket envoyée à pharmacie:', pharmacyId);

      io.to(userId.toString()).emit('nouvelleCommande', {
        commande: commandePopulatee,
        notification: {
          _id: notificationClient._id,
          message: notificationClient.message,
          date: notificationClient.createdAt,
          commandeId: commande._id,
        },
      });
      console.log('📡 [createCommande] Notification WebSocket envoyée à client:', userId);

      for (const adminNotification of adminNotifications) {
        io.to(adminNotification.userId.toString()).emit('nouvelleCommande', {
          commande: commandePopulatee,
          notification: {
            _id: adminNotification._id,
            message: adminNotification.message,
            date: adminNotification.createdAt,
            commandeId: commande._id,
          },
        });
        console.log('📡 [createCommande] Notification WebSocket envoyée à admin:', adminNotification.userId);
      }
    } else {
      console.warn('⚠️ [createCommande] Socket.IO non initialisé');
      createDetailedLog('WEBSOCKET_ECHEC', {
        raison: 'IO_UNDEFINED',
        pharmacyId,
        clientId: userId,
      });
    }

    console.log('✅ [createCommande] Commande créée:', commande._id);
    createDetailedLog('CREER_COMMANDE_REUSSI', {
      commandeId: commande._id,
      userId,
      pharmacyId,
      total,
    });

    const commandeResponse = await Commande.findById(commande._id)
      .populate('userId', 'nom prenom email telephone')
      .populate('pharmacyId', 'pharmacieInfo.nomPharmacie');

    res.json({ success: true, message: 'Commande passée avec succès', commande: commandeResponse });
  } catch (error) {
    console.error('❌ [createCommande] Erreur:', error);
    createDetailedLog('ERREUR_CREER_COMMANDE', {
      erreur: error.message,
      stack: error.stack,
      userId: req.user?._id,
      pharmacyId: req.body.pharmacyId,
      medicaments: req.body.medicaments,
    });
    res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
  }
});

// Lister les commandes d'un client
pharmacyCommandesRouter.get('/', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 50, statut, dateDebut, dateFin, pharmacyId } = req.query;

    console.log('🔍 [getCommandesPharmacie] Requête reçue:', {
      pharmacyId,
      userId: req.user._id,
      userRole: req.user.role,
      page,
      limit,
      statut,
      dateDebut,
      dateFin
    });

    if (!mongoose.Types.ObjectId.isValid(pharmacyId)) {
      console.warn('⚠️ [getCommandesPharmacie] ID pharmacie invalide:', pharmacyId);
      createDetailedLog('GET_COMMANDES_ECHEC', { raison: 'ID_PHARMACIE_INVALIDE', pharmacyId });
      return res.status(400).json({ success: false, message: 'ID de pharmacie invalide' });
    }

    const pharmacy = await User.findById(pharmacyId);
    console.log('🔍 [getCommandesPharmacie] Résultat User.findById:', {
      pharmacyExists: !!pharmacy,
      role: pharmacy?.role,
      statutDemande: pharmacy?.pharmacieInfo?.statutDemande
    });

    if (!pharmacy || pharmacy.role !== 'pharmacie' || pharmacy.pharmacieInfo?.statutDemande !== 'approuvee') {
      console.warn('⚠️ [getCommandesPharmacie] Échec validation pharmacie:', {
        pharmacyId,
        pharmacyExists: !!pharmacy,
        role: pharmacy?.role,
        statutDemande: pharmacy?.pharmacieInfo?.statutDemande
      });
      createDetailedLog('GET_COMMANDES_ECHEC', {
        raison: 'PHARMACIE_NON_TROUVEE_OU_NON_APPROUVEE',
        pharmacyId,
        details: { pharmacyExists: !!pharmacy, role: pharmacy?.role, statutDemande: pharmacy?.pharmacieInfo?.statutDemande }
      });
      return res.status(404).json({ success: false, message: 'Pharmacie non trouvée ou non approuvée' });
    }

    const filter = { pharmacyId };
    if (statut) filter.statut = statut;
    if (dateDebut && dateFin) {
      filter.createdAt = { $gte: new Date(dateDebut), $lte: new Date(dateFin) };
    }

    const skip = (page - 1) * limit;
    const commandes = await Commande.find(filter)
      .populate('userId', 'nom prenom email telephone')
      .populate('pharmacyId', 'pharmacieInfo.nomPharmacie')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Commande.countDocuments(filter);

    console.log('✅ [getCommandesPharmacie] Commandes récupérées:', { total, pharmacyId });
    createDetailedLog('GET_COMMANDES_REUSSI', { pharmacyId, totalCommandes: total });
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
    console.error('❌ [getCommandesPharmacie] Erreur:', error);
    createDetailedLog('ERREUR_GET_COMMANDES_PHARMACIE', {
      erreur: error.message,
      stack: error.stack,
      pharmacyId: req.query.pharmacyId,
    });
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});



pharmacyCommandesRouter.put('/statut', authenticate, async (req, res) => {
    try {
    const { commandeId, statut, pharmacyId } = req.body;
    const validStatuts = ['en_attente', 'en_preparation', 'prete', 'livree', 'annulee'];

    if (!commandeId || !mongoose.Types.ObjectId.isValid(commandeId)) {
      console.warn('⚠️ [updateCommandeStatut] commandeId invalide:', commandeId);
      return res.status(400).json({ success: false, message: 'ID de commande invalide' });
    }

    if (!pharmacyId || !mongoose.Types.ObjectId.isValid(pharmacyId)) {
      console.warn('⚠️ [updateCommandeStatut] pharmacyId invalide:', pharmacyId);
      return res.status(400).json({ success: false, message: 'ID de pharmacie invalide' });
    }

    if (!statut || !validStatuts.includes(statut)) {
      console.warn('⚠️ [updateCommandeStatut] Statut invalide:', statut);
      return res.status(400).json({ success: false, message: 'Statut invalide' });
    }

    const pharmacy = await User.findById(pharmacyId);
    if (!pharmacy || pharmacy.role !== 'pharmacie') {
      console.warn('⚠️ [updateCommandeStatut] Pharmacie non trouvée:', pharmacyId);
      return res.status(404).json({ success: false, message: 'Pharmacie non trouvée' });
    }

    const commande = await Commande.findOne({ _id: commandeId, pharmacyId });
    if (!commande) {
      console.warn('⚠️ [updateCommandeStatut] Commande non trouvée:', commandeId);
      return res.status(404).json({ success: false, message: 'Commande non trouvée ou non autorisée' });
    }

    commande.statut = statut;
    await commande.save();

    const notificationClient = await Notification.create({
      userId: commande.userId,
      type: 'commande',
      message: `Votre commande (#${commande._id}) est maintenant "${statut.replace('_', ' ')}"`,
      commandeId: commande._id,
    });

    const io = getIo();
    if (io) {
      const commandePopulatee = await Commande.findById(commande._id)
        .populate('userId', 'nom prenom email telephone')
        .populate('pharmacyId', 'pharmacieInfo.nomPharmacie');

      io.to(commande.userId.toString()).emit('updateCommande', {
        commande: commandePopulatee,
        notification: {
          _id: notificationClient._id,
          message: notificationClient.message,
          date: notificationClient.createdAt,
          commandeId: commande._id,
        },
      });
      console.log('📡 [updateCommandeStatut] Notification WebSocket envoyée à client:', commande.userId);
    }

    console.log('✅ [updateCommandeStatut] Statut mis à jour:', { commandeId, statut });
    res.json({ success: true, message: 'Statut mis à jour avec succès', commande });
  } catch (error) {
    console.error('❌ [updateCommandeStatut] Erreur:', error);
    createDetailedLog('ERREUR_UPDATE_STATUT_COMMANDE', {
      erreur: error.message,
      stack: error.stack,
      pharmacyId: req.body.pharmacyId,
    });
    res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
  }
});

router.use('/pharmacies', pharmacyCommandesRouter);

module.exports = router;