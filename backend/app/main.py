"""FastAPI application entry point."""

import logging
import os
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

# CORS: credentialed cross-origin requests cannot use wildcard origins (browsers reject
# the combination). Configure an explicit origin list from CORS_ALLOW_ORIGINS env var.
_cors_origins_env = os.getenv("CORS_ALLOW_ORIGINS", "http://localhost:3000")
CORS_ALLOW_ORIGINS = [o.strip() for o in _cors_origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Processing-Time-Ms"],
)


@app.middleware("http")
async def track_processing_time(request: Request, call_next):
    """Track request processing time. data_store is attached to request.state
    automatically by Starlette from the lifespan-yielded state dict."""
    start = time.perf_counter()
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
