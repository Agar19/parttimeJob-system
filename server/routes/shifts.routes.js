const express = require('express');
const shiftsController = require('../controllers/shifts.controller');
const { authenticateToken, authorizeRole } = require('../middleware/auth.middleware');
const router = express.Router();

// Protected routes (need authentication)
router.use(authenticateToken);

// Get shifts by employee (employees can view their own shifts)
router.get('/employee/:employeeId', shiftsController.getShiftsByEmployee);

// All other routes only for managers and admins
router.use(authorizeRole(['Manager', 'Admin']));

// Get shifts by schedule
router.get('/schedule/:scheduleId', shiftsController.getShiftsBySchedule);

// Create shift
router.post('/', shiftsController.createShift);

// Update shift
router.put('/:shiftId', shiftsController.updateShift);

// Delete shift
router.delete('/:shiftId', shiftsController.deleteShift);

module.exports = router;