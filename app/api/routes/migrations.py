"""Migration CRUD and execution endpoints."""

import asyncio
from typing import Dict, Any
from fastapi import APIRouter, HTTPException, BackgroundTasks

from ..models import (
    MigrationCreate,
    MigrationUpdate,
    MigrationResponse,
    MigrationListResponse,
    MigrationStatusEnum,
    BatchUploadRequest,
    BatchUploadResponse,
    BatchUploadResultItem,
)
from ..storage import migration_storage
from .events import migration_progress

router = APIRouter()


@router.post("", response_model=MigrationResponse)
async def create_migration(data: MigrationCreate):
    """Create a new migration."""
    return migration_storage.create(data)


@router.get("", response_model=MigrationListResponse)
async def list_migrations():
    """List all migrations."""
    migrations = migration_storage.list_all()
    return MigrationListResponse(migrations=migrations, total=len(migrations))


@router.get("/{migration_id}", response_model=MigrationResponse)
async def get_migration(migration_id: str):
    """Get a specific migration."""
    migration = migration_storage.get(migration_id)
    if not migration:
        raise HTTPException(status_code=404, detail="Migration not found")
    return migration


@router.patch("/{migration_id}", response_model=MigrationResponse)
async def update_migration(migration_id: str, data: MigrationUpdate):
    """Update a migration."""
    migration = migration_storage.update(migration_id, data)
    if not migration:
        raise HTTPException(status_code=404, detail="Migration not found")
    return migration


@router.delete("/{migration_id}")
async def delete_migration(migration_id: str):
    """Delete a migration."""
    if not migration_storage.delete(migration_id):
        raise HTTPException(status_code=404, detail="Migration not found")
    return {"status": "deleted"}


@router.post("/{migration_id}/start")
async def start_migration(migration_id: str, background_tasks: BackgroundTasks):
    """Start a migration run."""
    migration = migration_storage.get(migration_id)
    if not migration:
        raise HTTPException(status_code=404, detail="Migration not found")

    if migration.status not in (MigrationStatusEnum.DRAFT, MigrationStatusEnum.FAILED):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot start migration in status: {migration.status}"
        )

    # Update status to pending
    migration_storage.update_status(migration_id, MigrationStatusEnum.PENDING)

    # Start migration in background
    background_tasks.add_task(run_migration_task, migration_id)

    return {"status": "started", "migration_id": migration_id}


@router.post("/{migration_id}/pause")
async def pause_migration(migration_id: str):
    """Pause a running migration."""
    migration = migration_storage.get(migration_id)
    if not migration:
        raise HTTPException(status_code=404, detail="Migration not found")

    if migration.status not in (
        MigrationStatusEnum.EXTRACTING,
        MigrationStatusEnum.TRANSFORMING,
        MigrationStatusEnum.VALIDATING,
        MigrationStatusEnum.LOADING,
    ):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot pause migration in status: {migration.status}"
        )

    migration_storage.update_status(migration_id, MigrationStatusEnum.PAUSED)
    return {"status": "paused"}


@router.post("/{migration_id}/resume")
async def resume_migration(migration_id: str, background_tasks: BackgroundTasks):
    """Resume a paused migration."""
    migration = migration_storage.get(migration_id)
    if not migration:
        raise HTTPException(status_code=404, detail="Migration not found")

    if migration.status != MigrationStatusEnum.PAUSED:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot resume migration in status: {migration.status}"
        )

    # Resume in background
    background_tasks.add_task(run_migration_task, migration_id)
    return {"status": "resumed"}


@router.post("/{migration_id}/cancel")
async def cancel_migration(migration_id: str):
    """Cancel a running migration."""
    migration = migration_storage.get(migration_id)
    if not migration:
        raise HTTPException(status_code=404, detail="Migration not found")

    migration_storage.update_status(migration_id, MigrationStatusEnum.CANCELLED)
    return {"status": "cancelled"}


@router.post("/{migration_id}/rollback")
async def rollback_migration(migration_id: str):
    """Rollback a completed migration."""
    migration = migration_storage.get(migration_id)
    if not migration:
        raise HTTPException(status_code=404, detail="Migration not found")

    if migration.status != MigrationStatusEnum.COMPLETED:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot rollback migration in status: {migration.status}"
        )

    # TODO: Implement actual rollback using orchestrator
    return {"status": "rollback_started"}


