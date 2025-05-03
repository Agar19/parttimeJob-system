// Update to schedules.controller.js to support custom settings

const { pool } = require('../app');
const scheduleService = require('../services/schedule.service');

/**
 * Get schedule settings templates
 * This is a new endpoint to support the templates feature
 */
exports.getScheduleSettingsTemplates = async (req, res, next) => {
  try {
    const templates = await scheduleService.getScheduleSettingsTemplates();
    res.json(templates);
  } catch (error) {
    next(error);
  }
};

/**
 * Save a schedule settings template
 * This is a new endpoint to support saving templates
 */
exports.saveScheduleSettingsTemplate = async (req, res, next) => {
  try {
    const templateData = req.body;
    
    if (!templateData.name) {
      return res.status(400).json({
        error: { message: 'Template name is required' }
      });
    }
    
    const result = await scheduleService.saveScheduleSettingsTemplate(templateData);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

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
        end_time: '23:00',
        min_gap_between_shifts: 8,
        min_shifts_per_employee: 1,
        max_shifts_per_employee: 5,
        min_shift_length: 4,
        max_shift_length: 8,
        max_employees_per_shift: 5,
        shift_increment: 2
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
 * Updated to support custom settings
 */
exports.createSchedule = async (req, res, next) => {
  try {
    const { 
      branchId, 
      weekStart, 
      scheduleName, 
      selected_days, 
      start_time, 
      end_time,
      min_gap_between_shifts,
      min_shifts_per_employee,
      max_shifts_per_employee,
      min_shift_length,
      max_shift_length,
      max_employees_per_shift,
      shift_increment,
      additional_notes,
      skipGeneration // Parameter to control auto-generation
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
      
      // Create schedule using the service
      const scheduleResult = await scheduleService.createSchedule(branchId, weekStart, skipGeneration || false);
      
      const scheduleId = scheduleResult.scheduleId;
      
      // Store custom schedule settings
      // Check if the table has the new columns
      const columnCheck = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='schedule_settings' AND column_name='min_shift_length'
      `);
      
      let query;
      let params;
      
      if (columnCheck.rows.length > 0) {
        // Use extended schema with all new parameters
        query = `
          INSERT INTO schedule_settings (
            schedule_id,
            selected_days,
            start_time,
            end_time,
            min_gap_between_shifts,
            min_shifts_per_employee,
            max_shifts_per_employee,
            min_shift_length,
            max_shift_length,
            max_employees_per_shift,
            shift_increment,
            additional_notes
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `;
        
        params = [
          scheduleId,
          selected_days ? JSON.stringify(selected_days) : '[0,1,2,3,4,5,6]',
          start_time || '07:00',
          end_time || '23:00',
          min_gap_between_shifts || 8,
          min_shifts_per_employee || 1,
          max_shifts_per_employee || 5,
          min_shift_length || 4,
          max_shift_length || 8,
          max_employees_per_shift || 5,
          shift_increment || 2,
          additional_notes || scheduleName || null
        ];
      } else {
        // Use original schema
        query = `
          INSERT INTO schedule_settings (
            schedule_id,
            selected_days,
            start_time,
            end_time,
            min_gap_between_shifts,
            min_shifts_per_employee,
            max_shifts_per_employee,
            additional_notes
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;
        
        params = [
          scheduleId,
          selected_days ? JSON.stringify(selected_days) : '[0,1,2,3,4,5,6]',
          start_time || '07:00',
          end_time || '23:00',
          min_gap_between_shifts || 8,
          min_shifts_per_employee || 1,
          max_shifts_per_employee || 5,
          additional_notes || scheduleName || null
        ];
      }
      
      await client.query(query, params);
      
      await client.query('COMMIT');
      
      // Return the scheduleId and skipGeneration flag in response
      res.status(201).json({ 
        scheduleId,
        skipGeneration: scheduleResult.skipGeneration
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
 * Generate schedule with custom settings
 * Updated to accept custom settings
 */
exports.generateSchedule = async (req, res, next) => {
  try {
    const { scheduleId } = req.params;
    const customSettings = req.body; // Optional custom settings from request body
    
    // Generate shifts for schedule
    const result = await scheduleService.generateSchedule(scheduleId, customSettings);
    
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