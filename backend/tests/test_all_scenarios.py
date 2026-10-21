import uuid
import json
import base64
from datetime import datetime, timezone, timedelta
import pytest
from httpx import AsyncClient, ASGITransport
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import hashes, serialization
from app.main import app
from app.core.crypto import canonical_json_bytes, der_to_raw_p1363
from app.seed import seed_database
from app.core.database import SessionLocal
from app.models import Wallet, Reserve, Settlement, LedgerEntry, Transaction


@pytest.fixture(autouse=True)
def setup_db():
    seed_database(reset=True)


def generate_test_device():
    """Generates an ECDSA P-256 keypair mimicking the Web Crypto API."""
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key = private_key.public_key()
    der_pub = public_key.public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    public_key_spki = base64.b64encode(der_pub).decode('ascii')
    device_id = str(uuid.uuid4())
    return device_id, public_key_spki, private_key


def sign_token(private_key, token_dict):
    """Signs a token canonical payload with a device private key (raw IEEE P1363 64 bytes)."""
    data = canonical_json_bytes(token_dict)
    der_sig = private_key.sign(data, ec.ECDSA(hashes.SHA256()))
    raw_sig = der_to_raw_p1363(der_sig)
    return base64.b64encode(raw_sig).decode('ascii')


async def login_user(client: AsyncClient, username: str, password: str = "DemoPass123!"):
    resp = await client.post("/api/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


@pytest.mark.asyncio
async def test_1_normal_offline_payment():
    """
    TEST 1: Normal offline payment
    - Issue a valid certificate.
    - Generate a valid signed token.
    - Upload the transaction.
    - Confirm that it settles exactly once.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Login as customer1
        token = await login_user(client, "customer1")
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Register device
        dev_id, dev_spki, dev_priv = generate_test_device()
        reg_resp = await client.post("/api/devices/register", json={
            "device_id": dev_id,
            "public_key_spki": dev_spki,
            "device_name": "Test iPhone"
        }, headers=headers)
        assert reg_resp.status_code == 200

        # 3. Create Reserve of ₹1,000 (100,000 paise)
        reserve_resp = await client.post("/api/reserves", json={
            "amount": 100000,
            "device_id": dev_id
        }, headers=headers)
        assert reserve_resp.status_code == 200
        res_data = reserve_resp.json()
        cert_data = res_data["certificate"]
        cert_id = cert_data["certificate_id"]

        # 4. Generate signed payment token for ₹200 (20,000 paise) to merchant
        now = datetime.now(timezone.utc)
        token_payload = {
            "transaction_id": str(uuid.uuid4()),
            "certificate_id": cert_id,
            "payer_device_id": dev_id,
            "payer_user_id": 1,
            "payee_id": "merchant",
            "amount": 20000,
            "nonce": str(uuid.uuid4()),
            "counter": 1,
            "issued_at": now.isoformat(),
            "expires_at": (now + timedelta(hours=2)).isoformat()
        }
        token_sig = sign_token(dev_priv, token_payload)

        # 5. Upload transaction for sync
        sync_payload = {
            "transactions": [{
                "token_payload": token_payload,
                "token_signature": token_sig,
                "payer_public_key": dev_spki,
                "certificate": {
                    "payload": json.loads(cert_data["raw_payload_json"]),
                    "signature": cert_data["signature"]
                }
            }]
        }
        sync_resp = await client.post("/api/transactions/sync", json=sync_payload, headers=headers)
        assert sync_resp.status_code == 200
        sync_result = sync_resp.json()
        assert sync_result["settled"] == 1
        assert sync_result["results"][0]["status"] == "SETTLED"
        assert sync_result["results"][0]["settled_amount"] == 20000


@pytest.mark.asyncio
async def test_2_double_spend_detection():
    """
    TEST 2: Double-spend
    - Create a reserve of 50,000 paise.
    - Create conflicting payment claims across two payees totaling 60,000 paise.
    - Upload the claims.
    - Confirm the conflicting/excess claim is flagged.
    - Confirm total settlement does not exceed the reserve.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await login_user(client, "customer1")
        headers = {"Authorization": f"Bearer {token}"}

        dev_id, dev_spki, dev_priv = generate_test_device()
        await client.post("/api/devices/register", json={
            "device_id": dev_id,
            "public_key_spki": dev_spki
        }, headers=headers)

        # Create reserve of 50,000 paise (₹500)
        reserve_resp = await client.post("/api/reserves", json={
            "amount": 50000,
            "device_id": dev_id
        }, headers=headers)
        assert reserve_resp.status_code == 200
        cert_data = reserve_resp.json()["certificate"]

        now = datetime.now(timezone.utc)
        # Claim 1: 30,000 paise to merchant
        t1 = {
            "transaction_id": str(uuid.uuid4()),
            "certificate_id": cert_data["certificate_id"],
            "payer_device_id": dev_id,
            "payer_user_id": 1,
            "payee_id": "merchant",
            "amount": 30000,
            "nonce": str(uuid.uuid4()),
            "counter": 1,
            "issued_at": now.isoformat(),
            "expires_at": (now + timedelta(hours=2)).isoformat()
        }
        sig1 = sign_token(dev_priv, t1)

        # Claim 2: 30,000 paise to customer2 (Total = 60,000 > 50,000 reserve)
        t2 = {
            "transaction_id": str(uuid.uuid4()),
            "certificate_id": cert_data["certificate_id"],
            "payer_device_id": dev_id,
            "payer_user_id": 1,
            "payee_id": "customer2",
            "amount": 30000,
            "nonce": str(uuid.uuid4()),
            "counter": 2,
            "issued_at": now.isoformat(),
            "expires_at": (now + timedelta(hours=2)).isoformat()
        }
        sig2 = sign_token(dev_priv, t2)

        cert_dict = {
            "payload": json.loads(cert_data["raw_payload_json"]),
            "signature": cert_data["signature"]
        }

        # Upload first claim
        resp1 = await client.post("/api/transactions/sync", json={
            "transactions": [{"token_payload": t1, "token_signature": sig1, "payer_public_key": dev_spki, "certificate": cert_dict}]
        }, headers=headers)
        assert resp1.json()["settled"] == 1

        # Upload second conflicting claim
        resp2 = await client.post("/api/transactions/sync", json={
            "transactions": [{"token_payload": t2, "token_signature": sig2, "payer_public_key": dev_spki, "certificate": cert_dict}]
        }, headers=headers)
        assert resp2.json()["flagged"] == 1
        assert "DOUBLE-SPEND" in resp2.json()["results"][0]["flag_reason"]

        # Confirm total settlement does not exceed reserve
        db = SessionLocal()
        total_settled = sum(s.settled_amount for s in db.query(Settlement).all())
        assert total_settled == 30000
        assert total_settled <= 50000
        db.close()


@pytest.mark.asyncio
async def test_3_replay_attack():
    """
    TEST 3: Replay attack
    - Upload a previously processed token again.
    - Confirm it does not produce another settlement.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await login_user(client, "customer1")
        headers = {"Authorization": f"Bearer {token}"}

        dev_id, dev_spki, dev_priv = generate_test_device()
        await client.post("/api/devices/register", json={"device_id": dev_id, "public_key_spki": dev_spki}, headers=headers)

        reserve_resp = await client.post("/api/reserves", json={"amount": 40000, "device_id": dev_id}, headers=headers)
        cert_data = reserve_resp.json()["certificate"]

        now = datetime.now(timezone.utc)
        t1 = {
            "transaction_id": str(uuid.uuid4()),
            "certificate_id": cert_data["certificate_id"],
            "payer_device_id": dev_id,
            "payer_user_id": 1,
            "payee_id": "merchant",
            "amount": 10000,
            "nonce": str(uuid.uuid4()),
            "counter": 1,
            "issued_at": now.isoformat(),
            "expires_at": (now + timedelta(hours=2)).isoformat()
        }
        sig1 = sign_token(dev_priv, t1)
        cert_dict = {"payload": json.loads(cert_data["raw_payload_json"]), "signature": cert_data["signature"]}

        # First upload
        resp1 = await client.post("/api/transactions/sync", json={
            "transactions": [{"token_payload": t1, "token_signature": sig1, "payer_public_key": dev_spki, "certificate": cert_dict}]
        }, headers=headers)
        assert resp1.json()["settled"] == 1

        # Replayed with different transaction ID but same nonce
        t_replay = dict(t1)
        t_replay["transaction_id"] = str(uuid.uuid4())
        sig_replay = sign_token(dev_priv, t_replay)

        resp2 = await client.post("/api/transactions/sync", json={
            "transactions": [{"token_payload": t_replay, "token_signature": sig_replay, "payer_public_key": dev_spki, "certificate": cert_dict}]
        }, headers=headers)
        assert resp2.json()["settled"] == 0
        assert resp2.json()["flagged"] == 1
        assert "REPLAY ATTACK" in resp2.json()["results"][0]["flag_reason"]


@pytest.mark.asyncio
async def test_4_expired_certificate():
    """
    TEST 4: Expired certificate
    - Create an expired certificate payload.
    - Confirm the upload rejects it.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await login_user(client, "customer1")
        headers = {"Authorization": f"Bearer {token}"}

        dev_id, dev_spki, dev_priv = generate_test_device()
        await client.post("/api/devices/register", json={"device_id": dev_id, "public_key_spki": dev_spki}, headers=headers)

        # Create expired cert
        expired_time = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
        cert_payload = {
            "certificate_id": str(uuid.uuid4()),
            "device_id": dev_id,
            "payer_user_id": 1,
            "reserve_amount": 50000,
            "max_per_payment": 50000,
            "issued_at": (datetime.now(timezone.utc) - timedelta(days=10)).isoformat(),
            "expires_at": expired_time
        }
        from app.core.crypto import sign_bank_payload
        cert_sig = sign_bank_payload(cert_payload)

        t1 = {
            "transaction_id": str(uuid.uuid4()),
            "certificate_id": cert_payload["certificate_id"],
            "payer_device_id": dev_id,
            "payer_user_id": 1,
            "payee_id": "merchant",
            "amount": 5000,
            "nonce": str(uuid.uuid4()),
            "counter": 1,
            "issued_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        }
        sig1 = sign_token(dev_priv, t1)

        resp = await client.post("/api/transactions/sync", json={
            "transactions": [{"token_payload": t1, "token_signature": sig1, "payer_public_key": dev_spki, "certificate": {"payload": cert_payload, "signature": cert_sig}}]
        }, headers=headers)
        assert resp.json()["settled"] == 0
        assert resp.json()["results"][0]["status"] == "REJECTED"
        assert "expired" in resp.json()["results"][0]["flag_reason"].lower()

        db = SessionLocal()
        assert db.query(Settlement).count() == 0
        # The session remains usable after the rejection path completes.
        assert db.query(Wallet).filter(Wallet.user_id == 1).one().available_balance > 0
        db.close()


@pytest.mark.asyncio
async def test_5_idempotency_ten_uploads():
    """
    TEST 5: Idempotency
    - Upload the same valid transaction ten times.
    - Confirm there is exactly one settlement and no duplicate financial ledger movements.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await login_user(client, "customer1")
        headers = {"Authorization": f"Bearer {token}"}

        dev_id, dev_spki, dev_priv = generate_test_device()
        await client.post("/api/devices/register", json={"device_id": dev_id, "public_key_spki": dev_spki}, headers=headers)

        reserve_resp = await client.post("/api/reserves", json={"amount": 40000, "device_id": dev_id}, headers=headers)
        cert_data = reserve_resp.json()["certificate"]

        now = datetime.now(timezone.utc)
        t1 = {
            "transaction_id": str(uuid.uuid4()),
            "certificate_id": cert_data["certificate_id"],
            "payer_device_id": dev_id,
            "payer_user_id": 1,
            "payee_id": "merchant",
            "amount": 15000,
            "nonce": str(uuid.uuid4()),
            "counter": 1,
            "issued_at": now.isoformat(),
            "expires_at": (now + timedelta(hours=2)).isoformat()
        }
        sig1 = sign_token(dev_priv, t1)
        cert_dict = {"payload": json.loads(cert_data["raw_payload_json"]), "signature": cert_data["signature"]}

        sync_body = {
            "transactions": [{"token_payload": t1, "token_signature": sig1, "payer_public_key": dev_spki, "certificate": cert_dict}]
        }

        # Upload 10 times consecutively
        for i in range(10):
            resp = await client.post("/api/transactions/sync", json=sync_body, headers=headers)
            assert resp.status_code == 200
            assert resp.json()["results"][0]["status"] == "SETTLED"

        # Verify database has exactly 1 settlement and 1 pair of settlement ledger entries
        db = SessionLocal()
        settlements = db.query(Settlement).filter(Settlement.transaction_id == t1["transaction_id"]).all()
        assert len(settlements) == 1
        assert settlements[0].settled_amount == 15000

        tx_ledgers = db.query(LedgerEntry).filter(LedgerEntry.reference_id == t1["transaction_id"]).all()
        assert len(tx_ledgers) == 2  # Exactly 1 debit for payer, 1 credit for merchant
        db.close()


@pytest.mark.asyncio
async def test_6_invalid_signature():
    """
    TEST 6: Invalid signature
    - Modify the token after signing.
    - Confirm verification fails.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await login_user(client, "customer1")
        headers = {"Authorization": f"Bearer {token}"}

        dev_id, dev_spki, dev_priv = generate_test_device()
        await client.post("/api/devices/register", json={"device_id": dev_id, "public_key_spki": dev_spki}, headers=headers)

        reserve_resp = await client.post("/api/reserves", json={"amount": 40000, "device_id": dev_id}, headers=headers)
        cert_data = reserve_resp.json()["certificate"]

        now = datetime.now(timezone.utc)
        t1 = {
            "transaction_id": str(uuid.uuid4()),
            "certificate_id": cert_data["certificate_id"],
            "payer_device_id": dev_id,
            "payer_user_id": 1,
            "payee_id": "merchant",
            "amount": 10000,
            "nonce": str(uuid.uuid4()),
            "counter": 1,
            "issued_at": now.isoformat(),
            "expires_at": (now + timedelta(hours=2)).isoformat()
        }
        sig1 = sign_token(dev_priv, t1)

        # Tamper with the amount after signing!
        t1_tampered = dict(t1)
        t1_tampered["amount"] = 25000

        cert_dict = {"payload": json.loads(cert_data["raw_payload_json"]), "signature": cert_data["signature"]}
        resp = await client.post("/api/transactions/sync", json={
            "transactions": [{"token_payload": t1_tampered, "token_signature": sig1, "payer_public_key": dev_spki, "certificate": cert_dict}]
        }, headers=headers)
        assert resp.json()["settled"] == 0
        assert resp.json()["results"][0]["status"] == "REJECTED"
        assert "signature" in resp.json()["results"][0]["flag_reason"].lower()


@pytest.mark.asyncio
async def test_7_reserve_protection():
    """
    TEST 7: Reserve protection
    - Attempt to reserve more than the available wallet balance.
    - Confirm rejection.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await login_user(client, "customer1")
        headers = {"Authorization": f"Bearer {token}"}

        dev_id, dev_spki, _ = generate_test_device()
        await client.post("/api/devices/register", json={"device_id": dev_id, "public_key_spki": dev_spki}, headers=headers)

        # customer1 has ₹10,000 (1,000,000 paise). Try to reserve ₹20,000 (2,000,000 paise)
        resp = await client.post("/api/reserves", json={
            "amount": 2000000,
            "device_id": dev_id
        }, headers=headers)
        assert resp.status_code == 400
        assert "exceeds" in resp.json()["detail"].lower() or "insufficient" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_8_role_based_access():
    """
    TEST 8: Role-based access
    - Attempt to access analyst endpoints using a customer account.
    - Confirm access is denied (403 Forbidden).
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        customer_token = await login_user(client, "customer1")
        cust_headers = {"Authorization": f"Bearer {customer_token}"}

        # Attempt to access analyst flags
        resp = await client.get("/api/analyst/flags", headers=cust_headers)
        assert resp.status_code == 403
        assert "forbidden" in resp.json()["detail"].lower()

        # Analyst account can access successfully
        analyst_token = await login_user(client, "analyst")
        analyst_headers = {"Authorization": f"Bearer {analyst_token}"}
        analyst_resp = await client.get("/api/analyst/flags", headers=analyst_headers)
        assert analyst_resp.status_code == 200


@pytest.mark.asyncio
async def test_9_concurrent_settlement():
    """
    TEST 9: Concurrent settlement
    - Upload conflicting transactions concurrently.
    - Confirm the reserve cannot be overdrawn.
    """
    import asyncio
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        token = await login_user(client, "customer1")
        headers = {"Authorization": f"Bearer {token}"}

        dev_id, dev_spki, dev_priv = generate_test_device()
        await client.post("/api/devices/register", json={"device_id": dev_id, "public_key_spki": dev_spki}, headers=headers)

        # Create reserve of 40,000 paise (₹400)
        reserve_resp = await client.post("/api/reserves", json={"amount": 40000, "device_id": dev_id}, headers=headers)
        cert_data = reserve_resp.json()["certificate"]
        cert_dict = {"payload": json.loads(cert_data["raw_payload_json"]), "signature": cert_data["signature"]}

        now = datetime.now(timezone.utc)
        # Create 3 transactions of 25,000 paise each (Total = 75,000 > 40,000)
        tasks = []
        for i in range(1, 4):
            t = {
                "transaction_id": str(uuid.uuid4()),
                "certificate_id": cert_data["certificate_id"],
                "payer_device_id": dev_id,
                "payer_user_id": 1,
                "payee_id": "merchant",
                "amount": 25000,
                "nonce": str(uuid.uuid4()),
                "counter": i,
                "issued_at": now.isoformat(),
                "expires_at": (now + timedelta(hours=2)).isoformat()
            }
            sig = sign_token(dev_priv, t)
            body = {"transactions": [{"token_payload": t, "token_signature": sig, "payer_public_key": dev_spki, "certificate": cert_dict}]}
            tasks.append(client.post("/api/transactions/sync", json=body, headers=headers))

        responses = await asyncio.gather(*tasks)
        for r in responses:
            assert r.status_code == 200

        # Verify in DB: Total settled amount must NEVER exceed reserve (40,000 paise)
        db = SessionLocal()
        total_settled = sum(s.settled_amount for s in db.query(Settlement).all())
        assert total_settled == 25000  # Only one 25,000 payment fits in the 40,000 reserve!
        assert total_settled <= 40000
        db.close()
