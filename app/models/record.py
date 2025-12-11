"""Record models for migration data."""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from enum import Enum
from datetime import datetime


class RecordStatus(str, Enum):
    """Status of a record during migration."""
    PENDING = "pending"
    EXTRACTED = "extracted"
    TRANSFORMED = "transformed"
    VALIDATED = "validated"
    LOADED = "loaded"
    FAILED = "failed"
    SKIPPED = "skipped"


@dataclass
class ValidationError:
    """A validation error on a record."""
    field: str
    message: str
    error_type: str = "validation"
    severity: str = "error"  # error, warning, info
    value: Optional[Any] = None
    suggested_fix: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "field": self.field,
            "message": self.message,
            "error_type": self.error_type,
            "severity": self.severity,
            "value": self.value,
            "suggested_fix": self.suggested_fix,
        }


@dataclass
class SourceRecord:
    """A record extracted from a source system."""
    id: str
    source_service: str
    source_entity: str
    data: Dict[str, Any]
    extracted_at: datetime = field(default_factory=datetime.utcnow)
    source_type: str = "api"  # api, csv, screenshot, etc.
    source_file: Optional[str] = None
    raw_data: Optional[Dict[str, Any]] = None  # Original unprocessed data
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "id": self.id,
            "source_service": self.source_service,
            "source_entity": self.source_entity,
            "data": self.data,
            "extracted_at": self.extracted_at.isoformat(),
            "source_type": self.source_type,
            "source_file": self.source_file,
            "metadata": self.metadata,
        }

    def get_field(self, path: str, default: Any = None) -> Any:
        """Get a field value by dot-notation path (e.g., 'address.city')."""
        parts = path.split(".")
        value = self.data
        for part in parts:
            if isinstance(value, dict):
                value = value.get(part)
            elif isinstance(value, list) and part.isdigit():
                idx = int(part)
                value = value[idx] if idx < len(value) else None
            else:
                return default
            if value is None:
                return default
        return value


@dataclass
class TransformedRecord:
    """A record transformed for the target system."""
    id: str
    target_service: str
    target_entity: str
    data: Dict[str, Any]
    source_records: List[SourceRecord] = field(default_factory=list)
    transformed_at: datetime = field(default_factory=datetime.utcnow)
    status: RecordStatus = RecordStatus.TRANSFORMED
    validation_errors: List[ValidationError] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "id": self.id,
            "target_service": self.target_service,
            "target_entity": self.target_entity,
            "data": self.data,
            "source_records": [{"id": r.id, "service": r.source_service, "entity": r.source_entity}
                              for r in self.source_records],
            "transformed_at": self.transformed_at.isoformat(),
            "status": self.status.value,
            "validation_errors": [e.to_dict() for e in self.validation_errors],
            "warnings": self.warnings,
            "metadata": self.metadata,
        }

    def add_validation_error(self, field: str, message: str, **kwargs) -> None:
        """Add a validation error."""
        self.validation_errors.append(ValidationError(field=field, message=message, **kwargs))

    @property
    def is_valid(self) -> bool:
        """Check if record passed validation."""
        return not any(e.severity == "error" for e in self.validation_errors)

    @property
    def source_ids(self) -> Dict[str, str]:
        """Get mapping of source service to source ID."""
        return {r.source_service: r.id for r in self.source_records}


@dataclass
class MigrationResult:
    """Result of attempting to load a record to the target."""
    record_id: str
    target_id: Optional[str] = None  # ID assigned by target system
    success: bool = False
    error: Optional[str] = None
    error_code: Optional[str] = None
    response_data: Optional[Dict[str, Any]] = None
    loaded_at: Optional[datetime] = None
    retry_count: int = 0

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "record_id": self.record_id,
            "target_id": self.target_id,
            "success": self.success,
            "error": self.error,
            "error_code": self.error_code,
            "loaded_at": self.loaded_at.isoformat() if self.loaded_at else None,
            "retry_count": self.retry_count,
        }


@dataclass
class RecordBatch:
    """A batch of records for processing."""
    batch_id: str
    entity: str
    records: List[Any] = field(default_factory=list)  # SourceRecord or TransformedRecord
    status: RecordStatus = RecordStatus.PENDING
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    results: List[MigrationResult] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "batch_id": self.batch_id,
            "entity": self.entity,
            "record_count": len(self.records),
            "status": self.status.value,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "results_summary": {
                "total": len(self.results),
                "succeeded": sum(1 for r in self.results if r.success),
                "failed": sum(1 for r in self.results if not r.success),
            },
        }

    @property
    def success_count(self) -> int:
        """Count of successful results."""
        return sum(1 for r in self.results if r.success)

    @property
    def failure_count(self) -> int:
        """Count of failed results."""
        return sum(1 for r in self.results if not r.success)
