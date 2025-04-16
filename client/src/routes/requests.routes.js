const express = require('express');
const { authenticateToken, authorizeRole } = require('../middleware/auth.middleware');
const router = express.Router();

// Protected routes (need authentication)
router.use(authenticateToken);

// Get requests for a specific employee
router.get('/employee/:employeeId', async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    
    const result = await pool.query(
      `SELECT r.id, r.shift_id, r.status, r.created_at,
              s.start_time, s.end_time, s.status as shift_status
       FROM requests r
       JOIN shifts s ON r.shift_id = s.id
       WHERE r.employee_id = $1
       ORDER BY r.created_at DESC`,
      [employeeId]
    );
    
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// Create request
router.post('/', async (req, res, next) => {
    try {
      const { employeeId, shiftId } = req.body;
      
      // Validate input
      if (!employeeId || !shiftId) {
        return res.status(400).json({
          error: { message: 'Employee ID and shift ID are required' }
        });
      }
      
      // Check if a request already exists
      const existingRequest = await pool.query(
        'SELECT id FROM requests WHERE employee_id = $1 AND shift_id = $2',
        [employeeId, shiftId]
      );
      
      if (existingRequest.rows.length > 0) {
        return res.status(400).json({
          error: { message: 'A request for this shift already exists' }
        });
      }
      
      // Create request
      const result = await pool.query(
        `INSERT INTO requests (employee_id, shift_id, status, created_at)
         VALUES ($1, $2, 'Pending', CURRENT_TIMESTAMP)
         RETURNING *`,
        [employeeId, shiftId]
      );
      
      res.status(201).json(result.rows[0]);
    } catch (error) {
      next(error);
    }
  });
  
  // Only managers and admins can access these routes
  router.use(authorizeRole(['Manager', 'Admin']));
  
  // Get all requests
  router.get('/', async (req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT r.id, r.employee_id, r.shift_id, r.status, r.created_at,
                e.user_id, u.name as employee_name,
                s.start_time, s.end_time, s.status as shift_status
         FROM requests r
         JOIN employees e ON r.employee_id = e.id
         JOIN users u ON e.user_id = u.id
         JOIN shifts s ON r.shift_id = s.id
         ORDER BY r.created_at DESC`
      );
      
      res.json(result.rows);
    } catch (error) {
      next(error);
    }
  });
  
  // Update request status
  router.patch('/:requestId', async (req, res, next) => {
    try {
      const { requestId } = req.params;
      const { status } = req.body;
      
      // Validate input
      if (!status || !['Approved', 'Rejected', 'Pending'].includes(status)) {
        return res.status(400).json({
          error: { message: 'Valid status is required' }
        });
      }
      
      // Update request
      const result = await pool.query(
        'UPDATE requests SET status = $1 WHERE id = $2 RETURNING *',
        [status, requestId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          error: { message: 'Request not found' }
        });
      }
      
      res.json(result.rows[0]);
    } catch (error) {
      next(error);
    }
  });
  
  module.exports = router;