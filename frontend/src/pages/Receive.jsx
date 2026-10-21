import React, { useState } from 'react';
import {
  ArrowDownLeft,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  ShieldCheck,
  Receipt as ReceiptIcon,
  ClipboardPaste
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  verifySignature,
  canonicalJson,
  sha256Hex,
  signPayload
} from '../utils/crypto';
import {
  hasSeenNonce,
  recordSeenNonce,
  getLastCounterForDevice,
  updateLastCounterForDevice,
  addToSyncQueue
} from '../utils/storage';

export default function Receive() {
  const { user, deviceKey, bankPublicKey } = useAuth();

  const [tokenInput, setTokenInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verdict, setVerdict] = useState(null); // { status: 'ACCEPTED' | 'REJECTED', reason, amount, checks: [] }
  const [receipt, setReceipt] = useState(null);
  const [receiptCopied, setReceiptCopied] = useState(false);

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setTokenInput(text);
    } catch {
      alert('Clipboard access not permitted. Please paste manually into the box.');
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;

    setVerifying(true);
    setVerdict(null);
    setReceipt(null);

    const checks = [];
    const recordCheck = (name, passed, detail) => {
      checks.push({ name, passed, detail });
    };

    try {
      // 1. JSON Parsing
      let bundle;
      try {
        bundle = JSON.parse(tokenInput);
        recordCheck('Valid Token Bundle Format', true, 'Parsed valid JSON structure');
      } catch {
        recordCheck('Valid Token Bundle Format', false, 'Invalid JSON format');
        setVerdict({
          status: 'REJECTED',
          reason: 'Token payload is not valid JSON.',
          checks
        });
        setVerifying(false);
        return;
      }

      const { token_payload, token_signature, payer_public_key, certificate } = bundle;
      if (!token_payload || !token_signature || !payer_public_key || !certificate) {
        recordCheck('Required Bundle Elements', false, 'Missing payload, signature, public key, or certificate');
        setVerdict({
          status: 'REJECTED',
          reason: 'Token bundle is missing cryptographic proofs.',
          checks
        });
        setVerifying(false);
        return;
      }
      recordCheck('Required Bundle Elements', true, 'Token, signature, public key, and certificate present');

      const certPayload = certificate.payload;
      const certSig = certificate.signature;

      // 2. Allowance Certificate Expiration
      const now = new Date();
      const certExpiresAt = new Date(certPayload.expires_at);
      if (now > certExpiresAt) {
        recordCheck('Certificate Expiry', false, `Expired on ${certExpiresAt.toLocaleString()}`);
        setVerdict({
          status: 'REJECTED',
          reason: 'Allowance Certificate has expired. Customer must lock a fresh reserve.',
          checks
        });
        setVerifying(false);
        return;
      }
      recordCheck('Certificate Expiry', true, `Valid until ${certExpiresAt.toLocaleDateString()}`);

      // 3. Bank Signature Verification on Certificate
      if (!bankPublicKey) {
        recordCheck('Bank Verification Key', false, 'Bank public key missing from local vault');
        setVerdict({
          status: 'REJECTED',
          reason: 'Cannot verify certificate without bank public key in cache.',
          checks
        });
        setVerifying(false);
        return;
      }

      const isBankSigValid = await verifySignature(bankPublicKey, certPayload, certSig);
      if (!isBankSigValid) {
        recordCheck('Bank Signature on Certificate', false, 'Bank cryptographic signature failed verification');
        setVerdict({
          status: 'REJECTED',
          reason: 'Invalid bank signature on allowance certificate. Possible forgery.',
          checks
        });
        setVerifying(false);
        return;
      }
      recordCheck('Bank Signature on Certificate', true, 'Authentic bank signature verified via ECDSA P-256');

      // 4. Device Binding (Certificate device matches Token payer device)
      if (certPayload.device_id !== token_payload.payer_device_id) {
        recordCheck('Device Key Binding', false, 'Certificate device ID mismatch with token payer device');
        setVerdict({
          status: 'REJECTED',
          reason: 'Device key mismatch: Token was signed on a different device than certified by the bank.',
          checks
        });
        setVerifying(false);
        return;
      }
      recordCheck('Device Key Binding', true, `Device ${token_payload.payer_device_id.slice(0, 10)}... bound to certificate`);

      // 5. Payer Digital Signature on Token
      const isTokenSigValid = await verifySignature(payer_public_key, token_payload, token_signature);
      if (!isTokenSigValid) {
        recordCheck('Payer Token Digital Signature', false, 'Payer private key signature verification failed');
        setVerdict({
          status: 'REJECTED',
          reason: 'Token signature invalid: payment was altered or not signed by the payer device.',
          checks
        });
        setVerifying(false);
        return;
      }
      recordCheck('Payer Token Digital Signature', true, 'Payer ECDSA P-256 signature verified');

      // 6. Token Expiration
      const tokenExpiresAt = new Date(token_payload.expires_at);
      if (now > tokenExpiresAt) {
        recordCheck('Token Expiration', false, `Token expired at ${tokenExpiresAt.toLocaleTimeString()}`);
        setVerdict({
          status: 'REJECTED',
          reason: 'Payment token has expired.',
          checks
        });
        setVerifying(false);
        return;
      }
      recordCheck('Token Expiration', true, 'Token is active and not expired');

      // 7. Amount Limits
      if (token_payload.amount <= 0) {
        recordCheck('Amount Validation', false, 'Amount must be positive');
        setVerdict({
          status: 'REJECTED',
          reason: 'Payment amount must be greater than zero.',
          checks
        });
        setVerifying(false);
        return;
      }

      if (token_payload.amount > certPayload.max_per_payment) {
        recordCheck('Per-Payment Limit', false, `Amount ₹${(token_payload.amount/100).toFixed(2)} exceeds limit ₹${(certPayload.max_per_payment/100).toFixed(2)}`);
        setVerdict({
          status: 'REJECTED',
          reason: `Payment amount ₹${(token_payload.amount/100).toFixed(2)} exceeds certificate limit of ₹${(certPayload.max_per_payment/100).toFixed(2)}.`,
          checks
        });
        setVerifying(false);
        return;
      }
      recordCheck('Per-Payment Limit', true, `Amount within limit of ₹${(certPayload.max_per_payment/100).toFixed(2)}`);

      // 8. Local Nonce Replay Check
      const nonceAlreadySeen = await hasSeenNonce(token_payload.nonce);
      if (nonceAlreadySeen) {
        recordCheck('Local Nonce Freshness', false, `Nonce '${token_payload.nonce}' has already been processed locally`);
        setVerdict({
          status: 'REJECTED',
          reason: 'REPLAY ATTACK: This token has already been accepted on this terminal previously.',
          checks
        });
        setVerifying(false);
        return;
      }
      recordCheck('Local Nonce Freshness', true, 'Nonce is fresh and unseen on this terminal');

      // 9. Sequence Counter Check (Rollback Protection)
      const lastSeenCounter = await getLastCounterForDevice(token_payload.payer_device_id);
      if (token_payload.counter <= lastSeenCounter) {
        recordCheck(
          'Sequence Counter Check',
          false,
          `Counter #${token_payload.counter} is not higher than previously seen #${lastSeenCounter}`
        );
        setVerdict({
          status: 'REJECTED',
          reason: `COUNTER ROLLBACK: Payer counter (${token_payload.counter}) is not strictly greater than previous counter (${lastSeenCounter}).`,
          checks
        });
        setVerifying(false);
        return;
      }
      recordCheck(
        'Sequence Counter Check',
        true,
        `Counter #${token_payload.counter} is strictly increasing (previous was #${lastSeenCounter})`
      );

      // ALL CHECKS PASSED!
      // Generate Signed Receipt
      const tokenHash = await sha256Hex(canonicalJson(token_payload));
      const acceptedAt = new Date().toISOString();
      const merchantDeviceId = deviceKey?.deviceId || 'merchant_terminal';

      let receiptSig = 'offline_simulated_receipt_sig';
      if (deviceKey?.keypair?.privateKey) {
        const receiptPayload = {
          transaction_id: token_payload.transaction_id,
          token_hash: tokenHash,
          merchant_id: user.username,
          merchant_device_id: merchantDeviceId,
          amount: token_payload.amount,
          accepted_at: acceptedAt
        };
        receiptSig = await signPayload(deviceKey.keypair.privateKey, receiptPayload);
      }

      const signedReceipt = {
        transaction_id: token_payload.transaction_id,
        token_hash: tokenHash,
        merchant_id: user.username,
        merchant_device_id: merchantDeviceId,
        amount: token_payload.amount,
        accepted_at: acceptedAt,
        receipt_signature: receiptSig
      };

      // Record nonce and update last seen counter
      await recordSeenNonce(token_payload.nonce);
      await updateLastCounterForDevice(token_payload.payer_device_id, token_payload.counter);

      // Save to local sync queue for settlement upon reconnect
      const fullSyncItem = {
        token_payload,
        token_signature,
        payer_public_key,
        certificate,
        receipt: signedReceipt
      };

      await addToSyncQueue({
        transaction_id: token_payload.transaction_id,
        role: 'PAYEE',
        payer_username: `User #${token_payload.payer_user_id}`,
        amount: token_payload.amount,
        status: 'ACCEPTED_OFFLINE',
        created_at: acceptedAt,
        syncPayload: fullSyncItem,
        bundle
      });

      setReceipt(signedReceipt);
      setVerdict({
        status: 'ACCEPTED',
        amount: token_payload.amount,
        txId: token_payload.transaction_id,
        checks
      });

    } catch (err) {
      console.error('Verification error:', err);
      setVerdict({
        status: 'REJECTED',
        reason: 'Internal verification failure: ' + err.message,
        checks
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleCopyReceipt = () => {
    if (!receipt) return;
    navigator.clipboard.writeText(JSON.stringify(receipt, null, 2));
    setReceiptCopied(true);
    setTimeout(() => setReceiptCopied(false), 2000);
  };

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <h1>Receive Offline Payment</h1>
        <p>
          Verify payment tokens completely offline. No network required. The terminal validates bank
          signatures, limits, expiry, and sequences before issuing a signed receipt.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
        {/* Input Card */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <ArrowDownLeft size={18} color="var(--primary)" />
              <span>Paste Payment Token</span>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
              onClick={handlePasteClipboard}
            >
              <ClipboardPaste size={14} />
              <span>Paste from Clipboard</span>
            </button>
          </div>

          <form onSubmit={handleVerify}>
            <div className="form-group">
              <label className="form-label">Payment Token Bundle (JSON)</label>
              <textarea
                className="form-textarea"
                rows={9}
                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder='Paste {"token_payload": {...}, "token_signature": "...", ...}'
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={verifying || !tokenInput.trim()}
            >
              {verifying ? 'Running Cryptographic Verification...' : 'Verify & Provisionally Accept'}
            </button>
          </form>
        </div>

        {/* Verification Result Card */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <ShieldCheck size={18} color="var(--primary)" />
              <span>Offline Verification Verdict</span>
            </div>
            <span className="badge badge-emerald">Client-Side Engine</span>
          </div>

          {verdict ? (
            <div>
              {/* Verdict Banner */}
              {verdict.status === 'ACCEPTED' ? (
                <div
                  style={{
                    background: 'var(--emerald-bg)',
                    color: 'var(--emerald-text)',
                    border: '1px solid var(--emerald-border)',
                    padding: '1rem',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                  }}
                >
                  <CheckCircle2 size={32} color="var(--emerald)" />
                  <div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>
                      ACCEPTED (PROVISIONAL)
                    </div>
                    <div style={{ fontSize: '0.85rem' }}>
                      Payment of <strong>₹{(verdict.amount / 100).toFixed(2)}</strong> verified offline. Added to sync queue.
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    background: 'var(--rose-bg)',
                    color: 'var(--rose-text)',
                    border: '1px solid var(--rose-border)',
                    padding: '1rem',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: '1rem',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.75rem',
                  }}
                >
                  <XCircle size={28} color="var(--rose)" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>
                      PAYMENT REJECTED
                    </div>
                    <div style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}>
                      {verdict.reason}
                    </div>
                  </div>
                </div>
              )}

              {/* 10-point Verification Checklist */}
              <div style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                Cryptographic & Trust Checks
              </div>
              <div className="checklist">
                {verdict.checks.map((c, i) => (
                  <div key={i} className={`check-item ${c.passed ? 'passed' : 'failed'}`}>
                    {c.passed ? (
                      <CheckCircle2 size={16} color="var(--emerald)" style={{ flexShrink: 0, marginTop: '2px' }} />
                    ) : (
                      <XCircle size={16} color="var(--rose)" style={{ flexShrink: 0, marginTop: '2px' }} />
                    )}
                    <div>
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                      <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>{c.detail}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Signed Receipt (If Accepted) */}
              {receipt && (
                <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <ReceiptIcon size={16} color="var(--primary)" />
                      <span>Signed Merchant Receipt</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                      onClick={handleCopyReceipt}
                    >
                      {receiptCopied ? <Check size={12} /> : <Copy size={12} />}
                      <span>{receiptCopied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>

                  <div className="code-box">
                    {JSON.stringify(receipt, null, 2)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Merchant signature on token hash serves as non-repudiation proof for the customer.
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <ShieldCheck size={40} color="var(--text-light)" style={{ marginBottom: '0.5rem' }} />
              <div style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Ready for Verification</div>
              <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                Paste an offline payment token bundle on the left to execute the client-side cryptographic engine.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
