// routes/authRoutes.js
const express = require('express');
const { registerUser, authUser, getUserProfile, updateUserProfile, getAllUsers, resetUserPassword, deleteUser, forgotPassword, resetPasswordWithOtp } = require('../controllers/authController');
const { protect, admin } = require('../middleware/authMiddleware');
const { uploadAvatar, deleteAvatar, getAvatar, listAvatars } = require('../controllers/authController');
const { trackAction } = require('../services/analytics');

const router = express.Router();

router.post('/login', authUser);

// Password reset with an emailed one-time code (public)
router.post('/forgot-password', trackAction('password_reset_requested', () => undefined), forgotPassword);
router.post('/reset-password', trackAction('password_reset_completed', () => undefined), resetPasswordWithOtp);

// Only admins can create accounts (public self-registration is disabled)
router.post('/register', protect, admin, trackAction('user_created', () => undefined), registerUser);
router.post('/', protect, admin, trackAction('user_created', () => undefined), registerUser);

// Private
router.get('/profile', protect, getUserProfile);
router.put('/profile', protect, trackAction('profile_updated', () => undefined), updateUserProfile);
router.put('/profile/avatar', protect, trackAction('avatar_updated', () => undefined), uploadAvatar);
router.delete('/profile/avatar', protect, trackAction('avatar_removed', () => undefined), deleteAvatar);
router.get('/avatars', protect, listAvatars);
router.get('/avatar/:id', getAvatar);

// Admin only
router.get('/', protect, admin, getAllUsers);
router.put('/:id/reset-password', protect, admin, trackAction('password_reset_by_admin'), resetUserPassword);
// Legacy aliases kept so older clients keep working
router.put('/reset-password/:id', protect, admin, trackAction('password_reset_by_admin'), resetUserPassword);
router.post('/:id/reset-password', protect, admin, trackAction('password_reset_by_admin'), resetUserPassword);
router.post('/reset-password/:id', protect, admin, trackAction('password_reset_by_admin'), resetUserPassword);
router.delete('/:id', protect, admin, trackAction('user_deleted'), deleteUser);

module.exports = router;
