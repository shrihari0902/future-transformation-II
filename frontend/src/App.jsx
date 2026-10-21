import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NetworkProvider, useNetwork } from './context/NetworkContext';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Wallet from './pages/Wallet';
import Pay from './pages/Pay';
import Receive from './pages/Receive';
import SyncQueue from './pages/SyncQueue';
import Analyst from './pages/Analyst';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-muted)' }}>
        Loading secure vault...
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function AppContent() {
  const { isSimulatedOffline, toggleSimulatedOffline } = useNetwork();
  return (
    <div className="app-container">
      <Navbar />

      {/* Simulated Offline Notice Banner */}
      {isSimulatedOffline && (
        <div
          style={{
            background: '#fffbeb',
            borderBottom: '1px solid #fde68a',
            color: '#92400e',
            padding: '0.45rem 1rem',
            textAlign: 'center',
            fontSize: '0.825rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
          }}
        >
          <span>⚡ Simulated Offline Mode: Browser Web Crypto & IndexedDB are active with zero network.</span>
          <button
            type="button"
            onClick={toggleSimulatedOffline}
            style={{
              background: '#fef3c7',
              border: '1px solid #d97706',
              borderRadius: '4px',
              padding: '0.1rem 0.4rem',
              color: '#92400e',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.75rem',
            }}
          >
            Resume Online
          </button>
        </div>
      )}

      <main className="main-content">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Navigate to="/wallet" replace />
              </ProtectedRoute>
            }
          />
          <Route
            path="/wallet"
            element={
              <ProtectedRoute>
                <Wallet />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pay"
            element={
              <ProtectedRoute>
                <Pay />
              </ProtectedRoute>
            }
          />
          <Route
            path="/receive"
            element={
              <ProtectedRoute>
                <Receive />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sync"
            element={
              <ProtectedRoute>
                <SyncQueue />
              </ProtectedRoute>
            }
          />
          <Route
            path="/analyst"
            element={
              <ProtectedRoute>
                <Analyst />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <NetworkProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </AuthProvider>
    </NetworkProvider>
  );
}
