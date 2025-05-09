const express = require('express');
const employeesController = require('../controllers/employees.controller');
const { authenticateToken, authorizeRole } = require('../middleware/auth.middleware');
const router = express.Router();

// Protected routes (need authentication)
router.use(authenticateToken);

// Get employee by ID
router.get('/:employeeId', employeesController.getEmployeeById);

// Get employees by branch
router.get('/branch/:branchId', employeesController.getEmployeesByBranch);

// Routes only for managers and admins
router.use(authorizeRole(['Manager', 'Admin']));

// Get all employees
router.get('/', employeesController.getAllEmployees);

// Create employee
router.post('/', employeesController.createEmployee);

// Update employee status
router.patch('/:employeeId/status', employeesController.updateEmployeeStatus);

// Change employee branch
router.patch('/:employeeId/branch', employeesController.changeEmployeeBranch);

// Delete employee
router.delete('/:employeeId', employeesController.deleteEmployee);

module.exports = router;