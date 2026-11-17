import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { Sessions } from './pages/Sessions';
import { Recordings } from './pages/Recordings';
import { JoinSession } from './pages/JoinSession';
import { AdminLogin } from './pages/AdminLogin';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Admin Routes */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/dashboard" element={<Dashboard />} />
        <Route path="/admin/sessions" element={<Sessions />} />
        <Route path="/admin/recordings" element={<Recordings />} />

        {/* Participant Invitation Route */}
        <Route path="/join/:token" element={<JoinSession />} />

        {/* Default route */}
        <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
};
export default App;
