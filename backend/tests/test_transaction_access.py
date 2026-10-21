import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.database import SessionLocal
from app.core.security import get_password_hash
from app.main import app
from app.models import Transaction, User
from app.seed import seed_database


@pytest.fixture(autouse=True)
def reset_database():
    seed_database(reset=True)


async def auth_headers(client: AsyncClient, username: str):
    response = await client.post(
        "/api/auth/login",
        json={"username": username, "password": "DemoPass123!"},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def add_transaction(payer_id: int, payee_id: int, amount: int = 1000):
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        transaction = Transaction(
            transaction_id=str(uuid.uuid4()),
            certificate_id=str(uuid.uuid4()),
            payer_user_id=payer_id,
            payer_device_id=str(uuid.uuid4()),
            payee_user_id=payee_id,
            amount=amount,
            nonce=str(uuid.uuid4()),
            counter=1,
            status="SETTLED",
            issued_at=now,
            expires_at=now + timedelta(hours=1),
            created_at=now,
            settled_at=now,
        )
        db.add(transaction)
        db.commit()
        return transaction.transaction_id
    finally:
        db.close()


@pytest.mark.asyncio
async def test_customer_history_is_scoped_and_includes_incoming_and_outgoing():
    db = SessionLocal()
    try:
        customer1 = db.query(User).filter(User.username == "customer1").one()
        customer2 = db.query(User).filter(User.username == "customer2").one()
        merchant = db.query(User).filter(User.username == "merchant").one()
        outgoing_id = add_transaction(customer1.id, merchant.id)
        incoming_id = add_transaction(customer2.id, customer1.id)
        hidden_id = add_transaction(customer2.id, merchant.id)
    finally:
        db.close()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        headers = await auth_headers(client, "customer1")
        response = await client.get("/api/transactions", headers=headers)

    assert response.status_code == 200
    transaction_ids = [item["transaction_id"] for item in response.json()]
    assert transaction_ids.count(outgoing_id) == 1
    assert transaction_ids.count(incoming_id) == 1
    assert hidden_id not in transaction_ids


@pytest.mark.asyncio
async def test_merchant_history_contains_only_payments_to_that_merchant():
    db = SessionLocal()
    try:
        customer1 = db.query(User).filter(User.username == "customer1").one()
        customer2 = db.query(User).filter(User.username == "customer2").one()
        merchant = db.query(User).filter(User.username == "merchant").one()
        merchant2 = User(
            username="merchant2",
            email="merchant2@offlinepay.local",
            hashed_password=get_password_hash("DemoPass123!"),
            role="merchant",
            is_active=True,
        )
        db.add(merchant2)
        db.commit()
        addressed_id = add_transaction(customer1.id, merchant.id)
        unrelated_merchant_id = add_transaction(customer2.id, merchant2.id)
        outgoing_id = add_transaction(merchant.id, customer1.id)
    finally:
        db.close()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        headers = await auth_headers(client, "merchant")
        response = await client.get("/api/transactions", headers=headers)

    assert response.status_code == 200
    transaction_ids = [item["transaction_id"] for item in response.json()]
    assert addressed_id in transaction_ids
    assert unrelated_merchant_id not in transaction_ids
    assert outgoing_id not in transaction_ids


@pytest.mark.asyncio
async def test_only_analysts_can_use_system_wide_transaction_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        customer_headers = await auth_headers(client, "customer1")
        customer_response = await client.get(
            "/api/analyst/transactions", headers=customer_headers
        )
        analyst_headers = await auth_headers(client, "analyst")
        analyst_response = await client.get(
            "/api/analyst/transactions", headers=analyst_headers
        )

    assert customer_response.status_code == 403
    assert analyst_response.status_code == 200
