# Backward-compatible shim pointing to restructured backend/main.py
from main import app, lifespan, root, health

__all__ = ["app", "lifespan", "root", "health"]
