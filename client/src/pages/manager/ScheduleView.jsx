import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { format, parseISO, addDays, startOfWeek } from 'date-fns';

const ScheduleView = () => {
  const { scheduleId } = useParams();
  const navigate = useNavigate();
  
  const [schedule, setSchedule] = useState(null);
  const [processedSchedule, setProcessedSchedule] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalData, setModalData] = useState({
    employeeId: '',
    day: 0,
    startTime: '07:00',
    endTime: '15:00'
  });
  
  // Days of the week in Mongolian - start with Monday (0)
  const daysOfWeek = ['Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба', 'Ням'];
  
  // Time slots for display
  const timeSlots = [
    '07:00', '08:00', '09:00', '10:00', '11:00', '12:00',
    '13:00', '14:00', '15:00', '16:00', '17:00', '18:00',
    '19:00', '20:00', '21:00', '22:00', '23:00'
  ];
  
  // Process the schedule data to fill in all time slots covered by each shift
  const processScheduleData = (scheduleData) => {
    console.log('Processing schedule data:', scheduleData);
    
    if (scheduleData && scheduleData.shifts) {
      console.log('All dates in schedule:');
      const dateKeys = Object.keys(scheduleData.shifts);
      dateKeys.forEach(dateStr => {
        const date = new Date(dateStr);
        // get JS day (0 = Sunday, 1 = Monday, etc)
        const jsDay = date.getDay(); 
        // convert to our day (0 = Monday, 6 = Sunday)
        const ourDay = jsDay === 0 ? 6 : jsDay - 1;
        console.log(`Date: ${dateStr}, JS Day: ${jsDay}, Our Day Index: ${ourDay} (${daysOfWeek[ourDay]})`);
      });
    }

    if (!scheduleData || !scheduleData.shifts) {
      console.error('Invalid schedule data received:', scheduleData);
      return null;
    }
    
    // Clone the data to avoid modifying the original
    const processedData = JSON.parse(JSON.stringify(scheduleData));
    
    // Ensure all date entries have all time slots
    for (const dateStr in processedData.shifts) {
      for (const timeSlot of timeSlots) {
        if (!processedData.shifts[dateStr][timeSlot]) {
          processedData.shifts[dateStr][timeSlot] = [];
        }
      }
    }
    
    // For each date in the schedule
    for (const dateStr in scheduleData.shifts) {
      // For each time slot in that date
      for (const timeStr in scheduleData.shifts[dateStr]) {
        // For each shift starting at this time
        const shiftsAtTime = scheduleData.shifts[dateStr][timeStr];
        
        if (shiftsAtTime && shiftsAtTime.length > 0) {
          // Process each shift
          shiftsAtTime.forEach(shift => {
            const startTime = new Date(shift.startTime);
            const endTime = new Date(shift.endTime);
            
            // Calculate hours this shift covers
            let currentHour = startTime.getHours();
            const endHour = endTime.getHours();
            
            // Add the shift to all subsequent time slots it covers
            while (currentHour < endHour - 1) {
              currentHour++;
              const nextTimeStr = `${String(currentHour).padStart(2, '0')}:00`;
              
              // Skip if we're beyond our defined time slots
              if (!timeSlots.includes(nextTimeStr)) continue;
              
              // Initialize the time slot array if needed
              if (!processedData.shifts[dateStr][nextTimeStr]) {
                processedData.shifts[dateStr][nextTimeStr] = [];
              }
              
              // Add a reference to this shift with a continuation flag
              const continuationShift = {
                ...shift,
                isContinuation: true,
                originalStartTime: shift.startTime
              };
              
              // Add to this time slot only if it doesn't already have this shift
              const alreadyExists = processedData.shifts[dateStr][nextTimeStr].some(
                existingShift => existingShift.id === shift.id
              );
              
              if (!alreadyExists) {
                processedData.shifts[dateStr][nextTimeStr].push(continuationShift);
              }
            }
          });
        }
      }
    }
    
    return processedData;
  };
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch schedule details
        const scheduleResponse = await api.get(`/schedules/${scheduleId}`);
        
        // Ensure we're using the correct week start date without time zone adjustments
        let weekStart = scheduleResponse.data.weekStart;
        // Fix the date by removing any time component and ensure it's treated as a local date
        if (weekStart.includes('T')) {
          weekStart = weekStart.split('T')[0];
          scheduleResponse.data.weekStart = weekStart;
        }
        
        console.log('Week start from server (fixed):', weekStart);
        console.log('Week start as Date:', new Date(weekStart));
        console.log('Day of week for week start:', new Date(weekStart).getDay());
        
        setSchedule(scheduleResponse.data);
        
        // Process the schedule data
        const processed = processScheduleData(scheduleResponse.data);
        setProcessedSchedule(processed);
        
        // Fetch employees for this branch
        const employeesResponse = await api.get(`/employees/branch/${scheduleResponse.data.branchId}`);
        setEmployees(employeesResponse.data);
      } catch (err) {
        setError('Failed to load schedule data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [scheduleId]);
  
  // Function to refresh schedule data
  const refreshScheduleData = async () => {
    try {
      setLoading(true);
      // Fetch schedule details
      const scheduleResponse = await api.get(`/schedules/${scheduleId}`);
      console.log('Refreshed schedule data:', scheduleResponse.data);
      setSchedule(scheduleResponse.data);
      
      // Process the schedule data to fill all time slots
      const processed = processScheduleData(scheduleResponse.data);
      setProcessedSchedule(processed);
    } catch (err) {
      setError('Failed to refresh schedule data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  
  const handleAddShift = () => {
    // Debug: log the days of week we're using
    console.log('Days of week mapping:', daysOfWeek);
    
    // Initialize modal with first employee if available
    setModalData({
      employeeId: employees.length > 0 ? employees[0].id : '',
      day: 0, // Monday if your daysOfWeek starts with Monday
      startTime: '07:00',
      endTime: '15:00'
    });
    setIsModalOpen(true);
  };
  
  const closeModal = () => {
    setIsModalOpen(false);
  };
  
  const handleModalInputChange = (e) => {
    const { name, value } = e.target;
    setModalData({ ...modalData, [name]: value });
  };
  
  const handleSaveShift = async () => {
    try {
      setLoading(true);
      const { employeeId, day, startTime, endTime } = modalData;
      
      if (!employeeId) {
        setError('Please select an employee');
        setLoading(false);
        return;
      }
      
      // Get the week start date directly from the schedule data
      const weekStartDate = new Date(schedule.weekStart);
      console.log('Week start date:', weekStartDate.toISOString());
      console.log('Adding day index:', day);
      
      // Calculate the shift date by adding the day index
      const shiftDate = new Date(weekStartDate);
      shiftDate.setDate(weekStartDate.getDate() + parseInt(day));
      console.log('Calculated shift date:', shiftDate.toISOString());
      
      // Create date objects for start and end times on the correct day
      const [startHour, startMinute] = startTime.split(':').map(Number);
      const startDateTime = new Date(shiftDate);
      startDateTime.setHours(startHour, startMinute, 0, 0);
      
      const [endHour, endMinute] = endTime.split(':').map(Number);
      const endDateTime = new Date(shiftDate);
      endDateTime.setHours(endHour, endMinute, 0, 0);
      
      console.log('Final shift times:');
      console.log('Start time:', startDateTime.toISOString());
      console.log('End time:', endDateTime.toISOString());
      
      // Add the shift with ISO string times
      const response = await api.post(`/shifts`, {
        scheduleId,
        employeeId,
        startTime: startDateTime.toISOString(),
        endTime: endDateTime.toISOString(),
        status: 'Approved'
      });
      
      console.log('Shift created response:', response.data);
      
      // Refresh schedule data
      await refreshScheduleData();
      
      // Close modal
      closeModal();
    } catch (err) {
      setError(`Failed to add shift: ${err.response?.data?.error?.message || err.message}`);
      console.error('Error adding shift:', err);
    } finally {
      setLoading(false);
    }
  };
  
  const handleDeleteShift = async (shiftId) => {
    if (!window.confirm('Энэ ээлжийг устгахдаа итгэлтэй байна уу?')) {
      return;
    }
    
    try {
      setLoading(true);
      await api.delete(`/shifts/${shiftId}`);
      
      // Refresh schedule data
      await refreshScheduleData();
    } catch (err) {
      setError('Failed to delete shift');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  
  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Хуваарь үзэх</h1>
        
        <div className="flex space-x-4">
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            onClick={handleAddShift}
          >
            + Хуваарь гаргах
          </button>
          
          <button
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
            onClick={() => navigate(-1)}
          >
            Буцах
          </button>
        </div>
      </div>
      
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      
      {schedule && (
        <div className="mb-4">
          <div className="bg-white rounded-lg shadow-sm p-4">
            <h2 className="text-lg font-semibold">
              {schedule.branchName} - {format(parseISO(schedule.weekStart), 'yyyy-MM-dd')} -с эхэлсэн долоо хоног
            </h2>
          </div>
        </div>
      )}
      
      {processedSchedule && processedSchedule.shifts && (
        <div className="bg-white rounded-lg shadow-md overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                  Цаг
                </th>
                
                {/* Day columns */}
                {Object.keys(processedSchedule.shifts).map((dateStr, index) => {
                  const date = new Date(dateStr);
                  // Get JS day (0 = Sunday, 1 = Monday, etc)
                  const jsDay = date.getDay();
                  // Convert to our day index (0 = Monday, 6 = Sunday)
                  const ourDay = jsDay === 0 ? 6 : jsDay - 1;
                  
                  return (
                    <th key={dateStr} className="py-3 px-6 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                      <div>{daysOfWeek[ourDay]}</div>
                      <div className="text-gray-400">{format(parseISO(dateStr), 'MM/dd')}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            
            <tbody>
              {/* Time slots */}
              {timeSlots.map((timeSlot) => (
                <tr key={timeSlot} className="border-b hover:bg-gray-50">
                  <td className="py-4 px-6 text-sm text-gray-500 whitespace-nowrap">
                    {timeSlot}
                  </td>
                  
                  {/* Shifts for each day */}
                  {Object.keys(processedSchedule.shifts).map((dateStr) => {
                    // Get shifts for this time slot
                    const shiftsAtTime = processedSchedule.shifts[dateStr][timeSlot] || [];
                    
                    return (
                      <td key={`${dateStr}-${timeSlot}`} className="py-2 px-2 text-sm border-l">
                        {shiftsAtTime.map(shift => (
                          <div 
                            key={`${shift.id}-${timeSlot}`}
                            className={`${shift.isContinuation ? 'bg-blue-50' : 'bg-blue-100'} 
                                      border border-blue-300 rounded-md p-2 mb-1 relative`}
                          >
                            <div className="font-medium">{shift.employeeName}</div>
                            {!shift.isContinuation && (
                              <div className="text-xs text-gray-500">
                                {format(new Date(shift.startTime), 'HH:mm')} - {format(new Date(shift.endTime), 'HH:mm')}
                              </div>
                            )}
                            
                            {!shift.isContinuation && (
                              <button
                                className="absolute top-1 right-1 text-red-500 hover:text-red-700"
                                onClick={() => handleDeleteShift(shift.id)}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                              </button>
                            )}
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      {/* Add Shift Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4">Ээлж нэмэх</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ажилтан
                </label>
                <select
                  name="employeeId"
                  value={modalData.employeeId}
                  onChange={handleModalInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">-- Ажилтан сонгох --</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Өдөр
                </label>
                <select
                  name="day"
                  value={modalData.day}
                  onChange={handleModalInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  {daysOfWeek.map((day, index) => (
                    <option key={index} value={index}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Эхлэх цаг
                </label>
                <select
                  name="startTime"
                  value={modalData.startTime}
                  onChange={handleModalInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  {timeSlots.slice(0, -1).map((time) => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Дуусах цаг
                </label>
                <select
                  name="endTime"
                  value={modalData.endTime}
                  onChange={handleModalInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  {timeSlots.slice(1).map((time) => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
                  onClick={closeModal}
                >
                  Хаасан
                </button>
                <button
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                  onClick={handleSaveShift}
                >
                  Хадгалах
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScheduleView;