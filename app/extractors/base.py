"""Base extractor interface."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Dict, List, Optional, Iterator
from datetime import datetime
import logging

from ..models.record import SourceRecord
from ..models.migration import DataSource

logger = logging.getLogger(__name__)


@dataclass
class ExtractionResult:
    """Result of an extraction operation."""
    source: DataSource
    records: List[SourceRecord] = field(default_factory=list)
    total_extracted: int = 0
    errors: List[Dict[str, Any]] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def duration_seconds(self) -> Optional[float]:
        """Get duration in seconds."""
        if self.started_at and self.completed_at:
            return (self.completed_at - self.started_at).total_seconds()
        return None

    @property
    def success(self) -> bool:
        """Check if extraction was successful."""
        return len(self.errors) == 0

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "source": self.source.to_dict(),
            "total_extracted": self.total_extracted,
            "errors": self.errors,
            "warnings": self.warnings,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "duration_seconds": self.duration_seconds,
            "metadata": self.metadata,
        }


class BaseExtractor(ABC):
    """
    Base class for all data extractors.

    Extractors are responsible for pulling data from various sources
    (API, CSV, screenshots, web scraping) and converting them to
    SourceRecord objects.
    """

    def __init__(self, source: DataSource):
        """
        Initialize the extractor.

        Args:
            source: Data source configuration
        """
        self.source = source
        self._extracted_count = 0
        self._errors: List[Dict[str, Any]] = []
        self._warnings: List[str] = []

    @abstractmethod
    def extract(self) -> ExtractionResult:
        """
        Extract all data from the source.

        Returns:
            ExtractionResult containing all extracted records
        """
        pass

    @abstractmethod
    def extract_batch(self, offset: int = 0, limit: int = 100) -> List[SourceRecord]:
        """
        Extract a batch of records.

        Args:
            offset: Starting offset
            limit: Maximum records to extract

        Returns:
            List of extracted SourceRecord objects
        """
        pass

    def stream(self, batch_size: Optional[int] = None) -> Iterator[List[SourceRecord]]:
        """
        Stream records in batches.

        Args:
            batch_size: Size of each batch (defaults to source.batch_size)

        Yields:
            Batches of SourceRecord objects
        """
        batch_size = batch_size or self.source.batch_size
        offset = 0

        while True:
            batch = self.extract_batch(offset=offset, limit=batch_size)
            if not batch:
                break

            yield batch
            offset += len(batch)

            if len(batch) < batch_size:
                break

    async def stream_async(
        self,
        batch_size: Optional[int] = None
    ) -> AsyncIterator[List[SourceRecord]]:
        """
        Async stream records in batches.

        Args:
            batch_size: Size of each batch

        Yields:
            Batches of SourceRecord objects
        """
        # Default implementation converts sync to async
        for batch in self.stream(batch_size):
            yield batch

    def validate_source(self) -> List[str]:
        """
        Validate the source configuration.

        Returns:
            List of validation error messages
        """
        errors = []

        if not self.source.service:
            errors.append("Source service name is required")

        if not self.source.entity:
            errors.append("Source entity name is required")

        return errors

    def create_record(
        self,
        id: str,
        data: Dict[str, Any],
        raw_data: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> SourceRecord:
        """
        Create a SourceRecord from extracted data.

        Args:
            id: Record identifier
            data: Processed record data
            raw_data: Original unprocessed data
            metadata: Additional metadata

        Returns:
            SourceRecord object
        """
        return SourceRecord(
            id=str(id),
            source_service=self.source.service,
            source_entity=self.source.entity,
            data=data,
            source_type=self.source.type.value,
            source_file=self.source.file_path,
            raw_data=raw_data,
            metadata=metadata or {},
        )

    def add_error(
        self,
        message: str,
        record_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ) -> None:
        """Add an error to the extraction."""
        error = {
            "message": message,
            "record_id": record_id,
            "timestamp": datetime.utcnow().isoformat(),
        }
        if details:
            error.update(details)
        self._errors.append(error)
        logger.error(f"Extraction error: {message}")

    def add_warning(self, message: str) -> None:
        """Add a warning to the extraction."""
        self._warnings.append(message)
        logger.warning(f"Extraction warning: {message}")

    def get_extraction_result(self, records: List[SourceRecord]) -> ExtractionResult:
        """
        Create an ExtractionResult from extracted records.

        Args:
            records: List of extracted records

        Returns:
            ExtractionResult object
        """
        return ExtractionResult(
            source=self.source,
            records=records,
            total_extracted=len(records),
            errors=self._errors.copy(),
            warnings=self._warnings.copy(),
        )

    def reset(self) -> None:
        """Reset the extractor state."""
        self._extracted_count = 0
        self._errors = []
        self._warnings = []
