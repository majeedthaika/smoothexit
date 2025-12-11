"""Migration execution models."""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from enum import Enum
from datetime import datetime
import uuid


class MigrationStatus(str, Enum):
    """Status of a migration run."""
    PENDING = "pending"
    EXTRACTING = "extracting"
    TRANSFORMING = "transforming"
    VALIDATING = "validating"
    LOADING = "loading"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    PAUSED = "paused"
    ROLLING_BACK = "rolling_back"
    ROLLED_BACK = "rolled_back"


class DataSourceType(str, Enum):
    """Types of data sources for extraction."""
    API = "api"  # Direct API integration
    CSV = "csv"  # CSV file export
    JSON = "json"  # JSON file export
    SCREENSHOT = "screenshot"  # Screenshot with OCR/vision
    WEB_SCRAPE = "web_scrape"  # Web scraping / browser automation
    DATABASE = "database"  # Direct database connection
    WEBHOOK = "webhook"  # Webhook data
    MANUAL = "manual"  # Manual data entry


@dataclass
class DataSource:
    """Configuration for a data source."""
    type: DataSourceType
    name: str
    service: str  # Service name (e.g., "stripe", "salesforce")
    entity: str  # Entity type (e.g., "customer", "subscription")

    # For API sources
    api_key: Optional[str] = None
    api_endpoint: Optional[str] = None
    oauth_config: Optional[Dict[str, Any]] = None

    # For file sources
    file_path: Optional[str] = None
    file_pattern: Optional[str] = None  # Glob pattern for multiple files

    # For web scraping
    url: Optional[str] = None
    scrape_config: Optional[Dict[str, Any]] = None
    browser_instructions: Optional[str] = None

    # For screenshots
    screenshot_path: Optional[str] = None
    ocr_config: Optional[Dict[str, Any]] = None

    # General options
    batch_size: int = 100
    rate_limit: Optional[float] = None  # Requests per second
    retry_config: Dict[str, Any] = field(default_factory=lambda: {
        "max_retries": 3,
        "backoff_factor": 2.0,
    })
    filters: Dict[str, Any] = field(default_factory=dict)  # Filter criteria

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "type": self.type.value,
            "name": self.name,
            "service": self.service,
            "entity": self.entity,
            "api_endpoint": self.api_endpoint,
            "file_path": self.file_path,
            "file_pattern": self.file_pattern,
            "url": self.url,
            "browser_instructions": self.browser_instructions,
            "screenshot_path": self.screenshot_path,
            "batch_size": self.batch_size,
            "rate_limit": self.rate_limit,
            "retry_config": self.retry_config,
            "filters": self.filters,
        }


@dataclass
class MigrationStep:
    """A single step in a migration process."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = ""
    entity: str = ""
    status: MigrationStatus = MigrationStatus.PENDING
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    records_processed: int = 0
    records_succeeded: int = 0
    records_failed: int = 0
    records_skipped: int = 0
    errors: List[Dict[str, Any]] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "id": self.id,
            "name": self.name,
            "entity": self.entity,
            "status": self.status.value,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "records_processed": self.records_processed,
            "records_succeeded": self.records_succeeded,
            "records_failed": self.records_failed,
            "records_skipped": self.records_skipped,
            "errors": self.errors,
            "warnings": self.warnings,
        }

    @property
    def duration_seconds(self) -> Optional[float]:
        """Get duration in seconds."""
        if self.started_at and self.completed_at:
            return (self.completed_at - self.started_at).total_seconds()
        return None


@dataclass
class MigrationRun:
    """A complete migration run."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = ""
    description: str = ""
    status: MigrationStatus = MigrationStatus.PENDING

    # Configuration
    config_path: Optional[str] = None
    mapping_path: Optional[str] = None
    dry_run: bool = False

    # Timing
    created_at: datetime = field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    # Progress
    steps: List[MigrationStep] = field(default_factory=list)
    current_step: Optional[str] = None

    # Statistics
    total_records_processed: int = 0
    total_records_succeeded: int = 0
    total_records_failed: int = 0
    total_records_skipped: int = 0

    # Errors and rollback
    errors: List[Dict[str, Any]] = field(default_factory=list)
    rollback_data: Dict[str, List[str]] = field(default_factory=dict)  # Entity -> IDs to rollback

    # Metadata
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "status": self.status.value,
            "config_path": self.config_path,
            "mapping_path": self.mapping_path,
            "dry_run": self.dry_run,
            "created_at": self.created_at.isoformat(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "steps": [s.to_dict() for s in self.steps],
            "current_step": self.current_step,
            "total_records_processed": self.total_records_processed,
            "total_records_succeeded": self.total_records_succeeded,
            "total_records_failed": self.total_records_failed,
            "total_records_skipped": self.total_records_skipped,
            "errors": self.errors,
            "metadata": self.metadata,
        }

    @property
    def duration_seconds(self) -> Optional[float]:
        """Get duration in seconds."""
        if self.started_at and self.completed_at:
            return (self.completed_at - self.started_at).total_seconds()
        return None

    def add_step(self, name: str, entity: str) -> MigrationStep:
        """Add a new step to the migration."""
        step = MigrationStep(name=name, entity=entity)
        self.steps.append(step)
        return step

    def get_step(self, step_id: str) -> Optional[MigrationStep]:
        """Get a step by ID."""
        for step in self.steps:
            if step.id == step_id:
                return step
        return None

    def update_totals(self) -> None:
        """Update total statistics from steps."""
        self.total_records_processed = sum(s.records_processed for s in self.steps)
        self.total_records_succeeded = sum(s.records_succeeded for s in self.steps)
        self.total_records_failed = sum(s.records_failed for s in self.steps)
        self.total_records_skipped = sum(s.records_skipped for s in self.steps)


