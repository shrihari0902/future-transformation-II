#!/usr/bin/env python3
"""
Reset Demo Data Script
Safely clears the database and reseeds all demo accounts, risk tiers, and balances.
"""
import sys
import os

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

# Add the backend directory to the Python path so this script uses the same
# import root as `python -m uvicorn app.main:app` from backend.
sys.path.insert(0, os.path.join(os.path.abspath(os.path.dirname(__file__)), "backend"))

from app.seed import seed_database

if __name__ == "__main__":
    print("=" * 60)
    print("OFFLINE PAYMENT SYSTEM - RESETTING DEMO DATABASE")
    print("=" * 60)
    seed_database(reset=True)
    print("\nDemo Accounts seeded:")
    print("  Customer 1: customer1 / DemoPass123! (Balance: INR 10,000 | Tier: Medium Risk)")
    print("  Customer 2: customer2 / DemoPass123! (Balance: INR 10,000 | Tier: Low Risk)")
    print("  Merchant:   merchant  / DemoPass123! (Balance: INR 2,000  | Tier: Low Risk)")
    print("  Analyst:    analyst   / DemoPass123! (Role: Analyst)")
    print("=" * 60)
