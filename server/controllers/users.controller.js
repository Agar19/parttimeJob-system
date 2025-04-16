const { pool } = require('../app');
const bcrypt = require('bcrypt');

/**
 * Get current user profile
 */
exports.getCurrentUser = async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    // Get user details
    const userResult = await pool.query(
      'SELECT id, name, email, role, phone, created_at FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: { message: 'User not found' }
      });
    }
    
    const user = userResult.rows[0];
    
    // Get additional data based on role
    if (user.role === 'Manager') {
      const branchesResult = await pool.query(
        'SELECT id, name, location FROM branches WHERE manager_id = $1',
        [userId]
      );
      user.branches = branchesResult.rows;
    } else if (user.role === 'Employee') {
      const employeeResult = await pool.query(
        `SELECT e.id, e.branch_id, e.status, b.name as branch_name
         FROM employees e
         JOIN branches b ON e.branch_id = b.id
         WHERE e.user_id = $1`,
        [userId]
      );
      
      if (employeeResult.rows.length > 0) {
        user.employee = employeeResult.rows[0];
      }
    }
    
    res.json(user);
  } catch (error) {
    next(error);
  }
};

/**
 * Update user profile
 */
exports.updateUserProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { name, phone, currentPassword, newPassword } = req.body;
    
    // Start transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // If changing password, verify current password
      if (newPassword) {
        if (!currentPassword) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: { message: 'Current password is required to set a new password' }
          });
        }
        
        const userResult = await client.query(
          'SELECT password FROM users WHERE id = $1',
          [userId]
        );
        
        if (userResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({
            error: { message: 'User not found' }
          });
        }
        
        const validPassword = await bcrypt.compare(
          currentPassword,
          userResult.rows[0].password
        );
        
        if (!validPassword) {
          await client.query('ROLLBACK');
          return res.status(401).json({
            error: { message: 'Current password is incorrect' }
          });
        }
        
        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        
        // Update user with new password
        await client.query(
          `UPDATE users
           SET name = COALESCE($1, name),
               phone = COALESCE($2, phone),
               password = $3,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [name, phone, hashedPassword, userId]
        );
      } else {
        // Update user without changing password
        await client.query(
          `UPDATE users
           SET name = COALESCE($1, name),
               phone = COALESCE($2, phone),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [name, phone, userId]
        );
      }
      
      await client.query('COMMIT');
      
      // Get updated user
      const updatedUser = await pool.query(
        'SELECT id, name, email, role, phone, created_at FROM users WHERE id = $1',
        [userId]
      );
      
      res.json(updatedUser.rows[0]);
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