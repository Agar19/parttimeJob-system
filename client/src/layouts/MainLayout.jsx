import React, { useState } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const MainLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  
  const handleLogout = () => {
    logout();
    navigate('/login');
  };
  
  // Determine active route
  const isActive = (path) => {
    return location.pathname.startsWith(path);
  };
  
  // Generate navigation links based on user role
  const renderNavLinks = () => {
    if (user.role === 'Manager' || user.role === 'Admin') {
      return (
        <>
          <Link
            to="/manager/branches"
            className={`flex items-center py-3 px-4 space-x-2 ${
              isActive('/manager/branches') ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>
            </svg>
            <span>Салбар</span>
          </Link>
          
          <Link
            to="/manager/schedules"
            className={`flex items-center py-3 px-4 space-x-2 ${
              isActive('/manager/schedule') ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
            </svg>
            <span>Цагийн хуваарь</span>
          </Link>
        </>
      );
    } else if (user.role === 'Employee') {
      return (
        <>
          <Link
            to="/employee/availability"
            className={`flex items-center py-3 px-4 space-x-2 ${
              isActive('/employee/availability') ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
            </svg>
            <span>Хуваарь үүсгэх</span>
          </Link>
          
          <Link
            to="/employee/shifts"
            className={`flex items-center py-3 px-4 space-x-2 ${
              isActive('/employee/shifts') ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
            </svg>
            <span>Миний ээлж</span>
          </Link>
        </>
      );
    }
    
    return null;
  };
  
  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar - Changed from blue to dark gray */}
      <div className={`fixed inset-y-0 left-0 z-30 w-64 bg-gray-800 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${
        menuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}>
        {/* Logo - Changed from blue to darker gray */}
        <div className="flex items-center justify-center h-16 bg-gray-900 text-white font-bold px-6">
          <span>Ажлын хуваарийн систем</span>
        </div>
        
        {/* Navigation */}
        <div className="mt-6">
          <nav className="flex flex-col">
            {renderNavLinks()}
          </nav>
        </div>
        
        {/* Logout Button - Now transparent with just icon visible */}
        <div className="absolute bottom-0 w-full p-4">
          <button
            onClick={handleLogout}
            className="flex items-center justify-center w-full py-2 px-4 text-white bg-transparent hover:bg-gray-700 rounded-md transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
            </svg>
          </button>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="bg-white shadow-sm z-10">
          <div className="px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
            {/* Menu Toggle Button (Mobile) */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden text-gray-600 focus:outline-none"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            
            {/* User Info */}
            <div className="flex items-center ml-auto">
              <span className="text-gray-700 mr-2">{user?.name}</span>
              <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center text-white">
                {user?.name.charAt(0)}
              </div>
            </div>
          </div>
        </header>
        
        {/* Content Area */}
        <main className="flex-1 overflow-auto bg-gray-100">
          <Outlet />
        </main>
      </div>
      
      {/* Mobile Overlay */}
      {menuOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden"
          onClick={() => setMenuOpen(false)}
        ></div>
      )}
    </div>
  );
};

export default MainLayout;