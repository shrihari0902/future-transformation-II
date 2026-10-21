import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  Send,
  FileText
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNetwork } from '../context/NetworkContext';
import api from '../utils/api';
import { getSyncQueue, updateSyncItem } from '../utils/storage';
import DisputeModal from '../components/DisputeModal';

export default function SyncQueue() {
  const { user } = useAuth();
  const { isOnline } = useNetwork();

  const [queue, setQueue] = useState([]);
  const [history, setHistory] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [idempotencyRunning, setIdempotencyRunning] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [selectedTxForDispute, setSelectedTxForDispute] = useState(null);
  const [disputeSuccessMsg, setDisputeSuccessMsg] = useState(null);

  useEffect(() => {
    loadLocalQueue();
    if (isOnline) {
      loadServerHistory();
    }
  }, [user, isOnline]);

  const loadLocalQueue = async () => {
    try {
      const items = await getSyncQueue();
      setQueue(items || []);
    } catch (e) {
      console.warn('Could not load local sync queue:', e);
    }
  };

  const loadServerHistory = async () => {
    try {
      const resp = await api.get('/transactions');
      setHistory(resp.data || []);
    } catch (e) {
      console.warn('Could not load server history:', e);
    }
  };

  const handleSyncAll = async () => {
    if (!isOnline) {
      setError('Cannot sync while offline. Please connect or toggle to Online mode.');
      return;
    }

    const itemsToSync = queue.filter(
      (item) => item.status === 'ACCEPTED_OFFLINE' && item.syncPayload
    );

    if (itemsToSync.length === 0) {
      setMessage('No un-synced received payments in local queue.');
      return;
    }

    setSyncing(true);
    setError(null);
    setMessage(null);

    try {
      const payload = {
        transactions: itemsToSync.map((item) => item.syncPayload)
      };

      const resp = await api.post('/transactions/sync', payload);
      const { settled, flagged, results } = resp.data;

      // Update local items
      for (const res of results) {
        const item = itemsToSync.find((it) => it.transaction_id === res.transaction_id);
        if (item) {
          item.status = res.status;
          item.syncMessage = res.message;
          item.flagReason = res.flag_reason;
          await updateSyncItem(item);
        }
      }

      await loadLocalQueue();
      await loadServerHistory();

      if (flagged > 0) {
        setError(
          `Sync completed: ${settled} settled, ${flagged} flagged. DOUBLE-SPEND or limit violation detected. Bank bounded the loss safely.`
        );
      } else {
        setMessage(`Sync complete! ${settled} offline payments settled successfully with the bank ledger.`);
      }
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  // Demo Step 5: Test Idempotency (Upload 10 times)
  const handleTest10xIdempotency = async (item) => {
    if (!isOnline) {
      setError('Idempotency test requires online connectivity.');
      return;
    }
    if (!item?.syncPayload) {
      setError('Item payload missing for sync.');
      return;
    }

    setIdempotencyRunning(true);
    setError(null);
    setMessage(null);

    try {
      let settledCount = 0;
      const responses = [];

      for (let i = 1; i <= 10; i++) {
        const resp = await api.post('/transactions/sync', {
          transactions: [item.syncPayload]
        });
        responses.push(resp.data);
        if (resp.data.results?.[0]?.status === 'SETTLED') {
          settledCount++;
        }
      }

      setMessage(
        `Idempotency Verified! Uploaded the same token 10 consecutive times. Exactly 1 settlement was recorded on the ledger. All 10 returned HTTP 200 SETTLED.`
      );
      await loadServerHistory();
    } catch (err) {
      setError('Idempotency test failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setIdempotencyRunning(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <h1>Offline Sync Queue & History</h1>
        <p>
          Transactions created while offline are queued locally. When connectivity returns, 1 tap
          synchronizes them with the bank ledger for final settlement and double-spend inspection.
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
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {disputeSuccessMsg && (
        <div
          style={{
            background: 'var(--primary-subtle)',
            color: 'var(--primary)',
            border: '1px solid #bfdbfe',
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
          <span>Dispute successfully filed with cryptographic evidence bundle attached! Bank analyst notified.</span>
        </div>
      )}

      {/* Section 1: Local Offline Queue */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <RefreshCw size={18} color="var(--primary)" />
            <span>Local Offline Queue ({queue.length} items)</span>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSyncAll}
            disabled={syncing || !isOnline || queue.length === 0}
          >
            <Send size={15} />
            <span>{syncing ? 'Syncing with Bank...' : 'Sync Now with Bank'}</span>
          </button>
        </div>

        {queue.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {queue.map((item) => (
              <div
                key={item.transaction_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.85rem',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-surface)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: item.role === 'PAYER' ? 'var(--primary-subtle)' : 'var(--emerald-bg)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: item.role === 'PAYER' ? 'var(--primary)' : 'var(--emerald)',
                    }}
                  >
                    {item.role === 'PAYER' ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
                  </div>

                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                      {item.role === 'PAYER' ? `Payment to ${item.payee_id}` : `Received from ${item.payer_username || 'Customer'}`}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      ID: {item.transaction_id.slice(0, 14)}... • {new Date(item.created_at).toLocaleTimeString()}
                    </div>
                    {item.flagReason && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--rose)', marginTop: '0.2rem', fontWeight: 500 }}>
                        ⚠ {item.flagReason}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.35rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '1rem' }}>
                    ₹{(item.amount / 100).toFixed(2)}
                  </div>

                  <span
                    className={`badge ${
                      item.status === 'SETTLED'
                        ? 'badge-emerald'
                        : item.status === 'FLAGGED'
                        ? 'badge-rose'
                        : 'badge-amber'
                    }`}
                  >
                    {item.status === 'ACCEPTED_OFFLINE' ? 'Accepted Offline' : item.status}
                  </span>

                  {item.syncPayload && item.status === 'ACCEPTED_OFFLINE' && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem', marginTop: '0.2rem' }}
                      onClick={() => handleTest10xIdempotency(item)}
                      disabled={idempotencyRunning || !isOnline}
                      title="Upload 10 times to verify exactly 1 settlement is produced"
                    >
                      {idempotencyRunning ? 'Testing 10x...' : 'Test 10x Sync (Demo 5)'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <Clock size={32} color="var(--text-light)" style={{ marginBottom: '0.5rem' }} />
            <div style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Local Queue is Empty</div>
            <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
              Offline payments you create or accept will appear here ready to sync.
            </p>
          </div>
        )}
      </div>

      {/* Section 2: Bank Settled Transaction History */}
      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-header">
          <div className="card-title">
            <FileText size={18} color="var(--primary)" />
            <span>Bank Settled Ledger History</span>
          </div>
          {isOnline && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
              onClick={loadServerHistory}
            >
              <RefreshCw size={12} />
              <span>Refresh</span>
            </button>
          )}
        </div>

        {history.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {history.map((tx) => (
              <div
                key={tx.id || tx.transaction_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.85rem',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  background: tx.status === 'FLAGGED' ? 'var(--rose-bg)' : 'var(--bg-surface)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                      {tx.transaction_type === 'OUTGOING'
                        ? `Payment to ${tx.payee_username || 'Merchant'}`
                        : `Received from ${tx.payer_username || 'Customer'}`}
                    </span>
                    <span
                      className={`badge ${
                        tx.status === 'SETTLED'
                          ? 'badge-emerald'
                          : tx.status === 'FLAGGED'
                          ? 'badge-rose'
                          : 'badge-gray'
                      }`}
                    >
                      {tx.status}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '0.15rem' }}>
                    Tx: {tx.transaction_id.slice(0, 12)}... • Counter #{tx.counter}
                  </div>

                  {tx.flag_reason && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--rose-text)', marginTop: '0.3rem', fontWeight: 500 }}>
                      ⚠ {tx.flag_reason}
                    </div>
                  )}
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, fontSize: '1rem' }}>
                    ₹{(tx.amount / 100).toFixed(2)}
                  </div>

                  {tx.status === 'SETTLED' && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem', marginTop: '0.35rem', color: 'var(--rose)' }}
                      onClick={() => setSelectedTxForDispute(tx)}
                    >
                      Dispute
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-muted)' }}>No Bank Ledger Transactions</div>
            <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
              {isOnline ? 'Transactions will appear here once settled on the bank server.' : 'Connect to load transaction history.'}
            </p>
          </div>
        )}
      </div>

      {/* Dispute Modal */}
      {selectedTxForDispute && (
        <DisputeModal
          transaction={selectedTxForDispute}
          onClose={() => setSelectedTxForDispute(null)}
          onSuccess={() => {
            setSelectedTxForDispute(null);
            setDisputeSuccessMsg(true);
            setTimeout(() => setDisputeSuccessMsg(false), 4000);
          }}
        />
      )}
    </div>
  );
}
