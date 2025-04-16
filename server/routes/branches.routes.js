const express = require('express');
const branchesController = require('../controllers/branches.controller');
const { authenticateToken, authorizeRole } = require('../middleware/auth.middleware');
const router = express.Router();

// Protected routes (need authentication)
router.use(authenticateToken);

// Get all branches
router.get('/', branchesController.getAllBranches);

// Get branch by ID
router.get('/:branchId', branchesController.getBranchById);

// Routes only for managers and admins
router.use(authorizeRole(['Manager', 'Admin']));

// Create branch
router.post('/', branchesController.createBranch);

// Update branch
router.put('/:branchId', branchesController.updateBranch);

// Delete branch
router.delete('/:branchId', branchesController.deleteBranch);

module.exports = router;