import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { format, parseISO, addDays, startOfWeek, subDays } from 'date-fns';

const ShiftView = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Days of the week in Mongolian - starting with Sunday (0)
  const daysOfWeek = ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба'];
  
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedWeek, setSelectedWeek] = useState(startOfWeek(new Date()));
  
  useEffect(() => {
    const fetchShifts = async () => {
      if (!user || !user.employee || !user.employee.id) {
        navigate('/login');
        return;
      }
      
      try {
        // Format date for API
        const startDate = format(selectedWeek, 'yyyy-MM-dd');
        const endDate = format(addDays(selectedWeek, 6), 'yyyy-MM-dd');
        
        console.log(`Fetching shifts for week: ${format(selectedWeek, 'yyyy-MM-dd')} (${daysOfWeek[0]}) to ${endDate} (${daysOfWeek[6]})`);
        console.log(`Employee ID: ${user.employee.id}`);
        
        // Fetch shifts for this employee within the selected week
        const response = await api.get(`/shifts/employee/${user.employee.id}`, {
          params: { startDate, endDate }
        });
        
        console.log(`Received ${response.data.length} shifts`);
        
        // Pre-process shifts to fix the date offset before displaying
        const correctedShifts = response.data.map(shift => {
          // Create a copy of the shift
          const correctedShift = { ...shift };
          
          // Fix the date by subtracting one day from both start and end times
          const originalStartTime = new Date(shift.start_time);
          const originalEndTime = new Date(shift.end_time);
          
          // Subtract one day to fix the offset
          const correctedStartTime = subDays(originalStartTime, 1);
          const correctedEndTime = subDays(originalEndTime, 1);
          
          // Update the shift with corrected times
          correctedShift.start_time = correctedStartTime.toISOString();
          correctedShift.end_time = correctedEndTime.toISOString();
          
          // For debugging
          console.log(`Shift ID ${shift.id}: Original start: ${originalStartTime.toISOString()}, Corrected to: ${correctedStartTime.toISOString()}`);
          
          return correctedShift;
        });
        
        setShifts(correctedShifts);
      } catch (err) {
        setError('Failed to load shifts');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchShifts();
  }, [navigate, user, selectedWeek]);
  
  const handleWeekChange = (e) => {
    const date = new Date(e.target.value);
    const newWeekStart = startOfWeek(date);
    console.log(`Selected date: ${e.target.value}, calculated week start: ${format(newWeekStart, 'yyyy-MM-dd')}`);
    setSelectedWeek(newWeekStart);
  };
  
  const handleRequestChange = async (shiftId) => {
    try {
      // Create a change request
      await api.post('/requests', {
        employeeId: user.employee.id,
        shiftId,
      });
      
      // Update UI
      alert('Хүсэлт амжилттай илгээгдлээ.');
    } catch (err) {
      setError('Failed to submit request');
      console.error(err);
    }
  };
  
  // Group shifts by day
  const groupShiftsByDay = () => {
    const groupedShifts = {};
    
    // Initialize days - create a date for each day of the week
    for (let i = 0; i < 7; i++) {
      const day = addDays(selectedWeek, i);
      const dateStr = format(day, 'yyyy-MM-dd');
      groupedShifts[dateStr] = [];
      console.log(`Initialized day ${i} (${daysOfWeek[i]}): ${dateStr}`);
    }
    
    // Add shifts to their respective days
    shifts.forEach(shift => {
      // Format the date string to match our keys exactly
      const shiftDate = format(parseISO(shift.start_time), 'yyyy-MM-dd');
      
      if (groupedShifts[shiftDate]) {
        groupedShifts[shiftDate].push(shift);
        console.log(`Added shift ${shift.id} to date ${shiftDate}, day: ${new Date(shiftDate).getDay()}`);
      } else {
        console.log(`Date not found: ${shiftDate}. Available dates:`, Object.keys(groupedShifts));
      }
    });
    
    return groupedShifts;
  };
  
  const shiftsByDay = groupShiftsByDay();
  
  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-6">Миний ээлж</h1>
      
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      
      <div className="mb-6 bg-white rounded-lg shadow-md p-4">
        <div className="flex items-center">
          <label className="mr-4 text-gray-700">Долоо хоног сонгох:</label>
          <input
            type="date"
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            value={format(selectedWeek, 'yyyy-MM-dd')}
            onChange={handleWeekChange}
          />
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
        {Object.entries(shiftsByDay).map(([dateStr, dayShifts], index) => {
          const date = new Date(dateStr);
          // JS day of week (0 = Sunday, 1 = Monday)
          const jsDay = date.getDay();
          
          return (
            <div key={dateStr} className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="bg-blue-50 p-3 border-b">
                <div className="font-medium text-center">{daysOfWeek[jsDay]}</div>
                <div className="text-sm text-gray-500 text-center">{format(date, 'MM/dd')}</div>
              </div>
              
              <div className="p-4">
                {dayShifts.length === 0 ? (
                  <div className="text-center text-gray-500 py-4">
                    Ээлж байхгүй
                  </div>
                ) : (
                  <div className="space-y-3">
                    {dayShifts.map(shift => (
                      <div 
                        key={shift.id}
                        className={`border rounded-md p-3 ${
                          shift.status === 'Approved' 
                            ? 'bg-green-50 border-green-200' 
                            : 'bg-yellow-50 border-yellow-200'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-medium">
                              {format(parseISO(shift.start_time), 'HH:mm')} - {format(parseISO(shift.end_time), 'HH:mm')}
                            </div>
                            <div className="text-sm text-gray-500">
                              {shift.branch_name}
                            </div>
                          </div>
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            shift.status === 'Approved' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {shift.status === 'Approved' ? 'Баталсан' : 'Хүлээгдэж байна'}
                          </span>
                        </div>
                        
                        {shift.status === 'Approved' && (
                          <div className="mt-3 flex justify-end">
                            <button 
                              onClick={() => handleRequestChange(shift.id)}
                              className="text-sm text-blue-600 hover:text-blue-800"
                            >
                              Өөрчлөлт хүсэх
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ShiftView;