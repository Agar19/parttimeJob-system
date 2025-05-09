// client/src/pages/employee/ShiftTrades.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { format, parseISO } from 'date-fns';

const ShiftTrades = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [myTrades, setMyTrades] = useState([]);
  const [availableTrades, setAvailableTrades] = useState([]);
  const [myShifts, setMyShifts] = useState([]);
  const [activeTab, setActiveTab] = useState('myTrades');
  
  // Modal states
  const [isOfferModalOpen, setIsOfferModalOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState(null);
  const [tradeNotes, setTradeNotes] = useState('');
  
  useEffect(() => {
    fetchData();
  }, []);
  
  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch my trade requests
      const tradesResponse = await api.get('/shift-trades');
      setMyTrades(tradesResponse.data);
      
      // Fetch available trades from others
      const availableResponse = await api.get('/shift-trades/available');
      setAvailableTrades(availableResponse.data);
      
      // Fetch my upcoming shifts
      const today = new Date();
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      
      const shiftsResponse = await api.get(`/shifts/employee/${user.employee.id}`, {
        params: { 
          startDate: format(today, 'yyyy-MM-dd'),
          endDate: format(nextMonth, 'yyyy-MM-dd')
        }
      });
      
      // Filter out shifts that already have pending trade requests
      const shiftsWithTrades = tradesResponse.data
        .filter(trade => trade.status === 'Pending')
        .map(trade => trade.shift_id);
      
      const availableShifts = shiftsResponse.data.filter(
        shift => !shiftsWithTrades.includes(shift.id)
      );
      
      setMyShifts(availableShifts);
    } catch (err) {
      setError('Failed to load trades data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  
  const handleCreateTradeRequest = async () => {
    if (!selectedShift) return;
    
    try {
      setLoading(true);
      
      await api.post('/shift-trades', {
        shiftId: selectedShift.id,
        notes: tradeNotes
      });
      
      // Reset form and close modal
      setSelectedShift(null);
      setTradeNotes('');
      setIsOfferModalOpen(false);
      
      // Refresh data
      await fetchData();
      
      // Show success message
      alert('Ээлж солих хүсэлт амжилттай илгээгдлээ');
    } catch (err) {
      setError(`Failed to create trade request: ${err.response?.data?.error?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };
  
  const handleAcceptTrade = async (tradeId) => {
    try {
      setLoading(true);
      
      await api.post(`/shift-trades/${tradeId}/accept`);
      
      // Refresh data
      await fetchData();
      
      // Show success message
      alert('Ээлж солих хүсэлт амжилттай хүлээн авлаа. Менежерийн зөвшөөрөл хүлээгдэж байна.');
    } catch (err) {
      setError(`Failed to accept trade: ${err.response?.data?.error?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };
  
  const handleCancelTrade = async (tradeId) => {
    if (!window.confirm('Энэ хүсэлтийг цуцлахдаа итгэлтэй байна уу?')) {
      return;
    }
    
    try {
      setLoading(true);
      
      await api.post(`/shift-trades/${tradeId}/cancel`);
      
      // Refresh data
      await fetchData();
      
      // Show success message
      alert('Ээлж солих хүсэлт амжилттай цуцлагдлаа');
    } catch (err) {
      setError(`Failed to cancel trade: ${err.response?.data?.error?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };
  
  // Helper function to format date/time
  const formatDateTime = (dateTimeStr) => {
    const date = parseISO(dateTimeStr);
    return format(date, 'yyyy-MM-dd HH:mm');
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
  
  if (loading && myTrades.length === 0) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Ээлж солилцох</h1>
        <button
          onClick={() => setIsOfferModalOpen(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          disabled={myShifts.length === 0}
        >
          + Ээлж санал болгох
        </button>
      </div>
      
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      
      {myShifts.length === 0 && (
        <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-4">
          <p className="text-sm text-yellow-700">
            Танд одоогоор солилцох боломжтой ээлж байхгүй байна.
          </p>
        </div>
      )}
      
      {/* Tab navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex -mb-px" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('myTrades')}
            className={`py-4 px-1 border-b-2 font-medium text-sm mr-8 ${
              activeTab === 'myTrades'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Миний хүсэлтүүд
          </button>
          <button
            onClick={() => setActiveTab('availableTrades')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'availableTrades'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Бусдын санал
          </button>
        </nav>
      </div>
      
      {/* My Trade Requests Tab */}
      {activeTab === 'myTrades' && (
        <div>
          {myTrades.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-6 text-center text-gray-500">
              Танд одоогоор ээлж солих хүсэлт байхгүй байна.
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
                      Хэнтэй солилцох
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Төлөв
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
                  {myTrades.map(trade => (
                    <tr key={trade.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {formatDateTime(trade.start_time)} - {formatDateTime(trade.end_time)}
                        </div>
                        <div className="text-sm text-gray-500">
                          {trade.branch_name}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {trade.recipient_name || 'Хүлээгдэж байна'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(trade.status)}`}>
                          {getStatusText(trade.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDateTime(trade.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {trade.status === 'Pending' && (
                          <button
                            onClick={() => handleCancelTrade(trade.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Цуцлах
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      
      {/* Available Trades Tab */}
      {activeTab === 'availableTrades' && (
        <div>
          {availableTrades.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-6 text-center text-gray-500">
              Одоогоор санал болгож буй ээлж байхгүй байна.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {availableTrades.map(trade => (
                <div key={trade.id} className="bg-white rounded-lg shadow-md overflow-hidden">
                  <div className="px-6 py-4">
                    <div className="font-bold text-xl mb-2">
                      {format(parseISO(trade.start_time), 'yyyy-MM-dd')}
                    </div>
                    <p className="text-gray-700 text-base mb-2">
                      {format(parseISO(trade.start_time), 'HH:mm')} - {format(parseISO(trade.end_time), 'HH:mm')}
                    </p>
                    <p className="text-gray-600 text-sm mb-2">
                      Салбар: {trade.branch_name}
                    </p>
                    <p className="text-gray-600 text-sm mb-4">
                      Санал болгосон: {trade.requester_name}
                    </p>
                    {trade.notes && (
                      <div className="bg-blue-50 p-3 rounded-md mb-4">
                        <p className="text-sm text-blue-800">{trade.notes}</p>
                      </div>
                    )}
                    <button
                      onClick={() => handleAcceptTrade(trade.id)}
                      className="w-full bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                    >
                      Авах
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* Offer Shift Modal */}
      {isOfferModalOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Ээлж санал болгох</h3>
              <button
                onClick={() => setIsOfferModalOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                &times;
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ээлж сонгох
                </label>
                <select
                  value={selectedShift ? selectedShift.id : ''}
                  onChange={(e) => {
                    const shift = myShifts.find(s => s.id === e.target.value);
                    setSelectedShift(shift || null);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">-- Ээлж сонгох --</option>
                  {myShifts.map(shift => (
                    <option key={shift.id} value={shift.id}>
                      {format(parseISO(shift.start_time), 'yyyy-MM-dd HH:mm')} - {format(parseISO(shift.end_time), 'HH:mm')}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Нэмэлт тайлбар (заавал биш)
                </label>
                <textarea
                  value={tradeNotes}
                  onChange={(e) => setTradeNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Жишээ: Гэр бүлийн шалтгаанаар ажиллах боломжгүй болсон"
                ></textarea>
              </div>
              
              <div className="mt-5 flex justify-end space-x-3">
                <button
                  onClick={() => setIsOfferModalOpen(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
                >
                  Цуцлах
                </button>
                <button
                  onClick={handleCreateTradeRequest}
                  disabled={!selectedShift || loading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300"
                >
                  {loading ? 'Илгээж байна...' : 'Илгээх'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShiftTrades;