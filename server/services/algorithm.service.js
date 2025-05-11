/**
 * Service implementing the scheduling algorithm
 * Uses a combination of greedy algorithm and backtracking to create optimal schedules
 */
class SchedulingAlgorithm {
    /**
     * Generate an optimal schedule using employee availability and constraints
     * 
     * @param {Array} employees - Array of employee objects
     * @param {Object} employeeAvailability - Mapping of employee IDs to their availability
     * @param {Array} shiftSlots - Array of shift slot objects (day, start time, end time)
     * @param {Object} constraints - Additional constraints for the schedule
     * @returns {Array} Schedule of shifts assigned to employees
     */
    generateSchedule(employees, employeeAvailability, shiftSlots, constraints = {}) {
      // Define days of week array (for logging purposes)
      const daysOfWeek = ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба'];
      
      console.log('Generating schedule for', employees.length, 'employees and', shiftSlots.length, 'shift slots');
      console.log('Using day convention: 0 =', daysOfWeek[0]);

      // Initial assignments using greedy algorithm
      const initialAssignments = this._greedyAssignment(employees, employeeAvailability, shiftSlots);
      
      // Apply backtracking to resolve conflicts and optimize
      const optimizedSchedule = this._backtrackOptimize(initialAssignments, employees, employeeAvailability, constraints);
      
      return optimizedSchedule;
    }
    
