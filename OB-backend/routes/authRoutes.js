// (routes/authRoutes.js

const express = require('express');
const { registerUser, authUser, getUserProfile, getAllUsers } = require('../controllers/authController');
const { protect, admin } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', authUser);

//Private
router.get('/profile', protect, getUserProfile);

// Admin only - fetch all users
router.get('/', protect, admin, getAllUsers);

module.exports = router;
