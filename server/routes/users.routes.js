const express = require('express');
const usersController = require('../controllers/users.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const router = express.Router();

// Protected routes (need authentication)
router.use(authenticateToken);

// Get current user profile
router.get('/me', usersController.getCurrentUser);

// Update user profile
router.put('/profile', usersController.updateUserProfile);

module.exports = router;