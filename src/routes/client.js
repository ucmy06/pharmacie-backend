// C:\reactjs node mongodb\pharmacie-backend\src\routes\client.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const { getMedicaments } = require('../controllers/adminController');

router.get('/pharmacy/:pharmacyId/medicaments', authenticate, getMedicaments);

module.exports = router;