import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowUpRight,
  Copy,
  Check,
  QrCode,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  getAllCertificates,
  getNextOutgoingCounter,
  addToSyncQueue
} from '../utils/storage';
import { signPayload } from '../utils/crypto';

export default function Pay() {
  const { user, deviceKey } = useAuth();

  const [certificates, setCertificates] = useState([]);
  const [selectedCert, setSelectedCert] = useState(null);
  const [payeeId, setPayeeId] = useState('merchant');
  const [amount, setAmount] = useState('150');
  const [generatedToken, setGeneratedToken] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadCertificates();
  }, [user]);

  const loadCertificates = async () => {
    try {
      const certs = await getAllCertificates();
      setCertificates(certs);
      if (certs.length > 0) {
        setSelectedCert(certs[0]);
      }
    } catch (e) {
      console.warn('Could not load certificates from IndexedDB:', e);
    }
  };

  const handleGeneratePayment = async (e) => {
    e.preventDefault();
    setError(null);

    if (!selectedCert) {
      setError('No active allowance certificate found. Please lock an offline reserve in the Wallet tab first.');
      return;
    }

    if (!deviceKey?.keypair?.privateKey) {
      setError('Browser device key not found. Please register your device in the Wallet tab.');
      return;
    }

    const amountInPaise = Math.round(parseFloat(amount) * 100);
    if (isNaN(amountInPaise) || amountInPaise <= 0) {
      setError('Please enter a valid payment amount.');
      return;
    }

    const certMax = selectedCert.max_per_payment || selectedCert.payload?.max_per_payment;
    if (certMax && amountInPaise > certMax) {
      setError(`Amount exceeds this certificate's per-payment limit of ₹${(certMax / 100).toFixed(2)}.`);
      return;
    }

    setLoading(true);

    try {
      // 1. Strictly increment local hardware/browser counter
      const counter = await getNextOutgoingCounter(deviceKey.deviceId);

      // 2. Generate unique nonce
      const nonce = 'non_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
      const txId = crypto.randomUUID();

      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

      // 3. Construct canonical token payload
      const tokenPayload = {
        transaction_id: txId,
        certificate_id: selectedCert.certificate_id,
        payer_device_id: deviceKey.deviceId,
        payer_user_id: user.id,
        payee_id: payeeId.trim(),
        amount: amountInPaise,
        nonce,
        counter,
        issued_at: now.toISOString(),
        expires_at: expiresAt.toISOString()
      };

      // 4. Sign token with local browser private key (ECDSA P-256)
      const tokenSignature = await signPayload(deviceKey.keypair.privateKey, tokenPayload);

      // 5. Build full bundle
      const tokenBundle = {
        token_payload: tokenPayload,
        token_signature: tokenSignature,
        payer_public_key: deviceKey.publicKeySpki,
        certificate: {
          payload: selectedCert.payload || {
            certificate_id: selectedCert.certificate_id,
            device_id: selectedCert.device_id,
            payer_user_id: selectedCert.user_id,
            reserve_amount: selectedCert.reserve_amount,
            max_per_payment: selectedCert.max_per_payment,
            issued_at: selectedCert.issued_at,
            expires_at: selectedCert.expires_at
          },
          signature: selectedCert.signature
        }
      };

      setGeneratedToken(tokenBundle);

      // 6. Record in local sync queue
      await addToSyncQueue({
        transaction_id: txId,
        role: 'PAYER',
        payee_id: payeeId,
        amount: amountInPaise,
        counter,
        status: 'OFFLINE_GENERATED',
        created_at: now.toISOString(),
        bundle: tokenBundle
      });

    } catch (err) {
      console.error('Offline token generation error:', err);
      setError('Failed to sign offline token: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyBundle = () => {
    if (!generatedToken) return;
    navigator.clipboard.writeText(JSON.stringify(generatedToken, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <h1>Pay Offline</h1>
        <p>
          Create and sign a payment token using your browser's private key. The payee can verify this
          without an internet connection.
        </p>
      </div>

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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
        {/* Form Card */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <ArrowUpRight size={18} color="var(--primary)" />
              <span>Create Offline Payment</span>
            </div>
            <span className="badge badge-emerald">Works Offline</span>
          </div>

          <form onSubmit={handleGeneratePayment}>
            {/* Certificate Selector */}
            <div className="form-group">
              <label className="form-label">Allowance Certificate</label>
              {certificates.length > 0 ? (
                <select
                  className="form-select"
                  value={selectedCert?.certificate_id || ''}
                  onChange={(e) => {
                    const cert = certificates.find((c) => c.certificate_id === e.target.value);
                    setSelectedCert(cert);
                  }}
                >
                  {certificates.map((c) => (
                    <option key={c.certificate_id} value={c.certificate_id}>
                      Cert: {c.certificate_id.slice(0, 8)}... (Reserve: ₹{(c.reserve_amount / 100).toFixed(0)} | Max: ₹{(c.max_per_payment / 100).toFixed(0)})
                    </option>
                  ))}
                </select>
              ) : (
                <div style={{ padding: '0.6rem', background: 'var(--amber-bg)', color: 'var(--amber-text)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
                  No certificate in local vault. Lock an offline reserve in the Wallet tab first.
                </div>
              )}
            </div>

            {/* Payee ID */}
            <div className="form-group">
              <label className="form-label">Payee Username or Merchant ID</label>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <button
                  type="button"
                  className={`btn ${payeeId === 'merchant' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, padding: '0.35rem', fontSize: '0.8rem' }}
                  onClick={() => setPayeeId('merchant')}
                >
                  merchant
                </button>
                <button
                  type="button"
                  className={`btn ${payeeId === 'customer2' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, padding: '0.35rem', fontSize: '0.8rem' }}
                  onClick={() => setPayeeId('customer2')}
                >
                  customer2
                </button>
              </div>
              <input
                type="text"
                className="form-input"
                value={payeeId}
                onChange={(e) => setPayeeId(e.target.value)}
                placeholder="e.g. merchant"
                required
              />
            </div>

            {/* Amount */}
            <div className="form-group">
              <label className="form-label">Payment Amount (₹)</label>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                {['50', '150', '300'].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setAmount(amt)}
                    className={`btn ${amount === amt ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1, padding: '0.35rem', fontSize: '0.8rem' }}
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
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount in ₹"
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={loading || !selectedCert}
            >
              {loading ? 'Signing in Browser...' : 'Sign Offline Payment Token'}
            </button>
          </form>
        </div>

        {/* Generated Token & QR Card */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <QrCode size={18} color="var(--primary)" />
              <span>Signed Token Bundle</span>
            </div>
            {generatedToken && <span className="badge badge-emerald">Ready for Payee</span>}
          </div>

          {generatedToken ? (
            <div>
              {/* QR Code */}
              <div className="qr-container">
                <QRCodeSVG
                  value={JSON.stringify(generatedToken)}
                  size={190}
                  level="M"
                />
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem', textAlign: 'center' }}>
                  Payee can scan this QR code completely offline.
                </div>
              </div>

              {/* Amount and Counter Summary */}
              <div style={{ background: 'var(--bg-subtle)', padding: '0.75rem', borderRadius: 'var(--radius-md)', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Amount:</span>
                  <strong>₹{(generatedToken.token_payload.amount / 100).toFixed(2)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Sequence Counter:</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>#{generatedToken.token_payload.counter}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Payee ID:</span>
                  <span>{generatedToken.token_payload.payee_id}</span>
                </div>
              </div>

              {/* 1-Click Copy Button */}
              <button
                type="button"
                className={`btn ${copied ? 'btn-success' : 'btn-secondary'} btn-block`}
                onClick={handleCopyBundle}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                <span>{copied ? 'Copied to Clipboard!' : 'Copy Token Bundle JSON'}</span>
              </button>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '0.4rem' }}>
                Paste into the "Receive Payment" screen on the merchant device.
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <QrCode size={40} color="var(--text-light)" style={{ marginBottom: '0.5rem' }} />
              <div style={{ fontWeight: 600, color: 'var(--text-muted)' }}>No Token Generated Yet</div>
              <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                Fill the form on the left and click "Sign Offline Payment Token".
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
