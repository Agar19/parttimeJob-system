const express = require('express');
const schedulesController = require('../controllers/schedules.controller');
const { authenticateToken, authorizeRole } = require('../middleware/auth.middleware');
const router = express.Router();

// Protected routes (need authentication)
router.use(authenticateToken);

// Routes accessible to all authenticated users
router.get('/:scheduleId/settings', schedulesController.getScheduleSettings);
router.get('/:scheduleId', schedulesController.getScheduleById);
router.get('/branch/:branchId', schedulesController.getSchedulesByBranch);

// Routes only for managers and admins
router.use(authorizeRole(['Manager', 'Admin']));
router.get('/', schedulesController.getAllSchedules);
router.post('/', schedulesController.createSchedule);
router.post('/:scheduleId/generate', schedulesController.generateSchedule);
router.delete('/:scheduleId', schedulesController.deleteSchedule);

module.exports = router;