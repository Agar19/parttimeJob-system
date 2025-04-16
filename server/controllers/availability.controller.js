// server/controllers/availability.controller.js
const { pool } = require('../app');

/**
 * Get availability for a specific employee
 */
exports.getEmployeeAvailability = async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    
    const result = await pool.query(
      `SELECT id, day_of_week, start_time, end_time
       FROM availability
       WHERE employee_id = $1
       ORDER BY day_of_week, start_time`,
      [employeeId]
    );
    
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
};

/**
 * Save employee availability
 */
exports.saveEmployeeAvailability = async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const { availability } = req.body;
    
    console.log('Received availability data:', availability);
    
    // Validate input
    if (!availability || !Array.isArray(availability)) {
      return res.status(400).json({
        error: { message: 'Availability must be an array' }
      });
    }
    
    // Start transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Delete existing availability
      await client.query(
        'DELETE FROM availability WHERE employee_id = $1',
        [employeeId]
      );
      
      // Insert new availability
      for (const slot of availability) {
        await client.query(
          `INSERT INTO availability (employee_id, day_of_week, start_time, end_time)
           VALUES ($1, $2, $3, $4)`,
          [employeeId, slot.dayOfWeek, slot.startTime, slot.endTime]
        );
      }
      
      await client.query('COMMIT');
      
      // Get the updated availability
      const result = await pool.query(
        `SELECT id, day_of_week, start_time, end_time
         FROM availability
         WHERE employee_id = $1
         ORDER BY day_of_week, start_time`,
        [employeeId]
      );
      
      res.json(result.rows);
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