"""FastAPI dependency injection providers."""

from fastapi import Request

from app.data.loader import DataStore


def get_data_store(request: Request) -> DataStore:
    """Inject the in-memory DataStore from lifespan state."""
    return request.state.data_store


def get_openai_client(request: Request) -> object | None:
    """Inject the shared AsyncOpenAI client when configured."""
    return getattr(request.state, "openai_client", None)
