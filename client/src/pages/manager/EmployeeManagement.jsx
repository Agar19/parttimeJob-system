// client/src/pages/manager/EmployeeManagement.jsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const EmployeeManagement = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState(null);
  const [isPermanentDelete, setIsPermanentDelete] = useState(false);
  
  // Form state for new employee
  const [newEmployee, setNewEmployee] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    branchId: ''
  });
  
  // Filter state
  const [filter, setFilter] = useState({
    branch: '',
    status: '',
    search: ''
  });
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        if (user?.role !== 'Manager' && user?.role !== 'Admin') {
          navigate('/login');
          return;
        }
        
        // Fetch employees
        const employeesResponse = await api.get('/employees');
        setEmployees(employeesResponse.data);
        
        // Fetch branches for dropdown
        const branchesResponse = await api.get('/branches');
        setBranches(branchesResponse.data);
        
        // Set default branch ID for new employee form
        if (branchesResponse.data.length > 0) {
          setNewEmployee(prev => ({
            ...prev,
            branchId: branchesResponse.data[0].id
          }));
        }
      } catch (err) {
        setError('Failed to load data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [navigate, user]);
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewEmployee(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilter(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const response = await api.post('/employees', newEmployee);
      
      // Update employees list
      setEmployees(prev => [...prev, response.data]);
      
      // Reset form
      setNewEmployee({
        name: '',
        email: '',
        password: '',
        phone: '',
        branchId: branches.length > 0 ? branches[0].id : ''
      });
      
      // Close modal
      setIsModalOpen(false);
      
      // Show success message
      alert('Ажилтан амжилттай нэмэгдлээ!');
    } catch (err) {
      setError(`Failed to add employee: ${err.response?.data?.error?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };
  
  const openConfirmModal = (employee, permanent = false) => {
    setEmployeeToDelete(employee);
    setIsPermanentDelete(permanent);
    setIsConfirmModalOpen(true);
  };
  
  const handleDeleteEmployee = async () => {
    if (!employeeToDelete) return;
    
    setLoading(true);
    
    try {
      if (isPermanentDelete) {
        // Permanently delete the employee
        await api.delete(`/employees/${employeeToDelete.id}`);
        
        // Remove from the local state
        setEmployees(prev => prev.filter(emp => emp.id !== employeeToDelete.id));
        
        // Show success message
        alert('Ажилтан бүрмөсөн устгагдлаа!');
      } else {
        // Set status to Inactive (soft delete)
        await api.patch(`/employees/${employeeToDelete.id}/status`, {
          status: 'Inactive'
        });
        
        // Update the local state
        setEmployees(prev => prev.map(emp => 
          emp.id === employeeToDelete.id ? { ...emp, status: 'Inactive' } : emp
        ));
        
        // Show success message
        alert('Ажилтан амжилттай цуцлагдлаа!');
      }
      
      // Close the confirmation modal
      setIsConfirmModalOpen(false);
      setEmployeeToDelete(null);
      setIsPermanentDelete(false);
    } catch (err) {
      setError(`Failed to ${isPermanentDelete ? 'permanently delete' : 'deactivate'} employee: ${err.response?.data?.error?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };
  
  const handleActivateEmployee = async (employeeId) => {
    setLoading(true);
    
    try {
      // Call API to change status to Active
      await api.patch(`/employees/${employeeId}/status`, {
        status: 'Active'
      });
      
      // Update the local state
      setEmployees(prev => prev.map(emp => 
        emp.id === employeeId ? { ...emp, status: 'Active' } : emp
      ));
      
      // Show success message
      alert('Ажилтан амжилттай идэвхжүүлэгдлээ!');
    } catch (err) {
      setError(`Failed to activate employee: ${err.response?.data?.error?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };
  
  const handleChangeBranch = async (employeeId, branchId) => {
    if (!branchId) return;
    
    setLoading(true);
    
    try {
      // Call API to change branch
      await api.patch(`/employees/${employeeId}/branch`, {
        branchId
      });
      
      // Get branch name for UI update
      const branch = branches.find(b => b.id === branchId);
      
      // Update the local state
      setEmployees(prev => prev.map(emp => 
        emp.id === employeeId ? { ...emp, branch_id: branchId, branch_name: branch.name } : emp
      ));
      
      // Show success message
      alert('Ажилтны салбар амжилттай өөрчлөгдлөө!');
    } catch (err) {
      setError(`Failed to change branch: ${err.response?.data?.error?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };
  
  const filteredEmployees = employees.filter(employee => {
    // Filter by branch
    if (filter.branch && employee.branch_id !== filter.branch) {
      return false;
    }
    
    // Filter by status
    if (filter.status && employee.status !== filter.status) {
      return false;
    }
    
    // Filter by search term
    if (filter.search) {
      const searchTerm = filter.search.toLowerCase();
      return (
        employee.name.toLowerCase().includes(searchTerm) ||
        employee.email.toLowerCase().includes(searchTerm)
      );
    }
    
    return true;
  });
  
  if (loading && employees.length === 0) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Ажилтны удирдлага</h1>
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          onClick={() => setIsModalOpen(true)}
        >
          + Ажилтан нэмэх
        </button>
      </div>
      
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      
      {/* Filters */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Салбараар
            </label>
            <select
              name="branch"
              value={filter.branch}
              onChange={handleFilterChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Бүх салбар</option>
              {branches.map(branch => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Төлөв
            </label>
            <select
              name="status"
              value={filter.status}
              onChange={handleFilterChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Бүх төлөв</option>
              <option value="Active">Идэвхтэй</option>
              <option value="Inactive">Идэвхгүй</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Хайх
            </label>
            <input
              type="text"
              name="search"
              value={filter.search}
              onChange={handleFilterChange}
              placeholder="Нэр эсвэл и-мэйл..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>
      
      {/* Employees List */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Нэр
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                И-мэйл
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Утас
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Салбар
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Төлөв
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Үйлдэл
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredEmployees.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-6 py-4 text-center text-gray-500">
                  Ажилтны мэдээлэл олдсонгүй
                </td>
              </tr>
            ) : (
              filteredEmployees.map(employee => (
                <tr key={employee.id} className={employee.status === 'Inactive' ? 'bg-gray-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-700 font-medium">
                        {employee.name.charAt(0)}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {employee.name}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{employee.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{employee.phone || '-'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <select
                      value={employee.branch_id}
                      onChange={(e) => handleChangeBranch(employee.id, e.target.value)}
                      className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      disabled={employee.status === 'Inactive' || loading}
                    >
                      {branches.map(branch => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span 
                      className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        employee.status === 'Active' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {employee.status === 'Active' ? 'Идэвхтэй' : 'Идэвхгүй'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => navigate(`/manager/employee/${employee.id}`)}
                      className="text-blue-600 hover:text-blue-900 mr-3"
                    >
                      Мэдээлэл
                    </button>
                    
                    {employee.status === 'Active' ? (
                      <button
                        onClick={() => openConfirmModal(employee, false)}
                        className="text-red-600 hover:text-red-900 mr-3"
                      >
                        Цуцлах
                      </button>
                    ) : (
                      <button
                        onClick={() => handleActivateEmployee(employee.id)}
                        className="text-green-600 hover:text-green-900 mr-3"
                      >
                        Идэвхжүүлэх
                      </button>
                    )}
                    
                    <button
                      onClick={() => openConfirmModal(employee, true)}
                      className="text-red-800 hover:text-red-900"
                    >
                      Устгах
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {/* Add Employee Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Ажилтан нэмэх</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                &times;
              </button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="name">
                  Нэр
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={newEmployee.name}
                  onChange={handleInputChange}
                  className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                  required
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="email">
                  И-мэйл
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={newEmployee.email}
                  onChange={handleInputChange}
                  className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                  required
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">
                  Нууц үг
                </label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  value={newEmployee.password}
                  onChange={handleInputChange}
                  className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                  required
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="phone">
                  Утас
                </label>
                <input
                  type="text"
                  id="phone"
                  name="phone"
                  value={newEmployee.phone}
                  onChange={handleInputChange}
                  className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                />
              </div>
              
              <div className="mb-6">
                <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="branchId">
                  Салбар
                </label>
                <select
                  id="branchId"
                  name="branchId"
                  value={newEmployee.branchId}
                  onChange={handleInputChange}
                  className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                  required
                >
                  <option value="">Салбар сонгох</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded mr-2"
                >
                  Цуцлах
                </button>
                <button
                  type="submit"
                  className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                  disabled={loading}
                >
                  {loading ? 'Хадгалж байна...' : 'Хадгалах'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Delete/Deactivate Confirmation Modal */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <h3 className="text-lg font-medium mb-4">
              {isPermanentDelete ? 'Ажилтныг бүрмөсөн устгах' : 'Ажилтныг цуцлах'}
            </h3>
            <p className="mb-4">
              {isPermanentDelete 
                ? `Та "${employeeToDelete?.name}" ажилтныг бүрмөсөн устгахдаа итгэлтэй байна уу? Энэ үйлдлийг буцаах боломжгүй!`
                : `Та "${employeeToDelete?.name}" ажилтныг цуцлахдаа итгэлтэй байна уу?`
              }
            </p>
            {isPermanentDelete && (
              <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-4">
                <div className="flex">
                  <div className="text-yellow-500">
                    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-yellow-700">
                      Анхааруулга: Устгасан ажилтныг сэргээх боломжгүй бөгөөд бүх мэдээлэл бүрмөсөн устана.
                    </p>
                  </div>
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <button
                onClick={() => setIsConfirmModalOpen(false)}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded mr-2"
              >
                Үгүй
              </button>
              <button
                onClick={handleDeleteEmployee}
                className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
                disabled={loading}
              >
                {loading ? 'Боловсруулж байна...' : 'Тийм'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeManagement;