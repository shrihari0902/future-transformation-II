# Threat Model & Security Analysis

## Project Title
**Offline Payment System with Double-Spend Protection**

---

## 1. Threat Landscape & Assumptions

Operating in an offline, air-gapped environment creates fundamental challenges:
- **No Global Real-Time Consensus:** Payer and merchant browsers cannot contact a central bank or blockchain consensus during a network partition.
- **Client Untrusted Boundary:** Code running in a payer or merchant browser can be modified or manipulated.
- **Physical Device Access:** Attackers may attempt to copy storage, repeat requests, or modify network payloads.

---

## 2. Threat Analysis & Mitigations

### Threat 1: Malicious Payer (Double-Spending Offline Reserve)
* **Attack Scenario:**  
  A customer locks ₹500 into an offline reserve, disconnects their device, and generates two separate valid payment tokens of ₹400 each to two different offline merchants (Merchant A and Merchant B), spending a total of ₹800 from a ₹500 reserve.
* **Mitigation:**  
  1. **Provisional Offline Acceptance:** Merchants are explicitly informed in the UI that offline token acceptance is *provisional* and does not guarantee settlement.
  2. **Reserve-Bounded Loss:** The bank's settlement engine enforces a strict cap: total payouts from a reserve can never exceed the initial locked amount.
  3. **Deterministic Settlement Policy:** When conflicting transactions arrive:
     - The first claim that fits within the available reserve is settled.
     - Conflicting or excess claims that would overdraw the reserve are automatically **FLAGGED** (`DOUBLE-SPEND DETECTED`), triggering an investigation in the Analyst Queue.
     - The reserve balance never goes negative.
  4. **Risk Tiers:** Untrusted or newly created accounts are assigned strict reserve caps (e.g., ₹500 maximum reserve).

---

### Threat 2: Token Tampering & Amount Inflation
* **Attack Scenario:**  
  A merchant or man-in-the-middle alters the payment amount on a token from ₹100 to ₹1,000 before uploading it to the backend.
* **Mitigation:**  
  1. The payment token payload is canonically serialized and digitally signed by the payer device's ECDSA P-256 private key.
  2. Any alteration of the amount, payee, counter, or nonce invalidates the digital signature.
  3. Both the merchant browser (offline) and the backend (online) verify the payer's digital signature and reject tampered tokens immediately.

---

### Threat 3: Replay Attacks (Token Resubmission)
* **Attack Scenario:**  
  An attacker intercepts a valid payment token and submits it ten times to the bank backend or presents it to the same merchant again.
* **Mitigation:**  
  1. **At Merchant Level (Offline):** The merchant's IndexedDB stores all accepted nonces (`seen_nonces`). Resubmitted nonces are rejected locally.
  2. **At Backend Level (Online):** 
     - **Idempotency:** Re-uploading the exact same transaction ID produces zero additional financial movements (returns existing settlement record).
     - **Nonce Uniqueness:** Reusing an existing nonce with a modified transaction ID triggers `REPLAY ATTACK DETECTED` and is flagged.
     - **Database Unique Constraints:** SQL level constraints on `nonce` enforce protocol integrity.

---

### Threat 4: Sequence Counter Rollback / Reordering
* **Attack Scenario:**  
  An attacker resets their local device counter to 1 after having already reached counter 5, attempting to create divergent transaction histories.
* **Mitigation:**  
  1. The merchant terminal tracks the highest observed sequence counter per payer device in IndexedDB (`device_counters`). Any token with `counter <= highest_observed` is rejected offline.
  2. The backend database enforces a unique constraint on `(payer_device_id, counter)`. Counter reuse is flagged immediately as a replay/fraud attempt.

---

### Threat 5: Device Key Compromise
* **Attack Scenario:**  
  An attacker extracts the device private key from browser storage.
* **Mitigation:**  
  1. Keys are generated via the Web Crypto API.
  2. In production deployments, keys can be set to `extractable: false`, using the browser's cryptographic hardware boundary (WebAuthn / TPM / Secure Enclave).
  3. Exposure of a single device key does not compromise the bank or any other user.
  4. Allowance certificates have strict expiration windows (e.g., 7 days) and per-payment caps.

---

### Threat 6: Compromised Bank Signing Key
* **Attack Scenario:**  
  An attacker obtains the Bank's private signing key.
* **Mitigation:**  
  1. Server private keys are stored outside the source code repository in environment variables or hardware key stores.
  2. Private keys are never exposed in API responses or client-side assets.
  3. Bank keys support rotation and public key distribution endpoints (`/api/certificates/public-key`).

---

### Threat 7: Network Interruption During Synchronization
* **Attack Scenario:**  
  The network drops midway through syncing a batch of queued offline transactions.
* **Mitigation:**  
  1. The client never deletes a queued transaction from IndexedDB until the server confirms settlement or flag recording.
  2. The server's synchronization endpoint is fully idempotent; safe to retry repeatedly without duplicate debits or credits.

---

## 3. Residual Risks & Honest Trade-offs

| Residual Risk | Severity | Discussion & Trade-Off |
| :--- | :--- | :--- |
| **Merchant Provisional Exposure** | Medium | In an air-gapped partitioned environment without global connectivity, mathematical prevention of a customer spending the same offline allowance across two disconnected physical merchants is physically impossible (CAP Theorem / Two Generals' Problem). The system bounds total bank loss to the reserve and shifts recourse to legal/analyst dispute procedures with cryptographic proof of fraud. |
| **Device Storage Deletion** | Low | If a user clears their browser storage before synchronization, pending local records may be lost unless the merchant also synchronizes their receipt. The dual-sync design (either customer or merchant can upload) mitigates this risk. |
