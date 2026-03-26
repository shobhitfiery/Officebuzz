// routes/authRoutes.js

const express = require('express');
const { registerUser, authUser, getUserProfile, getAllUsers, resetUserPassword, deleteUser } = require('../controllers/authController');
const { protect, admin } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', authUser);

//Private
router.get('/profile', protect, getUserProfile);

// Admin only - fetch all users
router.get('/', protect, admin, getAllUsers);
// Admin only - reset a user's password
router.put('/:id/reset-password', protect, admin, resetUserPassword);
router.put('/reset-password/:id', protect, admin, resetUserPassword);
router.post('/:id/reset-password', protect, admin, resetUserPassword);
router.post('/reset-password/:id', protect, admin, resetUserPassword);
// Admin only - delete a user
router.delete('/:id', protect, admin, deleteUser);

module.exports = router;
