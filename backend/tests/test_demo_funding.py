import pytest
from httpx import ASGITransport, AsyncClient

from app.core.database import SessionLocal
from app.core.config import settings
from app.main import app
from app.models import LedgerEntry, User, Wallet
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


@pytest.mark.asyncio
async def test_demo_funding_updates_wallet_and_ledger_without_changing_reserve():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        headers = await auth_headers(client, "customer1")
        before = (await client.get("/api/wallet", headers=headers)).json()
        response = await client.post(
            "/api/wallet/demo-funding",
            json={"amount": 50000, "idempotency_key": "funding-test-customer1-01"},
            headers=headers,
        )
        after = (await client.get("/api/wallet", headers=headers)).json()

    assert response.status_code == 200
    assert after["total_balance"] == before["total_balance"] + 50000
    assert after["available_balance"] == before["available_balance"] + 50000
    assert after["reserved_balance"] == before["reserved_balance"]

    db = SessionLocal()
    try:
        entries = db.query(LedgerEntry).filter(
            LedgerEntry.wallet_id == before["id"],
            LedgerEntry.entry_type == "DEMO_CREDIT",
        ).all()
        assert len(entries) == 1
        assert entries[0].amount == 50000
        assert entries[0].balance_after == after["total_balance"]
    finally:
        db.close()


@pytest.mark.asyncio
async def test_demo_funding_rejects_invalid_or_excessive_amounts():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        headers = await auth_headers(client, "customer1")
        invalid = await client.post(
            "/api/wallet/demo-funding",
            json={"amount": 0, "idempotency_key": "funding-test-invalid-01"},
            headers=headers,
        )
        excessive = await client.post(
            "/api/wallet/demo-funding",
            json={
                "amount": settings.DEMO_FUNDING_MAX_AMOUNT + 1,
                "idempotency_key": "funding-test-invalid-02",
            },
            headers=headers,
        )

    assert invalid.status_code == 422
    assert excessive.status_code == 422


@pytest.mark.asyncio
async def test_demo_funding_is_idempotent_for_repeated_requests():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        headers = await auth_headers(client, "customer1")
        first = await client.post(
            "/api/wallet/demo-funding",
            json={"amount": 25000, "idempotency_key": "funding-test-duplicate-01"},
            headers=headers,
        )
        second = await client.post(
            "/api/wallet/demo-funding",
            json={"amount": 25000, "idempotency_key": "funding-test-duplicate-01"},
            headers=headers,
        )

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["total_balance"] == first.json()["total_balance"]

    db = SessionLocal()
    try:
        assert db.query(LedgerEntry).filter(
            LedgerEntry.entry_type == "DEMO_CREDIT",
            LedgerEntry.reference_id == "funding-test-duplicate-01",
        ).count() == 1
    finally:
        db.close()


@pytest.mark.asyncio
async def test_demo_funding_uses_authenticated_wallet_and_rejects_non_customers():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        merchant_headers = await auth_headers(client, "merchant")
        response = await client.post(
            "/api/wallet/demo-funding",
            json={"amount": 10000, "idempotency_key": "funding-test-merchant-01"},
            headers=merchant_headers,
        )

    assert response.status_code == 403

    db = SessionLocal()
    try:
        customer1 = db.query(User).filter(User.username == "customer1").one()
        customer2 = db.query(User).filter(User.username == "customer2").one()
        customer1_wallet = db.query(Wallet).filter(Wallet.user_id == customer1.id).one()
        customer2_wallet = db.query(Wallet).filter(Wallet.user_id == customer2.id).one()
        assert customer1_wallet.total_balance == 1000000
        assert customer2_wallet.total_balance == 1000000
    finally:
        db.close()


@pytest.mark.asyncio
async def test_demo_funding_is_disabled_in_production(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        headers = await auth_headers(client, "customer1")
        response = await client.post(
            "/api/wallet/demo-funding",
            json={"amount": 10000, "idempotency_key": "funding-test-production-01"},
            headers=headers,
        )

    assert response.status_code == 404
