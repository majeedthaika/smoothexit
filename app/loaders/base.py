"""Base loader interface for target services."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from datetime import datetime
import logging

from ..models.record import TransformedRecord, MigrationResult

logger = logging.getLogger(__name__)


@dataclass
class LoadResult:
    """Result of a load operation."""
    entity: str
    total_attempted: int = 0
    total_succeeded: int = 0
    total_failed: int = 0
    total_skipped: int = 0
    results: List[MigrationResult] = field(default_factory=list)
    errors: List[Dict[str, Any]] = field(default_factory=list)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_ids: List[str] = field(default_factory=list)  # For rollback

    @property
    def duration_seconds(self) -> Optional[float]:
        if self.started_at and self.completed_at:
            return (self.completed_at - self.started_at).total_seconds()
        return None

    @property
    def success_rate(self) -> float:
        if self.total_attempted == 0:
            return 0.0
        return self.total_succeeded / self.total_attempted

    def to_dict(self) -> Dict[str, Any]:
        return {
            "entity": self.entity,
            "total_attempted": self.total_attempted,
            "total_succeeded": self.total_succeeded,
            "total_failed": self.total_failed,
            "total_skipped": self.total_skipped,
            "success_rate": self.success_rate,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "duration_seconds": self.duration_seconds,
            "created_ids": self.created_ids,
            "errors": self.errors,
        }


class BaseLoader(ABC):
    """
    Base class for data loaders.

    Loaders are responsible for loading transformed records
    into target services.
    """

    def __init__(
        self,
        target_service: str,
        api_key: Optional[str] = None,
        dry_run: bool = False,
        batch_size: int = 10
    ):
        """
        Initialize the loader.

        Args:
            target_service: Name of the target service
            api_key: API key for authentication
            dry_run: If True, simulate without making changes
            batch_size: Number of records per batch
        """
        self.target_service = target_service
        self.api_key = api_key
        self.dry_run = dry_run
        self.batch_size = batch_size
        self._created_records: Dict[str, List[str]] = {}  # entity -> list of IDs

    @abstractmethod
    def load_record(
        self,
        record: TransformedRecord,
        upsert: bool = True
    ) -> MigrationResult:
        """
        Load a single record to the target service.

        Args:
            record: Transformed record to load
            upsert: If True, update if exists; if False, fail on duplicate

        Returns:
            MigrationResult indicating success/failure
        """
        pass

    def load_batch(
        self,
        records: List[TransformedRecord],
        entity: str,
        upsert: bool = True
    ) -> LoadResult:
        """
        Load a batch of records.

        Args:
            records: List of transformed records
            entity: Entity type being loaded
            upsert: If True, update if exists

        Returns:
            LoadResult with batch statistics
        """
        result = LoadResult(entity=entity)
        result.started_at = datetime.utcnow()

        for record in records:
            try:
                migration_result = self.load_record(record, upsert)
                result.results.append(migration_result)
                result.total_attempted += 1

                if migration_result.success:
                    result.total_succeeded += 1
                    if migration_result.target_id:
                        result.created_ids.append(migration_result.target_id)
                else:
                    result.total_failed += 1
                    result.errors.append({
                        "record_id": record.id,
                        "error": migration_result.error,
                        "error_code": migration_result.error_code,
                    })

            except Exception as e:
                result.total_failed += 1
                result.total_attempted += 1
                result.errors.append({
                    "record_id": record.id,
                    "error": str(e),
                })
                logger.error(f"Failed to load record {record.id}: {e}")

        result.completed_at = datetime.utcnow()

        # Track created records for rollback
        if entity not in self._created_records:
            self._created_records[entity] = []
        self._created_records[entity].extend(result.created_ids)

        return result

    def load_all(
        self,
        records_by_entity: Dict[str, List[TransformedRecord]],
        order: Optional[List[str]] = None
    ) -> Dict[str, LoadResult]:
        """
        Load all records for multiple entities.

        Args:
            records_by_entity: Dictionary of entity -> records
            order: Optional order to load entities (for dependencies)

        Returns:
            Dictionary of entity -> LoadResult
        """
        results = {}

        entities = order if order else list(records_by_entity.keys())

        for entity in entities:
            if entity not in records_by_entity:
                continue

            records = records_by_entity[entity]
            logger.info(f"Loading {len(records)} {entity} records...")

            # Load in batches
            entity_result = LoadResult(entity=entity)
            entity_result.started_at = datetime.utcnow()

            for i in range(0, len(records), self.batch_size):
                batch = records[i:i + self.batch_size]
                batch_result = self.load_batch(batch, entity)

                entity_result.total_attempted += batch_result.total_attempted
                entity_result.total_succeeded += batch_result.total_succeeded
                entity_result.total_failed += batch_result.total_failed
                entity_result.results.extend(batch_result.results)
                entity_result.errors.extend(batch_result.errors)
                entity_result.created_ids.extend(batch_result.created_ids)

            entity_result.completed_at = datetime.utcnow()
            results[entity] = entity_result

            logger.info(
                f"Loaded {entity}: {entity_result.total_succeeded}/{entity_result.total_attempted} succeeded"
            )

        return results

    @abstractmethod
    def delete_record(self, entity: str, record_id: str) -> bool:
        """
        Delete a record from the target service.

        Args:
            entity: Entity type
            record_id: ID of the record to delete

        Returns:
            True if deleted successfully
        """
        pass

    def rollback(self, entity: Optional[str] = None) -> Dict[str, int]:
        """
        Rollback created records.

        Args:
            entity: Specific entity to rollback, or None for all

        Returns:
            Dictionary of entity -> number of records deleted
        """
        deleted_counts = {}

        entities = [entity] if entity else list(self._created_records.keys())

        for ent in entities:
            if ent not in self._created_records:
                continue

            count = 0
            for record_id in self._created_records[ent]:
                try:
                    if self.delete_record(ent, record_id):
                        count += 1
                except Exception as e:
                    logger.error(f"Failed to delete {ent} {record_id}: {e}")

            deleted_counts[ent] = count
            logger.info(f"Rolled back {count} {ent} records")

        return deleted_counts

    def validate_connection(self) -> bool:
        """Validate the connection to the target service."""
        return True

    def get_rollback_data(self) -> Dict[str, List[str]]:
        """Get data needed for rollback."""
        return self._created_records.copy()
