import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';

// Layouts
import MainLayout from './layouts/MainLayout';

// Common Pages
import Login from './pages/Login';
import NotFound from './pages/NotFound';

// Manager Pages
import BranchSelection from './pages/manager/BranchSelection';
import ScheduleCreation from './pages/manager/ScheduleCreation';
import ScheduleView from './pages/manager/ScheduleView';

// Employee Pages
import Availability from './pages/employee/Availability';
import ShiftView from './pages/employee/ShiftView';

// Protected route component
const ProtectedRoute = ({ element, allowedRoles }) => {
  const { isAuthenticated, user, loading } = useAuth();
  
  if (loading) {
    return <div>Loading...</div>;
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }
  
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" />;
  }
  
  return element;
};

const App = () => {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          {/* Manager Routes */}
          <Route path="/manager" element={
            <ProtectedRoute 
              element={<MainLayout />} 
              allowedRoles={['Admin', 'Manager']} 
            />
          }>
            <Route index element={<Navigate to="/manager/branches" />} />
            <Route path="branches" element={<BranchSelection />} />
            <Route path="schedules/:branchId" element={<ScheduleCreation />} />
            <Route path="schedule/:scheduleId" element={<ScheduleView />} />
          </Route>
          
          {/* Employee Routes */}
          <Route path="/employee" element={
            <ProtectedRoute 
              element={<MainLayout />} 
              allowedRoles={['Employee']} 
            />
          }>
            <Route index element={<Navigate to="/employee/availability" />} />
            <Route path="availability" element={<Availability />} />
            <Route path="shifts" element={<ShiftView />} />
          </Route>
          
          {/* Default Routes */}
          <Route path="/" element={
            <ProtectedRoute element={<MainLayout />} />
          }>
            <Route index element={<HomeRedirect />} />
          </Route>
          
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
};

// Helper component to redirect based on user role
const HomeRedirect = () => {
  const { user } = useAuth();
  
  if (user.role === 'Manager' || user.role === 'Admin') {
    return <Navigate to="/manager/branches" />;
  } else if (user.role === 'Employee') {
    return <Navigate to="/employee/availability" />;
  }
  
  return <Navigate to="/login" />;
};

export default App;