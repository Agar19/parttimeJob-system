import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import { formatLocalDate, formatTimeOnly } from '../../utils/dateUtils';

const ShiftTradeApprovals = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        if (user?.role !== 'Manager' && user?.role !== 'Admin') {
          navigate('/login');
          return;
        }
        
        // Fetch branches
        const branchesResponse = await api.get('/branches');
        setBranches(branchesResponse.data);
        
        // Set default branch if manager has branches
        if (user.branches && user.branches.length > 0) {
          setSelectedBranch(user.branches[0].id);
        } else if (branchesResponse.data.length > 0) {
          setSelectedBranch(branchesResponse.data[0].id);
        }
        
        // Fetch shift trades
        await fetchTrades();
      } catch (err) {
        setError('Failed to load data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [navigate, user]);
  
  const fetchTrades = async () => {
    try {
      setLoading(true);
      
      const params = {};
      if (selectedBranch) {
        params.branchId = selectedBranch;
      }
      
      const response = await api.get('/shift-trades', { params });
      setTrades(response.data);
    } catch (err) {
      setError('Failed to load trades');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    if (selectedBranch) {
      fetchTrades();
    }
  }, [selectedBranch]);
  
  const handleApproveReject = async (tradeId, status) => {
    try {
      setLoading(true);
      
      await api.patch(`/shift-trades/${tradeId}/status`, { status });
      
      // Refresh trades
      await fetchTrades();
      
      // Show success message
      alert(`Хүсэлт амжилттай ${status === 'Approved' ? 'зөвшөөрөгдлөө' : 'татгалзагдлаа'}`);
    } catch (err) {
      setError(`Failed to ${status === 'Approved' ? 'approve' : 'reject'} trade: ${err.response?.data?.error?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };
  
  // Helper function to get trade status text
  const getStatusText = (status) => {
    switch (status) {
      case 'Pending': return 'Хүлээгдэж байна';
      case 'Approved': return 'Зөвшөөрсөн';
      case 'Rejected': return 'Татгалзсан';
      case 'Cancelled': return 'Цуцалсан';
      default: return status;
    }
  };
  
  // Helper function to get status badge color
  const getStatusColor = (status) => {
    switch (status) {
      case 'Pending': return 'bg-yellow-100 text-yellow-800';
      case 'Approved': return 'bg-green-100 text-green-800';
      case 'Rejected': return 'bg-red-100 text-red-800';
      case 'Cancelled': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };
  
  // Filter trades that need approval (pending and have recipient)
  const pendingTrades = trades.filter(
    trade => trade.status === 'Pending' && trade.recipient_id
  );
  
  // Other trades (approved, rejected, cancelled or pending without recipient)
  const otherTrades = trades.filter(
    trade => trade.status !== 'Pending' || !trade.recipient_id
  );
  
  if (loading && trades.length === 0) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Ээлж солилцох хүсэлтүүд</h1>
        
        <div className="flex items-center">
          <label className="mr-2">Салбар:</label>
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Бүх салбар</option>
            {branches.map(branch => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      
      {/* Pending Approvals Section */}
      <h2 className="text-lg font-semibold mb-4">Хүлээгдэж буй хүсэлтүүд</h2>
      
      {pendingTrades.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-6 text-center text-gray-500 mb-8">
          Одоогоор зөвшөөрөл хүлээж буй хүсэлт байхгүй байна.
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-md overflow-hidden mb-8">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ээлжийн мэдээлэл
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Санал болгосон
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Хүлээн авсан
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Үүсгэсэн огноо
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Үйлдэл
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {pendingTrades.map(trade => (
                <tr key={trade.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {formatLocalDate(trade.start_time)} - {formatTimeOnly(trade.end_time)}
                    </div>
                    <div className="text-sm text-gray-500">
                      {trade.branch_name}
                    </div>
                    {trade.notes && (
                      <div className="text-xs text-gray-500 mt-1 italic">
                        "{trade.notes}"
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {trade.requester_name}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {trade.recipient_name}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatLocalDate(trade.created_at)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                    <button
                      onClick={() => handleApproveReject(trade.id, 'Approved')}
                      className="text-green-600 hover:text-green-900 font-medium"
                    >
                      Зөвшөөрөх
                    </button>
                    <button
                      onClick={() => handleApproveReject(trade.id, 'Rejected')}
                      className="text-red-600 hover:text-red-900 font-medium"
                    >
                      Татгалзах
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      {/* All Trades History Section */}
      <h2 className="text-lg font-semibold mb-4">Бүх хүсэлтүүд</h2>
      
      {otherTrades.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-6 text-center text-gray-500">
          Одоогоор солилцох хүсэлтийн түүх байхгүй байна.
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ээлжийн мэдээлэл
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Санал болгосон
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Хүлээн авсан
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Төлөв
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Шийдвэрлэсэн
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {otherTrades.map(trade => (
                <tr key={trade.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {formatLocalDate(trade.start_time)} - {formatTimeOnly(trade.end_time)}
                    </div>
                    <div className="text-sm text-gray-500">
                      {trade.branch_name}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {trade.requester_name}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {trade.recipient_name || '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(trade.status)}`}>
                      {getStatusText(trade.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {trade.approved_by_name ? (
                      <div>
                        <div>{trade.approved_by_name}</div>
                        <div className="text-xs text-gray-500">
                          {trade.approved_at ? formatLocalDate(trade.approved_at) : ''}
                        </div>
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ShiftTradeApprovals;