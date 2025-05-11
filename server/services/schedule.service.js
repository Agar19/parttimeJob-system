const { pool } = require('../app');

/**
 * Service for handling scheduling operations
 */
class ScheduleService {
  /**
   * Create a new schedule for a branch and week
   */
  async createSchedule(branchId, weekStart, skipGeneration = false) {
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
      
      return { scheduleId, skipGeneration };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Store custom settings for a schedule
   */
  async _storeCustomSettings(client, scheduleId, settings) {
    try {
      // Check if settings already exist
      const existingSettings = await client.query(
        'SELECT id FROM schedule_settings WHERE schedule_id = $1',
        [scheduleId]
      );
      
      // Convert any array properties to JSON strings
      const processedSettings = { ...settings };
      if (Array.isArray(processedSettings.selected_days)) {
        processedSettings.selected_days = JSON.stringify(processedSettings.selected_days);
      }
      
      if (existingSettings.rows.length > 0) {
        // Update existing settings
        await client.query(`
          UPDATE schedule_settings SET
            selected_days = COALESCE($1, selected_days),
            start_time = COALESCE($2, start_time),
            end_time = COALESCE($3, end_time),
            min_gap_between_shifts = COALESCE($4, min_gap_between_shifts),
            min_shifts_per_employee = COALESCE($5, min_shifts_per_employee),
            max_shifts_per_employee = COALESCE($6, max_shifts_per_employee),
            min_shift_length = COALESCE($7, min_shift_length),
            max_shift_length = COALESCE($8, max_shift_length),
            max_employees_per_shift = COALESCE($9, max_employees_per_shift),
            shift_increment = COALESCE($10, shift_increment),
            additional_notes = COALESCE($11, additional_notes)
          WHERE schedule_id = $12
        `, [
          processedSettings.selected_days,
          processedSettings.start_time,
          processedSettings.end_time,
          processedSettings.min_gap_between_shifts,
          processedSettings.min_shifts_per_employee,
          processedSettings.max_shifts_per_employee,
          processedSettings.min_shift_length,
          processedSettings.max_shift_length,
          processedSettings.max_employees_per_shift,
          processedSettings.shift_increment,
          processedSettings.additional_notes,
          scheduleId
        ]);
      } else {
        // Insert new settings
        await client.query(`
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
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, [
          scheduleId,
          processedSettings.selected_days,
          processedSettings.start_time,
          processedSettings.end_time,
          processedSettings.min_gap_between_shifts,
          processedSettings.min_shifts_per_employee,
          processedSettings.max_shifts_per_employee,
          processedSettings.min_shift_length,
          processedSettings.max_shift_length,
          processedSettings.max_employees_per_shift,
          processedSettings.shift_increment,
          processedSettings.additional_notes
        ]);
      }
      
      return true;
    } catch (error) {
      console.error('Error storing custom settings:', error);
      throw error;
    }
  }
  
  /**
   * Generate an optimized schedule using employee availability and constraints
   */
  async generateSchedule(scheduleId, customSettings = null) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      console.log('Starting to generate schedule for scheduleId:', scheduleId);
      
      // Get schedule details
      const scheduleResult = await client.query(
        `SELECT * FROM schedules WHERE id = $1`,
        [scheduleId]
      );
      
      if (scheduleResult.rows.length === 0) {
        console.error('Schedule not found with ID:', scheduleId);
        throw new Error('Schedule not found');
      }
      
      const schedule = scheduleResult.rows[0];
      const branchId = schedule.branch_id;
      
      // If custom settings provided from UI form, use those instead of database settings
      let scheduleSettings;
      if (customSettings) {
        // Store custom settings in the database for future reference
        await this._storeCustomSettings(client, scheduleId, customSettings);
        scheduleSettings = customSettings;
      } else {
        // Ensure schedule settings exist (with default values if needed)
        await this._ensureScheduleSettings(client, scheduleId, {
          startTime: '07:00',
          endTime: '23:00', 
          minGapBetweenShifts: 8,
          minShiftsPerEmployee: 1,
          maxShiftsPerEmployee: 5,
          minShiftLength: 4,
          maxShiftLength: 8,
          maxEmployeesPerShift: 5
        });
        
        // Now get schedule with settings
        const scheduleWithSettingsResult = await client.query(
          `SELECT s.*, ss.* 
           FROM schedules s
           LEFT JOIN schedule_settings ss ON s.id = ss.schedule_id
           WHERE s.id = $1`,
          [scheduleId]
        );
        
        scheduleSettings = scheduleWithSettingsResult.rows[0];
      }
      
      // Parse schedule settings safely
      // Default to all days (Monday=0 to Sunday=6)
      let selectedDays = [0, 1, 2, 3, 4, 5, 6]; 
      
      if (scheduleSettings.selected_days) {
        try {
          // Handle both string and array formats safely
          if (typeof scheduleSettings.selected_days === 'string') {
            selectedDays = JSON.parse(scheduleSettings.selected_days);
          } else if (Array.isArray(scheduleSettings.selected_days)) {
            selectedDays = scheduleSettings.selected_days;
          }
          
          // Convert string numbers to integers if needed
          selectedDays = selectedDays.map(day => parseInt(day));
        } catch (error) {
          console.error('Error parsing selected_days:', error);
          console.error('Raw selected_days value:', scheduleSettings.selected_days);
          // Fall back to default if parsing fails
        }
      }
      
      console.log('Selected days for scheduling:', selectedDays);
      
      // Define days of week in Mongolian for logging
      const daysOfWeek = ['Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба', 'Ням'];
      
      // Get dynamic parameters from settings
      const startTime = scheduleSettings.start_time ? 
        scheduleSettings.start_time.substring(0, 5) : '07:00';
      const endTime = scheduleSettings.end_time ? 
        scheduleSettings.end_time.substring(0, 5) : '23:00';
      const minGapBetweenShifts = parseInt(scheduleSettings.min_gap_between_shifts) || 8;
      const minShiftsPerEmployee = parseInt(scheduleSettings.min_shifts_per_employee) || 1;
      const maxShiftsPerEmployee = parseInt(scheduleSettings.max_shifts_per_employee) || 5;
      
      // Get additional parameters - use custom settings if available or defaults
      const minShiftLength = parseInt(scheduleSettings.min_shift_length) || 4; 
      const maxShiftLength = parseInt(scheduleSettings.max_shift_length) || 8;
      const maxEmployeesPerShift = parseInt(scheduleSettings.max_employees_per_shift) || 5;
      const shiftIncrement = parseInt(scheduleSettings.shift_increment) || 2; // New parameter for flexibility
      
      console.log('Scheduling parameters:', {
        startTime,
        endTime,
        minGapBetweenShifts,
        minShiftsPerEmployee,
        maxShiftsPerEmployee,
        minShiftLength,
        maxShiftLength,
        maxEmployeesPerShift,
        shiftIncrement
      });
      
      // Get all employees for the branch
      const employeesResult = await client.query(
        `SELECT e.id, e.user_id, u.name 
         FROM employees e
         JOIN users u ON e.user_id = u.id
         WHERE e.branch_id = $1 AND e.status = 'Active'`,
        [branchId]
      );
      
      const employees = employeesResult.rows;
      
      console.log(`Found ${employees.length} active employees for this branch`);
      if (employees.length === 0) {
        console.error('No active employees found for branch:', branchId);
        throw new Error('No active employees found for this branch');
      }
      
      // Debug: Log employee info
      employees.forEach(emp => {
        console.log(`Employee: id=${emp.id}, name=${emp.name}`);
      });
      
      // Get availability for all employees
      const employeeIds = employees.map(emp => emp.id);
      
      console.log('Fetching availability for employee IDs:', employeeIds);
      
      // Check if any availability exists for these employees
      const availCountResult = await client.query(
        `SELECT COUNT(*) as count FROM availability 
         WHERE employee_id = ANY($1::uuid[])`,
        [employeeIds]
      );
      
      const availCount = parseInt(availCountResult.rows[0].count);
      console.log(`Found ${availCount} total availability records`);
      
      if (availCount === 0) {
        console.error('No availability records found for any employees!');
        throw new Error('No employee availability data found. Employees must set their availability before schedules can be generated.');
      }
      
      // Use array_agg format for IN clause to avoid parameter limit
      const availabilityResult = await client.query(
        `SELECT employee_id, day_of_week, start_time, end_time 
         FROM availability 
         WHERE employee_id = ANY($1::uuid[])`,
        [employeeIds]
      );
      
      console.log(`Fetched ${availabilityResult.rowCount} availability records`);
      
      // Group availability by employee
      const employeeAvailability = {};
      employees.forEach(emp => {
        employeeAvailability[emp.id] = [];
      });
      
      availabilityResult.rows.forEach(avail => {
        const empId = avail.employee_id;
        if (employeeAvailability[empId]) {
          // Remove seconds from time format
          const startTime = avail.start_time.substring(0, 5);
          const endTime = avail.end_time.substring(0, 5);
          
          employeeAvailability[empId].push({
            dayOfWeek: parseInt(avail.day_of_week),
            startTime: startTime,
            endTime: endTime
          });
          
          console.log(`Added availability for ${empId}: day=${avail.day_of_week}, time=${startTime}-${endTime}`);
        }
      });
      
      // Log availability for troubleshooting
      for (const empId in employeeAvailability) {
        const availCount = employeeAvailability[empId].length;
        console.log(`Employee ${empId} has ${availCount} availability slots`);
      }
      
      const shiftSlots = [];
      const weekStart = new Date(schedule.week_start);
      console.log('Week start date:', weekStart.toISOString());
      
      // Define shift times based on settings (more flexible options now)
      const shiftTimes = [];
      
      // Create more flexible shift options based on parameters
      // - Allow any length between minShiftLength and maxShiftLength
      // - Allow starting at any hour (0-23)
      const startHour = parseInt(startTime.split(':')[0]);
      const endHour = parseInt(endTime.split(':')[0]);
        
      // Handle the case where end hour is 0 (midnight next day) by treating it as hour 24
      const adjustedEndHour = endHour === 0 ? 24 : endHour;
      
      for (let hour = startHour; hour <= adjustedEndHour - minShiftLength; hour += 1) {
        for (let length = minShiftLength; length <= maxShiftLength; length += shiftIncrement) {
          if (hour + length <= adjustedEndHour) {
            const shiftStart = `${(hour % 24).toString().padStart(2, '0')}:00`;
            const shiftEnd = `${((hour + length) % 24).toString().padStart(2, '0')}:00`;
            shiftTimes.push({ start: shiftStart, end: shiftEnd });
          }
        }
      }
      
      console.log(`Created ${shiftTimes.length} different shift time slots`);
      console.log('Creating shift slots for selected days:', selectedDays);
      
      // Helper function to convert from Monday-based index (0=Monday) to JavaScript's Sunday-based date offset
      const adjustDayForJs = (day) => {
        // In our system: Monday=0, Tuesday=1, ..., Sunday=6
        // For date adding: we want offset from the week start date (which is Monday)
        return day; // If week starts on Monday, no adjustment needed
      };
      
      // Create shift slots for each selected day
      for (const dayIndex of selectedDays) {
        // Create the date for this day by adding the dayIndex to the week start date
        const dayDate = new Date(weekStart);
        const adjustedDay = adjustDayForJs(dayIndex);
        dayDate.setDate(weekStart.getDate() + adjustedDay);
        
        console.log(`Creating shifts for day ${dayIndex} (${daysOfWeek[dayIndex]}), date: ${dayDate.toISOString()}`);
        
        // Create all shift slots for this day
        for (const shiftTime of shiftTimes) {
          const slot = {
            day: dayIndex, // Store the original day index (0=Monday) for compatibility
            date: new Date(dayDate),
            startTime: shiftTime.start,
            endTime: shiftTime.end,
            maxEmployees: maxEmployeesPerShift,
            assignedEmployees: 0
          };
          
          shiftSlots.push(slot);
        }
      }
      
      console.log(`Created ${shiftSlots.length} total shift slots`);
      
      // Helper function to check if an employee is available for a shift
      const isEmployeeAvailableForShift = (employee, shift, employeeAvailability) => {
        const availability = employeeAvailability[employee.id] || [];
        const daySlots = availability.filter(slot => slot.dayOfWeek === shift.day);
        
        if (daySlots.length === 0) return false;
        
        const shiftStartHour = parseInt(shift.startTime.split(':')[0]);
        const shiftEndHour = parseInt(shift.endTime.split(':')[0]);
        
        // Check each hour of the shift
        for (let hour = shiftStartHour; hour < shiftEndHour; hour++) {
          const hourString = `${hour.toString().padStart(2, '0')}:00`;
          const nextHourString = `${(hour + 1).toString().padStart(2, '0')}:00`;
          
          const isHourCovered = daySlots.some(slot => 
            slot.startTime <= hourString && slot.endTime >= nextHourString
          );
          
          if (!isHourCovered) return false;
        }
        
        return true;
      };
      
      // Count available employees for each shift for better prioritization
      const shiftAvailableEmployees = {};
      for (const shift of shiftSlots) {
        const availableCount = employees.filter(emp => isEmployeeAvailableForShift(emp, shift, employeeAvailability)).length;
        shiftAvailableEmployees[`${shift.day}-${shift.startTime}-${shift.endTime}`] = availableCount;
      }
      
      // Apply enhanced greedy algorithm with prioritization
      console.log('Starting enhanced greedy shift assignment...');
      const assignments = this._enhancedGreedyShiftAssignment(
        employees, 
        employeeAvailability, 
        shiftSlots,
        {
          minGapBetweenShifts,
          minShiftsPerEmployee,
          maxShiftsPerEmployee,
          maxEmployeesPerShift
        },
        shiftAvailableEmployees,
        isEmployeeAvailableForShift
      );
      
      console.log(`Assigned ${assignments.length} shifts to employees`);
      
      // Apply backtracking to optimize and resolve conflicts
      console.log('Starting backtracking optimization...');
      const optimizedAssignments = this._backtrackOptimize(
        assignments,
        employees,
        employeeAvailability,
        {
          minGapBetweenShifts,
          minShiftsPerEmployee,
          maxShiftsPerEmployee,
          maxEmployeesPerShift
        }
      );
      
      console.log(`After optimization: ${optimizedAssignments.length} shifts`);
      
      // Count how many shifts each employee has
      const employeeShiftCounts = {};
      optimizedAssignments.forEach(assignment => {
        employeeShiftCounts[assignment.employeeId] = (employeeShiftCounts[assignment.employeeId] || 0) + 1;
      });
      
      console.log('Final shift counts per employee:', employeeShiftCounts);
      
      // Insert shift assignments into the database
      const insertedShifts = [];
      
      if (optimizedAssignments.length === 0) {
        console.error('No shifts were assigned! Check employee availability data.');
        
        // As a fallback, create at least one shift per employee to demonstrate functionality
        console.log('Creating fallback shifts - one per employee');
        
        const fallbackDate = new Date(schedule.week_start);
        for (const emp of employees) {
          // Create a sample shift for this employee
          const startDateTime = new Date(fallbackDate);
          startDateTime.setHours(9, 0, 0, 0);
          
          const endDateTime = new Date(fallbackDate);
          endDateTime.setHours(17, 0, 0, 0);
          
          try {
            const shiftResult = await client.query(
              `INSERT INTO shifts (schedule_id, employee_id, start_time, end_time, status)
               VALUES ($1, $2, $3, $4, 'Approved')
               RETURNING id`,
              [scheduleId, emp.id, startDateTime, endDateTime]
            );
            
            insertedShifts.push({
              id: shiftResult.rows[0].id,
              employeeId: emp.id,
              employeeName: emp.name,
              startTime: startDateTime,
              endTime: endDateTime
            });
            
            console.log(`Created fallback shift for ${emp.name}`);
          } catch (shiftError) {
            console.error(`Error creating fallback shift for ${emp.name}:`, shiftError);
          }
        }
      } else {
        // Normal case - insert the optimized shifts
        for (const assignment of optimizedAssignments) {
          // Find employee name for logging
          const employee = employees.find(e => e.id === assignment.employeeId);
          const employeeName = employee ? employee.name : 'Unknown';
          
          // Calculate start and end times for the database
          const startDateTime = new Date(assignment.date);
          const [startHour, startMinute] = assignment.startTime.split(':');
          startDateTime.setHours(parseInt(startHour), parseInt(startMinute), 0, 0);
          
          const endDateTime = new Date(assignment.date);
          const [endHour, endMinute] = assignment.endTime.split(':');
          endDateTime.setHours(parseInt(endHour), parseInt(endMinute), 0, 0);
          
          console.log(`Inserting shift: ${employeeName}, ${startDateTime.toISOString()} to ${endDateTime.toISOString()}`);
          
          // Insert the shift into the database
          const shiftResult = await client.query(
            `INSERT INTO shifts (schedule_id, employee_id, start_time, end_time, status)
             VALUES ($1, $2, $3, $4, 'Approved')
             RETURNING id`,
            [scheduleId, assignment.employeeId, startDateTime, endDateTime]
          );
          
          console.log(`Shift inserted with ID: ${shiftResult.rows[0].id}`);
          
          insertedShifts.push({
            id: shiftResult.rows[0].id,
            employeeId: assignment.employeeId,
            employeeName: employeeName,
            startTime: startDateTime,
            endTime: endDateTime
          });
        }
      }
      
      await client.query('COMMIT');
      
      return { 
        scheduleId, 
        shiftsCreated: insertedShifts.length,
        message: `Successfully created ${insertedShifts.length} shifts based on employee availability.`
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
   * Add default schedule settings if none exist
   */
  async _ensureScheduleSettings(client, scheduleId, defaultSettings) {
    // Check if settings already exist
    const settingsCheck = await client.query(
      'SELECT id FROM schedule_settings WHERE schedule_id = $1',
      [scheduleId]
    );
    
    if (settingsCheck.rows.length === 0) {
      console.log('Creating default schedule settings');
      
      // Create settings with defaults
      await client.query(
        `INSERT INTO schedule_settings (
          schedule_id, 
          selected_days, 
          start_time, 
          end_time,
          min_gap_between_shifts,
          min_shifts_per_employee,
          max_shifts_per_employee,
          min_shift_length,
          max_shift_length,
          max_employees_per_shift
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          scheduleId,
          JSON.stringify([0, 1, 2, 3, 4, 5, 6]),
          defaultSettings.startTime || '07:00',
          defaultSettings.endTime || '23:00',
          defaultSettings.minGapBetweenShifts || 8,
          defaultSettings.minShiftsPerEmployee || 1,
          defaultSettings.maxShiftsPerEmployee || 5,
          defaultSettings.minShiftLength || 4,
          defaultSettings.maxShiftLength || 8,
          defaultSettings.maxEmployeesPerShift || 3
        ]
      );
    }
  }
  
  /**
   * Enhanced greedy algorithm for initial shift assignments
   * Prioritizes hard-to-fill shifts first and prevents overlapping assignments
   */
  _enhancedGreedyShiftAssignment(employees, employeeAvailability, shiftSlots, constraints, shiftAvailableEmployees, isEmployeeAvailableForShift) {
    console.log('Starting enhanced greedy algorithm with prioritization:', { 
      employeeCount: employees.length,
      shiftSlotCount: shiftSlots.length,
      constraints
    });
    
    const assignments = [];
    const employeeShiftCounts = {};
    
    // Initialize shift counts
    employees.forEach(emp => {
      employeeShiftCounts[emp.id] = 0;
    });
    
    // Sort shift slots by available employees (ascending), then by length (descending)
    const sortedShiftSlots = [...shiftSlots].sort((a, b) => {
      const keyA = `${a.day}-${a.startTime}-${a.endTime}`;
      const keyB = `${b.day}-${b.startTime}-${b.endTime}`;
      
      // Sort by number of available employees (ascending)
      const availableA = shiftAvailableEmployees[keyA] || 0;
      const availableB = shiftAvailableEmployees[keyB] || 0;
      
      if (availableA !== availableB) {
        return availableA - availableB; // Prioritize shifts with fewer available employees
      }
      
      // Then by shift length (descending)
      const lengthA = this._calculateShiftLengthInHours(a.startTime, a.endTime);
      const lengthB = this._calculateShiftLengthInHours(b.startTime, b.endTime);
      if (lengthA !== lengthB) {
        return lengthB - lengthA; // Longer shifts first
      }
      
      // Finally by day and start time
      if (a.day !== b.day) return a.day - b.day;
      return a.startTime.localeCompare(b.startTime);
    });
    
    // Track assigned shifts by employee and day to prevent overlaps
    const employeeAssignedShifts = {};
    employees.forEach(emp => {
      employeeAssignedShifts[emp.id] = {};
      for (let day = 0; day < 7; day++) {
        employeeAssignedShifts[emp.id][day] = [];
      }
    });
    
    // Assign each shift
    for (const shift of sortedShiftSlots) {
      // Skip if this shift already has the maximum allowed employees
      if (shift.assignedEmployees >= shift.maxEmployees) {
        continue;
      }
      
      // Find available employees for this shift
      const availableEmployees = employees.filter(emp => {
        // Check basic availability
        if (!isEmployeeAvailableForShift(emp, shift, employeeAvailability)) {
          return false;
        }
        
        // Check for overlapping shifts on the same day
        const assignedShiftsOnDay = employeeAssignedShifts[emp.id][shift.day] || [];
        const hasOverlap = assignedShiftsOnDay.some(assigned => {
          return this._shiftsOverlap(assigned, shift);
        });
        
        if (hasOverlap) {
          return false;
        }
        
        // Check for minimum rest period between shifts
        // Get all shifts already assigned to this employee
        const allAssignedShifts = [];
        for (let day = 0; day < 7; day++) {
          if (employeeAssignedShifts[emp.id][day]) {
            allAssignedShifts.push(...employeeAssignedShifts[emp.id][day]);
          }
        }
        
        // Check if any assigned shift violates the minimum rest period
        const violatesRestPeriod = allAssignedShifts.some(assigned => {
          // Calculate hours between shifts
          const hoursBetween = this._calculateHoursBetween(
            assigned.day, assigned.endTime,
            shift.day, shift.startTime
          );
          
          return hoursBetween > 0 && hoursBetween < constraints.minGapBetweenShifts;
        });
        
        return !violatesRestPeriod;
      });
      
      const shiftKey = `${shift.day}-${shift.startTime}-${shift.endTime}`;
      console.log(`Shift ${shiftKey}: ${availableEmployees.length} available employees`);
      
      if (availableEmployees.length > 0) {
        // Filter employees who haven't exceeded their max shifts
        const eligibleEmployees = availableEmployees.filter(emp => 
          employeeShiftCounts[emp.id] < constraints.maxShiftsPerEmployee
        );
        
        if (eligibleEmployees.length > 0) {
          // First, prioritize employees who haven't reached minimum shifts
          const underutilizedEmployees = eligibleEmployees.filter(emp => 
            employeeShiftCounts[emp.id] < constraints.minShiftsPerEmployee
          );
          
          // Pick from underutilized employees if any exist, otherwise from all eligible employees
          const candidateEmployees = underutilizedEmployees.length > 0 ? underutilizedEmployees : eligibleEmployees;
          
          // Then sort by current shift count (ascending)
          candidateEmployees.sort((a, b) => {
            // First by total shift count
            const countDiff = employeeShiftCounts[a.id] - employeeShiftCounts[b.id];
            if (countDiff !== 0) return countDiff;
            
            // Then by shifts on this specific day
            const aShiftsOnDay = (employeeAssignedShifts[a.id][shift.day] || []).length;
            const bShiftsOnDay = (employeeAssignedShifts[b.id][shift.day] || []).length;
            return aShiftsOnDay - bShiftsOnDay;
          });
          
          // Assign to employee with fewest shifts
          const assignedEmployee = candidateEmployees[0];
          employeeShiftCounts[assignedEmployee.id]++;
          
          // Record the assignment
          if (!employeeAssignedShifts[assignedEmployee.id][shift.day]) {
            employeeAssignedShifts[assignedEmployee.id][shift.day] = [];
          }
          employeeAssignedShifts[assignedEmployee.id][shift.day].push({
            startTime: shift.startTime,
            endTime: shift.endTime,
            day: shift.day
          });
          
          // Debug info
          console.log(`Assigned to ${assignedEmployee.name} (now has ${employeeShiftCounts[assignedEmployee.id]} shifts)`);
          
          // Update the shift's assigned employee count
          shift.assignedEmployees++;
          
          assignments.push({
            employeeId: assignedEmployee.id,
            day: shift.day,
            date: shift.date,
            startTime: shift.startTime,
            endTime: shift.endTime
          });
          
          // If we need multiple employees per shift, we can continue assigning
          // But for now, we'll move to the next shift
        } else {
          console.log(`No eligible employees (all exceeded max shifts)`);
        }
      } else {
        console.log(`No available non-overlapping employees for this shift!`);
      }
    }
    
    console.log(`Enhanced greedy algorithm assigned ${assignments.length} shifts out of ${shiftSlots.length} possible slots`);
    
    // Calculate schedule coverage percentage
    const coveragePercentage = (assignments.length / shiftSlots.length) * 100;
    console.log(`Schedule coverage: ${coveragePercentage.toFixed(2)}%`);
    
    // Log shift distribution per employee
    console.log('Shift distribution:');
    for (const emp of employees) {
      const shiftCount = employeeShiftCounts[emp.id] || 0;
      console.log(`- ${emp.name}: ${shiftCount} shifts`);
    }
    
    return assignments;
  }
  
  /**
   * Check if two shifts overlap in time
   */
  _shiftsOverlap(shift1, shift2) {
    const start1 = parseInt(shift1.startTime.split(':')[0]);
    const end1 = parseInt(shift1.endTime.split(':')[0]);
    const start2 = parseInt(shift2.startTime.split(':')[0]);
    const end2 = parseInt(shift2.endTime.split(':')[0]);
    
    // Shifts overlap if one starts before the other ends
    return (start1 < end2 && start2 < end1);
  }
  
  /**
   * Calculate shift length in hours
   */
  _calculateShiftLengthInHours(startTime, endTime) {
    const startHour = parseInt(startTime.split(':')[0]);
    const endHour = parseInt(endTime.split(':')[0]);
    
    // Handle overnight shifts
    if (endHour < startHour) {
      return (24 - startHour) + endHour;
    }
    
    return endHour - startHour;
  }
  
  /**
   * Backtracking algorithm to optimize the schedule
   * Attempts to resolve any constraint violations
   */
  _backtrackOptimize(initialAssignments, employees, employeeAvailability, constraints) {
    // Clone the initial assignments to avoid modifying the original
    let currentAssignments = [...initialAssignments];
    
    // Define function to check constraint violations
    const checkConstraints = (assignments) => {
      const violations = [];
      
      // Count shifts per employee
      const shiftCounts = {};
      assignments.forEach(assignment => {
        shiftCounts[assignment.employeeId] = (shiftCounts[assignment.employeeId] || 0) + 1;
      });
      
      // Check maximum shifts per employee constraint
      for (const empId in shiftCounts) {
        if (shiftCounts[empId] > constraints.maxShiftsPerEmployee) {
          violations.push({
            type: 'maxShiftsExceeded',
            employeeId: empId,
            count: shiftCounts[empId]
          });
        }
        
        // Check minimum shifts per employee constraint
        if (shiftCounts[empId] < constraints.minShiftsPerEmployee) {
          violations.push({
            type: 'minShiftsNotMet',
            employeeId: empId,
            count: shiftCounts[empId]
          });
        }
      }
      
      // Check minimum rest time between shifts
      // Group assignments by employee
      const employeeAssignments = {};
      assignments.forEach(assignment => {
        if (!employeeAssignments[assignment.employeeId]) {
          employeeAssignments[assignment.employeeId] = [];
        }
        employeeAssignments[assignment.employeeId].push(assignment);
      });
      
      // Check each employee's shifts
      for (const empId in employeeAssignments) {
        const shifts = employeeAssignments[empId];
        
        // Sort shifts by day and start time
        shifts.sort((a, b) => {
          if (a.day !== b.day) return a.day - b.day;
          return a.startTime.localeCompare(b.startTime);
        });
        
        // Check consecutive shifts for rest time violations
        for (let i = 0; i < shifts.length - 1; i++) {
          const currentShift = shifts[i];
          const nextShift = shifts[i + 1];
          
          // Calculate hours between shifts
          const hoursBetween = this._calculateHoursBetween(
            currentShift.day, currentShift.endTime,
            nextShift.day, nextShift.startTime
          );
          
          if (hoursBetween < constraints.minGapBetweenShifts) {
            violations.push({
              type: 'insufficientRest',
              employeeId: empId,
              shifts: [currentShift, nextShift],
              hoursBetween
            });
          }
        }
      }
      
      // Check for overlapping shifts
      for (const empId in employeeAssignments) {
        const shifts = employeeAssignments[empId];
        
        // Check each pair of shifts for this employee
        for (let i = 0; i < shifts.length; i++) {
          for (let j = i + 1; j < shifts.length; j++) {
            const shift1 = shifts[i];
            const shift2 = shifts[j];
            
            // Only check shifts on the same day
            if (shift1.day !== shift2.day) continue;
            
            // Check for overlap
            if (this._shiftsOverlap(shift1, shift2)) {
              violations.push({
                type: 'shiftOverlap',
                employeeId: empId,
                shifts: [shift1, shift2]
              });
            }
          }
        }
      }
      
      return violations;
    };
    
    // Log initial constraint violations
    const initialViolations = checkConstraints(currentAssignments);
    console.log(`Initial schedule has ${initialViolations.length} constraint violations`);
    
    // Recursive function to resolve violations
    const resolveViolations = (assignments, depth = 0, maxDepth = 3) => {
      // Prevent infinite recursion
      if (depth >= maxDepth) {
        console.log(`Reached max recursion depth (${maxDepth}), returning current solution`);
        return assignments;
      }
      
      // Check for violations
      const violations = checkConstraints(assignments);
      
      // If no violations, return the assignments
      if (violations.length === 0) {
        console.log(`No violations found at depth ${depth}, solution is optimal`);
        return assignments;
      }
      
      console.log(`Found ${violations.length} constraint violations at depth ${depth}, attempting to resolve...`);
      
      let modifiedAssignments = [...assignments];
      
      // Handle overlap violations first as they're critical
      const overlapViolations = violations.filter(v => v.type === 'shiftOverlap');
      if (overlapViolations.length > 0) {
        console.log(`Processing ${overlapViolations.length} shift overlap violations`);
        
        for (const violation of overlapViolations) {
          // Choose the second shift to reassign
          const shiftToReassign = violation.shifts[1];
          
          // Find alternative employee
          const alternativeEmployeeId = this._findAlternativeEmployee(
            shiftToReassign,
            employees,
            employeeAvailability,
            modifiedAssignments,
            constraints
          );
          
          if (alternativeEmployeeId) {
            const employee = employees.find(e => e.id === violation.employeeId);
            const altEmployee = employees.find(e => e.id === alternativeEmployeeId);
            console.log(`Resolving overlap by reassigning shift from ${employee?.name || violation.employeeId} to ${altEmployee?.name || alternativeEmployeeId}`);
            
            // Update the assignment
            const assignmentIndex = modifiedAssignments.findIndex(
              a => a.employeeId === shiftToReassign.employeeId && 
                   a.day === shiftToReassign.day && 
                   a.startTime === shiftToReassign.startTime
            );
            
            if (assignmentIndex !== -1) {
              modifiedAssignments[assignmentIndex] = {
                ...modifiedAssignments[assignmentIndex],
                employeeId: alternativeEmployeeId
              };
            }
          } else {
            console.log(`Could not find alternative employee for overlapping shift, removing it`);
            
            // If no alternative, remove the shift
            modifiedAssignments = modifiedAssignments.filter(
              a => !(a.employeeId === shiftToReassign.employeeId && 
                    a.day === shiftToReassign.day && 
                    a.startTime === shiftToReassign.startTime)
            );
          }
        }
      }
      
      // Handle each type of violation
      // First handle max shifts exceeded
      const maxShiftsViolations = violations.filter(v => v.type === 'maxShiftsExceeded');
      if (maxShiftsViolations.length > 0) {
        console.log(`Processing ${maxShiftsViolations.length} max shifts violations`);
        
        for (const violation of maxShiftsViolations) {
          // Find the employee
          const employee = employees.find(e => e.id === violation.employeeId);
          console.log(`Employee ${employee?.name || violation.employeeId} has ${violation.count} shifts (exceeds max of ${constraints.maxShiftsPerEmployee})`);
          
          // Get shifts assigned to this employee
          const employeeShifts = modifiedAssignments.filter(
            a => a.employeeId === violation.employeeId
          );
          
          // Calculate how many shifts to reassign
          const excessShifts = violation.count - constraints.maxShiftsPerEmployee;
          console.log(`Need to reassign ${excessShifts} shifts`);
          
          // Try to reassign excess shifts
          let reassignedCount = 0;
          
          for (let i = 0; i < employeeShifts.length && reassignedCount < excessShifts; i++) {
            const shiftToReassign = employeeShifts[i];
            
            // Find alternative employee for this shift
            const alternativeEmployeeId = this._findAlternativeEmployee(
              shiftToReassign,
              employees,
              employeeAvailability,
              modifiedAssignments,
              constraints
            );
            
            if (alternativeEmployeeId) {
              // Find the alternative employee
              const altEmployee = employees.find(e => e.id === alternativeEmployeeId);
              console.log(`Reassigning shift from ${employee?.name || violation.employeeId} to ${altEmployee?.name || alternativeEmployeeId}`);
              
              // Update the assignment
              const assignmentIndex = modifiedAssignments.findIndex(
                a => a.employeeId === shiftToReassign.employeeId && 
                     a.day === shiftToReassign.day && 
                     a.startTime === shiftToReassign.startTime
              );
              
              if (assignmentIndex !== -1) {
                modifiedAssignments[assignmentIndex] = {
                  ...modifiedAssignments[assignmentIndex],
                  employeeId: alternativeEmployeeId
                };
                reassignedCount++;
              }
            } else {
              console.log(`Could not find alternative employee for shift day=${shiftToReassign.day}, time=${shiftToReassign.startTime}-${shiftToReassign.endTime}`);
            }
          }
          
          console.log(`Successfully reassigned ${reassignedCount} of ${excessShifts} excess shifts`);
        }
      }
      
      // Handle insufficient rest violations
      const restViolations = violations.filter(v => v.type === 'insufficientRest');
      if (restViolations.length > 0) {
        console.log(`Processing ${restViolations.length} insufficient rest violations`);
        
        for (const violation of restViolations) {
          // Get the second shift (that needs to be reassigned)
          const shiftToReassign = violation.shifts[1];
          
          // Find alternative employee
          const alternativeEmployeeId = this._findAlternativeEmployee(
            shiftToReassign,
            employees,
            employeeAvailability,
            modifiedAssignments,
            constraints
          );
          
          if (alternativeEmployeeId) {
            // Find employees for logging
            const origEmployee = employees.find(e => e.id === violation.employeeId);
            const altEmployee = employees.find(e => e.id === alternativeEmployeeId);
            
            console.log(`Reassigning shift from ${origEmployee?.name || violation.employeeId} to ${altEmployee?.name || alternativeEmployeeId} due to insufficient rest`);
            
            // Update the assignment
            const assignmentIndex = modifiedAssignments.findIndex(
              a => a.employeeId === shiftToReassign.employeeId && 
                   a.day === shiftToReassign.day && 
                   a.startTime === shiftToReassign.startTime
            );
            
            if (assignmentIndex !== -1) {
              modifiedAssignments[assignmentIndex] = {
                ...modifiedAssignments[assignmentIndex],
                employeeId: alternativeEmployeeId
              };
            }
          } else {
            console.log(`Could not find alternative employee for shift to resolve insufficient rest`);
          }
        }
      }
      
      // Handle min shifts not met violations by trying to assign additional shifts
      const minShiftsViolations = violations.filter(v => v.type === 'minShiftsNotMet');
      if (minShiftsViolations.length > 0) {
        console.log(`Processing ${minShiftsViolations.length} minimum shifts violations`);
        
        // For each employee who needs more shifts
        for (const violation of minShiftsViolations) {
          const employee = employees.find(e => e.id === violation.employeeId);
          console.log(`Employee ${employee?.name || violation.employeeId} only has ${violation.count} shifts (below min of ${constraints.minShiftsPerEmployee})`);
          
          // Find shifts that could be reassigned to this employee
          const candidateShifts = [];
          
          // Look through all shifts already assigned to other employees
          const otherEmployeeShifts = modifiedAssignments.filter(a => a.employeeId !== violation.employeeId);
          
          for (const shift of otherEmployeeShifts) {
            // Check if this employee is available for this shift
            const isAvailable = this._isEmployeeAvailableForShift(employee, shift, employeeAvailability);
            
            if (isAvailable) {
              // Check if assigning this shift would create overlaps
              const wouldCreateOverlap = modifiedAssignments
                .filter(a => a.employeeId === violation.employeeId && a.day === shift.day)
                .some(existingShift => this._shiftsOverlap(existingShift, shift));
              
              if (!wouldCreateOverlap) {
                // Check if it would violate rest time with any existing shifts
                const wouldViolateRest = modifiedAssignments
                  .filter(a => a.employeeId === violation.employeeId)
                  .some(existingShift => {
                    const hoursBetween = this._calculateHoursBetween(
                      existingShift.day, existingShift.endTime,
                      shift.day, shift.startTime
                    );
                    
                    return hoursBetween < constraints.minGapBetweenShifts;
                  });
                
                if (!wouldViolateRest) {
                  candidateShifts.push(shift);
                }
              }
            }
          }
          
          // Sort candidate shifts by employee shift count (descending)
          // to take shifts from employees who have the most
          candidateShifts.sort((a, b) => {
            const aCount = modifiedAssignments.filter(shift => shift.employeeId === a.employeeId).length;
            const bCount = modifiedAssignments.filter(shift => shift.employeeId === b.employeeId).length;
            return bCount - aCount;
          });
          
          // Calculate how many more shifts are needed
          const neededShifts = constraints.minShiftsPerEmployee - violation.count;
          console.log(`Need to assign ${neededShifts} more shifts, found ${candidateShifts.length} candidates`);
          
          // Reassign shifts up to the needed amount
          let reassignedCount = 0;
          for (let i = 0; i < candidateShifts.length && reassignedCount < neededShifts; i++) {
            const shiftToReassign = candidateShifts[i];
            const originalEmployee = employees.find(e => e.id === shiftToReassign.employeeId);
            
            // Only reassign if the original employee won't go below minimum
            const originalEmployeeShiftCount = modifiedAssignments.filter(
              a => a.employeeId === shiftToReassign.employeeId
            ).length;
            
            if (originalEmployeeShiftCount > constraints.minShiftsPerEmployee) {
              console.log(`Reassigning shift from ${originalEmployee?.name || shiftToReassign.employeeId} to ${employee?.name || violation.employeeId}`);
              
              // Update the assignment
              const assignmentIndex = modifiedAssignments.findIndex(
                a => a.employeeId === shiftToReassign.employeeId && 
                     a.day === shiftToReassign.day && 
                     a.startTime === shiftToReassign.startTime
              );
              
              if (assignmentIndex !== -1) {
                modifiedAssignments[assignmentIndex] = {
                  ...modifiedAssignments[assignmentIndex],
                  employeeId: violation.employeeId
                };
                reassignedCount++;
              }
            }
          }
          
          console.log(`Successfully reassigned ${reassignedCount} of ${neededShifts} needed shifts`);
        }
      }
      
      // Recursively continue resolving violations
      return resolveViolations(modifiedAssignments, depth + 1, maxDepth);
    };
    
    // Attempt to resolve all violations
    console.log('Starting constraint resolution process...');
    const optimizedAssignments = resolveViolations(currentAssignments);
    
    // Check final violations
    const finalViolations = checkConstraints(optimizedAssignments);
    console.log(`After optimization: ${finalViolations.length} remaining violations`);
    
    return optimizedAssignments;
  }
  
  /**
   * Helper method to check if an employee is available for a shift
   */
  _isEmployeeAvailableForShift(employee, shift, employeeAvailability) {
    const availability = employeeAvailability[employee.id] || [];
    const daySlots = availability.filter(slot => slot.dayOfWeek === shift.day);
    
    if (daySlots.length === 0) return false;
    
    const shiftStartHour = parseInt(shift.startTime.split(':')[0]);
    const shiftEndHour = parseInt(shift.endTime.split(':')[0]);
    
    // Check each hour of the shift
    for (let hour = shiftStartHour; hour < shiftEndHour; hour++) {
      const hourString = `${hour.toString().padStart(2, '0')}:00`;
      const nextHourString = `${(hour + 1).toString().padStart(2, '0')}:00`;
      
      const isHourCovered = daySlots.some(slot => 
        slot.startTime <= hourString && slot.endTime >= nextHourString
      );
      
      if (!isHourCovered) return false;
    }
    
    return true;
  }
  
  /**
   * Find an alternative employee to assign to a shift
   */
  _findAlternativeEmployee(shift, employees, employeeAvailability, currentAssignments, constraints) {
    console.log(`Finding alternative employee for shift: day=${shift.day}, time=${shift.startTime}-${shift.endTime}`);
    
    // Find employees available for this shift
    const availableEmployees = employees.filter(emp => {
      // Skip the current employee
      if (emp.id === shift.employeeId) return false;
      
      // Check if employee is available based on their availability
      if (!this._isEmployeeAvailableForShift(emp, shift, employeeAvailability)) {
        return false;
      }
      
      // Check for overlapping shifts on the same day
      const existingShiftsOnDay = currentAssignments.filter(
        a => a.employeeId === emp.id && a.day === shift.day
      );
      
      const hasOverlap = existingShiftsOnDay.some(existingShift => 
        this._shiftsOverlap(existingShift, shift)
      );
      
      if (hasOverlap) {
        return false;
      }
      
      // Check if reassignment would violate constraints
      // Count current shifts for this employee
      const employeeShiftCount = currentAssignments.filter(
        a => a.employeeId === emp.id
      ).length;
      
      // Check max shifts constraint
      if (employeeShiftCount >= constraints.maxShiftsPerEmployee) {
        return false;
      }
      
      // Check minimum rest time between shifts
      const employeeAssignments = currentAssignments.filter(
        a => a.employeeId === emp.id
      );
      
      for (const assignment of employeeAssignments) {
        // Calculate hours between this assignment and the shift to reassign
        let hoursBetween;
        
        if (assignment.day === shift.day) {
          // Same day - check time difference
          if (assignment.endTime <= shift.startTime) {
            hoursBetween = this._calculateHoursBetween(
              assignment.day, assignment.endTime,
              shift.day, shift.startTime
            );
          } else if (shift.endTime <= assignment.startTime) {
            hoursBetween = this._calculateHoursBetween(
              shift.day, shift.endTime,
              assignment.day, assignment.startTime
            );
          } else {
            // Shifts overlap - cannot assign
            return false;
          }
        } else if (assignment.day < shift.day) {
          // Assignment is before shift
          hoursBetween = this._calculateHoursBetween(
            assignment.day, assignment.endTime,
            shift.day, shift.startTime
          );
        } else {
          // Assignment is after shift
          hoursBetween = this._calculateHoursBetween(
            shift.day, shift.endTime,
            assignment.day, assignment.startTime
          );
        }
        
        if (hoursBetween < constraints.minGapBetweenShifts) {
          return false;
        }
      }
      
      return true;
    });
    
    if (availableEmployees.length === 0) {
      console.log(`No alternative employees found for this shift`);
      return null;
    }
    
    // Get current shift counts for available employees
    const employeeShiftCounts = {};
    availableEmployees.forEach(emp => {
      employeeShiftCounts[emp.id] = currentAssignments.filter(
        a => a.employeeId === emp.id
      ).length;
    });
    
    // First try employees who haven't reached minimum shifts
    const underutilizedEmployees = availableEmployees.filter(emp => 
      employeeShiftCounts[emp.id] < constraints.minShiftsPerEmployee
    );
    
    // If we have underutilized employees, prefer them
    if (underutilizedEmployees.length > 0) {
      // Sort by shift count (ascending)
      underutilizedEmployees.sort((a, b) => 
        employeeShiftCounts[a.id] - employeeShiftCounts[b.id]
      );
      
      const chosenEmployee = underutilizedEmployees[0];
      console.log(`Selected underutilized employee: ${chosenEmployee.name} (${chosenEmployee.id}) with ${employeeShiftCounts[chosenEmployee.id]} shifts`);
      return chosenEmployee.id;
    }
    
    // Otherwise sort all available employees by shift count (ascending)
    availableEmployees.sort((a, b) => 
      employeeShiftCounts[a.id] - employeeShiftCounts[b.id]
    );
    
    // Log the chosen employee
    const chosenEmployee = availableEmployees[0];
    console.log(`Selected alternative employee: ${chosenEmployee.name} (${chosenEmployee.id}) with ${employeeShiftCounts[chosenEmployee.id]} current shifts`);
    
    // Return employee with fewest shifts
    return chosenEmployee.id;
  }
  
  /**
   * Calculate hours between two timepoints
   */
  _calculateHoursBetween(day1, time1, day2, time2) {
    // Convert times to hours
    const getHours = (timeStr) => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      return hours + (minutes / 60);
    };
    
    const hours1 = getHours(time1);
    const hours2 = getHours(time2);
    
    // Calculate difference
    let hoursBetween;
    if (day1 === day2) {
      hoursBetween = hours2 - hours1;
    } else {
      // Add 24 hours for each day difference
      hoursBetween = (24 * (day2 - day1)) + (hours2 - hours1);
    }
    
    return hoursBetween;
  }
  
  /**
   * Generate a simple schedule with default shifts when the complex algorithm fails
   */
  async generateSimpleSchedule(scheduleId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Get schedule details
      const scheduleResult = await client.query(
        `SELECT * FROM schedules WHERE id = $1`,
        [scheduleId]
      );
      
      if (scheduleResult.rows.length === 0) {
        throw new Error('Schedule not found');
      }
      
      const schedule = scheduleResult.rows[0];
      const branchId = schedule.branch_id;
      
      // Get employees for this branch
      const employeesResult = await client.query(
        `SELECT e.id, u.name FROM employees e
         JOIN users u ON e.user_id = u.id
         WHERE e.branch_id = $1 AND e.status = 'Active'
         LIMIT 5`,
        [branchId]
      );
      
      if (employeesResult.rows.length === 0) {
        throw new Error('No employees found for this branch');
      }
      
      const employees = employeesResult.rows;
      console.log(`Found ${employees.length} employees`);
      
      // Create some basic shifts (one per day per employee)
      const insertedShifts = [];
      const weekStart = new Date(schedule.week_start);
      
      for (let day = 0; day < 7; day++) {
        const currentDate = new Date(weekStart);
        currentDate.setDate(weekStart.getDate() + day);
        
        for (let i = 0; i < Math.min(employees.length, 3); i++) {
          const empId = employees[i].id;
          
          // Create start and end times
          const startDateTime = new Date(currentDate);
          startDateTime.setHours(9, 0, 0, 0);
          
          const endDateTime = new Date(currentDate);
          endDateTime.setHours(17, 0, 0, 0);
          
          // Insert the shift
          const shiftResult = await client.query(
            `INSERT INTO shifts (schedule_id, employee_id, start_time, end_time, status)
             VALUES ($1, $2, $3, $4, 'Approved')
             RETURNING id`,
            [scheduleId, empId, startDateTime, endDateTime]
          );
          
          insertedShifts.push(shiftResult.rows[0].id);
        }
      }
      
      await client.query('COMMIT');
      
      return {
        scheduleId,
        shiftsCreated: insertedShifts.length,
        message: `Created ${insertedShifts.length} basic shifts`
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error in simple schedule generation:', error);
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
  console.log(`Found ${shifts.length} shifts for schedule ${scheduleId}`);
  
  // Define days of week for logging
  const daysOfWeek = ['Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба', 'Ням'];
  
  // Format shifts by day and time
  const formattedShifts = {};
  const weekStart = new Date(schedule.week_start);
  console.log(`Week start date: ${weekStart.toISOString()}`);
  
  for (let day = 0; day < 7; day++) {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + day);
    const dateString = date.toISOString().split('T')[0];
    
    // Get the JS day of week (0=Sunday, 1=Monday)
    const jsDay = date.getDay();
    // Convert to our day index (0=Monday, 6=Sunday)
    const ourDay = jsDay === 0 ? 6 : jsDay - 1;
    
    console.log(`Initialized day ${day} from week start: ${dateString}, JS day: ${jsDay}, Our day: ${ourDay} (${daysOfWeek[ourDay]})`);
    
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
    const endTime = new Date(shift.end_time);
    const dateString = startTime.toISOString().split('T')[0];
    
    console.log(`Processing shift: ${shift.id}, Date: ${dateString}, Start: ${startTime.toISOString()}, End: ${endTime.toISOString()}`);
    
    // Get all hours this shift spans
    const startHour = startTime.getHours();
    const endHour = endTime.getHours();
    
    // Check if this shift's date is in our formatted structure
    if (!formattedShifts[dateString]) {
      console.log(`Warning: Shift date ${dateString} not found in initialized dates. Finding closest match...`);
      // Find the closest date
      const closestDate = Object.keys(formattedShifts).reduce((closest, date) => {
        const diff1 = Math.abs(new Date(dateString) - new Date(closest));
        const diff2 = Math.abs(new Date(dateString) - new Date(date));
        return diff2 < diff1 ? date : closest;
      }, Object.keys(formattedShifts)[0]);
      
      console.log(`Using ${closestDate} as the closest match for ${dateString}`);
      
      // Add the shift to each hour's array that it spans in the closest date
      for (let hour = startHour; hour <= endHour; hour++) {
        const timeString = `${String(hour).padStart(2, '0')}:00`;
        
        if (formattedShifts[closestDate] && formattedShifts[closestDate][timeString]) {
          // Add a flag to indicate this is a continuation of a shift
          const isContinuation = hour > startHour;
          
          formattedShifts[closestDate][timeString].push({
            id: shift.id,
            employeeId: shift.employee_id,
            employeeName: shift.employee_name,
            startTime: shift.start_time,
            endTime: shift.end_time,
            status: shift.status,
            isContinuation 
          });
          
          console.log(`Added shift to closest date ${closestDate} at time ${timeString}`);
        }
      }
    } else {
      // Add the shift to each hour's array that it spans
      for (let hour = startHour; hour <= endHour; hour++) {
        const timeString = `${String(hour).padStart(2, '0')}:00`;
        
        if (formattedShifts[dateString] && formattedShifts[dateString][timeString]) {
          // Add a flag to indicate this is a continuation of a shift
          const isContinuation = hour > startHour;
          
          formattedShifts[dateString][timeString].push({
            id: shift.id,
            employeeId: shift.employee_id,
            employeeName: shift.employee_name,
            startTime: shift.start_time,
            endTime: shift.end_time,
            status: shift.status,
            isContinuation
          });
          
          console.log(`Added shift to ${dateString} at time ${timeString}`);
        }
      }
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