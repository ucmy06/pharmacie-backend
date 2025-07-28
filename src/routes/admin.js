const express = require('express');
const router = express.Router();
const multer = require('multer');

const { User } = require('../models/User');

const { authenticate } = require('../middlewares/auth');
const { requireAdmin } = require('../middlewares/roleCheck');
const { uploadDrugImages } = require('../middlewares/multerConfig'); // ✅ Import correct

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
  getAllMedicaments
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

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'Uploads/medicaments');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const mimetype = filetypes.test(file.mimetype);
    if (mimetype) {
      return cb(null, true);
    }
    cb(new Error('Type de fichier non supporté. Seuls JPEG, JPG et PNG sont autorisés.'));
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

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
router.get('/pharmacy-requests/:pharmacieId', getPharmacieRequestDetails);
router.put('/pharmacy-requests/:pharmacieId/document', updatePharmacieDocuments);

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

router.post('/pharmacy/:pharmacyId/medicament/:medicamentId/image', upload.single('image'), uploadMedicamentImage);

router.post('/drug/image', 
  uploadDrugImages, // ✅ Middleware multer AVANT le contrôleur
  uploadDrugImageHandler
  
);

router.get('/medicaments/all', getAllMedicaments);

module.exports = router;