import React, { useState } from 'react';
import { X } from 'lucide-react';
import api from '../utils/api';

export default function DisputeModal({ transaction, onClose, onSuccess }) {
  const [reason, setReason] = useState('Payment charged twice / duplicate');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const reasons = [
    'Payment charged twice / duplicate',
    'Goods or service not received',
    'Incorrect amount charged',
    'Unauthorized payment token / counter reuse',
    'Other dispute'
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!transaction) return;

    setSubmitting(true);
    setError(null);

    try {
      const fullReason = notes ? `${reason}: ${notes}` : reason;
      await api.post('/disputes', {
        transaction_id: transaction.transaction_id,
        reason: fullReason,
        evidence_bundle: {
          client_timestamp: new Date().toISOString(),
          transaction_amount: transaction.amount,
          role: transaction.transaction_type || 'CUSTOMER'
        }
      });

      onSuccess();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to raise dispute');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3>Open Transaction Dispute</h3>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div style={{ background: 'var(--rose-bg)', color: 'var(--rose-text)', padding: '0.65rem', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        <div style={{ background: 'var(--bg-subtle)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', fontSize: '0.85rem' }}>
          <div>Transaction: <strong style={{ fontFamily: 'var(--font-mono)' }}>{transaction.transaction_id.slice(0, 12)}...</strong></div>
          <div>Amount: <strong>₹{(transaction.amount / 100).toFixed(2)}</strong></div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
            Cryptographic evidence (certificate, signed token, receipt) will be automatically attached for bank analyst review.
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Dispute Reason</label>
            <select
              className="form-select"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              {reasons.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Additional Details (Optional)</label>
            <textarea
              className="form-textarea"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Provide any additional details for the bank analyst..."
            />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-danger" style={{ flex: 1 }} disabled={submitting}>
              {submitting ? 'Submitting Dispute...' : 'Submit to Bank Analyst'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
