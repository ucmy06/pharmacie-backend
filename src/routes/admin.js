const express = require('express');
const router = express.Router();

const { User } = require('../models/User');
const {
  getPharmacieRequests,
  approvePharmacieRequest,
  rejectPharmacieRequest,
  getPharmacieRequestDetails,
  updatePharmacieDocuments,
  getAdminDashboard,
  getApprovedPharmacies
} = require('../controllers/adminController');
const {
  getAllUsers,
  getUserById,
  updateUserRole,
  toggleUserStatus,
  deleteUser,
  getUserStats
} = require('../controllers/userController');
const {
  getSearchStats,
  getPharmacieStats
} = require('../controllers/statsController');
const { authenticate } = require('../middlewares/auth');
const { requireAdmin } = require('../middlewares/roleCheck');

router.use(authenticate);
router.use(requireAdmin);

// Utilisateurs
router.get('/users', getAllUsers);
router.get('/users/stats', getUserStats);
router.get('/users/:userId', getUserById);
router.put('/users/:userId/role', updateUserRole);
router.put('/users/:userId/status', toggleUserStatus);
router.delete('/users/:userId', deleteUser);

// Demandes de pharmacies
router.get('/pharmacy-requests', getPharmacieRequests);
router.put('/pharmacy-requests/:userId/approve', approvePharmacieRequest);
router.put('/pharmacy-requests/:userId/reject', rejectPharmacieRequest);
router.get('/pharmacy-requests/:pharmacieId', getPharmacieRequestDetails);
router.put('/pharmacy-requests/:pharmacieId/document', updatePharmacieDocuments);

// Statistiques
router.get('/dashboard', getAdminDashboard);
router.get('/stats/searches', getSearchStats);
router.get('/stats/pharmacies', getPharmacieStats);
router.get('/pharmacies', getApprovedPharmacies);

module.exports = router;
