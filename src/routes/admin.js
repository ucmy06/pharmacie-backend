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
  uploadMedicamentImage,
  approveModificationRequest,
  rejectModificationRequest,
  approveSuppressionRequest,
  rejectSuppressionRequest,
  uploadDrugImageHandler,
  getAllMedicaments,
} = require('../controllers/adminController');
const {
  getAllUsers,
  getUserById,
  updateUserRole,
  toggleUserStatus,
  deleteUser,
  getUserStats,
} = require('../controllers/userController');
const {
  getSearchStats,
  getPharmacieStats,
} = require('../controllers/statsController');
const Notification = require('../models/Notification');

router.use(authenticate);
router.use(requireAdmin);

router.get('/users', getAllUsers);
router.get('/users/stats', getUserStats);
router.get('/users/:userId', getUserById);
router.put('/users/:userId/role', updateUserRole);
router.put('/users/:userId/status', toggleUserStatus);
router.delete('/users/:userId', deleteUser);

router.get('/pharmacy-requests', getPharmacieDemandeCreationRequests);
router.post('/pharmacy-requests/:userId/approve', approvePharmacieRequest);
router.post('/pharmacy-requests/:userId/reject', rejectPharmacieRequest);
router.put('/pharmacy-requests/:userId/statut', updatePharmacyRequestStatus);
router.get('/pharmacy-requests/:pharmacyId', getPharmacieRequestDetails);
router.put('/pharmacy-requests/:pharmacyId/document', updatePharmacieDocuments);

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