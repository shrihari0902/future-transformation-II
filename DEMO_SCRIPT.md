# Demonstration Script: 5 Core Scenarios

This document provides exact, reproducible step-by-step instructions for demonstrating the 5 required core payment and security scenarios.

---

## Prerequisites
1. Start the backend:
   ```bash
   backend\venv\Scripts\python -m uvicorn app.main:app --port 8000
   ```
2. Start the frontend:
   ```bash
   cd frontend
   npm run dev
   ```
3. Open browser at `http://localhost:5173`.
4. Ensure demo data is reset:
   ```bash
   backend\venv\Scripts\python reset_demo.py
   ```

---

## Scenario 1: Normal Offline Payment Settles Upon Sync

**Objective:** Verify that a legitimate offline payment token is generated without network connectivity, verified by the merchant, and settles exactly once when synchronized.

1. **Login as Customer 1:**
   - Go to `http://localhost:5173/login`.
   - Click the **"Customer 1"** quick login button (or enter `customer1` / `DemoPass123!`).
2. **Register Browser Device Key:**
   - Navigate to **"Device Key"** (`/device`).
   - Click **"Generate & Register Device Keypair"**.
   - Confirm the device ID and public key appear with status `Active & Registered`.
3. **Lock Offline Reserve:**
   - Navigate to **"Wallet & Reserve"** (`/wallet`).
   - In "Add to Offline Reserve", enter `500` (₹500.00 = 50,000 paise).
   - Click **"Lock Amount & Issue Certificate"**.
   - Notice available balance decreases by ₹500, reserved balance increases by ₹500.
4. **Simulate Offline Mode & Pay:**
   - In the top navigation bar, click **"Simulate Offline"**. Status changes to amber **"Offline Mode"**.
   - Navigate to **"Pay Offline"** (`/pay`).
   - Select the newly issued allowance certificate.
   - Enter Merchant ID: `merchant`.
   - Enter Amount: `150` (₹150.00).
   - Click **"Sign Offline Payment Token"**.
   - Notice the QR code and Token Bundle JSON are generated. Copy the token bundle or keep it on screen.
5. **Receive Offline Payment as Merchant:**
   - Open an incognito window (or log out and log in as `merchant`).
   - If merchant has not yet registered a device key, click **"Device Key"** and register once.
   - Click **"Simulate Offline"**.
   - Navigate to **"Receive Payment"** (`/receive`).
   - Paste the token JSON bundle into the input box and click **"Verify & Provisionally Accept"**.
   - Observe:
     - All 10 verification checks turn **GREEN**!
     - Status banner displays: `ACCEPTED (PROVISIONAL) - ₹150.00`.
     - Signed merchant receipt is generated and saved in IndexedDB!
6. **Resume Online & Synchronize:**
   - In the navbar, click **"Resume Online"**.
   - Navigate to **"Offline Sync Queue"** (`/sync-queue`).
   - Click **"Sync Now"**.
   - Status updates from `Accepted Offline` to **`Settled`**!
   - Merchant available balance increases by ₹150, customer reserve balance decreases by ₹150.

---

## Scenario 2: Double-Spend Detection & Reserve Bounding

**Objective:** Demonstrate an attacker attempting to spend more than their reserve across two payees during a network partition. Confirm excess claim is flagged and the reserve is never overdrawn.

1. **Customer Creates a ₹400 Reserve:**
   - Log in as `customer1`.
   - Go to `/wallet`, lock `400` into a reserve.
2. **Simulate Offline:**
   - Click **"Simulate Offline"**.
3. **Generate Conflicting Claim 1 (₹300 to Merchant):**
   - Go to `/pay`, enter Payee: `merchant`, Amount: `300`. Click **"Sign Offline Payment Token"**.
   - Copy Token 1.
4. **Generate Conflicting Claim 2 (₹300 to Customer 2):**
   - In `/pay`, enter Payee: `customer2`, Amount: `300`. Click **"Sign Offline Payment Token"**.
   - Total attempted spending = ₹300 + ₹300 = ₹600 from a ₹400 reserve!
5. **Synchronize Transactions:**
   - Click **"Resume Online"**.
   - Go to **"Offline Sync Queue"** (`/sync-queue`).
   - Click **"Sync Now"**.
6. **Observe Settlement & Double-Spend Flag:**
   - Claim 1 settles successfully: `SETTLED (₹300.00)`.
   - Claim 2 is rejected and flagged:  
     `FLAGGED: DOUBLE-SPEND DETECTED: Claim amount 30000 paise exceeds available reserve balance 10000 paise`.
   - Reserve balance stays at ₹100; total payout NEVER exceeds the ₹400 reserve!
7. **Inspect in Analyst Dashboard:**
   - Log in as `analyst` (`analyst` / `DemoPass123!`).
   - Navigate to **"Flagged & Suspicious"** (`/analyst/flags`).
   - The double-spend attempt appears with the exact reason and cryptographic evidence bundle.

---

## Scenario 3: Replay Attack Rejected

**Objective:** Verify that an attacker resubmitting an already processed payment token or reusing a nonce is rejected.

1. **Attempt Replay on Merchant Terminal:**
   - Log in as `merchant`.
   - Go to `/receive`.
   - Paste an already accepted token bundle and click **"Verify & Provisionally Accept"**.
   - Result: **`PAYMENT REJECTED`**.
   - Check #9 fails: `Local Nonce Replay Protection: Nonce has already been accepted locally.`
2. **Attempt Replay on Server Sync:**
   - If an attacker submits a new transaction ID with an existing nonce:
   - Server responds: `FLAGGED: REPLAY ATTACK DETECTED: Nonce was previously used`.
   - Zero additional settlements are produced.

---

## Scenario 4: Expired Certificate Rejected Offline

**Objective:** Verify that the merchant's browser detects and rejects expired allowance certificates offline without calling the bank.

1. **Create Expired Certificate or Test via Pytest:**
   - Run the automated test scenario:
     ```bash
     backend\venv\Scripts\python -m pytest backend/tests/test_all_scenarios.py -k test_4_expired_certificate -v
     ```
   - In the frontend: If a token contains a certificate with `expires_at` in the past, pasting it into `/receive` immediately displays:
     - Check #2 failed: `Allowance Certificate Expiration: Certificate has expired.`
     - Result: **`PAYMENT REJECTED`**.

---

## Scenario 5: Idempotency (Uploaded 10 Times)

**Objective:** Confirm that uploading the exact same valid transaction 10 times produces exactly 1 settlement and no duplicate financial ledger movements.

1. **Run Idempotency Verification Test:**
   - Run:
     ```bash
     backend\venv\Scripts\python -m pytest backend/tests/test_all_scenarios.py -k test_5_idempotency_ten_uploads -v
     ```
   - Result:
     - All 10 upload calls return HTTP 200 with `status: SETTLED` (`Transaction already processed and settled (idempotent response)`).
     - Verified: exactly 1 database `Settlement` record and exactly 1 pair of ledger entries exist.

---

## Automated Verification of All 5 Scenarios
Run the entire automated suite anytime to verify all scenarios simultaneously:
```bash
backend\venv\Scripts\python -m pytest backend/tests/test_all_scenarios.py -v
```
All 9 scenario tests pass with 100% green output.
