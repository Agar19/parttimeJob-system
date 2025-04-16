const { pool } = require('../app');
const scheduleService = require('../services/schedule.service');


/**
 * Get schedule settings
 */
exports.getScheduleSettings = async (req, res, next) => {
  try {
    const { scheduleId } = req.params;
    
    // Query schedule_settings table
    const result = await pool.query(
      'SELECT * FROM schedule_settings WHERE schedule_id = $1',
      [scheduleId]
    );
    
    if (result.rows.length === 0) {
      // No settings found - return default values
      return res.json({
        selected_days: '[0,1,2,3,4,5,6]',
        start_time: '07:00',
        end_time: '23:00'
      });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
};

/**
 * Get all schedules
 */
exports.getAllSchedules = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT s.id, s.branch_id, s.week_start, s.created_at,
              b.name as branch_name,
              COUNT(sh.id) as shift_count
       FROM schedules s
       JOIN branches b ON s.branch_id = b.id
       LEFT JOIN shifts sh ON s.id = sh.schedule_id
       GROUP BY s.id, b.name
       ORDER BY s.week_start DESC`,
    );
    
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
};

/**
 * Get schedules by branch
 */
exports.getSchedulesByBranch = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    
    const result = await pool.query(
      `SELECT s.id, s.week_start, s.created_at,
              COUNT(sh.id) as shift_count
       FROM schedules s
       LEFT JOIN shifts sh ON s.id = sh.schedule_id
       WHERE s.branch_id = $1
       GROUP BY s.id
       ORDER BY s.week_start DESC`,
      [branchId]
    );
    
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
};

/**
 * Get schedule by ID
 */
exports.getScheduleById = async (req, res, next) => {
  try {
    const { scheduleId } = req.params;
    
    // Use service to get schedule with formatted shifts
    const schedule = await scheduleService.getScheduleDetails(scheduleId);
    
    res.json(schedule);
  } catch (error) {
    next(error);
  }
};

/**
 * Create schedule
 */
// server/controllers/schedules.controller.js
// Add this to your existing createSchedule function

exports.createSchedule = async (req, res, next) => {
  try {
    const { 
      branchId, 
      weekStart, 
      scheduleName, 
      selectedDays, 
      startTime, 
      endTime,
      minGapBetweenShifts,
      minShiftsPerEmployee,
      maxShiftsPerEmployee,
      additionalNotes
    } = req.body;
    
    // Input validation
    if (!branchId || !weekStart) {
      return res.status(400).json({
        error: { message: 'Branch ID and week start date are required' }
      });
    }
    
    // Start transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check if a schedule already exists
      const existingSchedule = await client.query(
        'SELECT id FROM schedules WHERE branch_id = $1 AND week_start = $2',
        [branchId, weekStart]
      );
      
      if (existingSchedule.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: { message: 'A schedule already exists for this branch and week' }
        });
      }
      
      // Create schedule
      const scheduleResult = await client.query(
        `INSERT INTO schedules (
          branch_id, 
          week_start, 
          created_at
        )
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        RETURNING id`,
        [branchId, weekStart]
      );
      
      const scheduleId = scheduleResult.rows[0].id;
      
      // Store schedule settings
      await client.query(
        `INSERT INTO schedule_settings (
          schedule_id,
          selected_days,
          start_time,
          end_time,
          min_gap_between_shifts,
          min_shifts_per_employee,
          max_shifts_per_employee,
          additional_notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          scheduleId,
          selectedDays ? JSON.stringify(selectedDays) : '[0,1,2,3,4]',
          startTime || '08:00',
          endTime || '17:00',
          minGapBetweenShifts || null,
          minShiftsPerEmployee || null,
          maxShiftsPerEmployee || null,
          additionalNotes || null
        ]
      );
      
      await client.query('COMMIT');
      
      res.status(201).json({ scheduleId });
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
 * Generate schedule
 */
exports.generateSchedule = async (req, res, next) => {
  try {
    const { scheduleId } = req.params;
    
    // Generate shifts for schedule
    const result = await scheduleService.generateSchedule(scheduleId);
    
    res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Delete schedule
 */
exports.deleteSchedule = async (req, res, next) => {
  try {
    const { scheduleId } = req.params;
    
    // Check if schedule exists
    const scheduleExists = await pool.query(
      'SELECT id FROM schedules WHERE id = $1',
      [scheduleId]
    );
    
    if (scheduleExists.rows.length === 0) {
      return res.status(404).json({
        error: { message: 'Schedule not found' }
      });
    }
    
    // Delete schedule (shifts will be deleted by CASCADE)
    const result = await pool.query(
      'DELETE FROM schedules WHERE id = $1 RETURNING id',
      [scheduleId]
    );
    
    res.json({ message: 'Schedule deleted successfully' });
  } catch (error) {
    next(error);
  }
};