"""FastAPI application entry point."""

import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import analytics as analytics_routes
from app.api.routes import claims as claims_routes
from app.api.routes import investigation as investigation_routes
from app.api.routes import ncci as ncci_routes
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
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


app.include_router(claims_routes.router)
app.include_router(analytics_routes.router)
app.include_router(investigation_routes.router)
app.include_router(ncci_routes.router)


@app.get("/api/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}


def main() -> None:
    """Run the FastAPI app with uvicorn when executed as a script."""
    import uvicorn

    target = "app.main:app" if settings.API_RELOAD else app
    uvicorn.run(
        target,
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.API_RELOAD,
    )


if __name__ == "__main__":
    main()
