import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('customer1');
  const [password, setPassword] = useState('DemoPass123!');
  const [isRegister, setIsRegister] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('DemoPass123!');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const demoAccounts = [
    {
      id: 'customer1',
      title: 'Customer 1 (Payer)',
      desc: 'Standard payer with ₹10,000 balance & Medium Risk tier.',
      badge: 'Customer',
      badgeColor: 'badge-emerald',
    },
    {
      id: 'customer2',
      title: 'Customer 2 (Payer)',
      desc: 'Second customer to demonstrate peer-to-peer or conflicting spend.',
      badge: 'Customer',
      badgeColor: 'badge-emerald',
    },
    {
      id: 'merchant',
      title: 'Merchant (Payee)',
      desc: 'Terminal to receive offline tokens, verify signatures & issue receipts.',
      badge: 'Merchant',
      badgeColor: 'badge-blue',
    },
    {
      id: 'analyst',
      title: 'Bank Analyst',
      desc: 'Monitor double-spending flag queue & adjudicate disputed transactions.',
      badge: 'Analyst',
      badgeColor: 'badge-amber',
    },
  ];

  const handleQuickLogin = async (account) => {
    setError(null);
    setLoading(true);
    try {
      await login(account, 'DemoPass123!');
      navigate('/wallet');
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegister) {
        await api.post('/auth/register', {
          full_name: fullName || username,
          username,
          email: email || `${username}@offlinepay.local`,
          password,
          confirm_password: confirmPassword,
        });
      }
      await login(username, password);
      navigate('/wallet');
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Authentication error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '460px', margin: '2rem auto', padding: '0 1rem' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
        <div
          style={{
            width: '54px',
            height: '54px',
            borderRadius: '14px',
            background: 'var(--primary)',
            color: 'white',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '0.75rem',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <Wallet size={28} />
        </div>
        <h1 style={{ fontSize: '1.6rem', marginBottom: '0.25rem' }}>OfflinePay</h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          Secure offline digital payments with bounded bank risk & cryptographic verification.
        </p>
      </div>

      {/* 1-Click Demo Logins */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Instant Demo Logins
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {demoAccounts.map((acc) => (
            <button
              key={acc.id}
              type="button"
              onClick={() => handleQuickLogin(acc.id)}
              disabled={loading}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.65rem 0.85rem',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-surface)',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-subtle)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-surface)')}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                    {acc.title}
                  </span>
                  <span className={`badge ${acc.badgeColor}`}>{acc.badge}</span>
                </div>
                <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  {acc.desc}
                </div>
              </div>
              <ArrowRight size={16} color="var(--text-muted)" />
            </button>
          ))}
        </div>
      </div>

      {/* Form Card */}
      <div className="card">
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '1rem' }}>
          <button
            type="button"
            onClick={() => setIsRegister(false)}
            style={{
              flex: 1,
              padding: '0.5rem',
              background: 'none',
              border: 'none',
              borderBottom: !isRegister ? '2px solid var(--primary)' : '2px solid transparent',
              fontWeight: !isRegister ? 600 : 400,
              color: !isRegister ? 'var(--primary)' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setIsRegister(true)}
            style={{
              flex: 1,
              padding: '0.5rem',
              background: 'none',
              border: 'none',
              borderBottom: isRegister ? '2px solid var(--primary)' : '2px solid transparent',
              fontWeight: isRegister ? 600 : 400,
              color: isRegister ? 'var(--primary)' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            Create Account
          </button>
        </div>

        {error && (
          <div
            style={{
              background: 'var(--rose-bg)',
              color: 'var(--rose-text)',
              border: '1px solid var(--rose-border)',
              padding: '0.65rem 0.85rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              marginBottom: '1rem',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Alex Johnson"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  className="form-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex@offlinepay.local"
                  required
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label className="form-label">Username</label>
            <input
              type="text"
              className="form-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {isRegister && (
            <div className="form-group">
              <label className="form-label">Confirm Password</label>
              <input
                type="password"
                className="form-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={loading} style={{ marginTop: '0.5rem' }}>
            {loading ? 'Authenticating...' : isRegister ? 'Register & Generate Key' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
