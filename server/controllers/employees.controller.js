const { pool } = require('../app');
const bcrypt = require('bcrypt');
/**
 * Get all employees
 */
exports.getAllEmployees = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT e.id, e.user_id, e.branch_id, e.status, e.created_at,
              u.name, u.email, u.phone,
              b.name as branch_name
       FROM employees e
       JOIN users u ON e.user_id = u.id
       JOIN branches b ON e.branch_id = b.id
       ORDER BY u.name`,
    );
    
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
};

/**
 * Get employees by branch
 */
exports.getEmployeesByBranch = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    
    const result = await pool.query(
      `SELECT e.id, e.user_id, e.status, e.created_at,
              u.name, u.email, u.phone
       FROM employees e
       JOIN users u ON e.user_id = u.id
       WHERE e.branch_id = $1
       ORDER BY u.name`,
      [branchId]
    );
    
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
};

/**
 * Get employee by ID
 */
exports.getEmployeeById = async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    
    const result = await pool.query(
      `SELECT e.id, e.user_id, e.branch_id, e.status, e.created_at,
              u.name, u.email, u.phone,
              b.name as branch_name
       FROM employees e
       JOIN users u ON e.user_id = u.id
       JOIN branches b ON e.branch_id = b.id
       WHERE e.id = $1`,
      [employeeId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { message: 'Employee not found' }
      });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
};

/**
 * Create employee
 */
exports.createEmployee = async (req, res, next) => {
  try {
    const { name, email, password, phone, branchId } = req.body;
    
    // Input validation
    if (!name || !email || !password || !branchId) {
      return res.status(400).json({
        error: { message: 'Name, email, password, and branch ID are required' }
      });
    }
    
    // Start transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check if user already exists
      const userExists = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );
      
      if (userExists.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: { message: 'User with that email already exists' }
        });
      }
      
      // Create user
      const hashedPassword = await bcrypt.hash(password, 10);
      
      const newUser = await client.query(
        `INSERT INTO users (name, email, password, role, phone, created_at, updated_at)
         VALUES ($1, $2, $3, 'Employee', $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id`,
        [name, email, hashedPassword, phone]
      );
      
      const userId = newUser.rows[0].id;
      
      // Create employee
      const newEmployee = await client.query(
        `INSERT INTO employees (user_id, branch_id, status, created_at)
         VALUES ($1, $2, 'Active', CURRENT_TIMESTAMP)
         RETURNING id`,
        [userId, branchId]
      );
      
      await client.query('COMMIT');
      
      res.status(201).json({
        id: newEmployee.rows[0].id,
        user_id: userId,
        branch_id: branchId,
        status: 'Active',
        name,
        email
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Update employee status
 */
exports.updateEmployeeStatus = async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const { status } = req.body;
    
    // Input validation
    if (!status || !['Active', 'Inactive'].includes(status)) {
      return res.status(400).json({
        error: { message: 'Valid status is required (Active or Inactive)' }
      });
    }
    
    // Update employee
    const result = await pool.query(
      `UPDATE employees
       SET status = $1
       WHERE id = $2
       RETURNING id, user_id, branch_id, status`,
      [status, employeeId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { message: 'Employee not found' }
      });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
};

/**
 * Change employee branch
 */
exports.changeEmployeeBranch = async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const { branchId } = req.body;
    
    // Input validation
    if (!branchId) {
      return res.status(400).json({
        error: { message: 'Branch ID is required' }
      });
    }
    
   // Check if branch exists
   const branchExists = await pool.query(
    'SELECT id FROM branches WHERE id = $1',
    [branchId]
  );
  
  if (branchExists.rows.length === 0) {
    return res.status(404).json({
      error: { message: 'Branch not found' }
    });
  }
  
  // Update employee's branch
  const result = await pool.query(
    `UPDATE employees
     SET branch_id = $1
     WHERE id = $2
     RETURNING id, user_id, branch_id, status`,
    [branchId, employeeId]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({
      error: { message: 'Employee not found' }
    });
  }
  
  res.json(result.rows[0]);
} catch (error) {
  next(error);
}
};

// Add this to server/controllers/employees.controller.js

/**
 * Delete employee
 */
exports.deleteEmployee = async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // First get the user_id for this employee
      const employeeResult = await client.query(
        'SELECT user_id FROM employees WHERE id = $1',
        [employeeId]
      );
      
      if (employeeResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          error: { message: 'Employee not found' }
        });
      }
      
      const userId = employeeResult.rows[0].user_id;
      
      // Delete availability records
      await client.query(
        'DELETE FROM availability WHERE employee_id = $1',
        [employeeId]
      );
      
      // Delete shift assignments
      await client.query(
        'DELETE FROM shifts WHERE employee_id = $1',
        [employeeId]
      );
      
      // Delete the employee record
      await client.query(
        'DELETE FROM employees WHERE id = $1',
        [employeeId]
      );
      
      // Delete the user record
      await client.query(
        'DELETE FROM users WHERE id = $1',
        [userId]
      );
      
      await client.query('COMMIT');
      
      res.json({ 
        message: 'Employee deleted successfully',
        deletedId: employeeId
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
};