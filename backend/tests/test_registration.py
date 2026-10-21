import pytest
from httpx import ASGITransport, AsyncClient

from app.core.database import SessionLocal
from app.core.security import verify_password
from app.main import app
from app.models import User
from app.seed import seed_database


@pytest.fixture(autouse=True)
def setup_db():
    seed_database(reset=True)


@pytest.mark.asyncio
async def test_customer_registration_hashes_password_and_can_login():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/auth/register",
            json={
                "full_name": "New Customer",
                "username": "newcustomer",
                "email": "NewCustomer@Example.com",
                "password": "UserPassword123",
                "confirm_password": "UserPassword123",
            },
        )

        assert response.status_code == 201
        body = response.json()
        assert body["username"] == "newcustomer"
        assert body["email"] == "newcustomer@example.com"
        assert body["role"] == "customer"
        assert "hashed_password" not in body

        db = SessionLocal()
        user = db.query(User).filter(User.username == "newcustomer").one()
        assert verify_password("UserPassword123", user.hashed_password)
        assert user.hashed_password != "UserPassword123"
        first_hash = user.hashed_password
        db.close()

        second = await client.post(
            "/api/auth/register",
            json={
                "full_name": "Another Customer",
                "username": "anothercustomer",
                "email": "another@example.com",
                "password": "UserPassword123",
                "confirm_password": "UserPassword123",
            },
        )
        assert second.status_code == 201
        db = SessionLocal()
        second_user = db.query(User).filter(User.username == "anothercustomer").one()
        assert second_user.hashed_password != first_hash
        db.close()

        login = await client.post(
            "/api/auth/login",
            json={"username": "newcustomer", "password": "UserPassword123"},
        )
        assert login.status_code == 200
        assert login.json()["user"]["role"] == "customer"


@pytest.mark.asyncio
async def test_registration_rejects_duplicate_username_and_email():
    payload = {
        "full_name": "First Customer",
        "username": "duplicate_user",
        "email": "duplicate@example.com",
        "password": "UserPassword123",
        "confirm_password": "UserPassword123",
    }
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.post("/api/auth/register", json=payload)).status_code == 201

        duplicate_username = {**payload, "email": "different@example.com"}
        response = await client.post("/api/auth/register", json=duplicate_username)
        assert response.status_code == 409
        assert "username" in response.json()["detail"].lower()

        duplicate_email = {**payload, "username": "different_user"}
        response = await client.post("/api/auth/register", json=duplicate_email)
        assert response.status_code == 409
        assert "email" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_registration_rejects_weak_password_and_role_escalation():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        weak = await client.post(
            "/api/auth/register",
            json={
                "full_name": "Weak Password",
                "username": "weakpassword",
                "email": "weak@example.com",
                "password": "short",
                "confirm_password": "short",
            },
        )
        assert weak.status_code == 422

        escalation = await client.post(
            "/api/auth/register",
            json={
                "full_name": "Safe Customer",
                "username": "safe_customer",
                "email": "safe@example.com",
                "password": "UserPassword123",
                "confirm_password": "UserPassword123",
                "role": "merchant",
            },
        )
        assert escalation.status_code == 201
        assert escalation.json()["role"] == "customer"