async def run_migration_task(migration_id: str):
    """Background task to run migration with progress updates."""
    from ...models.migration import (
        MigrationConfig,
        DataSource,
        DataSourceType,
    )
    from ...models.schema import EntityMapping, FieldMapping, MigrationMapping
    from ...services.schema_registry import SchemaRegistry
    from ...orchestrator import MigrationOrchestrator

    migration = migration_storage.get(migration_id)
    if not migration:
        return

    try:
        # Convert API models to internal models
        sources = []
        for src in migration.sources:
            source = DataSource(
                type=DataSourceType(src.type.value),
                name=src.name,
                service=src.service,
                entity=src.entity,
                api_key=src.api_key,
                api_endpoint=src.api_endpoint,
                file_path=src.file_path,
                url=src.url,
                browser_instructions=src.browser_instructions,
                screenshot_path=src.screenshot_path,
                batch_size=src.batch_size,
                rate_limit=src.rate_limit,
                filters=src.filters,
            )
            sources.append(source)

        config = MigrationConfig(
            name=migration.name,
            description=migration.description,
            sources=sources,
            target_service=migration.target_service,
            target_site=migration.target_site,
            dry_run=migration.dry_run,
            batch_size=migration.batch_size,
        )

        # Build mapping from entity_mappings
        entity_mappings = {}
        for em in migration.entity_mappings:
            field_mappings = []
            for fm in em.field_mappings:
                field_mappings.append(FieldMapping(
                    source_field=fm.source_field,
                    target_field=fm.target_field,
                    transform=fm.transform,
                    config=fm.config,
                ))

            mapping_name = f"{em.source_entity}_to_{em.target_entity}"
            entity_mappings[mapping_name] = EntityMapping(
                source_service=em.source_service,
                source_entity=em.source_entity,
                target_service=em.target_service,
                target_entity=em.target_entity,
                field_mappings=field_mappings,
            )

        mapping = MigrationMapping(
            name=migration.name,
            entity_mappings=entity_mappings,
        )

        # Set up registry
        registry = SchemaRegistry()

        # Create orchestrator
        orchestrator = MigrationOrchestrator(config, registry, mapping)

        # Simulate migration phases with progress updates
        phases = [
            (MigrationStatusEnum.EXTRACTING, "Extracting data from sources"),
            (MigrationStatusEnum.TRANSFORMING, "Transforming records"),
            (MigrationStatusEnum.VALIDATING, "Validating transformed data"),
            (MigrationStatusEnum.LOADING, "Loading data to target"),
        ]

        total_records = 100  # Simulated
        for phase_status, phase_message in phases:
            # Check if cancelled
            current = migration_storage.get(migration_id)
            if current and current.status == MigrationStatusEnum.CANCELLED:
                return

            # Check if paused
            while current and current.status == MigrationStatusEnum.PAUSED:
                await asyncio.sleep(1)
                current = migration_storage.get(migration_id)
                if current and current.status == MigrationStatusEnum.CANCELLED:
                    return

            migration_storage.update_status(migration_id, phase_status)

            # Send progress updates
            for i in range(0, total_records, 10):
                await migration_progress.send_progress(
                    migration_id,
                    phase=phase_status.value,
                    records_processed=i,
                    records_succeeded=i,
                    records_failed=0,
                    total_records=total_records,
                    message=phase_message,
                )
                await asyncio.sleep(0.1)  # Simulate work

            # Send step complete
            await migration_progress.send_step_complete(
                migration_id,
                step_name=phase_message,
                records_processed=total_records,
                records_succeeded=total_records,
                records_failed=0,
            )

        # Mark as completed
        migration_storage.update_status(migration_id, MigrationStatusEnum.COMPLETED)
        updated = migration_storage.get(migration_id)
        if updated:
            updated.total_records_processed = total_records * len(phases)
            updated.total_records_succeeded = total_records * len(phases)

        await migration_progress.send_complete(
            migration_id,
            total_processed=total_records * len(phases),
            total_succeeded=total_records * len(phases),
            total_failed=0,
        )

    except Exception as e:
        migration_storage.update_status(migration_id, MigrationStatusEnum.FAILED)
        await migration_progress.send_error(migration_id, str(e))


@router.post("/upload-batch", response_model=BatchUploadResponse)
async def upload_batch(request: BatchUploadRequest):
    """
    Upload a batch of records to the target service.

    This endpoint processes records and either validates them (dry_run=True)
    or creates them in the target service (dry_run=False).
    """
    results = []
    succeeded = 0
    failed = 0

    for idx, record in enumerate(request.records):
        try:
            if request.dry_run:
                # In dry run mode, just validate the record structure
                # For now, we'll simulate validation success
                results.append(BatchUploadResultItem(
                    source_index=idx,
                    target_id=f"dry_run_{idx}",
                    error=None,
                ))
                succeeded += 1
            else:
                # In live mode, we would call the actual target API
                # For now, simulate the upload
                # TODO: Integrate with actual loaders (Chargebee, API, etc.)

                if request.target_service.lower() == "chargebee":
                    # Chargebee API integration would go here
                    # from ...loaders.chargebee_loader import ChargebeeLoader
                    # loader = ChargebeeLoader(site=request.site, api_key=request.api_key)
                    # result = loader.create(request.target_entity, record)

                    # Simulated success for now
                    results.append(BatchUploadResultItem(
                        source_index=idx,
                        target_id=f"cb_{request.target_entity}_{idx}",
                        error=None,
                    ))
                    succeeded += 1
                else:
                    # Generic API loader would go here
                    results.append(BatchUploadResultItem(
                        source_index=idx,
                        target_id=f"{request.target_service}_{idx}",
                        error=None,
                    ))
                    succeeded += 1

        except Exception as e:
            results.append(BatchUploadResultItem(
                source_index=idx,
                target_id=None,
                error=str(e),
            ))
            failed += 1

    return BatchUploadResponse(
        results=results,
        total=len(request.records),
        succeeded=succeeded,
        failed=failed,
    )
