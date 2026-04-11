"""FastAPI application entry point."""

import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.data.loader import lifespan

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Claims Investigation Intelligence Assistant",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def inject_state_and_time(request: Request, call_next):
    """Inject data_store into request.state and track processing time."""
    start = time.perf_counter()
    # Inject data_store from lifespan state
    if hasattr(request.app, "state") and hasattr(request.app.state, "_state"):
        lifespan_state = request.app.state._state
        if "data_store" in lifespan_state:
            request.state.data_store = lifespan_state["data_store"]
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Processing-Time-Ms"] = f"{elapsed_ms:.1f}"
    return response


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    """Handle domain errors (invalid transitions, missing data)."""
    return JSONResponse(
        status_code=400,
        content={
            "error": {"code": "validation_error", "message": str(exc)},
            "metadata": {"data_source": "synthetic"},
        },
    )


@app.exception_handler(Exception)
async def global_error_handler(request: Request, exc: Exception):
    """Catch-all error handler — no bare except, logs the exception."""
    logger.exception("Unhandled error: %s", exc)
    return JSONResponse(
        status_code=500,
        content={
            "error": {"code": "internal_error", "message": "Internal server error"},
            "metadata": {"data_source": "synthetic"},
        },
    )


@app.get("/api/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}
