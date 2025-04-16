import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const BranchSelection = () => {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate(); 
  const { user } = useAuth();

  useEffect(() => {
    const fetchBranches = async () => {
      try {
        if (user?.role !== 'Manager') {
          navigate('/login');
          return;
        }

        const response = await api.get('/branches');
        setBranches(response.data);
      } catch (err) {
        setError('Failed to load branches');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchBranches();
  }, [navigate, user]);

  const handleBranchSelect = (branchId) => {
    navigate(`/manager/schedules/${branchId}`);
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
      <h1 className="text-2xl font-bold mb-6">Салбарууд</h1>
      
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {branches.map((branch) => (
          <div 
            key={branch.id}
            className="bg-white rounded-lg shadow-md p-6 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => handleBranchSelect(branch.id)}
          >
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-semibold">{branch.name}</h2>
                <p className="text-gray-600 mt-1">{branch.location}</p>
              </div>
              <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                Идэвхтэй
              </span>
            </div>
            
            <div className="mt-4 flex justify-between items-center">
              <div className="text-sm text-gray-500">
                {branch.employee_count || 0} ажилтан
              </div>
              <button 
                className="text-blue-600 hover:text-blue-800 text-sm font-semibold"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/manager/schedules/${branch.id}`);
                }}
              >
                Дэлгэрэнгүй
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BranchSelection;