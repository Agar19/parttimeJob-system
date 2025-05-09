// server/controllers/shift-trades.controller.js
const { pool } = require('../app');

/**
 * Get all shift trade requests 
 * (Filtered by branch for managers or by employee for regular employees)
 */
exports.getAllShiftTrades = async (req, res, next) => {
  try {
    const { role, id: userId } = req.user;
    
    let query;
    let params = [];
    
    if (role === 'Manager' || role === 'Admin') {
      // For managers, get trades for their branches
      if (req.query.branchId) {
        // Filter by specific branch if provided
        query = `
          SELECT st.id, st.shift_id, st.requester_id, st.recipient_id, st.status, st.notes, st.created_at, st.updated_at, st.approved_at,
                 s.start_time, s.end_time, 
                 requester.name as requester_name,
                 recipient.name as recipient_name,
                 approver.name as approved_by_name,
                 b.name as branch_name
          FROM shift_trades st
          JOIN shifts s ON st.shift_id = s.id
          JOIN schedules sch ON s.schedule_id = sch.id
          JOIN branches b ON sch.branch_id = b.id
          JOIN employees e_req ON st.requester_id = e_req.id
          JOIN users requester ON e_req.user_id = requester.id
          LEFT JOIN employees e_rec ON st.recipient_id = e_rec.id
          LEFT JOIN users recipient ON e_rec.user_id = recipient.id
          LEFT JOIN users approver ON st.approved_by = approver.id
          WHERE sch.branch_id = $1
          ORDER BY st.created_at DESC
        `;
        params = [req.query.branchId];
      } else {
        // Get all trades for all branches managed by this manager
        query = `
          SELECT st.id, st.shift_id, st.requester_id, st.recipient_id, st.status, st.notes, st.created_at, st.updated_at, st.approved_at,
                 s.start_time, s.end_time, 
                 requester.name as requester_name,
                 recipient.name as recipient_name,
                 approver.name as approved_by_name,
                 b.name as branch_name
          FROM shift_trades st
          JOIN shifts s ON st.shift_id = s.id
          JOIN schedules sch ON s.schedule_id = sch.id
          JOIN branches b ON sch.branch_id = b.id
          JOIN employees e_req ON st.requester_id = e_req.id
          JOIN users requester ON e_req.user_id = requester.id
          LEFT JOIN employees e_rec ON st.recipient_id = e_rec.id
          LEFT JOIN users recipient ON e_rec.user_id = recipient.id
          LEFT JOIN users approver ON st.approved_by = approver.id
          JOIN users m ON b.manager_id = m.id
          WHERE m.id = $1
          ORDER BY st.created_at DESC
        `;
        params = [userId];
      }
    } else {
      // For employees, get their own trade requests
      // First get the employee ID from user ID
      const employeeResult = await pool.query(
        'SELECT id FROM employees WHERE user_id = $1',
        [userId]
      );
      
      if (employeeResult.rows.length === 0) {
        return res.status(404).json({
          error: { message: 'Employee not found' }
        });
      }
      
      const employeeId = employeeResult.rows[0].id;
      
      query = `
        SELECT st.id, st.shift_id, st.requester_id, st.recipient_id, st.status, st.notes, st.created_at, st.updated_at, st.approved_at,
               s.start_time, s.end_time, 
               requester.name as requester_name,
               recipient.name as recipient_name,
               approver.name as approved_by_name,
               b.name as branch_name
        FROM shift_trades st
        JOIN shifts s ON st.shift_id = s.id
        JOIN schedules sch ON s.schedule_id = sch.id
        JOIN branches b ON sch.branch_id = b.id
        JOIN employees e_req ON st.requester_id = e_req.id
        JOIN users requester ON e_req.user_id = requester.id
        LEFT JOIN employees e_rec ON st.recipient_id = e_rec.id
        LEFT JOIN users recipient ON e_rec.user_id = recipient.id
        LEFT JOIN users approver ON st.approved_by = approver.id
        WHERE st.requester_id = $1 OR st.recipient_id = $1
        ORDER BY st.created_at DESC
      `;
      params = [employeeId];
    }
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
};

/**
 * Get available shift trades (shifts offered by other employees)
 */
exports.getAvailableShiftTrades = async (req, res, next) => {
  try {
    // Get current employee ID
    const employeeResult = await pool.query(
      'SELECT e.id, e.branch_id FROM employees e WHERE e.user_id = $1',
      [req.user.id]
    );
    
    if (employeeResult.rows.length === 0) {
      return res.status(404).json({
        error: { message: 'Employee not found' }
      });
    }
    
    const employeeId = employeeResult.rows[0].id;
    const branchId = employeeResult.rows[0].branch_id;
    
    // Get trades that are pending and don't have a recipient yet
    // Only from the same branch, and not requested by the current employee
    const query = `
      SELECT st.id, st.shift_id, st.requester_id, st.status, st.notes, st.created_at,
             s.start_time, s.end_time, 
             requester.name as requester_name,
             b.name as branch_name
      FROM shift_trades st
      JOIN shifts s ON st.shift_id = s.id
      JOIN schedules sch ON s.schedule_id = sch.id
      JOIN branches b ON sch.branch_id = b.id
      JOIN employees e_req ON st.requester_id = e_req.id
      JOIN users requester ON e_req.user_id = requester.id
      WHERE st.status = 'Pending'
        AND st.recipient_id IS NULL
        AND st.requester_id != $1
        AND e_req.branch_id = $2
        AND s.start_time > NOW() -- Only future shifts
      ORDER BY s.start_time
    `;
    
    const result = await pool.query(query, [employeeId, branchId]);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new shift trade request
 */
exports.createShiftTrade = async (req, res, next) => {
  try {
    const { shiftId, notes, recipientId } = req.body;
    
    // Get current employee ID
    const employeeResult = await pool.query(
      'SELECT id FROM employees WHERE user_id = $1',
      [req.user.id]
    );
    
    if (employeeResult.rows.length === 0) {
      return res.status(404).json({
        error: { message: 'Employee not found' }
      });
    }
    
    const requesterId = employeeResult.rows[0].id;
    
    // Verify the shift belongs to the requester
    const shiftResult = await pool.query(
      'SELECT id FROM shifts WHERE id = $1 AND employee_id = $2',
      [shiftId, requesterId]
    );
    
    if (shiftResult.rows.length === 0) {
      return res.status(403).json({
        error: { message: 'This shift does not belong to you or does not exist' }
      });
    }
    
    // Check if there's already an active trade request for this shift
    const existingTradeResult = await pool.query(
      "SELECT id FROM shift_trades WHERE shift_id = $1 AND status = 'Pending'",
      [shiftId]
    );
    
    if (existingTradeResult.rows.length > 0) {
      return res.status(400).json({
        error: { message: 'There is already an active trade request for this shift' }
      });
    }
    
    // Create the trade request
    const result = await pool.query(
      `INSERT INTO shift_trades (shift_id, requester_id, recipient_id, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      [shiftId, requesterId, recipientId || null, notes || null]
    );
    
    // Get the complete trade details to return
    const tradeResult = await pool.query(
      `SELECT st.id, st.shift_id, st.requester_id, st.recipient_id, st.status, st.notes, st.created_at,
              s.start_time, s.end_time,
              requester.name as requester_name,
              recipient.name as recipient_name
       FROM shift_trades st
       JOIN shifts s ON st.shift_id = s.id
       JOIN employees e_req ON st.requester_id = e_req.id
       JOIN users requester ON e_req.user_id = requester.id
       LEFT JOIN employees e_rec ON st.recipient_id = e_rec.id
       LEFT JOIN users recipient ON e_rec.user_id = recipient.id
       WHERE st.id = $1`,
      [result.rows[0].id]
    );
    
    res.status(201).json(tradeResult.rows[0]);
  } catch (error) {
    next(error);
  }
};

/**
 * Accept a shift trade request (by another employee)
 */
exports.acceptShiftTrade = async (req, res, next) => {
  try {
    const { tradeId } = req.params;
    
    // Get current employee ID
    const employeeResult = await pool.query(
      'SELECT id, branch_id FROM employees WHERE user_id = $1',
      [req.user.id]
    );
    
    if (employeeResult.rows.length === 0) {
      return res.status(404).json({
        error: { message: 'Employee not found' }
      });
    }
    
    const employeeId = employeeResult.rows[0].id;
    const employeeBranchId = employeeResult.rows[0].branch_id;
    
    // Get trade details
    const tradeResult = await pool.query(
      `SELECT st.id, st.shift_id, st.requester_id, st.recipient_id, st.status,
              s.employee_id as shift_employee_id,
              s.start_time, s.end_time,
              sch.branch_id
       FROM shift_trades st
       JOIN shifts s ON st.shift_id = s.id
       JOIN schedules sch ON s.schedule_id = sch.id
       WHERE st.id = $1`,
      [tradeId]
    );
    
    if (tradeResult.rows.length === 0) {
      return res.status(404).json({
        error: { message: 'Trade request not found' }
      });
    }
    
    const trade = tradeResult.rows[0];
    
    // Check branch match
    if (trade.branch_id !== employeeBranchId) {
      return res.status(403).json({
        error: { message: 'You cannot accept a trade from a different branch' }
      });
    }
    
    // Verify trade is still pending and has no recipient yet
    if (trade.status !== 'Pending' || trade.recipient_id !== null) {
      return res.status(400).json({
        error: { message: 'This trade request is no longer available' }
      });
    }
    
    // Make sure employee is not the requester
    if (trade.requester_id === employeeId) {
      return res.status(400).json({
        error: { message: 'You cannot accept your own trade request' }
      });
    }
    
    // Start transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Update the trade request with recipient
      await client.query(
        `UPDATE shift_trades
         SET recipient_id = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [employeeId, tradeId]
      );
      
      await client.query('COMMIT');
      
      // Get updated trade details
      const updatedTradeResult = await pool.query(
        `SELECT st.id, st.shift_id, st.requester_id, st.recipient_id, st.status, st.notes, st.created_at, st.updated_at,
                s.start_time, s.end_time,
                requester.name as requester_name,
                recipient.name as recipient_name
         FROM shift_trades st
         JOIN shifts s ON st.shift_id = s.id
         JOIN employees e_req ON st.requester_id = e_req.id
         JOIN users requester ON e_req.user_id = requester.id
         LEFT JOIN employees e_rec ON st.recipient_id = e_rec.id
         LEFT JOIN users recipient ON e_rec.user_id = recipient.id
         WHERE st.id = $1`,
        [tradeId]
      );
      
      res.json(updatedTradeResult.rows[0]);
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
 * Cancel a shift trade request (by the requester)
 */
exports.cancelShiftTrade = async (req, res, next) => {
  try {
    const { tradeId } = req.params;
    
    // Get current employee ID
    const employeeResult = await pool.query(
      'SELECT id FROM employees WHERE user_id = $1',
      [req.user.id]
    );
    
    if (employeeResult.rows.length === 0) {
      return res.status(404).json({
        error: { message: 'Employee not found' }
      });
    }
    
    const employeeId = employeeResult.rows[0].id;
    
    // Verify trade belongs to this employee
    const tradeResult = await pool.query(
      `SELECT id, requester_id, status FROM shift_trades WHERE id = $1`,
      [tradeId]
    );
    
    if (tradeResult.rows.length === 0) {
      return res.status(404).json({
        error: { message: 'Trade request not found' }
      });
    }
    
    const trade = tradeResult.rows[0];
    
    // Verify employee is the requester
    if (trade.requester_id !== employeeId) {
      return res.status(403).json({
        error: { message: 'You can only cancel your own trade requests' }
      });
    }
    
    // Verify trade is still pending
    if (trade.status !== 'Pending') {
      return res.status(400).json({
        error: { message: 'Only pending trade requests can be cancelled' }
      });
    }
    
    // Update trade status
    const result = await pool.query(
      `UPDATE shift_trades
       SET status = 'Cancelled', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, status`,
      [tradeId]
    );
    
    res.json({
      id: result.rows[0].id,
      status: result.rows[0].status,
      message: 'Trade request cancelled successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Approve or reject a shift trade request (by a manager)
 */
exports.updateShiftTradeStatus = async (req, res, next) => {
  try {
    const { tradeId } = req.params;
    const { status } = req.body;
    
    // Validate status
    if (!status || !['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({
        error: { message: 'Valid status (Approved or Rejected) is required' }
      });
    }
    
    // Get trade details
    const tradeResult = await pool.query(
      `SELECT st.id, st.shift_id, st.requester_id, st.recipient_id, st.status,
              s.employee_id as shift_employee_id,
              s.start_time, s.end_time, s.schedule_id,
              sch.branch_id
       FROM shift_trades st
       JOIN shifts s ON st.shift_id = s.id
       JOIN schedules sch ON s.schedule_id = sch.id
       WHERE st.id = $1`,
      [tradeId]
    );
    
    if (tradeResult.rows.length === 0) {
      return res.status(404).json({
        error: { message: 'Trade request not found' }
      });
    }
    
    const trade = tradeResult.rows[0];
    
    // Verify trade has a recipient
    if (trade.recipient_id === null) {
      return res.status(400).json({
        error: { message: 'Cannot approve/reject a trade without a recipient' }
      });
    }
    
    // Verify trade is still pending
    if (trade.status !== 'Pending') {
      return res.status(400).json({
        error: { message: 'Only pending trade requests can be approved/rejected' }
      });
    }
    
    // Verify the manager has rights to this branch
    const branchResult = await pool.query(
      `SELECT id FROM branches WHERE id = $1 AND manager_id = $2`,
      [trade.branch_id, req.user.id]
    );
    
    if (branchResult.rows.length === 0 && req.user.role !== 'Admin') {
      return res.status(403).json({
        error: { message: 'You do not have permission to approve trades for this branch' }
      });
    }
    
    // Start transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Update trade status
      await client.query(
        `UPDATE shift_trades
         SET status = $1, approved_by = $2, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [status, req.user.id, tradeId]
      );
      
      // If approved, also update the shift assignment
      if (status === 'Approved') {
        await client.query(
          `UPDATE shifts
           SET employee_id = $1
           WHERE id = $2`,
          [trade.recipient_id, trade.shift_id]
        );
      }
      
      await client.query('COMMIT');
      
      // Get updated trade details
      const updatedTradeResult = await pool.query(
        `SELECT st.id, st.shift_id, st.requester_id, st.recipient_id, st.status, st.notes, st.created_at, st.updated_at, st.approved_at,
                s.start_time, s.end_time,
                requester.name as requester_name,
                recipient.name as recipient_name,
                approver.name as approved_by_name
         FROM shift_trades st
         JOIN shifts s ON st.shift_id = s.id
         JOIN employees e_req ON st.requester_id = e_req.id
         JOIN users requester ON e_req.user_id = requester.id
         JOIN employees e_rec ON st.recipient_id = e_rec.id
         JOIN users recipient ON e_rec.user_id = recipient.id
         JOIN users approver ON st.approved_by = approver.id
         WHERE st.id = $1`,
        [tradeId]
      );
      
      res.json({
        ...updatedTradeResult.rows[0],
        message: `Trade request ${status.toLowerCase()} successfully`
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