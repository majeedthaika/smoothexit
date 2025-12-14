"""Pydantic models for API requests and responses."""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class DataSourceTypeEnum(str, Enum):
    API = "api"
    CSV = "csv"
    JSON = "json"
    SCREENSHOT = "screenshot"
    WEB_SCRAPE = "web_scrape"


class MigrationStatusEnum(str, Enum):
    DRAFT = "draft"
    PENDING = "pending"
    EXTRACTING = "extracting"
    TRANSFORMING = "transforming"
    VALIDATING = "validating"
    LOADING = "loading"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    PAUSED = "paused"


# Request Models
class DataSourceCreate(BaseModel):
    type: DataSourceTypeEnum
    name: str
    service: str
    entity: str
    api_key: Optional[str] = None
    api_endpoint: Optional[str] = None
    file_path: Optional[str] = None
    url: Optional[str] = None
    browser_instructions: Optional[str] = None
    screenshot_path: Optional[str] = None
    batch_size: int = 100
    rate_limit: Optional[float] = None
    filters: Dict[str, Any] = Field(default_factory=dict)


class FieldMappingCreate(BaseModel):
    source_field: str
    target_field: str
    transform: str = "direct"
    config: Dict[str, Any] = Field(default_factory=dict)


class EntityMappingCreate(BaseModel):
    source_service: str
    source_entity: str
    target_service: str
    target_entity: str
    field_mappings: List[FieldMappingCreate]


class MigrationCreate(BaseModel):
    name: str
    description: str = ""
    sources: List[DataSourceCreate] = Field(default_factory=list)
    target_service: str = ""
    target_api_key: Optional[str] = None
    target_site: Optional[str] = None
    entity_mappings: List[EntityMappingCreate] = Field(default_factory=list)
    dry_run: bool = True
    batch_size: int = 100
    deduplication: Dict[str, str] = Field(default_factory=dict)


class MigrationUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    sources: Optional[List[DataSourceCreate]] = None
    target_service: Optional[str] = None
    target_api_key: Optional[str] = None
    target_site: Optional[str] = None
    entity_mappings: Optional[List[EntityMappingCreate]] = None
    dry_run: Optional[bool] = None
    batch_size: Optional[int] = None
    deduplication: Optional[Dict[str, str]] = None


class PreviewRequest(BaseModel):
    source_record: Dict[str, Any]
    source_service: str
    source_entity: str
    target_service: str
    target_entity: str
    field_mappings: List[FieldMappingCreate]


class SchemaInferRequest(BaseModel):
    data: List[Dict[str, Any]]
    service: str
    entity: str


class MappingSaveRequest(BaseModel):
    name: str
    source_service: str
    source_entity: str
    target_service: str
    target_entity: str
    field_mappings: List[FieldMappingCreate]


class BatchUploadRequest(BaseModel):
    """Request for uploading a batch of records to target service."""
    target_service: str
    target_entity: str
    records: List[Dict[str, Any]]
    api_key: str
    site: Optional[str] = None
    dry_run: bool = True


class BatchUploadResultItem(BaseModel):
    """Result for a single record in batch upload."""
    source_index: int
    target_id: Optional[str] = None
    error: Optional[str] = None


class BatchUploadResponse(BaseModel):
    """Response for batch upload operation."""
    results: List[BatchUploadResultItem]
    total: int
    succeeded: int
    failed: int


# Response Models
class FieldSchema(BaseModel):
    name: str
    type: str
    required: bool = False
    description: str = ""


class EntitySchema(BaseModel):
    service: str
    entity: str
    fields: List[FieldSchema]


class MigrationStepResponse(BaseModel):
    id: str
    name: str
    entity: str
    status: str
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    records_processed: int = 0
    records_succeeded: int = 0
    records_failed: int = 0
    errors: List[Dict[str, Any]] = Field(default_factory=list)


class MigrationResponse(BaseModel):
    id: str
    name: str
    description: str
    status: MigrationStatusEnum
    sources: List[DataSourceCreate]
    target_service: str
    target_site: Optional[str] = None
    entity_mappings: List[EntityMappingCreate]
    dry_run: bool
    batch_size: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    steps: List[MigrationStepResponse] = Field(default_factory=list)
    total_records_processed: int = 0
    total_records_succeeded: int = 0
    total_records_failed: int = 0


class MigrationListResponse(BaseModel):
    migrations: List[MigrationResponse]
    total: int


class PreviewResponse(BaseModel):
    source_data: Dict[str, Any]
    transformed_data: Dict[str, Any]
    validation_errors: List[str] = Field(default_factory=list)
    is_valid: bool = True


class SchemaInferResponse(BaseModel):
    schema: EntitySchema
    sample_values: Dict[str, Any]


class MappingResponse(BaseModel):
    id: str
    name: str
    source_service: str
    source_entity: str
    target_service: str
    target_entity: str
    field_mappings: List[FieldMappingCreate]
    created_at: datetime


class MappingListResponse(BaseModel):
    mappings: List[MappingResponse]
    total: int


class ProgressEvent(BaseModel):
    type: str  # "progress", "step_complete", "error", "complete"
    phase: Optional[str] = None
    step_id: Optional[str] = None
    step_name: Optional[str] = None
    records_processed: int = 0
    records_succeeded: int = 0
    records_failed: int = 0
    total_records: Optional[int] = None
    message: Optional[str] = None
    error: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
