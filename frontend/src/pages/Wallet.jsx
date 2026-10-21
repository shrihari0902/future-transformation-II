import React, { useState, useEffect } from 'react';
import {
  Lock,
  ShieldCheck,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Coins
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNetwork } from '../context/NetworkContext';
import api from '../utils/api';
import { saveCertificate, getAllCertificates } from '../utils/storage';

export default function Wallet() {
  const { user, deviceKey, registerNewDevice } = useAuth();
  const { isOnline } = useNetwork();

  const [wallet, setWallet] = useState(null);
  const [activeCert, setActiveCert] = useState(null);
  const [riskLimit, setRiskLimit] = useState(null);
  const [reserveAmount, setReserveAmount] = useState('500');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [user, isOnline]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    // 1. First load local cached certificates from IndexedDB
    try {
      const localCerts = await getAllCertificates();
      if (localCerts && localCerts.length > 0) {
        setActiveCert(localCerts[0]);
      }
    } catch (e) {
      console.warn('Local cert load error:', e);
    }

    // 2. If online, fetch live wallet, reserves, and risk limits
    if (isOnline) {
      try {
        const [walletRes, reservesRes, riskRes] = await Promise.all([
          api.get('/wallet').catch(() => null),
          api.get('/reserves').catch(() => null),
          api.get('/risk/my-limit').catch(() => null),
        ]);

        if (walletRes?.data) setWallet(walletRes.data);
        if (reservesRes?.data) {
          setReserves(reservesRes.data);
          // Find first active certificate
          const active = reservesRes.data.find(
            (r) => r.status === 'ACTIVE' && r.certificate
          );
          if (active?.certificate) {
            setActiveCert(active.certificate);
            // Save to local IndexedDB for offline use
            await saveCertificate({
              ...active.certificate,
              payload: JSON.parse(active.certificate.raw_payload_json),
              status: active.status,
              remaining_allowance: active.remaining_allowance
            });
          }
        }
        if (riskRes?.data) setRiskLimit(riskRes.data);
      } catch (err) {
        console.warn('Online sync warning:', err);
      }
    }

    setLoading(false);
  };

  const handleCreateReserve = async (e) => {
    e.preventDefault();
    if (!isOnline) {
      setError('Cannot create an offline reserve while offline. Please connect or resume online mode.');
      return;
    }
    if (!deviceKey?.deviceId) {
      setError('Device key not registered. Please register device key first.');
      return;
    }

    const amountInPaise = Math.round(parseFloat(reserveAmount) * 100);
    if (isNaN(amountInPaise) || amountInPaise <= 0) {
      setError('Please enter a valid amount.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const resp = await api.post('/reserves', {
        amount: amountInPaise,
        device_id: deviceKey.deviceId,
      });

      const newReserve = resp.data;
      if (newReserve.certificate) {
        const certWithPayload = {
          ...newReserve.certificate,
          payload: JSON.parse(newReserve.certificate.raw_payload_json),
          status: newReserve.status,
          remaining_allowance: newReserve.remaining_allowance
        };
        setActiveCert(certWithPayload);
        await saveCertificate(certWithPayload);
      }

      setMessage(`Successfully locked ₹${reserveAmount} into offline reserve! Allowance certificate issued.`);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to create reserve');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoFunding = async (amountInRupees = 500) => {
    if (!isOnline) {
      setError('Demo funding requires online connectivity.');
      return;
    }
    try {
      const idempotencyKey = 'fund_' + crypto.randomUUID();
      await api.post('/wallet/demo-funding', {
        amount: amountInRupees * 100,
        idempotency_key: idempotencyKey,
      });
      setMessage(`Added ₹${amountInRupees} demo funds to your available balance.`);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Demo funding failed');
    }
  };

  return (
    <div>
      {/* Title */}
      <div style={{ marginBottom: '1.25rem' }}>
        <h1>Wallet & Offline Reserve</h1>
        <p>Manage your bank balance and lock pre-funded reserves for air-gapped payments.</p>
      </div>

      {message && (
        <div
          style={{
            background: 'var(--emerald-bg)',
            color: 'var(--emerald-text)',
            border: '1px solid var(--emerald-border)',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.9rem',
          }}
        >
          <CheckCircle2 size={18} />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div
          style={{
            background: 'var(--rose-bg)',
            color: 'var(--rose-text)',
            border: '1px solid var(--rose-border)',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.9rem',
          }}
        >
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Balance Hero Card */}
      <div className="balance-hero">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Total Balance
            </div>
            <div style={{ fontSize: '2.25rem', fontWeight: 800, marginTop: '0.2rem' }}>
              ₹{wallet ? (wallet.total_balance / 100).toFixed(2) : '0.00'}
            </div>
          </div>

          {isOnline && user?.role === 'customer' && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ background: 'rgba(255,255,255,0.15)', color: 'white', borderColor: 'rgba(255,255,255,0.2)' }}
              onClick={() => handleDemoFunding(500)}
            >
              <Coins size={15} />
              <span>+ Top-up ₹500 (Demo)</span>
            </button>
          )}
        </div>

        <div className="balance-grid">
          <div className="balance-sub-item">
            <div className="balance-sub-label">
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }} />
              Available Online
            </div>
            <div className="balance-sub-val">
              ₹{wallet ? (wallet.available_balance / 100).toFixed(2) : '0.00'}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.15rem' }}>
              For regular online payments
            </div>
          </div>

          <div className="balance-sub-item">
            <div className="balance-sub-label">
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
              Locked Offline Reserve
            </div>
            <div className="balance-sub-val">
              ₹{wallet ? (wallet.reserved_balance / 100).toFixed(2) : activeCert ? (activeCert.reserve_amount / 100).toFixed(2) : '0.00'}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.15rem' }}>
              Spendable without Wi-Fi / cell
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
        {/* Section 1: Lock Amount into Offline Reserve */}
        {user?.role === 'customer' && (
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <Lock size={18} color="var(--primary)" />
                <span>Add to Offline Reserve</span>
              </div>
              <span className="badge badge-emerald">Step 1 (Online)</span>
            </div>

            <p style={{ marginBottom: '1rem' }}>
              Lock funds into an offline reserve before going into no-network areas. The bank signs an
              <strong> Allowance Certificate</strong> bound to your device key.
            </p>

            <form onSubmit={handleCreateReserve}>
              <div className="form-group">
                <label className="form-label">Reserve Amount (₹)</label>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  {['100', '200', '500', '1000'].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setReserveAmount(amt)}
                      className={`btn ${reserveAmount === amt ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ flex: 1, padding: '0.4rem' }}
                    >
                      ₹{amt}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  className="form-input"
                  min="1"
                  step="1"
                  value={reserveAmount}
                  onChange={(e) => setReserveAmount(e.target.value)}
                  placeholder="Enter amount in ₹"
                  required
                />
              </div>

              {riskLimit && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Tier: <strong>{riskLimit.risk_tier.name}</strong> • Max reserve:{' '}
                  ₹{(riskLimit.risk_tier.max_reserve_amount / 100).toFixed(0)} • Per-payment limit:{' '}
                  ₹{(riskLimit.risk_tier.max_per_payment_limit / 100).toFixed(0)}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary btn-block"
                disabled={submitting || !isOnline}
              >
                {submitting ? 'Locking & Signing...' : 'Lock Amount & Issue Certificate'}
              </button>
              {!isOnline && (
                <div style={{ fontSize: '0.775rem', color: 'var(--amber)', textAlign: 'center', marginTop: '0.4rem' }}>
                  Cannot issue certificates while offline. Resume online to provision reserves.
                </div>
              )}
            </form>
          </div>
        )}

        {/* Section 2: Active Allowance Certificate Card */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <ShieldCheck size={18} color="var(--emerald)" />
              <span>Active Allowance Certificate</span>
            </div>
            <span className={`badge ${activeCert ? 'badge-emerald' : 'badge-gray'}`}>
              {activeCert ? 'Ready to Spend' : 'None Active'}
            </span>
          </div>

          {activeCert ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Certificate ID</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 600 }}>
                  {activeCert.certificate_id.slice(0, 14)}...
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Reserve Amount</span>
                <span style={{ fontWeight: 700, color: 'var(--emerald)' }}>
                  ₹{(activeCert.reserve_amount / 100).toFixed(2)}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Max Per Payment</span>
                <span style={{ fontWeight: 600 }}>
                  ₹{(activeCert.max_per_payment / 100).toFixed(2)}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Expires</span>
                <span style={{ fontSize: '0.85rem' }}>
                  {new Date(activeCert.expires_at).toLocaleDateString()} {new Date(activeCert.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Bank Signature</span>
                <span className="badge badge-emerald" style={{ fontSize: '0.7rem' }}>
                  ✓ Cryptographically Signed
                </span>
              </div>

              <div style={{ marginTop: '0.75rem', padding: '0.5rem', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                This certificate is verified by payees offline using the bank's public key.
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
              <Lock size={32} color="var(--text-light)" style={{ marginBottom: '0.5rem' }} />
              <div style={{ fontWeight: 600, color: 'var(--text-muted)' }}>No Active Certificate</div>
              <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                Lock an amount above to receive a digitally signed allowance certificate.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Section 3: Browser Device Key */}
      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-header">
          <div className="card-title">
            <Smartphone size={18} color="var(--primary)" />
            <span>Browser Device Identity & Hardware Key</span>
          </div>
          <span className="badge badge-emerald">ECDSA P-256</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', alignItems: 'center' }}>
          <div>
            <p style={{ marginBottom: '0.5rem' }}>
              Tokens are signed in this browser using the <strong>Web Crypto API</strong>. The private key never leaves
              your device.
            </p>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Device ID: <strong style={{ color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>{deviceKey?.deviceId || 'Loading...'}</strong>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Status: <span style={{ color: 'var(--emerald)', fontWeight: 600 }}>● Active & Bound to User</span>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '0.825rem' }}
              onClick={registerNewDevice}
              disabled={!isOnline}
            >
              <RefreshCw size={14} />
              <span>Re-register Device Key</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