    /**
     * Greedy algorithm for initial shift assignments
     * Assigns shifts to employees with the least number of current assignments
     * who are available for that shift
     */
    _greedyAssignment(employees, employeeAvailability, shiftSlots) {
      const assignments = [];
      const employeeShiftCounts = {};
      
      // Initialize shift counts
      employees.forEach(emp => {
        employeeShiftCounts[emp.id] = 0;
      });
      
      // Sort shift slots by start time
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
          return availability.some(slot => 
            slot.dayOfWeek === shift.day &&
            slot.startTime <= shift.startTime &&
            slot.endTime >= shift.endTime
          );
        });
        
        if (availableEmployees.length > 0) {
          // Sort employees by current shift count (ascending)
          availableEmployees.sort((a, b) => 
            employeeShiftCounts[a.id] - employeeShiftCounts[b.id]
          );
          
          // Assign to employee with fewest shifts
          const assignedEmployee = availableEmployees[0];
          employeeShiftCounts[assignedEmployee.id]++;
          
          assignments.push({
            shiftId: shift.id,
            employeeId: assignedEmployee.id,
            day: shift.day,
            startTime: shift.startTime,
            endTime: shift.endTime
          });
        }
      }
      
      return assignments;
    }
    
    /**
     * Backtracking algorithm to optimize the schedule
     * Attempts to resolve any constraint violations
     */
    _backtrackOptimize(initialAssignments, employees, employeeAvailability, constraints) {
      // Clone the initial assignments to avoid modifying the original
      let currentAssignments = [...initialAssignments];
      
      // Define constraints to check
      const checkConstraints = (assignments) => {
        const violations = [];
        
        // Check maximum shifts per employee
        if (constraints.maxShiftsPerEmployee) {
          const shiftCounts = {};
          assignments.forEach(assignment => {
            shiftCounts[assignment.employeeId] = (shiftCounts[assignment.employeeId] || 0) + 1;
          });
          
          for (const empId in shiftCounts) {
            if (shiftCounts[empId] > constraints.maxShiftsPerEmployee) {
              violations.push({
                type: 'maxShiftsExceeded',
                employeeId: empId,
                count: shiftCounts[empId]
              });
            }
          }
        }
        
        // Check minimum time between shifts
        if (constraints.minHoursBetweenShifts) {
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
            
            // Check consecutive shifts
            for (let i = 0; i < shifts.length - 1; i++) {
              const currentShift = shifts[i];
              const nextShift = shifts[i + 1];
              
              // Calculate hours between shifts
              const hoursBetween = this._calculateHoursBetween(
                currentShift.day, currentShift.endTime,
                nextShift.day, nextShift.startTime
              );
              
              if (hoursBetween < constraints.minHoursBetweenShifts) {
                violations.push({
                  type: 'insufficientRest',
                  employeeId: empId,
                  shifts: [currentShift, nextShift],
                  hoursBetween
                });
              }
            }
          }
        }
        
        return violations;
      };
      
      // Check initial assignments for constraint violations
      const initialViolations = checkConstraints(currentAssignments);
      
      // If no violations, return the initial assignments
      if (initialViolations.length === 0) {
        return currentAssignments;
      }
      
      // Attempt to resolve violations through backtracking
      const resolveViolations = (assignments, depth = 0, maxDepth = 10) => {
        // Check if we've reached maximum recursion depth
        if (depth >= maxDepth) {
          return assignments;
        }
        
        // Check for violations
        const violations = checkConstraints(assignments);
        
        // If no violations, return the assignments
        if (violations.length === 0) {
          return assignments;
        }
        
        // Handle violations by priority
        let modifiedAssignments = [...assignments];
        
        // First handle maximum shifts exceeded
        const maxShiftsViolations = violations.filter(v => v.type === 'maxShiftsExceeded');
        if (maxShiftsViolations.length > 0) {
          for (const violation of maxShiftsViolations) {
            // Get shifts assigned to this employee
            const employeeShifts = modifiedAssignments.filter(
              a => a.employeeId === violation.employeeId
            );
            
            // Sort by least important (e.g., weekend shifts might be less important)
            const sortedShifts = [...employeeShifts].sort((a, b) => {
              // Prioritize weekdays over weekends (0=Sun, 6=Sat are weekends)
              if ((a.day === 0 || a.day === 6) && (b.day > 0 && b.day < 6)) {
                return -1; // Weekends first (less important)
              }
              if ((b.day === 0 || b.day === 6) && (a.day > 0 && a.day < 6)) {
                return 1; // Weekends first (less important)
              }
              return 0;
            });
            
            // Calculate how many shifts to reassign
            const excessShifts = violation.count - constraints.maxShiftsPerEmployee;
            
            // Reassign excess shifts
            for (let i = 0; i < excessShifts && i < sortedShifts.length; i++) {
              const shiftToReassign = sortedShifts[i];
              
              // Find alternative employee for this shift
              const alternativeEmployee = this._findAlternativeEmployee(
                shiftToReassign,
                employees,
                employeeAvailability,
                modifiedAssignments,
                constraints
              );
              
              if (alternativeEmployee) {
                // Update the assignment
                const assignmentIndex = modifiedAssignments.findIndex(
                  a => a.shiftId === shiftToReassign.shiftId
                );
                
                if (assignmentIndex !== -1) {
                    modifiedAssignments[assignmentIndex] = {
                      ...modifiedAssignments[assignmentIndex],
                      employeeId: alternativeEmployee
                    };
                  }
                }
              }
            }
          }
          
          // Then handle insufficient rest violations
          const restViolations = violations.filter(v => v.type === 'insufficientRest');
          if (restViolations.length > 0) {
            for (const violation of restViolations) {
              // Get the second shift (that needs to be reassigned)
              const shiftToReassign = violation.shifts[1];
              
              // Find alternative employee
              const alternativeEmployee = this._findAlternativeEmployee(
                shiftToReassign,
                employees,
                employeeAvailability,
                modifiedAssignments,
                constraints
              );
              
              if (alternativeEmployee) {
                // Update the assignment
                const assignmentIndex = modifiedAssignments.findIndex(
                  a => a.shiftId === shiftToReassign.shiftId
                );
                
                if (assignmentIndex !== -1) {
                  modifiedAssignments[assignmentIndex] = {
                    ...modifiedAssignments[assignmentIndex],
                    employeeId: alternativeEmployee
                  };
                }
              }
            }
          }
          
          // Recursively continue resolving violations
          return resolveViolations(modifiedAssignments, depth + 1, maxDepth);
        };
        
        // Attempt to resolve all violations
        const optimizedAssignments = resolveViolations(currentAssignments);
        
        return optimizedAssignments;
      }
      
      /**
       * Find an alternative employee to assign to a shift
       */
      _findAlternativeEmployee(shift, employees, employeeAvailability, currentAssignments, constraints) {
        // Find employees available for this shift
        const availableEmployees = employees.filter(emp => {
          // Skip the current employee
          if (emp.id === shift.employeeId) return false;
          
          // Check if employee is available for this shift
          const availability = employeeAvailability[emp.id] || [];
          const isAvailable = availability.some(slot => 
            slot.dayOfWeek === shift.day &&
            slot.startTime <= shift.startTime &&
            slot.endTime >= shift.endTime
          );
          
          if (!isAvailable) return false;
          
          // Check if reassignment would violate constraints
          if (constraints.maxShiftsPerEmployee) {
            const employeeShiftCount = currentAssignments.filter(
              a => a.employeeId === emp.id
            ).length;
            
            if (employeeShiftCount >= constraints.maxShiftsPerEmployee) {
              return false;
            }
          }
          
          // Check minimum rest time between shifts
          if (constraints.minHoursBetweenShifts) {
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
              
              if (hoursBetween < constraints.minHoursBetweenShifts) {
                return false;
              }
            }
          }
          
          return true;
        });
        
        if (availableEmployees.length === 0) {
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
        
        // Return employee with fewest shifts
        return availableEmployees[0].id;
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
        if (day1 === day2) {
          return hours2 - hours1;
        } else {
          // Add 24 hours for each day difference
          return (24 * (day2 - day1)) + (hours2 - hours1);
        }
      }
    }
    
    module.exports = new SchedulingAlgorithm();