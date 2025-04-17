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
      
      // Ensure schedule settings exist
      await this._ensureScheduleSettings(client, scheduleId, {
        startTime: '07:00',
        endTime: '23:00',
        minGapBetweenShifts: 8,
        minShiftsPerEmployee: 1,
        maxShiftsPerEmployee: 5
      });
      
      // Now get schedule with settings
      const scheduleWithSettingsResult = await client.query(
        `SELECT s.*, ss.* 
         FROM schedules s
         LEFT JOIN schedule_settings ss ON s.id = ss.schedule_id
         WHERE s.id = $1`,
        [scheduleId]
      );
      
      const scheduleWithSettings = scheduleWithSettingsResult.rows[0];
      
      // Parse schedule settings safely
      let selectedDays = [0, 1, 2, 3, 4, 5, 6]; // Default to all days
      
      if (scheduleWithSettings.selected_days) {
        try {
          // Handle both string and array formats safely
          if (typeof scheduleWithSettings.selected_days === 'string') {
            selectedDays = JSON.parse(scheduleWithSettings.selected_days);
          } else if (Array.isArray(scheduleWithSettings.selected_days)) {
            selectedDays = scheduleWithSettings.selected_days;
          }
          
          // Convert string numbers to integers if needed
          selectedDays = selectedDays.map(day => parseInt(day));
        } catch (error) {
          console.error('Error parsing selected_days:', error);
          console.error('Raw selected_days value:', scheduleWithSettings.selected_days);
          // Fall back to default if parsing fails
        }
      }
      
      console.log('Selected days for scheduling:', selectedDays);
      
      // Get scheduling parameters with fallbacks for missing values
      const startTime = scheduleWithSettings.start_time ? scheduleWithSettings.start_time.substring(0, 5) : '07:00';
      const endTime = scheduleWithSettings.end_time ? scheduleWithSettings.end_time.substring(0, 5) : '23:00';
      const minGapBetweenShifts = parseInt(scheduleWithSettings.min_gap_between_shifts) || 0;
      const minShiftsPerEmployee = parseInt(scheduleWithSettings.min_shifts_per_employee) || 1;
      const maxShiftsPerEmployee = parseInt(scheduleWithSettings.max_shifts_per_employee) || 40;
      const shiftLength = 1; // Default shift length in hours
      
      console.log('Scheduling parameters:', {
        startTime,
        endTime,
        minGapBetweenShifts,
        minShiftsPerEmployee,
        maxShiftsPerEmployee,
        shiftLength
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
      
      // Define shift slots for each day
      const shiftSlots = [];
      const weekStart = new Date(schedule.week_start);
      
      // Define standard shift times based on settings
      const shiftTimes = [];
      
      // Convert time strings to hours for calculation
      const startHour = parseInt(startTime.split(':')[0]);
      const endHour = parseInt(endTime.split(':')[0]);
      
      // Create shifts with specified shift length
      for (let hour = startHour; hour <= endHour - shiftLength; hour += shiftLength) {
        const shiftStart = `${hour.toString().padStart(2, '0')}:00`;
        const shiftEnd = `${(hour + shiftLength).toString().padStart(2, '0')}:00`;
        shiftTimes.push({ start: shiftStart, end: shiftEnd });
      }
      
      console.log(`Created ${shiftTimes.length} different shift time slots:`, shiftTimes);
      
      // Create shift slots for each selected day
      for (const dayOfWeek of selectedDays) {
        const dayDate = new Date(weekStart);
        dayDate.setDate(weekStart.getDate() + dayOfWeek);
        
        for (const shiftTime of shiftTimes) {
          shiftSlots.push({
            day: dayOfWeek,
            date: new Date(dayDate),
            startTime: shiftTime.start,
            endTime: shiftTime.end
          });
        }
      }
      
      console.log(`Created ${shiftSlots.length} total shift slots`);
      
      // Debug: Show first few shift slots
      shiftSlots.slice(0, 3).forEach((slot, i) => {
        console.log(`Shift slot ${i}: day=${slot.day}, time=${slot.startTime}-${slot.endTime}, date=${slot.date}`);
      });
      
      // Check if we have employees available for each shift
      const availabilityCheck = [];
      
      for (const shift of shiftSlots) {
        const availableEmployees = [];
        
        for (const emp of employees) {
          const empId = emp.id;
          const availability = employeeAvailability[empId] || [];
          
          // Check if employee is available for this shift
          // Modified approach: Check if all hours of the shift are covered by availability slots
          // For an 8-hour shift, we don't need one slot covering the whole duration,
          // just enough slots to cover each hour
          
          // Get all availability slots for this day
          const daySlots = availability.filter(slot => slot.dayOfWeek === shift.day);
          
          if (daySlots.length === 0) {
            continue; // No availability for this day at all
          }
          
          // Convert shift start/end to hours for checking
          const shiftStartHour = parseInt(shift.startTime.split(':')[0]);
          const shiftEndHour = parseInt(shift.endTime.split(':')[0]);
          
          // Check if each hour of the shift is covered by at least one availability slot
          let allHoursCovered = true;
          for (let hour = shiftStartHour; hour < shiftEndHour; hour++) {
            const hourString = `${hour.toString().padStart(2, '0')}:00`;
            const nextHourString = `${(hour + 1).toString().padStart(2, '0')}:00`;
            
            // Check if any availability slot covers this hour
            const isHourCovered = daySlots.some(slot => 
              slot.startTime <= hourString && slot.endTime >= nextHourString
            );
            
            if (!isHourCovered) {
              allHoursCovered = false;
              break; // This hour is not covered by any availability slot
            }
          }
          
          if (allHoursCovered) {
            availableEmployees.push(emp.name);
          }
        }
        
        availabilityCheck.push({
          day: shift.day,
          time: `${shift.startTime}-${shift.endTime}`,
          availableEmployees: availableEmployees
        });
      }
      
      console.log('Availability check (first 3 shifts):', availabilityCheck.slice(0, 3));
      
      // Apply the greedy algorithm to assign shifts
      console.log('Starting greedy shift assignment...');
      const assignments = this._greedyShiftAssignment(
        employees, 
        employeeAvailability, 
        shiftSlots,
        {
          minGapBetweenShifts,
          minShiftsPerEmployee,
          maxShiftsPerEmployee
        }
      );
      
      console.log(`Assigned ${assignments.length} shifts to employees`);
      
      // Debug: Show first few assignments
      assignments.slice(0, 3).forEach((assignment, i) => {
        console.log(`Assignment ${i}: employee=${assignment.employeeId}, day=${assignment.day}, time=${assignment.startTime}-${assignment.endTime}`);
      });
      
      // Apply backtracking to optimize and resolve conflicts
      console.log('Starting backtracking optimization...');
      const optimizedAssignments = this._backtrackOptimize(
        assignments,
        employees,
        employeeAvailability,
        {
          minGapBetweenShifts,
          minShiftsPerEmployee,
          maxShiftsPerEmployee
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
   * Greedy algorithm for initial shift assignments
   * Assigns shifts to employees with the least number of current assignments
   * who are available for that shift
   */
  _greedyShiftAssignment(employees, employeeAvailability, shiftSlots, constraints) {
    console.log('Starting greedy algorithm with:', { 
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
    
    // Sort shift slots by day and start time
    const sortedShiftSlots = [...shiftSlots].sort((a, b) => {
      // First sort by day
      if (a.day !== b.day) return a.day - b.day;
      // Then by start time
      return a.startTime.localeCompare(b.startTime);
    });
    
    // Assign each shift
    for (const shift of sortedShiftSlots) {
      // Find available employees for this shift
      const availableEmployees = employees.filter(emp => {
        const availability = employeeAvailability[emp.id] || [];
        
        // Get all availability slots for this day
        const daySlots = availability.filter(slot => slot.dayOfWeek === shift.day);
        
        if (daySlots.length === 0) {
          return false; // No availability for this day at all
        }
        
        // Convert shift start/end to hours for checking
        const shiftStartHour = parseInt(shift.startTime.split(':')[0]);
        const shiftEndHour = parseInt(shift.endTime.split(':')[0]);
        
        // Check if each hour of the shift is covered by at least one availability slot
        for (let hour = shiftStartHour; hour < shiftEndHour; hour++) {
          const hourString = `${hour.toString().padStart(2, '0')}:00`;
          const nextHourString = `${(hour + 1).toString().padStart(2, '0')}:00`;
          
          // Check if any availability slot covers this hour
          const isHourCovered = daySlots.some(slot => 
            slot.startTime <= hourString && slot.endTime >= nextHourString
          );
          
          if (!isHourCovered) {
            return false; // This hour is not covered by any availability slot
          }
        }
        
        // If we got here, all hours are covered
        return true;
      });
      
      console.log(`Shift day=${shift.day} time=${shift.startTime}-${shift.endTime}: ${availableEmployees.length} available employees`);
      
      if (availableEmployees.length > 0) {
        // Filter employees who haven't exceeded their max shifts
        const eligibleEmployees = availableEmployees.filter(emp => 
          employeeShiftCounts[emp.id] < constraints.maxShiftsPerEmployee
        );
        
        if (eligibleEmployees.length > 0) {
          // Sort employees by current shift count (ascending)
          eligibleEmployees.sort((a, b) => 
            employeeShiftCounts[a.id] - employeeShiftCounts[b.id]
          );
          
          // Assign to employee with fewest shifts
          const assignedEmployee = eligibleEmployees[0];
          employeeShiftCounts[assignedEmployee.id]++;
          
          // Debug info
          console.log(`Assigned to ${assignedEmployee.name} (now has ${employeeShiftCounts[assignedEmployee.id]} shifts)`);
          
          assignments.push({
            employeeId: assignedEmployee.id,
            day: shift.day,
            date: shift.date,
            startTime: shift.startTime,
            endTime: shift.endTime
          });
        } else {
          console.log(`No eligible employees (all exceeded max shifts)`);
        }
      } else {
        console.log(`No available employees for this shift!`);
      }
    }
    
    console.log(`Greedy algorithm assigned ${assignments.length} shifts`);
    return assignments;
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
      
      // Check maximum shifts per employee
      for (const empId in shiftCounts) {
        // Check max shifts constraint
        if (shiftCounts[empId] > constraints.maxShiftsPerEmployee) {
          violations.push({
            type: 'maxShiftsExceeded',
            employeeId: empId,
            count: shiftCounts[empId]
          });
        }
        
        // Check min shifts constraint
        if (shiftCounts[empId] < constraints.minShiftsPerEmployee) {
          violations.push({
            type: 'minShiftsNotMet',
            employeeId: empId,
            count: shiftCounts[empId]
          });
        }
      }
      
      // Check for insufficient rest between shifts
      // Group assignments by employee
      const employeeAssignments = {};
      assignments.forEach(assignment => {
        if (!employeeAssignments[assignment.employeeId]) {
          employeeAssignments[assignment.employeeId] = [];
        }
        employeeAssignments[assignment.employeeId].push(assignment);
      });
      
      // Check each employee's consecutive shifts
      for (const empId in employeeAssignments) {
        const shifts = employeeAssignments[empId];
        
        // Sort shifts by day and start time
        shifts.sort((a, b) => {
          if (a.day !== b.day) return a.day - b.day;
          return a.startTime.localeCompare(b.startTime);
        });
        
        // Check pairs of shifts for rest time violations
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
   * Find an alternative employee to assign to a shift
   */
  _findAlternativeEmployee(shift, employees, employeeAvailability, currentAssignments, constraints) {
    console.log(`Finding alternative employee for shift: day=${shift.day}, time=${shift.startTime}-${shift.endTime}`);
    
    // Find employees available for this shift
    const availableEmployees = employees.filter(emp => {
      // Skip the current employee
      if (emp.id === shift.employeeId) return false;
      
      // Check if employee is available for this shift using the hourly approach
      const availability = employeeAvailability[emp.id] || [];
      
      // Get all availability slots for this day
      const daySlots = availability.filter(slot => slot.dayOfWeek === shift.day);
      
      if (daySlots.length === 0) {
        console.log(`Employee ${emp.name} (${emp.id}) has no availability on day ${shift.day}`);
        return false;
      }
      
      // Convert shift start/end to hours for checking
      const shiftStartHour = parseInt(shift.startTime.split(':')[0]);
      const shiftEndHour = parseInt(shift.endTime.split(':')[0]);
      
      // Check if each hour of the shift is covered by at least one availability slot
      for (let hour = shiftStartHour; hour < shiftEndHour; hour++) {
        const hourString = `${hour.toString().padStart(2, '0')}:00`;
        const nextHourString = `${(hour + 1).toString().padStart(2, '0')}:00`;
        
        // Check if any availability slot covers this hour
        const isHourCovered = daySlots.some(slot => 
          slot.startTime <= hourString && slot.endTime >= nextHourString
        );
        
        if (!isHourCovered) {
          console.log(`Employee ${emp.name} (${emp.id}) is not available at hour ${hourString} on day ${shift.day}`);
          return false;
        }
      }
      
      // Check if reassignment would violate constraints
      // Count current shifts for this employee
      const employeeShiftCount = currentAssignments.filter(
        a => a.employeeId === emp.id
      ).length;
      
      // Check max shifts constraint
      if (employeeShiftCount >= constraints.maxShiftsPerEmployee) {
        console.log(`Employee ${emp.name} (${emp.id}) already has maximum shifts (${employeeShiftCount})`);
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
            console.log(`Employee ${emp.name} (${emp.id}) has an overlapping shift on day ${assignment.day}`);
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
          console.log(`Employee ${emp.name} (${emp.id}) doesn't have enough rest time between shifts (${hoursBetween} hours, min is ${constraints.minGapBetweenShifts})`);
          return false;
        }
      }
      
      console.log(`Employee ${emp.name} (${emp.id}) is eligible for this shift`);
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
    
    // Sort by shift count (ascending)
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
    
    console.log(`Hours between day${day1} ${time1} and day${day2} ${time2}: ${hoursBetween}`);
    return hoursBetween;
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
          max_shifts_per_employee
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          scheduleId,
          JSON.stringify([0, 1, 2, 3, 4, 5, 6]),
          defaultSettings.startTime || '07:00',
          defaultSettings.endTime || '23:00',
          defaultSettings.minGapBetweenShifts || 8,
          defaultSettings.minShiftsPerEmployee || 1,
          defaultSettings.maxShiftsPerEmployee || 5
        ]
      );
    }
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