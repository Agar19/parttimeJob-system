// server/routes/shift-trades.routes.js
const express = require('express');
const shiftTradesController = require('../controllers/shift-trades.controller');
const { authenticateToken, authorizeRole } = require('../middleware/auth.middleware');
const router = express.Router();

// Protected routes (need authentication)
router.use(authenticateToken);

// Routes for all authenticated users
router.get('/', shiftTradesController.getAllShiftTrades);
router.get('/available', shiftTradesController.getAvailableShiftTrades);
router.post('/', shiftTradesController.createShiftTrade);
router.post('/:tradeId/accept', shiftTradesController.acceptShiftTrade);
router.post('/:tradeId/cancel', shiftTradesController.cancelShiftTrade);

// Routes only for managers and admins
router.patch('/:tradeId/status', authorizeRole(['Manager', 'Admin']), shiftTradesController.updateShiftTradeStatus);

module.exports = router;