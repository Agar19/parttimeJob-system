const { pool } = require('../app');

/**
 * Get all branches
 */
exports.getAllBranches = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT b.id, b.name, b.location, b.manager_id, b.created_at,
              u.name as manager_name,
              COUNT(e.id) as employee_count
       FROM branches b
       LEFT JOIN users u ON b.manager_id = u.id
       LEFT JOIN employees e ON b.id = e.branch_id
       GROUP BY b.id, u.name
       ORDER BY b.name`,
    );
    
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
};

/**
 * Get branch by ID
 */
exports.getBranchById = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    
    const result = await pool.query(
      `SELECT b.id, b.name, b.location, b.manager_id, b.created_at,
              u.name as manager_name
       FROM branches b
       LEFT JOIN users u ON b.manager_id = u.id
       WHERE b.id = $1`,
      [branchId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { message: 'Branch not found' }
      });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
};

/**
 * Create branch
 */
exports.createBranch = async (req, res, next) => {
  try {
    const { name, location, managerId } = req.body;
    
    // Input validation
    if (!name) {
      return res.status(400).json({
        error: { message: 'Branch name is required' }
      });
    }
    
    // Create branch
    const result = await pool.query(
      `INSERT INTO branches (name, location, manager_id, created_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       RETURNING id, name, location, manager_id, created_at`,
      [name, location, managerId]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
};

/**
 * Update branch
 */
exports.updateBranch = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const { name, location, managerId } = req.body;
    
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
    
    // Update branch
    const result = await pool.query(
      `UPDATE branches
       SET name = COALESCE($1, name),
           location = COALESCE($2, location),
           manager_id = COALESCE($3, manager_id)
       WHERE id = $4
       RETURNING id, name, location, manager_id, created_at`,
      [name, location, managerId, branchId]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
};

/**
 * Delete branch
 */
exports.deleteBranch = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    
    // Check if branch has employees
    const employeesCount = await pool.query(
      'SELECT COUNT(*) FROM employees WHERE branch_id = $1',
      [branchId]
    );
    
    if (parseInt(employeesCount.rows[0].count) > 0) {
      return res.status(400).json({
        error: { message: 'Cannot delete branch with employees' }
      });
    }
    
    // Delete branch
    const result = await pool.query(
      'DELETE FROM branches WHERE id = $1 RETURNING id',
      [branchId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { message: 'Branch not found' }
      });
    }
    
    res.json({ message: 'Branch deleted successfully' });
  } catch (error) {
    next(error);
  }
};