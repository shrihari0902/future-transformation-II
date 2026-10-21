import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  ShieldCheck,
  Wifi,
  WifiOff,
  User,
  LogOut,
  ChevronDown
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNetwork } from '../context/NetworkContext';

export default function Navbar() {
  const { user, logout, login } = useAuth();
  const { isOnline, isSimulatedOffline, toggleSimulatedOffline } = useNetwork();
  const location = useLocation();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const demoAccounts = [
    { username: 'customer1', role: 'Customer 1 (Payer)' },
    { username: 'customer2', role: 'Customer 2 (Payer)' },
    { username: 'merchant', role: 'Merchant (Payee)' },
    { username: 'analyst', role: 'Bank Analyst (Risk)' },
  ];

  const handleSwitchAccount = async (username) => {
    setShowUserMenu(false);
    try {
      await login(username, 'DemoPass123!');
    } catch (err) {
      alert('Could not switch account: ' + (err.response?.data?.detail || err.message));
    }
  };

  return (
    <header className="top-navbar">
      <div className="top-navbar-inner">
        {/* Brand */}
        <Link to="/" className="brand-link">
          <div className="brand-icon-box">
            <Wallet size={18} />
          </div>
          <span>OfflinePay</span>
        </Link>

        {/* Right side controls */}
        <div className="nav-controls">
          {/* Network Simulator Button / Status Pill */}
          <button
            type="button"
            className={`network-pill ${isOnline ? 'online' : 'offline'}`}
            onClick={toggleSimulatedOffline}
            title={
              isSimulatedOffline
                ? 'Click to resume Online mode'
                : 'Click to simulate Offline mode (tests local crypto with no network)'
            }
          >
            <span className="status-dot"></span>
            {isOnline ? (
              <>
                <Wifi size={13} />
                <span>Online</span>
              </>
            ) : (
              <>
                <WifiOff size={13} />
                <span>Offline {isSimulatedOffline ? '(Simulated)' : ''}</span>
              </>
            )}
          </button>

          {/* User Profile / Quick Switcher */}
          {user && (
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '0.35rem 0.65rem', fontSize: '0.825rem' }}
                onClick={() => setShowUserMenu(!showUserMenu)}
              >
                <User size={14} />
                <span style={{ fontWeight: 600 }}>{user.username}</span>
                <span className={`badge ${user.role === 'analyst' ? 'badge-amber' : user.role === 'merchant' ? 'badge-blue' : 'badge-emerald'}`}>
                  {user.role}
                </span>
                <ChevronDown size={13} />
              </button>

              {showUserMenu && (
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '120%',
                    width: '220px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-lg)',
                    padding: '0.5rem',
                    zIndex: 60,
                  }}
                >
                  <div style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                    Quick Switch Account
                  </div>
                  {demoAccounts.map((acc) => (
                    <button
                      key={acc.username}
                      type="button"
                      onClick={() => handleSwitchAccount(acc.username)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '0.45rem 0.6rem',
                        background: user.username === acc.username ? 'var(--bg-subtle)' : 'transparent',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        display: 'flex',
                        flexDirection: 'column',
                        color: user.username === acc.username ? 'var(--primary)' : 'var(--text-main)',
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{acc.username}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{acc.role}</span>
                    </button>
                  ))}

                  <div style={{ height: '1px', background: 'var(--border)', margin: '0.4rem 0' }} />

                  <button
                    type="button"
                    onClick={() => {
                      setShowUserMenu(false);
                      logout();
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '0.45rem 0.6rem',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      color: 'var(--rose)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                    }}
                  >
                    <LogOut size={14} />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Navigation Tabs for Logged In User */}
      {user && (
        <nav className="nav-tabs">
          <Link
            to="/wallet"
            className={`nav-tab ${location.pathname === '/wallet' || location.pathname === '/' ? 'active' : ''}`}
          >
            <Wallet size={16} />
            <span>Wallet & Reserve</span>
          </Link>

          <Link
            to="/pay"
            className={`nav-tab ${location.pathname === '/pay' ? 'active' : ''}`}
          >
            <ArrowUpRight size={16} />
            <span>Pay Offline</span>
          </Link>

          <Link
            to="/receive"
            className={`nav-tab ${location.pathname === '/receive' ? 'active' : ''}`}
          >
            <ArrowDownLeft size={16} />
            <span>Receive Payment</span>
          </Link>

          <Link
            to="/sync"
            className={`nav-tab ${location.pathname === '/sync' ? 'active' : ''}`}
          >
            <RefreshCw size={16} />
            <span>Sync Queue & History</span>
          </Link>

          {user.role === 'analyst' && (
            <Link
              to="/analyst"
              className={`nav-tab ${location.pathname === '/analyst' ? 'active' : ''}`}
            >
              <ShieldCheck size={16} />
              <span>Analyst Center</span>
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}
