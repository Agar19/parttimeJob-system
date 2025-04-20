// client/src/pages/manager/ScheduleCreation.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { format, startOfWeek, addDays } from 'date-fns';

const ScheduleCreation = () => {
  const { branchId } = useParams();
  const navigate = useNavigate();

  const [branch, setBranch] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedWeek, setSelectedWeek] = useState(startOfWeek(new Date()));
  const [schedules, setSchedules] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  
  // Enhanced modal data for schedule creation
  const [modalData, setModalData] = useState({
    scheduleName: 'New Schedule',
    selectedDays: {
      0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true // All days selected by default
    },
    startTime: '07:00',
    endTime: '15:00',
    minGapBetweenShifts: '8',
    minShiftsPerEmployee: '1',
    maxShiftsPerEmployee: '5',
    additionalNotes: ''
  });

  // Days of the week in Mongolian
  const daysOfWeek = ['Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба', 'Ням'];

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch branch details
        const branchResponse = await api.get(`/branches/${branchId}`);
        setBranch(branchResponse.data);

        // Fetch employees for this branch
        const employeesResponse = await api.get(`/employees/branch/${branchId}`);
        setEmployees(employeesResponse.data);

        // Fetch schedules for this branch
        const schedulesResponse = await api.get(`/schedules/branch/${branchId}`);
        setSchedules(schedulesResponse.data);
      } catch (err) {
        setError('Failed to load data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [branchId]);

  // Auto-generated schedule with algorithm
  const handleAutoGenerateSchedule = async () => {
    try {
      setLoading(true);
      setError('');
      
      if (employees.length === 0) {
        setError("Cannot generate schedule: No employees available for this branch.");
        setLoading(false);
        return;
      }
      
      // Format date for API
      const formattedDate = format(selectedWeek, 'yyyy-MM-dd');
      
      console.log('Creating auto-generated schedule with start date:', formattedDate);
      
      // Create schedule with all data needed for the algorithm
      const scheduleData = {
        branchId,
        weekStart: formattedDate,
        scheduleName: 'Auto-generated Schedule',
        selectedDays: [0, 1, 2, 3, 4, 5, 6], // All days of the week
        startTime: '07:00',
        endTime: '23:00',
        minGapBetweenShifts: '8',  // 8 hours minimum between shifts
        minShiftsPerEmployee: '1', // At least 1 shift per employee
        maxShiftsPerEmployee: '5',  // Maximum 5 shifts per employee
        skipGeneration: false // Use auto-generation
      };
      
      console.log("Sending schedule data:", scheduleData);
      
      const response = await api.post('/schedules', scheduleData);
      
      console.log('Schedule created response:', response.data);
      
      if (!response.data || !response.data.scheduleId) {
        throw new Error('Failed to get schedule ID from server response');
      }
      
      const scheduleId = response.data.scheduleId;
      
      try {
        // Generate shifts automatically using the algorithm
        console.log('Generating shifts for schedule:', scheduleId);
        const generateResponse = await api.post(`/schedules/${scheduleId}/generate`);
        console.log('Generate shifts response:', generateResponse.data);
        
        // Navigate to the schedule view
        navigate(`/manager/schedule/${scheduleId}`);
      } catch (genError) {
        console.error("Error generating shifts:", genError);
        
        // Check if we can still navigate to the schedule
        if (scheduleId) {
          setError(`Schedule created, but auto-assignment failed: ${genError.response?.data?.error?.message || genError.message}. You can assign shifts manually.`);
          navigate(`/manager/schedule/${scheduleId}`);
        } else {
          setError(`Failed to auto-generate schedule: ${genError.response?.data?.error?.message || genError.message}`);
        }
      }
    } catch (err) {
      console.error('Auto-generate schedule error:', err);
      setError(`Failed to create schedule: ${err.response?.data?.error?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Manual schedule creation that doesn't call the generate endpoint
  const handleCreateManualSchedule = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Format date for API
      const formattedDate = format(selectedWeek, 'yyyy-MM-dd');
      
      // Extract selected days as array of day indices
      const selectedDaysArray = Object.keys(modalData.selectedDays)
        .filter(day => modalData.selectedDays[day])
        .map(day => parseInt(day));
      
      console.log("Creating manual schedule with the following parameters:");
      console.log("Branch ID:", branchId);
      console.log("Week Start:", formattedDate);
      console.log("Selected Days:", selectedDaysArray);
      console.log("Shift Time Range:", `${modalData.startTime} - ${modalData.endTime}`);
      
      // Create schedule without generating shifts
      const response = await api.post('/schedules', {
        branchId,
        weekStart: formattedDate,
        scheduleName: modalData.scheduleName || 'Manual Schedule',
        selectedDays: selectedDaysArray,
        startTime: modalData.startTime,
        endTime: modalData.endTime,
        minGapBetweenShifts: modalData.minGapBetweenShifts,
        minShiftsPerEmployee: modalData.minShiftsPerEmployee,
        maxShiftsPerEmployee: modalData.maxShiftsPerEmployee,
        additionalNotes: modalData.additionalNotes,
        skipGeneration: true // This is the key - explicit flag to skip auto-generation
      });
      
      console.log("Manual schedule created successfully:", response.data);
      
      // Navigate directly to the schedule view without generating shifts
      if (response.data && response.data.scheduleId) {
        // Do NOT call generate endpoint for manual schedules
        navigate(`/manager/schedule/${response.data.scheduleId}`);
      } else {
        setError('Invalid response from server when creating schedule');
      }
    } catch (err) {
      console.error('Create manual schedule error:', err);
      setError(`Failed to create schedule: ${err.response?.data?.error?.message || err.message}`);
    } finally {
      setLoading(false);
      setIsModalOpen(false);
    }
  };

  const handleWeekChange = (e) => {
    const date = new Date(e.target.value);
    setSelectedWeek(startOfWeek(date));
  };

  const renderWeekDays = () => {
    const days = [];
    
    for (let i = 0; i < 7; i++) {
      const day = addDays(selectedWeek, i);
      const formattedDate = format(day, 'yyyy-MM-dd');
      
      days.push(
        <div key={i} className="text-center">
          <div className="font-medium">{daysOfWeek[i]}</div>
          <div className="text-sm text-gray-500">{format(day, 'dd')}</div>
        </div>
      );
    }
    
    return days;
  };

  // Function to delete a schedule
  const handleDeleteSchedule = async (scheduleId) => {
    try {
      setDeletingId(scheduleId);
      setError('');
      
      await api.delete(`/schedules/${scheduleId}`);
      
      // Refresh the schedules list
      const schedulesResponse = await api.get(`/schedules/branch/${branchId}`);
      setSchedules(schedulesResponse.data);
      
      // Show success message
      alert('Хуваарь амжилттай устгагдлаа.');
    } catch (err) {
      console.error('Delete schedule error:', err);
      setError(`Failed to delete schedule: ${err.response?.data?.error?.message || err.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const openScheduleModal = () => {
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const handleModalInputChange = (e) => {
    const { name, value } = e.target;
    setModalData({ ...modalData, [name]: value });
  };

  const handleDayToggle = (dayIndex) => {
    setModalData({
      ...modalData,
      selectedDays: {
        ...modalData.selectedDays,
        [dayIndex]: !modalData.selectedDays[dayIndex]
      }
    });
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
        <h1 className="text-2xl font-bold">Хуваарь үүсгэх</h1>
        <div className="text-gray-600">
          {branch && <span>{branch.name}</span>}
        </div>
      </div>
      
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Долоо хоног сонгох</h2>
        <div className="flex items-center">
          <input
            type="date"
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            value={format(selectedWeek, 'yyyy-MM-dd')}
            onChange={handleWeekChange}
          />
          <button
            className="ml-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            onClick={openScheduleModal}
            disabled={loading}
          >
            {loading ? 'Түр хүлээнэ үү...' : 'Хуваарь үүсгэх'}
          </button>
          <button
            className="ml-4 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            onClick={handleAutoGenerateSchedule}
            disabled={loading}
          >
            Автоматаар үүсгэх
          </button>
        </div>
      </div>
      
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="grid grid-cols-7 gap-4 p-4 border-b">
          {renderWeekDays()}
        </div>
        
        <div className="p-4 grid grid-cols-1 gap-4">
          {/* Time slots would go here */}
          <div className="text-center text-gray-500 py-8">
            Хуваарь үүсгэхийн тулд дээрх "Хуваарь үүсгэх" товчийг дарна уу.
          </div>
        </div>
      </div>
      
      {/* Existing Schedules Section */}
      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Одоогийн хуваарь</h2>
        
        {schedules.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-6 text-center text-gray-500">
            Одоогоор хуваарь байхгүй байна.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {schedules.map((schedule) => (
              <div 
                key={schedule.id}
                className="bg-white rounded-lg shadow-md p-6 cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => navigate(`/manager/schedule/${schedule.id}`)}
              >
                <h3 className="font-semibold">
                  {format(new Date(schedule.week_start), 'yyyy-MM-dd')} -дээс эхэлсэн долоо хоног
                </h3>
                <p className="text-sm text-gray-500 mt-2">
                  {schedule.shift_count || 0} ээлж
                </p>
                <div className="mt-4 flex justify-between items-center">
                  <button 
                    className="text-red-600 hover:text-red-800 text-sm font-semibold"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm('Энэ хуваарийг устгах уу?')) {
                        handleDeleteSchedule(schedule.id);
                      }
                    }}
                    disabled={deletingId === schedule.id}
                  >
                    {deletingId === schedule.id ? 'Устгаж байна...' : 'Устгах'}
                  </button>
                  <button 
                    className="text-blue-600 hover:text-blue-800 text-sm font-semibold"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/manager/schedule/${schedule.id}`);
                    }}
                  >
                    Үзэх
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Schedule Creation Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <div className="flex justify-between">
              <h2 className="text-xl font-semibold mb-4">Хуваарь эхлэх өгнөө:</h2>
              <button onClick={closeModal} className="text-gray-500">✕</button>
            </div>
            
            <div className="space-y-4">
              <div>
                <input
                  type="text"
                  name="scheduleName"
                  placeholder="Schedule name..."
                  value={modalData.scheduleName}
                  onChange={handleModalInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ажлын өдрүүд сонгох:
                </label>
                <div className="flex flex-wrap gap-2">
                  {daysOfWeek.map((day, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => handleDayToggle(index)}
                      className={`px-3 py-1 rounded-md ${
                        modalData.selectedDays[index] 
                          ? 'bg-blue-500 text-white' 
                          : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Эхлэх эхлэх цаг:
                  </label>
                  <select
                    name="startTime"
                    value={modalData.startTime}
                    onChange={handleModalInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="07:00">07:00</option>
                    <option value="08:00">08:00</option>
                    <option value="09:00">09:00</option>
                    <option value="10:00">10:00</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Эхлэх дуусах цаг:
                  </label>
                  <select
                    name="endTime"
                    value={modalData.endTime}
                    onChange={handleModalInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="15:00">15:00</option>
                    <option value="16:00">16:00</option>
                    <option value="17:00">17:00</option>
                    <option value="18:00">18:00</option>
                    <option value="23:00">23:00</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Нэг гарааны ажиллах цаг:
                </label>
                <select
                  name="minGapBetweenShifts"
                  value={modalData.minGapBetweenShifts}
                  onChange={handleModalInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="4">4 цаг</option>
                  <option value="6">6 цаг</option>
                  <option value="8">8 цаг</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ажилтаны 7 хоногт ажиллах дээд хэмжээ:
                </label>
                <select
                  name="maxShiftsPerEmployee"
                  value={modalData.maxShiftsPerEmployee}
                  onChange={handleModalInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="3">3 өдөр</option>
                  <option value="4">4 өдөр</option>
                  <option value="5">5 өдөр</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ажилтаны нэг зөвшүүл ажиллах доод хэмжээ:
                </label>
                <select
                  name="minShiftsPerEmployee"
                  value={modalData.minShiftsPerEmployee}
                  onChange={handleModalInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="1">1 өдөр</option>
                  <option value="2">2 өдөр</option>
                  <option value="3">3 өдөр</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Нэг ээлжинд ажиллах ажилчдын тоо:
                </label>
                <input
                  type="text"
                  name="additionalNotes"
                  value={modalData.additionalNotes}
                  onChange={handleModalInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
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
                  onClick={handleCreateManualSchedule}
                >
                  Үүсгэх
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScheduleCreation;  