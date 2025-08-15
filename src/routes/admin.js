// C:\reactjs node mongodb\pharmacie-backend\src\routes\admin.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const { requireAdmin } = require('../middlewares/roleCheck');
const { uploadDrugImages } = require('../middlewares/multerConfig');
const {
  getPharmacieDemandeCreationRequests,
  getPharmacyModifDeleteRequests,
  approvePharmacieRequest,
  rejectPharmacieRequest,
  getPharmacieRequestDetails,
  updatePharmacieDocuments,
  getAdminDashboard,
  getApprovedPharmacies,
  updatePharmacyRequestStatus,
  associerBaseMedicament,
  disconnectDatabase,
  uploadMedicamentImage,
  approveModificationRequest,
  rejectModificationRequest,
  approveSuppressionRequest,
  rejectSuppressionRequest,
  toggleUserStatus,
  uploadDrugImageHandler,
  getAllMedicaments,
} = require('../controllers/adminController');
const {
  getAllUsers,
  getUserById,
  updateUserRole,
  deleteUser,
  getUserStats,
} = require('../controllers/userController');
const {
  getSearchStats,
  getPharmacieStats,
} = require('../controllers/statsController');
const Notification = require('../models/Notification');
const DrugImage = require('../models/DrugImage');
const fs = require('fs').promises;
const path = require('path');

router.use(authenticate);
router.use(requireAdmin);

router.get('/users', getAllUsers);
router.get('/users/stats', getUserStats);
router.get('/users/:userId', getUserById);
router.put('/users/:userId/role', updateUserRole);
router.delete('/users/:userId', deleteUser);

router.get('/pharmacy-requests', getPharmacieDemandeCreationRequests);
router.post('/pharmacy-requests/:userId/approve', approvePharmacieRequest);
router.post('/pharmacy-requests/:userId/reject', rejectPharmacieRequest);
router.put('/pharmacy-requests/:userId/statut', updatePharmacyRequestStatus);
router.get('/pharmacy-requests/:pharmacyId', getPharmacieRequestDetails);
router.put('/pharmacy-requests/:pharmacyId/document', updatePharmacieDocuments);
router.put('/users/:userId/status', toggleUserStatus);
router.get('/modification-requests', getPharmacyModifDeleteRequests);
router.post('/modification-requests/:userId/approve', approveModificationRequest);
router.post('/modification-requests/:userId/reject', rejectModificationRequest);
router.post('/suppression-requests/:userId/approve', approveSuppressionRequest);
router.post('/suppression-requests/:userId/reject', rejectSuppressionRequest);

router.get('/dashboard', getAdminDashboard);
router.get('/stats/searches', getSearchStats);
router.get('/stats/pharmacies', getPharmacieStats);

router.get('/pharmacies', getApprovedPharmacies);

router.post('/pharmacy/:pharmacyId/assign-db', associerBaseMedicament);

router.delete('/pharmacy/:pharmacyId/assign-db', disconnectDatabase);

router.post('/pharmacy/:pharmacyId/medicament/:medicamentId/image', uploadDrugImages, uploadMedicamentImage);

router.post('/drug/image', uploadDrugImages, uploadDrugImageHandler);

router.get('/medicaments/all', getAllMedicaments);

// Nouvelle route pour les notifications des administrateurs
router.get('/notifications', async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user.id, lu: false })
      .sort({ date: -1 })
      .limit(50);
    res.json({ success: true, data: { notifications } });
  } catch (error) {
    console.error('❌ Erreur récupération notifications admin:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// Nouvelle route pour modifier une image
router.put('/drug/image/:nom/:imageId', uploadDrugImages, async (req, res) => {
  try {
    const { nom, imageId } = req.params;
    const file = req.files?.[0];

    if (!file) {
      return res.status(400).json({ success: false, message: 'Aucune image fournie' });
    }

    const drugImage = await DrugImage.findOne({ nom: nom.toLowerCase() });
    if (!drugImage) {
      return res.status(404).json({ success: false, message: 'Médicament non trouvé' });
    }

    const imageIndex = drugImage.images.findIndex(img => img._id.toString() === imageId);
    if (imageIndex === -1) {
      return res.status(404).json({ success: false, message: 'Image non trouvée' });
    }

    // Supprimer l'ancienne image du système de fichiers
    const oldImagePath = path.join(__dirname, '../..', drugImage.images[imageIndex].cheminFichier);
    try {
      await fs.unlink(oldImagePath);
      console.log(`✅ [updateDrugImage] Ancienne image supprimée: ${oldImagePath}`);
    } catch (err) {
      console.warn(`⚠️ [updateDrugImage] Impossible de supprimer l'ancienne image: ${oldImagePath}`, err);
    }

    // Mettre à jour les informations de l'image
    drugImage.images[imageIndex] = {
      nomFichier: file.filename,
      cheminFichier: `/Uploads/medicaments/${file.filename}`,
      typeFichier: file.mimetype,
      tailleFichier: file.size,
      dateUpload: new Date(),
    };

    await drugImage.save();
    console.log(`✅ [updateDrugImage] Image mise à jour pour ${nom}, imageId: ${imageId}`);
    res.json({ success: true, message: 'Image mise à jour avec succès', data: drugImage.images });
  } catch (error) {
    console.error('❌ [updateDrugImage] Erreur:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
  }
});

// Nouvelle route pour supprimer une image
router.delete('/drug/image/:nom/:imageId', async (req, res) => {
  try {
    const { nom, imageId } = req.params;

    const drugImage = await DrugImage.findOne({ nom: nom.toLowerCase() });
    if (!drugImage) {
      return res.status(404).json({ success: false, message: 'Médicament non trouvé' });
    }

    const imageIndex = drugImage.images.findIndex(img => img._id.toString() === imageId);
    if (imageIndex === -1) {
      return res.status(404).json({ success: false, message: 'Image non trouvée' });
    }

    // Supprimer l'image du système de fichiers
    const imagePath = path.join(__dirname, '../..', drugImage.images[imageIndex].cheminFichier);
    try {
      await fs.unlink(imagePath);
      console.log(`✅ [deleteDrugImage] Image supprimée: ${imagePath}`);
    } catch (err) {
      console.warn(`⚠️ [deleteDrugImage] Impossible de supprimer l'image: ${imagePath}`, err);
    }

    // Supprimer l'image du tableau
    drugImage.images.splice(imageIndex, 1);
    if (drugImage.images.length === 0) {
      await DrugImage.deleteOne({ nom: nom.toLowerCase() });
    } else {
      await drugImage.save();
    }

    console.log(`✅ [deleteDrugImage] Image supprimée pour ${nom}, imageId: ${imageId}`);
    res.json({ success: true, message: 'Image supprimée avec succès', data: drugImage.images });
  } catch (error) {
    console.error('❌ [deleteDrugImage] Erreur:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
  }
});

router.put('/notifications/:id/lu', async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { lu: true },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification non trouvée' });
    }
    res.json({ success: true, message: 'Notification marquée comme lue' });
  } catch (error) {
    console.error('❌ Erreur marquage notification admin:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

module.exports = router;