// C:\reactjs node mongodb\pharmacie-backend\src\routes\admin.js

const express = require('express');
const router = express.Router();

// 🔁 Import des modèles
const { User } = require('../models/User');

// 🔁 Import des middlewares
const { authenticate } = require('../middlewares/auth');
const { requireAdmin } = require('../middlewares/roleCheck');

// 🔁 Import des contrôleurs
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
  getMedicaments,
  approveModificationRequest,
  rejectModificationRequest,
  approveSuppressionRequest,
  rejectSuppressionRequest
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

// ✅ Middleware : Authentification + Vérification admin
router.use(authenticate);
router.use(requireAdmin);

/* ════════════════════════ ROUTES UTILISATEURS ════════════════════════ */
router.get('/users', getAllUsers);
router.get('/users/stats', getUserStats);
router.get('/users/:userId', getUserById);
router.put('/users/:userId/role', updateUserRole);
router.put('/users/:userId/status', toggleUserStatus);
router.delete('/users/:userId', deleteUser);

/* ════════════════════ ROUTES DEMANDES PHARMACIE ══════════════════════ */
router.get('/pharmacy-requests', getPharmacieDemandeCreationRequests);
router.post('/pharmacy-requests/:userId/approve', approvePharmacieRequest);
router.post('/pharmacy-requests/:userId/reject', rejectPharmacieRequest);
router.put('/pharmacy-requests/:userId/statut', updatePharmacyRequestStatus);
router.get('/pharmacy-requests/:pharmacieId', getPharmacieRequestDetails);
router.put('/pharmacy-requests/:pharmacieId/document', updatePharmacieDocuments);


/* ═════════════════════ ROUTES DEMANDES MODIFICATION/SUPPRESSION ═════════════════════ */
router.get('/modification-requests', getPharmacyModifDeleteRequests); // Nouvelle route
router.post('/modification-requests/:userId/approve', approveModificationRequest);
router.post('/modification-requests/:userId/reject', rejectModificationRequest);
router.post('/suppression-requests/:userId/approve', approveSuppressionRequest);
router.post('/suppression-requests/:userId/reject', rejectSuppressionRequest);

/* ══════════════════════ ROUTES STATISTIQUES ADMIN ═════════════════════ */
router.get('/dashboard', getAdminDashboard);
router.get('/stats/searches', getSearchStats);
router.get('/stats/pharmacies', getPharmacieStats);

/* ══════════════════════ ROUTES PHARMACIES VALIDÉES ═════════════════════ */
router.get('/pharmacies', getApprovedPharmacies);

/* ══════════════════ LIAISON BASE MÉDICAMENT À PHARMACIE ══════════════════ */
router.post('/pharmacy/:pharmacyId/assign-db', associerBaseMedicament);
router.post('/pharmacy/:pharmacyId/medicament/:medicamentId/image', uploadMedicamentImage);
router.get('/pharmacy/:pharmacyId/medicaments', getMedicaments);

module.exports = router;