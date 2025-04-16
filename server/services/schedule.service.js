const { pool } = require('../app');

/**
 * Service for handling scheduling operations
 */
class ScheduleService {
  /**
   * Create a new schedule for a branch and week
   */
  async createSchedule(branchId, weekStart) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Create the schedule
      const scheduleResult = await client.query(
        `INSERT INTO schedules (branch_id, week_start, created_at) 
         VALUES ($1, $2, CURRENT_TIMESTAMP) 
         RETURNING id`,
        [branchId, weekStart]
      );
      
      const scheduleId = scheduleResult.rows[0].id;
      
      await client.query('COMMIT');
      
      return { scheduleId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Generate an optimized schedule using employee availability and constraints
   */
  async generateSchedule(scheduleId) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get schedule details and settings
      const scheduleResult = await client.query(
        `SELECT s.*, ss.* 
         FROM schedules s
         LEFT JOIN schedule_settings ss ON s.id = ss.schedule_id
         WHERE s.id = $1`,
        [scheduleId]
      );
      
      if (scheduleResult.rows.length === 0) {
        throw new Error('Schedule not found');
      }
      
      const schedule = scheduleResult.rows[0];
      const branchId = schedule.branch_id;
      
      // Parse schedule settings
      const selectedDays = schedule.selected_days ? 
        JSON.parse(schedule.selected_days) : 
        [0, 1, 2, 3, 4, 5, 6];
      
      const startTime = schedule.start_time || '07:00';
      const endTime = schedule.end_time || '23:00';
      const minGapBetweenShifts = parseInt(schedule.min_gap_between_shifts) || 8;
      const minShiftsPerEmployee = parseInt(schedule.min_shifts_per_employee) || 1;
      const maxShiftsPerEmployee = parseInt(schedule.max_shifts_per_employee) || 5;
      
      // Get all employees for the branch
      const employeesResult = await client.query(
        `SELECT e.id, e.user_id, u.name 
         FROM employees e
         JOIN users u ON e.user_id = u.id
         WHERE e.branch_id = $1 AND e.status = 'Active'`,
        [branchId]
      );
      
      const employees = employeesResult.rows;
      
      // Get availability for all employees
      const availabilityResult = await client.query(
        `SELECT a.employee_id, a.day_of_week, a.start_time, a.end_time 
         FROM availability a
         WHERE a.employee_id IN (${employees.map((_, i) => `$${i + 1}`).join(',')})`,
        employees.map(emp => emp.id)
      );
      
      // Group availability by employee
      const employeeAvailability = {};
      employees.forEach(emp => {
        employeeAvailability[emp.id] = [];
      });
      
      availabilityResult.rows.forEach(avail => {
        if (employeeAvailability[avail.employee_id]) {
          employeeAvailability[avail.employee_id].push({
            dayOfWeek: parseInt(avail.day_of_week),
            startTime: avail.start_time.substring(0, 5), // Remove seconds
            endTime: avail.end_time.substring(0, 5)     // Remove seconds
          });
        }
      });
      
      console.log('Employee availability:', JSON.stringify(employeeAvailability, null, 2));
      
      // Define shifts for each day
      const shifts = [];
      const weekStart = new Date(schedule.week_start);
      
      // Define standard shift times (e.g., morning shift, afternoon shift)
      const shiftTimes = [
        { start: startTime, end: '15:00' },  // Morning shift
        { start: '15:00', end: endTime }     // Afternoon shift
      ];
      
      // For each day of the week
      for (const dayOfWeek of selectedDays.map(Number)) {
        const currentDate = new Date(weekStart);
        currentDate.setDate(weekStart.getDate() + Number(dayOfWeek));
        const dateStr = currentDate.toISOString().split('T')[0];
        
        // For each shift time
        for (const shiftTime of shiftTimes) {
          // Find employees available for this shift
          const availableEmployees = [];
          
          for (const empId in employeeAvailability) {
            const empAvailability = employeeAvailability[empId];
            const isAvailable = empAvailability.some(slot => {
              return (
                slot.dayOfWeek === dayOfWeek &&
                slot.startTime <= shiftTime.start &&
                slot.endTime >= shiftTime.end
              );
            });
            
            if (isAvailable) {
              availableEmployees.push(empId);
            }
          }
          
          console.log(`Day ${dayOfWeek}, Shift ${shiftTime.start}-${shiftTime.end}, Available employees:`, availableEmployees);
          
          if (availableEmployees.length > 0) {
            // Get current shift counts for each employee
            const employeeShifts = {};
            employees.forEach(emp => {
              employeeShifts[emp.id] = 0;
            });
            
            // Count existing shifts
            const existingShiftsResult = await client.query(
              `SELECT employee_id, COUNT(*) as shift_count
               FROM shifts
               WHERE schedule_id = $1
               GROUP BY employee_id`,
              [scheduleId]
            );
            
            existingShiftsResult.rows.forEach(row => {
              employeeShifts[row.employee_id] = parseInt(row.shift_count);
            });
            
            // Sort employees by shift count (ascending)
            availableEmployees.sort((a, b) => {
              return (employeeShifts[a] || 0) - (employeeShifts[b] || 0);
            });
            
            // Check maximum shifts constraint
            const eligibleEmployees = availableEmployees.filter(empId => {
              return (employeeShifts[empId] || 0) < maxShiftsPerEmployee;
            });
            
            if (eligibleEmployees.length > 0) {
              // Assign shift to employee with fewest shifts
              const assignedEmployeeId = eligibleEmployees[0];
              
              // Create start and end times for the shift
              const startDateTime = new Date(currentDate);
              const [startHour, startMinute] = shiftTime.start.split(':');
              startDateTime.setHours(parseInt(startHour), parseInt(startMinute), 0, 0);
              
              const endDateTime = new Date(currentDate);
              const [endHour, endMinute] = shiftTime.end.split(':');
              endDateTime.setHours(parseInt(endHour), parseInt(endMinute), 0, 0);
              
              // Insert the shift
              const shiftResult = await client.query(
                `INSERT INTO shifts (schedule_id, employee_id, start_time, end_time, status)
                 VALUES ($1, $2, $3, $4, 'Approved')
                 RETURNING id`,
                [scheduleId, assignedEmployeeId, startDateTime, endDateTime]
              );
              
              // Update the shift count for this employee
              employeeShifts[assignedEmployeeId] = (employeeShifts[assignedEmployeeId] || 0) + 1;
              
              // Add to shifts array
              shifts.push({
                id: shiftResult.rows[0].id,
                employeeId: assignedEmployeeId,
                day: dayOfWeek,
                startTime: startDateTime,
                endTime: endDateTime
              });
              
              console.log(`Assigned shift to employee ${assignedEmployeeId}`);
            } else {
              console.log(`No eligible employees for this shift (max shifts constraint)`);
            }
          } else {
            console.log(`No available employees for this shift`);
          }
        }
      }
      
      await client.query('COMMIT');
      
      return { 
        scheduleId, 
        shiftsCreated: shifts.length,
        message: `Successfully created ${shifts.length} shifts based on employee availability.`
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error generating schedule:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get schedule details with shifts
   */
  async getScheduleDetails(scheduleId) {
    // Get schedule basic info
    const scheduleResult = await pool.query(
      `SELECT s.id, s.branch_id, b.name as branch_name, s.week_start, s.created_at
       FROM schedules s
       JOIN branches b ON s.branch_id = b.id
       WHERE s.id = $1`,
      [scheduleId]
    );
    
    if (scheduleResult.rows.length === 0) {
      throw new Error('Schedule not found');
    }
    
    const schedule = scheduleResult.rows[0];
    
    // Get shifts
    const shiftsResult = await pool.query(
      `SELECT sh.id, sh.employee_id, sh.start_time, sh.end_time, sh.status,
              e.user_id, u.name as employee_name
       FROM shifts sh
       JOIN employees e ON sh.employee_id = e.id
       JOIN users u ON e.user_id = u.id
       WHERE sh.schedule_id = $1
       ORDER BY sh.start_time`,
      [scheduleId]
    );
    
    const shifts = shiftsResult.rows;
    
    // Format shifts by day and time
    const formattedShifts = {};
    const weekStart = new Date(schedule.week_start);
    
    for (let day = 0; day < 7; day++) {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + day);
      const dateString = date.toISOString().split('T')[0];
      
      formattedShifts[dateString] = {};
      
      // Define common shift times
      const shiftTimes = ['07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', 
                         '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', 
                         '21:00', '22:00', '23:00'];
      
      for (const time of shiftTimes) {
        formattedShifts[dateString][time] = [];
      }
    }
    
    // Add shifts to the formatted structure
    shifts.forEach(shift => {
      const startTime = new Date(shift.start_time);
      const dateString = startTime.toISOString().split('T')[0];
      const timeString = `${String(startTime.getHours()).padStart(2, '0')}:00`;
      
      if (formattedShifts[dateString] && formattedShifts[dateString][timeString]) {
        formattedShifts[dateString][timeString].push({
          id: shift.id,
          employeeId: shift.employee_id,
          employeeName: shift.employee_name,
          startTime: shift.start_time,
          endTime: shift.end_time,
          status: shift.status
        });
      }
    });
    
    return {
      id: schedule.id,
      branchId: schedule.branch_id,
      branchName: schedule.branch_name,
      weekStart: schedule.week_start,
      createdAt: schedule.created_at,
      shifts: formattedShifts
    };
  }
  
  /**
   * Update shift status
   */
  async updateShiftStatus(shiftId, status) {
    const result = await pool.query(
      'UPDATE shifts SET status = $1 WHERE id = $2 RETURNING *',
      [status, shiftId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Shift not found');
    }
    
    return result.rows[0];
  }
  
  /**
   * Delete shift
   */
  async deleteShift(shiftId) {
    const result = await pool.query(
      'DELETE FROM shifts WHERE id = $1 RETURNING id',
      [shiftId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Shift not found');
    }
    
    return { deleted: true };
  }
  
  /**
   * Add shift manually
   */
  async addShift(scheduleId, employeeId, startTime, endTime) {
    const result = await pool.query(
      `INSERT INTO shifts (schedule_id, employee_id, start_time, end_time, status)
       VALUES ($1, $2, $3, $4, 'Approved')
       RETURNING *`,
      [scheduleId, employeeId, startTime, endTime]
    );
    
    return result.rows[0];
  }
}

module.exports = new ScheduleService();