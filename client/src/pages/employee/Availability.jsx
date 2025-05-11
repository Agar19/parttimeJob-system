import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const Availability = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Important: Updated to use Sunday as day 0
  const [availability, setAvailability] = useState({
    0: [], // Sunday
    1: [], // Monday 
    2: [], // Tuesday
    3: [], // Wednesday
    4: [], // Thursday
    5: [], // Friday
    6: []  // Saturday
  });
  const [employeeId, setEmployeeId] = useState(null);
  const [visibleDays, setVisibleDays] = useState([0, 1, 2, 3, 4, 5, 6]);
  const [timeSlotsList, setTimeSlots] = useState([
    { id: 1, label: '7:00 AM - 8:00 AM', start: '07:00', end: '08:00' },
    { id: 2, label: '8:00 AM - 9:00 AM', start: '08:00', end: '09:00' },
    { id: 3, label: '9:00 AM - 10:00 AM', start: '09:00', end: '10:00' },
    { id: 4, label: '10:00 AM - 11:00 AM', start: '10:00', end: '11:00' },
    { id: 5, label: '11:00 AM - 12:00 PM', start: '11:00', end: '12:00' },
    { id: 6, label: '12:00 PM - 1:00 PM', start: '12:00', end: '13:00' },
    { id: 7, label: '1:00 PM - 2:00 PM', start: '13:00', end: '14:00' },
    { id: 8, label: '2:00 PM - 3:00 PM', start: '14:00', end: '15:00' },
    { id: 9, label: '3:00 PM - 4:00 PM', start: '15:00', end: '16:00' },
    { id: 10, label: '4:00 PM - 5:00 PM', start: '16:00', end: '17:00' },
    { id: 11, label: '5:00 PM - 6:00 PM', start: '17:00', end: '18:00' },
    { id: 12, label: '6:00 PM - 7:00 PM', start: '18:00', end: '19:00' },
    { id: 13, label: '7:00 PM - 8:00 PM', start: '19:00', end: '20:00' },
    { id: 14, label: '8:00 PM - 9:00 PM', start: '20:00', end: '21:00' },
    { id: 15, label: '9:00 PM - 10:00 PM', start: '21:00', end: '22:00' },
    { id: 16, label: '10:00 PM - 11:00 PM', start: '22:00', end: '23:00' },
  ]);
  
  // Days of week in Mongolian - start with Sunday (0)
  const daysOfWeek = ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба'];
  
  // Load employee's saved availability data
  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!user || user.role !== 'Employee') {
          navigate('/login');
          return;
        }
        
        // Set employee ID from user data
        if (user.employee && user.employee.id) {
          setEmployeeId(user.employee.id);
          
          // Fetch employee availability
          console.log('Fetching availability for employee:', user.employee.id);
          const response = await api.get(`/availability/employee/${user.employee.id}`);
          console.log('Loaded availability data:', response.data);

          // Format availability data
          const availabilityMap = {
            0: [], // Sunday
            1: [], // Monday
            2: [], // Tuesday
            3: [], // Wednesday
            4: [], // Thursday
            5: [], // Friday
            6: []  // Saturday
          };
          
          // Add available time slots
          response.data.forEach(slot => {
            // Strip seconds from time format
            const startTime = slot.start_time.substring(0, 5); // Convert "07:00:00" to "07:00"
            const endTime = slot.end_time.substring(0, 5);   // Convert "08:00:00" to "08:00"
            
            // Make sure we use the correct day index (using JS day of week)
            const dayIndex = slot.day_of_week;
            
            if (availabilityMap[dayIndex] !== undefined) {
              availabilityMap[dayIndex].push({
                id: slot.id,
                start: startTime,
                end: endTime
              });
            }
            
            console.log(`Added availability for day ${dayIndex} (${daysOfWeek[dayIndex]}): ${startTime}-${endTime}`);
          });
          
          setAvailability(availabilityMap);
          console.log('Processed availability data:', availabilityMap);
        }
      } catch (err) {
        console.error('Error loading availability:', err);
        setError('Failed to load availability data');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [navigate, user]);
  
  // Load manager's schedule settings 
  useEffect(() => {
    const fetchScheduleSettings = async () => {
      try {
        // Get employee's branch
        if (!user?.employee?.branch_id) return;
        
        console.log('Fetching schedule settings for branch:', user.employee.branch_id);
        
        // Get active schedules for this branch
        const schedulesResponse = await api.get(`/schedules/branch/${user.employee.branch_id}`);
        console.log('Branch schedules:', schedulesResponse.data);
        
        if (schedulesResponse.data.length > 0) {
          // Get the most recent schedule
          const latestSchedule = schedulesResponse.data[0];
          
          // Get schedule settings
          const settingsResponse = await api.get(`/schedules/${latestSchedule.id}/settings`);
          const settings = settingsResponse.data;
          console.log('Schedule settings:', settings);
          
          // Adjust time slots based on settings
          if (settings) {
            // Filter time slots based on schedule settings
            if (settings.start_time && settings.end_time) {
              const filteredTimeSlots = timeSlotsList.filter(slot => {
                return slot.start >= settings.start_time && slot.end <= settings.end_time;
              });
              
              setTimeSlots(filteredTimeSlots);
              console.log('Filtered time slots:', filteredTimeSlots);
            }
            
            // Update days of week based on settings.selected_days
            if (settings.selected_days) {
              try {
                const selectedDays = typeof settings.selected_days === 'string' 
                  ? JSON.parse(settings.selected_days) 
                  : settings.selected_days;
                
                // Filter days of week - make sure they use 0 = Sunday
                setVisibleDays(selectedDays.map(Number));
                console.log('Visible days:', selectedDays);
              } catch (error) {
                console.error('Error parsing selected days:', error);
              }
            }
          }
        }
      } catch (err) {
        console.error('Error fetching schedule settings:', err);
      }
    };
    
    fetchScheduleSettings();
  }, [user]);
  
  const toggleTimeSlot = (dayOfWeek, timeSlot) => {
    const newAvailability = { ...availability };
    
    // Check if the time slot is already selected
    const slotIndex = newAvailability[dayOfWeek].findIndex(
      slot => slot.start === timeSlot.start && slot.end === timeSlot.end
    );
    
    if (slotIndex === -1) {
      // Add the time slot
      newAvailability[dayOfWeek].push({
        start: timeSlot.start,
        end: timeSlot.end
      });
    } else {
      // Remove the time slot
      newAvailability[dayOfWeek].splice(slotIndex, 1);
    }
    
    setAvailability(newAvailability);
  };
  
  const isTimeSlotSelected = (dayOfWeek, timeSlot) => {
    return availability[dayOfWeek]?.some(slot => {
      // Check if the start/end times match, either exact or with seconds
      const startMatches = slot.start === timeSlot.start || 
                           slot.start === timeSlot.start + ':00';
      const endMatches = slot.end === timeSlot.end || 
                         slot.end === timeSlot.end + ':00';
      
      return startMatches && endMatches;
    });
  };
  
  const saveAvailability = async () => {
    if (!employeeId) return;
    
    setSaving(true);
    setError('');
    
    try {
      // Format availability data for API
      const availabilityData = [];
      
      // Loop through all days using JS day of week (0 = Sunday)
      for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
        if (availability[dayOfWeek] && availability[dayOfWeek].length > 0) {
          availability[dayOfWeek].forEach(slot => {
            availabilityData.push({
              employeeId,
              dayOfWeek,
              startTime: slot.start,
              endTime: slot.end
            });
          });
        }
      }
      
      console.log('Sending availability data:', availabilityData);
      
      // Send to API
      await api.post(`/availability/employee/${employeeId}`, { 
        availability: availabilityData 
      });
      
      // Show success message
      alert('Хуваарь амжилттай хадгалагдлаа!');
    } catch (err) {
      console.error('Error saving availability:', err);
      setError('Failed to save availability');
    } finally {
      setSaving(false);
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
      <h1 className="text-2xl font-bold mb-6">Өөрийн завтай цагийг сонгох</h1>
      
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      
      <div className="mb-6">
        <p className="text-gray-600">
          Доорх хүснэгтээс өөрийн ажиллах боломжтой цагуудыг сонгоно уу. 
          Та хэд хэдэн цагийг сонгож болно.
        </p>
      </div>
      
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="grid grid-cols-8 border-b">
          <div className="p-4 font-medium text-gray-500 border-r">Цаг</div>
          {daysOfWeek.map((day, index) => (
            <div key={index} className={`p-4 text-center font-medium ${!visibleDays.includes(index) ? 'opacity-50' : ''}`}>
              {day}
            </div>
          ))}
        </div>
        
        {timeSlotsList.map(timeSlot => (
          <div key={timeSlot.id} className="grid grid-cols-8 border-b">
            <div className="p-4 text-sm text-gray-600 border-r">
              {timeSlot.label}
            </div>
            
            {[0, 1, 2, 3, 4, 5, 6].map(dayOfWeek => (
              <div 
                key={dayOfWeek} 
                className="flex items-center justify-center p-4"
              >
                <button
                  className={`w-full h-8 rounded-md transition-colors ${
                    isTimeSlotSelected(dayOfWeek, timeSlot)
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  }`}
                  onClick={() => toggleTimeSlot(dayOfWeek, timeSlot)}
                  disabled={!visibleDays.includes(dayOfWeek)}
                  style={{ opacity: visibleDays.includes(dayOfWeek) ? 1 : 0.5 }}
                >
                  Сонгох
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
      
      <div className="mt-6 flex justify-end">
        <button
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:bg-blue-300"
          onClick={saveAvailability}
          disabled={saving}
        >
          {saving ? 'Хадгалж байна...' : 'Хадгалах'}
        </button>
      </div>
    </div>
  );
};

export default Availability;