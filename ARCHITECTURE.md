# System Architecture

## Project Title
**Offline Payment System with Double-Spend Protection**

---

## 1. High-Level Architecture Overview

OfflinePay is a resilient, privacy-preserving, cryptographically authenticated payment architecture designed for scenarios with intermittent or zero internet connectivity. The application operates in three distinct phases:

1. **Pre-Offline Liquidity Provisioning (Online):**  
   The customer connects to the bank server to lock an amount from their available balance into an offline reserve. The bank issues an asymmetric, digitally signed **Allowance Certificate** bound to the customer's registered browser device key.
2. **Offline Transaction Exchange (Offline / Air-Gapped):**  
   The payer's browser constructs a canonical payment token, increments its hardware/browser counter, and signs the token with its local ECDSA P-256 private key via the browser's native **Web Crypto API**. The merchant's browser receives the token (via QR code or copy-paste) and verifies the bank certificate, limits, expiration, payer signature, and sequence counter **completely offline** before issuing a signed receipt.
3. **Post-Partition Settlement & Adjudication (Reconnected):**  
   Once network connectivity returns, either party uploads the queued transaction evidence to the backend. The server enforces idempotency, validates all signatures, enforces reserve-bounded loss, flags conflicting claims (double-spending), and executes immutable double-entry ledger movements.

---

## 2. Component Diagram

```mermaid
graph TD
    subgraph Client Browser [Client Browser Environment]
        WC[Web Crypto API (ECDSA P-256)]
        IDB[(IndexedDB Storage)]
        UI[React + Vite Frontend]
        SW[Service Worker Cache]
        
        UI -->|Generate KeyPair| WC
        UI -->|Store Token & Receipts| IDB
        WC -->|Sign / Verify| UI
    end

    subgraph Transport [Network Layer]
        API[REST API / JSON]
        QR[QR Code / Text Token Bundle]
    end

    subgraph Backend Server [FastAPI Backend Service]
        ROUTER[FastAPI REST Endpoints]
        AUTH[JWT & Role RBAC]
        SETTLE[Deterministic Settlement Engine]
        CRYPTO[Server Cryptography (P-256)]
        
        ROUTER --> AUTH
        ROUTER --> SETTLE
        SETTLE --> CRYPTO
    end

    subgraph Storage [Persistent Storage]
        DB[(MySQL 8.0 Database)]
        LEDGER[Immutable Financial Ledger]
        AUDIT[Audit Logs]
        
        SETTLE --> DB
        SETTLE --> LEDGER
        SETTLE --> AUDIT
    end

    UI -.->|Offline Exchange| QR
    UI -->|Online Sync| API
    API --> ROUTER
```

---

## 3. Detailed Component Breakdown

### A. React Frontend & State Management
- **Framework:** React 19 bootstrapped with Vite.
- **Routing:** Protected layout using React Router with role-based routing (Customer, Merchant, Analyst).
- **Network State:** React Context dynamically tracking `navigator.onLine` with a simulated offline toggle button for testing and demonstrations without cutting system Wi-Fi.
- **User Interface:** Modern fintech aesthetic built with Vanilla CSS variables, responsive grids, and Lucide React iconography.

### B. Browser-Side Cryptography (Web Crypto API)
- **Algorithm:** ECDSA with curve `P-256` (FIPS 186-4) and `SHA-256`.
- **Key Generation:** Keys are generated via `window.crypto.subtle.generateKey`.
- **Private Key Custody:** The private key is non-extractable and never transmitted across the network or logged.
- **Canonical Serialization:** All signed payloads are normalized using deterministic JSON canonicalization (sorted keys, no whitespace) ensuring identical byte sequences in JavaScript and Python.
- **Public Key Export:** Exported as base64-encoded `SubjectPublicKeyInfo` (SPKI) DER.

### C. IndexedDB Offline Storage
The browser maintains seven dedicated IndexedDB stores:
1. `device_keys`: Persists local browser device identities and CryptoKey instances.
2. `certificates`: Caches active allowance certificates signed by the bank.
3. `sync_queue`: Preserves offline-generated payments and receipts across page refreshes.
4. `merchant_receipts`: Stores merchant-generated signed receipts.
5. `seen_nonces`: Prevents duplicate payment token reuse on the local merchant terminal.
6. `device_counters`: Tracks highest observed counter per payer device to prevent counter rollback.
7. `bank_cache`: Holds the bank's public verification key.

### D. FastAPI Backend & Settlement Engine
- **Framework:** Python 3.12 with FastAPI and Pydantic validation.
- **Security:** Argon2/Bcrypt password hashing, JWT bearer authentication, role-based authorization.
- **Deterministic Settlement Engine:**
  - Idempotent transaction processing.
  - Replay attack detection via database uniqueness constraints and nonce tracking.
  - Reserve-bounded loss: Settle claims strictly within the available reserve balance.
  - Concurrency control: Atomic transactions and database locking.
  - Double-spend detection: Excess claims exceeding remaining reserve are flagged for analyst review.

### E. Database & Immutable Financial Ledger
- **Engine:** MySQL 8.0 with SQLAlchemy ORM and `PyMySQL` driver.
- **Connection Pooling:** Configured with `pool_size=10`, `max_overflow=20`, `pool_recycle=3600`, and `pool_pre_ping=True`.
- **Automatic Database Provisioning:** The connection utility automatically issues `CREATE DATABASE IF NOT EXISTS offline_payments` upon startup.
All financial records are represented as integer minor units (paise) to eliminate floating-point rounding errors:
- Every reserve lock, settlement debit, credit, or dispute reversal produces an append-only `LedgerEntry` record with before/after balances.
- Balance derivation: Frontend balances are never trusted; all balances are computed and validated from server ledger state.
