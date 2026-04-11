"""FastAPI dependency injection providers."""

from fastapi import Request

from app.data.loader import DataStore


def get_data_store(request: Request) -> DataStore:
    """Inject the in-memory DataStore from lifespan state."""
    return request.state.data_store
