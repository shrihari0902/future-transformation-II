import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  FileCheck2,
  CheckCircle2,
  Eye,
  RefreshCw,
  Clock
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNetwork } from '../context/NetworkContext';
import api from '../utils/api';

export default function Analyst() {
  const { user } = useAuth();
  const { isOnline } = useNetwork();

  const [flags, setFlags] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [selectedDisputeEvidence, setSelectedDisputeEvidence] = useState(null);
  const [selectedFlagEvidence, setSelectedFlagEvidence] = useState(null);
  const [decisionNotes, setDecisionNotes] = useState('');
  const [processingId, setProcessingId] = useState(null);
  const [message, setMessage] = useState(null);
  const [, setLoading] = useState(false);

  useEffect(() => {
    loadAnalystData();
  }, [user, isOnline]);

  const loadAnalystData = async () => {
    if (!isOnline) return;
    setLoading(true);
    try {
      const [flagsRes, disputesRes] = await Promise.all([
        api.get('/analyst/flags').catch(() => ({ data: [] })),
        api.get('/analyst/disputes').catch(() => ({ data: [] }))
      ]);
      setFlags(flagsRes.data || []);
      setDisputes(disputesRes.data || []);
    } catch (err) {
      console.warn('Could not load analyst data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDisputeDecision = async (disputeId, decision) => {
    setProcessingId(disputeId);
    setMessage(null);
    try {
      await api.post(`/analyst/disputes/${disputeId}/decision`, {
        decision,
        decision_notes: decisionNotes || `Analyst decision: ${decision}`
      });
      setMessage(`Dispute #${disputeId.slice(0, 8)} successfully resolved as ${decision}.`);
      setDecisionNotes('');
      await loadAnalystData();
    } catch (err) {
      alert('Error updating dispute: ' + (err.response?.data?.detail || err.message));
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <h1>Bank Risk & Analyst Operations</h1>
        <p>
          Investigate double-spend conflicts, overspend flags, and adjudicate disputes backed by
          cryptographic evidence bundles.
        </p>
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

      {/* Section 1: Flag Queue (Double-Spend & Overspend) */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="card-header">
          <div className="card-title">
            <ShieldAlert size={18} color="var(--rose)" />
            <span>Section 1: Double-Spend & Overspend Flag Queue ({flags.length})</span>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
            onClick={loadAnalystData}
          >
            <RefreshCw size={12} />
            <span>Refresh</span>
          </button>
        </div>

        <div style={{ padding: '0.65rem 0.85rem', background: 'var(--primary-subtle)', borderRadius: 'var(--radius-md)', marginBottom: '1rem', fontSize: '0.825rem', color: 'var(--primary)' }}>
          <strong>Bounded Loss Guarantee:</strong> When a customer double-spends an offline reserve across multiple merchants,
          the bank settles claims in sequence of sync strictly up to the reserve balance. Excess claims are flagged here with zero bank overdraw.
        </div>

        {flags.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {flags.map((tx) => (
              <div
                key={tx.id || tx.transaction_id}
                style={{
                  border: '1px solid var(--rose-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem',
                  background: 'var(--rose-bg)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="badge badge-rose">Flagged Incident</span>
                      <strong style={{ fontSize: '0.95rem' }}>
                        Attempted spend of ₹{(tx.amount / 100).toFixed(2)}
                      </strong>
                    </div>

                    <div style={{ fontSize: '0.8rem', color: 'var(--rose-text)', marginTop: '0.4rem', fontWeight: 600 }}>
                      Reason: {tx.flag_reason}
                    </div>

                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '0.25rem' }}>
                      Payer: {tx.payer_username || `ID ${tx.payer_user_id}`} • Payee: {tx.payee_username || `ID ${tx.payee_user_id}`} • Counter #{tx.counter}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                    onClick={async () => {
                      try {
                        const res = await api.get(`/transactions/${tx.transaction_id}`);
                        setSelectedFlagEvidence(res.data);
                      } catch (e) {
                        alert('Could not fetch details: ' + e.message);
                      }
                    }}
                  >
                    <Eye size={13} />
                    <span>View Evidence</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <CheckCircle2 size={32} color="var(--emerald)" style={{ marginBottom: '0.5rem' }} />
            <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>No Double-Spend Flags</div>
            <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
              All transactions have settled cleanly within reserve balances.
            </p>
          </div>
        )}
      </div>

      {/* Section 2: Dispute Adjudication List */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <FileCheck2 size={18} color="var(--primary)" />
            <span>Section 2: Dispute Resolution & Evidence Bundles ({disputes.length})</span>
          </div>
        </div>

        {disputes.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {disputes.map((d) => (
              <div
                key={d.id || d.dispute_id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem',
                  background: 'var(--bg-surface)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <strong style={{ fontSize: '0.95rem' }}>Dispute #{d.dispute_id.slice(0, 8)}</strong>
                      <span
                        className={`badge ${
                          d.status === 'OPEN'
                            ? 'badge-amber'
                            : d.status === 'RESOLVED_REFUNDED'
                            ? 'badge-emerald'
                            : 'badge-gray'
                        }`}
                      >
                        {d.status}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', marginTop: '0.35rem' }}>
                      <strong>Reason:</strong> {d.reason}
                    </div>

                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      Transaction: {d.transaction_id.slice(0, 14)}... • Raised at {new Date(d.created_at).toLocaleString()}
                    </div>

                    {d.decision_notes && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.4rem', fontStyle: 'italic' }}>
                        Analyst Note: "{d.decision_notes}"
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {d.evidence_bundle_json && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                        onClick={() => setSelectedDisputeEvidence(JSON.parse(d.evidence_bundle_json))}
                      >
                        <Eye size={13} />
                        <span>Inspect Evidence</span>
                      </button>
                    )}

                    {d.status === 'OPEN' && (
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <button
                          type="button"
                          className="btn btn-success"
                          style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                          onClick={() => handleDisputeDecision(d.dispute_id, 'RESOLVED_REFUNDED')}
                          disabled={processingId === d.dispute_id}
                        >
                          Refund Customer
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                          onClick={() => handleDisputeDecision(d.dispute_id, 'RESOLVED_REJECTED')}
                          disabled={processingId === d.dispute_id}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <Clock size={32} color="var(--text-light)" style={{ marginBottom: '0.5rem' }} />
            <div style={{ fontWeight: 600, color: 'var(--text-muted)' }}>No Disputes Raised</div>
            <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
              Customers or merchants can open disputes from their transaction history.
            </p>
          </div>
        )}
      </div>

      {/* Evidence Modal */}
      {(selectedDisputeEvidence || selectedFlagEvidence) && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '620px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3>Cryptographic Evidence Bundle</h3>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                onClick={() => {
                  setSelectedDisputeEvidence(null);
                  setSelectedFlagEvidence(null);
                }}
              >
                Close
              </button>
            </div>

            <div className="code-box" style={{ maxHeight: '350px' }}>
              {JSON.stringify(selectedDisputeEvidence || selectedFlagEvidence, null, 2)}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
              Evidence bundle contains the allowance certificate, token digital signature, merchant receipt, and non-repudiation proofs.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
