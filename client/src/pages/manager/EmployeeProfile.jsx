// client/src/pages/manager/EmployeeProfile.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { format, parseISO } from 'date-fns';

const EmployeeProfile = () => {
  const { employeeId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [employee, setEmployee] = useState(null);
  const [availability, setAvailability] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('info');
  
  // For date filtering shifts
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 14); // 2 weeks ago
    return format(date, 'yyyy-MM-dd');
  });
  const [endDate, setEndDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 30); // 1 month ahead
    return format(date, 'yyyy-MM-dd');
  });
  
  // Days of the week
  const daysOfWeek = ['Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба', 'Ням'];
  
  useEffect(() => {
    const fetchEmployeeData = async () => {
      try {
        if (user?.role !== 'Manager' && user?.role !== 'Admin') {
          navigate('/login');
          return;
        }
        
        // Fetch employee details
        const employeeResponse = await api.get(`/employees/${employeeId}`);
        setEmployee(employeeResponse.data);
        
        // Fetch employee availability
        const availabilityResponse = await api.get(`/availability/employee/${employeeId}`);
        setAvailability(availabilityResponse.data);
        
        // Fetch employee shifts within date range
        await fetchShifts();
      } catch (err) {
        setError('Failed to load employee data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchEmployeeData();
  }, [employeeId, navigate, user]);
  
  const fetchShifts = async () => {
    try {
      // Fetch employee shifts within date range
      const shiftsResponse = await api.get(`/shifts/employee/${employeeId}`, {
        params: { startDate, endDate }
      });
      
      setShifts(shiftsResponse.data);
    } catch (err) {
      console.error('Failed to load shifts:', err);
    }
  };
  
  // Helper function to format time
  const formatTime = (timeString) => {
    if (!timeString) return '';
    if (timeString.length <= 5) return timeString;
    return timeString.substring(0, 5); // Take only HH:MM part
  };
  
  // Group availability by day of week
  const availabilityByDay = {};
  for (let i = 0; i < 7; i++) {
    availabilityByDay[i] = [];
  }
  
  availability.forEach(slot => {
    const day = slot.day_of_week;
    const startTime = formatTime(slot.start_time);
    const endTime = formatTime(slot.end_time);
    
    availabilityByDay[day].push({
      start: startTime,
      end: endTime
    });
  });
  
  // Group shifts by date
  const shiftsByDate = {};
  shifts.forEach(shift => {
    const date = format(new Date(shift.start_time), 'yyyy-MM-dd');
    if (!shiftsByDate[date]) {
      shiftsByDate[date] = [];
    }
    
    shiftsByDate[date].push(shift);
  });
  
  const handleDateChange = async () => {
    await fetchShifts();
  };
  
  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  if (!employee) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="bg-red-50 border-l-4 border-red-500 p-4">
          <p className="text-red-700">Ажилтны мэдээлэл олдсонгүй</p>
        </div>
        <button
          onClick={() => navigate('/manager/employees')}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          Буцах
        </button>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Ажилтны мэдээлэл</h1>
        <button
          onClick={() => navigate('/manager/employees')}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
        >
          Буцах
        </button>
      </div>
      
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {/* Employee Header */}
        <div className="p-6 border-b">
          <div className="flex items-center">
            <div className="h-20 w-20 rounded-full bg-blue-200 flex items-center justify-center text-blue-700 text-xl font-medium">
              {employee.name.charAt(0)}
            </div>
            <div className="ml-6">
              <h2 className="text-xl font-semibold">{employee.name}</h2>
              <p className="text-gray-600">
                <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-full mt-1 ${
                  employee.status === 'Active' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  {employee.status === 'Active' ? 'Идэвхтэй' : 'Идэвхгүй'}
                </span>
              </p>
            </div>
          </div>
        </div>
        
        {/* Tab Navigation */}
        <div className="px-6 border-b">
          <nav className="flex -mb-px" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('info')}
              className={`py-4 px-1 border-b-2 font-medium text-sm mr-8 ${
                activeTab === 'info'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Ерөнхий мэдээлэл
            </button>
            <button
              onClick={() => setActiveTab('availability')}
              className={`py-4 px-1 border-b-2 font-medium text-sm mr-8 ${
                activeTab === 'availability'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Завтай цагийн хуваарь
            </button>
            <button
              onClick={() => setActiveTab('shifts')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'shifts'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Ээлжийн хуваарь
            </button>
          </nav>
        </div>
        
        {/* Tab Content */}
        <div className="p-6">
          {/* General Information Tab */}
          {activeTab === 'info' && (
            <div>
              <h3 className="text-lg font-medium mb-4">Хувийн мэдээлэл</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-500">Хэрэглэгчийн нэр</p>
                    <p className="font-medium">{employee.name}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm text-gray-500">И-мэйл</p>
                    <p className="font-medium">{employee.email}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm text-gray-500">Утас</p>
                    <p className="font-medium">{employee.phone || '-'}</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-500">Салбар</p>
                    <p className="font-medium">{employee.branch_name}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm text-gray-500">Төлөв</p>
                    <p className="font-medium">
                      <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-full ${
                        employee.status === 'Active' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {employee.status === 'Active' ? 'Идэвхтэй' : 'Идэвхгүй'}
                      </span>
                    </p>
                  </div>
                  
                  <div>
                    <p className="text-sm text-gray-500">Бүртгүүлсэн огноо</p>
                    <p className="font-medium">
                      {employee.created_at ? format(new Date(employee.created_at), 'yyyy-MM-dd') : '-'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Availability Tab */}
          {activeTab === 'availability' && (
            <div>
              <h3 className="text-lg font-medium mb-4">Завтай цагийн хуваарь</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
                {/* Display availability for each day */}
                {Object.keys(availabilityByDay).map(day => (
                  <div key={day} className="border rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2 border-b">
                      <h4 className="font-medium">{daysOfWeek[day]}</h4>
                    </div>
                    <div className="p-4">
                      {availabilityByDay[day].length === 0 ? (
                        <p className="text-sm text-gray-500">Хуваарь байхгүй</p>
                      ) : (
                        <div className="space-y-2">
                          {availabilityByDay[day].map((slot, index) => (
                            <div 
                              key={index}
                              className="bg-blue-50 border border-blue-100 rounded-md p-2 text-sm"
                            >
                              {slot.start} - {slot.end}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Shifts Tab */}
          {activeTab === 'shifts' && (
            <div>
              <h3 className="text-lg font-medium mb-4">Ээлжийн хуваарь</h3>
              
              <div className="bg-white rounded-lg border p-4 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Эхлэх огноо
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Дуусах огноо
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  
                  <div className="flex items-end">
                    <button
                      onClick={handleDateChange}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                    >
                      Хайх
                    </button>
                  </div>
                </div>
              </div>
              
              {Object.keys(shiftsByDate).length === 0 ? (
                <div className="bg-gray-50 p-4 rounded-lg text-center">
                  <p className="text-gray-500">Сонгосон хугацаанд ээлж байхгүй байна.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.keys(shiftsByDate).sort().map(date => (
                    <div key={date} className="border rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-4 py-2 border-b">
                        <h4 className="font-medium">
                          {format(new Date(date), 'yyyy-MM-dd')} 
                          ({daysOfWeek[new Date(date).getDay()]})
                        </h4>
                      </div>
                      <div className="p-4">
                        <div className="space-y-2">
                          {shiftsByDate[date].map(shift => (
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
                                    {format(new Date(shift.start_time), 'HH:mm')} - {format(new Date(shift.end_time), 'HH:mm')}
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
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmployeeProfile;