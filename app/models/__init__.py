"""Data models for the migration application."""

from .schema import (
    FieldDefinition,
    EntitySchema,
    ServiceSchema,
    FieldMapping,
    EntityMapping,
    MigrationMapping,
)
from .migration import (
    MigrationConfig,
    MigrationRun,
    MigrationStep,
    MigrationStatus,
    DataSource,
    DataSourceType,
)
from .record import (
    SourceRecord,
    TransformedRecord,
    MigrationResult,
    ValidationError,
)

__all__ = [
    "FieldDefinition",
    "EntitySchema",
    "ServiceSchema",
    "FieldMapping",
    "EntityMapping",
    "MigrationMapping",
    "MigrationConfig",
    "MigrationRun",
    "MigrationStep",
    "MigrationStatus",
    "DataSource",
    "DataSourceType",
    "SourceRecord",
    "TransformedRecord",
    "MigrationResult",
    "ValidationError",
]
