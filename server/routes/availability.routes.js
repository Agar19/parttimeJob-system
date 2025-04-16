// server/routes/availability.routes.js
const express = require('express');
const availabilityController = require('../controllers/availability.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const router = express.Router();

// Protected routes (need authentication)
router.use(authenticateToken);

// Get employee availability
router.get('/employee/:employeeId', availabilityController.getEmployeeAvailability);

// Save employee availability
router.post('/employee/:employeeId', availabilityController.saveEmployeeAvailability);

module.exports = router;