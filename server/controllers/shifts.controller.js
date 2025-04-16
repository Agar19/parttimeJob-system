const { pool } = require('../app');

/**
 * Get all shifts for a specific schedule
 */
exports.getShiftsBySchedule = async (req, res, next) => {
  try {
    const { scheduleId } = req.params;
    
    const result = await pool.query(
      `SELECT s.id, s.employee_id, s.start_time, s.end_time, s.status,
              e.user_id, u.name as employee_name, b.name as branch_name
       FROM shifts s
       JOIN employees e ON s.employee_id = e.id
       JOIN users u ON e.user_id = u.id
       JOIN schedules sch ON s.schedule_id = sch.id
       JOIN branches b ON sch.branch_id = b.id
       WHERE s.schedule_id = $1
       ORDER BY s.start_time`,
      [scheduleId]
    );
    
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
};

/**
 * Get shifts for a specific employee within a date range
 */
exports.getShiftsByEmployee = async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const { startDate, endDate } = req.query;
    
    let query = `
      SELECT s.id, s.schedule_id, s.start_time, s.end_time, s.status,
             b.name as branch_name
      FROM shifts s
      JOIN schedules sch ON s.schedule_id = sch.id
      JOIN branches b ON sch.branch_id = b.id
      WHERE s.employee_id = $1
    `;
    
    const queryParams = [employeeId];
    
    if (startDate && endDate) {
      query += ` AND s.start_time >= $2 AND s.start_time <= $3`;
      queryParams.push(startDate, endDate);
    }
    
    query += ` ORDER BY s.start_time`;
    
    const result = await pool.query(query, queryParams);
    
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new shift
 */
exports.createShift = async (req, res, next) => {
  try {
    const { scheduleId, employeeId, startTime, endTime, status = 'Pending' } = req.body;
    
    // Validate input
    if (!scheduleId || !employeeId || !startTime || !endTime) {
      return res.status(400).json({
        error: { message: 'Missing required fields' }
      });
    }
    
    // Check if employee belongs to the branch
    const employeeCheck = await pool.query(
      `SELECT e.id FROM employees e
       JOIN schedules s ON e.branch_id = s.branch_id
       WHERE e.id = $1 AND s.id = $2`,
      [employeeId, scheduleId]
    );
    
    if (employeeCheck.rows.length === 0) {
      return res.status(400).json({
        error: { message: 'Employee does not belong to this branch' }
      });
    }
    
    // Create shift
    const result = await pool.query(
      `INSERT INTO shifts (schedule_id, employee_id, start_time, end_time, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [scheduleId, employeeId, startTime, endTime, status]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
};

/**
 * Update a shift
 */
exports.updateShift = async (req, res, next) => {
  try {
    const { shiftId } = req.params;
    const { employeeId, startTime, endTime, status } = req.body;
    
    // Build update query based on provided fields
    let updateQuery = 'UPDATE shifts SET';
    let updateValues = [];
    let paramCounter = 1;
    
    if (employeeId) {
      updateQuery += ` employee_id = $${paramCounter},`;
      updateValues.push(employeeId);
      paramCounter++;
    }
    
    if (startTime) {
      updateQuery += ` start_time = $${paramCounter},`;
      updateValues.push(startTime);
      paramCounter++;
    }
    
    if (endTime) {
      updateQuery += ` end_time = $${paramCounter},`;
      updateValues.push(endTime);
      paramCounter++;
    }
    
    if (status) {
      updateQuery += ` status = $${paramCounter},`;
      updateValues.push(status);
      paramCounter++;
    }
    
    // Remove trailing comma
    updateQuery = updateQuery.slice(0, -1);
    
    // Add WHERE clause and RETURNING
    updateQuery += ` WHERE id = $${paramCounter} RETURNING *`;
    updateValues.push(shiftId);
    
    // Execute query
    const result = await pool.query(updateQuery, updateValues);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { message: 'Shift not found' }
      });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a shift
 */
exports.deleteShift = async (req, res, next) => {
  try {
    const { shiftId } = req.params;
    
    const result = await pool.query(
      'DELETE FROM shifts WHERE id = $1 RETURNING id',
      [shiftId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { message: 'Shift not found' }
      });
    }
    
    res.json({ message: 'Shift deleted successfully' });
  } catch (error) {
    next(error);
  }
};