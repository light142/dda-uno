import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import Simulations from './pages/Simulations';
import SimulationDetail from './pages/SimulationDetail';
import Training from './pages/Training';
import TierDetail from './pages/TierDetail';
import TierCompare from './pages/TierCompare';
import Login from './pages/Login';
import { AuthProvider, useAuth } from './hooks/useAuth';

function ProtectedRoutes() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/simulations" element={<Simulations />} />
        <Route path="/simulations/:id" element={<SimulationDetail />} />
        <Route path="/training" element={<Training />} />
        <Route path="/training/compare" element={<TierCompare />} />
        <Route path="/training/:tier" element={<TierDetail />} />
      </Routes>
    </Layout>
  );
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={<ProtectedRoutes />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
