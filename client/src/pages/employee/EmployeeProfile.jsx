// client/src/pages/employee/EmployeeProfile.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const EmployeeProfile = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  
  const [employeeInfo, setEmployeeInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  
  // Form state for profile update
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        if (user?.role !== 'Employee') {
          navigate('/login');
          return;
        }
        
        // Fetch employee's profile
        const userResponse = await api.get('/users/me');
        setEmployeeInfo(userResponse.data);
        
        // Update form data with current values
        setFormData(prev => ({
          ...prev,
          name: userResponse.data.name || '',
          phone: userResponse.data.phone || ''
        }));
      } catch (err) {
        setError('Failed to load profile data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [navigate, user]);
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    // Validate passwords if trying to change password
    if (formData.newPassword) {
      if (!formData.currentPassword) {
        setError('Одоогийн нууц үгээ оруулна уу');
        setLoading(false);
        return;
      }
      
      if (formData.newPassword !== formData.confirmPassword) {
        setError('Шинэ нууц үг таарахгүй байна');
        setLoading(false);
        return;
      }
    }
    
    try {
      // Prepare data for API
      const updateData = {
        name: formData.name,
        phone: formData.phone
      };
      
      // Add password data if changing password
      if (formData.newPassword) {
        updateData.currentPassword = formData.currentPassword;
        updateData.newPassword = formData.newPassword;
      }
      
      // Update profile
      const response = await api.put('/users/profile', updateData);
      
      // Update local state
      setEmployeeInfo(response.data);
      
      // Exit edit mode
      setIsEditMode(false);
      
      // Clear password fields
      setFormData(prev => ({
        ...prev,
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      }));
      
      // Show success message
      alert('Хувийн мэдээлэл амжилттай шинэчлэгдлээ!');
    } catch (err) {
      setError(`Failed to update profile: ${err.response?.data?.error?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };
  
  const handleLogout = () => {
    logout();
    navigate('/login');
  };
  
  if (loading && !employeeInfo) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Хувийн мэдээлэл</h1>
        {!isEditMode && (
          <button
            onClick={() => setIsEditMode(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Засах
          </button>
        )}
      </div>
      
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {/* Profile Header */}
        <div className="p-6 bg-gray-50 border-b">
          <div className="flex items-center">
            <div className="h-20 w-20 rounded-full bg-blue-200 flex items-center justify-center text-blue-700 text-xl font-medium">
              {employeeInfo?.name.charAt(0)}
            </div>
            <div className="ml-6">
              <h2 className="text-xl font-semibold">{employeeInfo?.name}</h2>
              <p className="text-gray-600">
                Ажилтан - {employeeInfo?.employee?.branch_name || ''}
              </p>
            </div>
          </div>
        </div>
        
        <div className="p-6">
          {isEditMode ? (
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Хэрэглэгчийн нэр
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      И-мэйл
                    </label>
                    <input
                      type="email"
                      value={employeeInfo?.email}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
                      disabled
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      И-мэйл хаягийг өөрчлөх боломжгүй
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Утас
                    </label>
                    <input
                      type="text"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Одоогийн нууц үг
                    </label>
                    <input
                      type="password"
                      name="currentPassword"
                      value={formData.currentPassword}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Нууц үг өөрчлөх бол заавал одоогийн нууц үгээ оруулна уу
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Шинэ нууц үг
                    </label>
                    <input
                      type="password"
                      name="newPassword"
                      value={formData.newPassword}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Нууц үг давтах
                    </label>
                    <input
                      type="password"
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
              
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsEditMode(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
                >
                  Цуцлах
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                  disabled={loading}
                >
                  {loading ? 'Хадгалж байна...' : 'Хадгалах'}
                </button>
              </div>
            </form>
          ) : (
            <>
              <h3 className="text-lg font-medium mb-4">Хувийн мэдээлэл</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-500">Хэрэглэгчийн нэр</p>
                    <p className="font-medium">{employeeInfo?.name}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm text-gray-500">И-мэйл</p>
                    <p className="font-medium">{employeeInfo?.email}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm text-gray-500">Утас</p>
                    <p className="font-medium">{employeeInfo?.phone || '-'}</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-500">Салбар</p>
                    <p className="font-medium">{employeeInfo?.employee?.branch_name || '-'}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm text-gray-500">Төлөв</p>
                    <p className="font-medium">
                      <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-full ${
                        employeeInfo?.employee?.status === 'Active' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {employeeInfo?.employee?.status === 'Active' ? 'Идэвхтэй' : 'Идэвхгүй'}
                      </span>
                    </p>
                  </div>
                  
                  <div>
                    <p className="text-sm text-gray-500">Бүртгүүлсэн огноо</p>
                    <p className="font-medium">
                      {employeeInfo?.created_at ? new Date(employeeInfo.created_at).toLocaleDateString() : '-'}
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Logout Button */}
              <div className="mt-8 pt-6 border-t">
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
                >
                  Гарах
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmployeeProfile;