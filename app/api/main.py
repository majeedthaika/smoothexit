"""FastAPI application entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes import migrations, schemas, mappings, preview, events, ai, mcp

app = FastAPI(
    title="Migrate Services API",
    description="API for the service migration framework",
    version="1.0.0",
)

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(migrations.router, prefix="/api/migrations", tags=["migrations"])
app.include_router(schemas.router, prefix="/api/schemas", tags=["schemas"])
app.include_router(mappings.router, prefix="/api/mappings", tags=["mappings"])
app.include_router(preview.router, prefix="/api/preview", tags=["preview"])
app.include_router(events.router, prefix="/api/events", tags=["events"])
app.include_router(ai.router, prefix="/api/ai", tags=["ai"])
app.include_router(mcp.router, prefix="/api/mcp", tags=["mcp"])


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}
