const { pool } = require('../app');

/**
 * Get all shifts for a specific schedule
 */
exports.getShiftsBySchedule = async (req, res, next) => {
  try {
    const { scheduleId } = req.params;
    
    console.log(`Getting shifts for schedule: ${scheduleId}`);
    
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
    
    console.log(`Found ${result.rows.length} shifts for schedule ${scheduleId}`);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error in getShiftsBySchedule:', error);
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
    
    console.log(`Fetching shifts for employee ${employeeId} from ${startDate} to ${endDate}`);
    
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
      // Important: Use proper date range filtering
      query += ` AND DATE(s.start_time) >= $2 AND DATE(s.start_time) <= $3`;
      queryParams.push(startDate, endDate);
      
      console.log(`Using date filter: ${startDate} to ${endDate}`);
    }
    
    query += ` ORDER BY s.start_time`;
    
    console.log('Executing query:', query);
    console.log('With params:', queryParams);
    
    const result = await pool.query(query, queryParams);
    
    console.log(`Found ${result.rows.length} shifts for employee ${employeeId}`);
    result.rows.forEach(shift => {
      const shiftDate = new Date(shift.start_time).toISOString().split('T')[0];
      console.log(`Shift ID: ${shift.id}, Date: ${shiftDate}, Time: ${new Date(shift.start_time).toISOString()}`);
    });
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error in getShiftsByEmployee:', error);
    next(error);
  }
};

/**
 * Create a new shift
 */
exports.createShift = async (req, res, next) => {
  try {
    let { scheduleId, employeeId, startTime, endTime, status = 'Approved' } = req.body;
    
    // Validate input
    if (!scheduleId || !employeeId || !startTime || !endTime) {
      return res.status(400).json({
        error: { message: 'Missing required fields' }
      });
    }
    
    // Log the received times for debugging
    console.log('Creating new shift with parameters:');
    console.log('Employee ID:', employeeId);
    console.log('Schedule ID:', scheduleId);
    console.log('Received start time:', startTime);
    console.log('Received end time:', endTime);
    
    // Parse the times
    const startDateTime = new Date(startTime);
    const endDateTime = new Date(endTime);
    
    console.log('Parsed start time:', startDateTime.toISOString());
    console.log('Parsed end time:', endDateTime.toISOString());
    
    // Create shift with times in ISO format
    const result = await pool.query(
      `INSERT INTO shifts (schedule_id, employee_id, start_time, end_time, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [scheduleId, employeeId, startDateTime.toISOString(), endDateTime.toISOString(), status]
    );
    
    console.log('Shift created:', result.rows[0]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating shift:', error);
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