@dataclass
class MigrationConfig:
    """Configuration for a migration."""
    name: str
    description: str = ""

    # Sources and target
    sources: List[DataSource] = field(default_factory=list)
    target_service: str = ""
    target_api_key: Optional[str] = None
    target_site: Optional[str] = None  # For services like Chargebee

    # Mapping
    mapping_file: Optional[str] = None
    custom_mappings: Dict[str, Any] = field(default_factory=dict)

    # Execution options
    dry_run: bool = False
    batch_size: int = 100
    parallel_workers: int = 1
    continue_on_error: bool = True
    max_errors: int = 100  # Stop after this many errors

    # Data options
    deduplication: Dict[str, str] = field(default_factory=dict)  # Entity -> key field
    dedup_preferred_source: str = ""  # Preferred source for dedup conflicts

    # Output
    output_dir: str = "./data"
    save_extracted: bool = True
    save_transformed: bool = True

    # LLM options for schema inference
    use_llm_inference: bool = False
    llm_api_key: Optional[str] = None
    llm_model: str = "gpt-4"

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "name": self.name,
            "description": self.description,
            "sources": [s.to_dict() for s in self.sources],
            "target_service": self.target_service,
            "target_site": self.target_site,
            "mapping_file": self.mapping_file,
            "custom_mappings": self.custom_mappings,
            "dry_run": self.dry_run,
            "batch_size": self.batch_size,
            "parallel_workers": self.parallel_workers,
            "continue_on_error": self.continue_on_error,
            "max_errors": self.max_errors,
            "deduplication": self.deduplication,
            "dedup_preferred_source": self.dedup_preferred_source,
            "output_dir": self.output_dir,
            "save_extracted": self.save_extracted,
            "save_transformed": self.save_transformed,
            "use_llm_inference": self.use_llm_inference,
            "llm_model": self.llm_model,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "MigrationConfig":
        """Create from dictionary representation."""
        sources = []
        for source_data in data.get("sources", []):
            source = DataSource(
                type=DataSourceType(source_data.get("type", "api")),
                name=source_data.get("name", ""),
                service=source_data.get("service", ""),
                entity=source_data.get("entity", ""),
                api_key=source_data.get("api_key"),
                api_endpoint=source_data.get("api_endpoint"),
                file_path=source_data.get("file_path"),
                file_pattern=source_data.get("file_pattern"),
                url=source_data.get("url"),
                browser_instructions=source_data.get("browser_instructions"),
                screenshot_path=source_data.get("screenshot_path"),
                batch_size=source_data.get("batch_size", 100),
                rate_limit=source_data.get("rate_limit"),
                filters=source_data.get("filters", {}),
            )
            sources.append(source)

        return cls(
            name=data.get("name", ""),
            description=data.get("description", ""),
            sources=sources,
            target_service=data.get("target_service", ""),
            target_api_key=data.get("target_api_key"),
            target_site=data.get("target_site"),
            mapping_file=data.get("mapping_file"),
            custom_mappings=data.get("custom_mappings", {}),
            dry_run=data.get("dry_run", False),
            batch_size=data.get("batch_size", 100),
            parallel_workers=data.get("parallel_workers", 1),
            continue_on_error=data.get("continue_on_error", True),
            max_errors=data.get("max_errors", 100),
            deduplication=data.get("deduplication", {}),
            dedup_preferred_source=data.get("dedup_preferred_source", ""),
            output_dir=data.get("output_dir", "./data"),
            save_extracted=data.get("save_extracted", True),
            save_transformed=data.get("save_transformed", True),
            use_llm_inference=data.get("use_llm_inference", False),
            llm_api_key=data.get("llm_api_key"),
            llm_model=data.get("llm_model", "gpt-4"),
        )
