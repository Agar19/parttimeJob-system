import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { format, addDays, parseISO } from 'date-fns';

const ScheduleView = () => {
  const { scheduleId } = useParams();
  const navigate = useNavigate();
  
  const [schedule, setSchedule] = useState(null);
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
  
  // Days of the week in Mongolian
  const daysOfWeek = ['Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба', 'Ням'];
  
  // Time slots for display
  const timeSlots = [
    '07:00', '08:00', '09:00', '10:00', '11:00', '12:00',
    '13:00', '14:00', '15:00', '16:00', '17:00', '18:00',
    '19:00', '20:00', '21:00', '22:00', '23:00'
  ];
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch schedule details
        const scheduleResponse = await api.get(`/schedules/${scheduleId}`);
        setSchedule(scheduleResponse.data);
        
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
  
  const handleAddShift = () => {
    setModalData({
      employeeId: employees.length > 0 ? employees[0].id : '',
      day: 0,
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
      const { employeeId, day, startTime, endTime } = modalData;
      
      // Calculate date from day of week
      const shiftDate = addDays(parseISO(schedule.weekStart), day);
      
      // Create start and end times
      const startDateTime = new Date(shiftDate);
      const [startHour, startMinute] = startTime.split(':').map(Number);
      startDateTime.setHours(startHour, startMinute, 0, 0);
      
      const endDateTime = new Date(shiftDate);
      const [endHour, endMinute] = endTime.split(':').map(Number);
      endDateTime.setHours(endHour, endMinute, 0, 0);
      
      // Add the shift
      await api.post(`/shifts`, {
        scheduleId,
        employeeId,
        startTime: startDateTime.toISOString(),
        endTime: endDateTime.toISOString()
      });
      
      // Refresh schedule data
      const scheduleResponse = await api.get(`/schedules/${scheduleId}`);
      setSchedule(scheduleResponse.data);
      
      // Close modal
      closeModal();
    } catch (err) {
      setError('Failed to add shift');
      console.error(err);
    }
  };
  
  const handleDeleteShift = async (shiftId) => {
    if (!window.confirm('Энэ ээлжийг устгахдаа итгэлтэй байна уу?')) {
      return;
    }
    
    try {
      await api.delete(`/shifts/${shiftId}`);
      
      // Refresh schedule data
      const scheduleResponse = await api.get(`/schedules/${scheduleId}`);
      setSchedule(scheduleResponse.data);
    } catch (err) {
      setError('Failed to delete shift');
      console.error(err);
    }
  };
  
  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  // Prepare the schedule grid data
  const getScheduleGridData = () => {
    if (!schedule || !schedule.shifts) {
      return null;
    }
    
    // Initialize grid
    const grid = {};
    
    // Days of the week
    for (let day = 0; day < 7; day++) {
      const date = addDays(parseISO(schedule.weekStart), day);
      const dateString = format(date, 'yyyy-MM-dd');
      
      grid[dateString] = {};
      
      // Time slots
      for (const time of timeSlots) {
        grid[dateString][time] = [];
      }
    }
    
    // Populate grid with shifts
    for (const dateStr in schedule.shifts) {
      for (const timeStr in schedule.shifts[dateStr]) {
        const shifts = schedule.shifts[dateStr][timeStr];
        
        if (grid[dateStr] && grid[dateStr][timeStr]) {
          grid[dateStr][timeStr] = shifts;
        }
      }
    }
    
    return grid;
  };
  
  const scheduleGrid = getScheduleGridData();
  
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Хуваарь үүсгэх</h1>
        
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
      
      {scheduleGrid && (
        <div className="bg-white rounded-lg shadow-md overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                  Цаг
                </th>
                
                {/* Day columns */}
                {Object.keys(scheduleGrid).map((dateStr, index) => (
                  <th key={dateStr} className="py-3 px-6 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                    <div>{daysOfWeek[index]}</div>
                    <div className="text-gray-400">{format(parseISO(dateStr), 'MM/dd')}</div>
                  </th>
                ))}
              </tr>
            </thead>
            
            <tbody>
              {/* Time slots */}
              {timeSlots.map(timeSlot => (
                <tr key={timeSlot} className="border-b hover:bg-gray-50">
                  <td className="py-4 px-6 text-sm text-gray-500 whitespace-nowrap">
                    {timeSlot}
                  </td>
                  
                  {/* Shifts for each day */}
                  {Object.keys(scheduleGrid).map(dateStr => (
                    <td key={`${dateStr}-${timeSlot}`} className="py-2 px-2 text-sm border-l">
                      {scheduleGrid[dateStr][timeSlot].map(shift => (
                        <div 
                          key={shift.id}
                          className="bg-blue-100 border border-blue-300 rounded-md p-2 mb-1 relative"
                        >
                          <div className="font-medium">{shift.employeeName}</div>
                          <div className="text-xs text-gray-500">
                            {format(parseISO(shift.startTime), 'HH:mm')} - {format(parseISO(shift.endTime), 'HH:mm')}
                          </div>
                          
                          <button
                            className="absolute top-1 right-1 text-red-500 hover:text-red-700"
                            onClick={() => handleDeleteShift(shift.id)}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                          </button>
                        </div>
                      ))}
                    </td>
                  ))}
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