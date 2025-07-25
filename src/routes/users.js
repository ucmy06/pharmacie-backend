//C:\reactjs node mongodb\pharmacie-backend\src\routes\users.js

const express = require('express');
const router = express.Router();
const {
  getAllUsers,
  getUserById,
  updateUserRole,
  toggleUserStatus,
  deleteUser,
  getMedicaments, // ✅ Added
  getUserStats
} = require('../controllers/userController');
const { authenticate } = require('../middlewares/auth');
const { requireAdmin, requireAdminOrOwner } = require('../middlewares/roleCheck');

router.get('/:id/medicaments', authenticate, getMedicaments); // ✅ Fixed

// route GET /api/pharmacies/:id/medicaments



// Routes administrateur
router.get('/', authenticate, requireAdmin, getAllUsers);
router.get('/stats', authenticate, requireAdmin, getUserStats);
router.put('/:userId/role', authenticate, requireAdmin, updateUserRole);
router.put('/:userId/status', authenticate, requireAdmin, toggleUserStatus);
router.delete('/:userId', authenticate, requireAdmin, deleteUser);

// Routes accessibles par admin ou propriétaire du compte
router.get('/:userId', authenticate, requireAdminOrOwner, getUserById);



module.exports = router;