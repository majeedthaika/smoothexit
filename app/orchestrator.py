"""Migration orchestrator - coordinates the complete migration process."""

import json
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Tuple

from .models.schema import (
    ServiceSchema,
    EntityMapping,
    MigrationMapping,
)
from .models.migration import (
    MigrationConfig,
    MigrationRun,
    MigrationStep,
    MigrationStatus,
    DataSource,
    DataSourceType,
)
from .models.record import (
    SourceRecord,
    TransformedRecord,
    RecordBatch,
)
from .services.schema_registry import SchemaRegistry
from .services.transformer import TransformEngine
from .services.validator import RecordValidator
from .services.llm_inference import LLMSchemaInference
from .extractors.base import BaseExtractor, ExtractionResult
from .extractors.api_extractor import APIExtractor
from .extractors.csv_extractor import CSVExtractor
from .extractors.screenshot_extractor import ScreenshotExtractor
from .extractors.web_scraper import WebScraperExtractor
from .loaders.base import BaseLoader, LoadResult
from .loaders.chargebee_loader import ChargebeeLoader
from .loaders.api_loader import APILoader

logger = logging.getLogger(__name__)


class MigrationOrchestrator:
    """
    Orchestrates the complete migration process.

    Handles:
    - Configuration loading
    - Data extraction from multiple sources
    - Schema inference and mapping
    - Data transformation
    - Batch streaming
    - Loading to target
    - Validation and rollback
    - Progress tracking and reporting
    """

    def __init__(
        self,
        config: MigrationConfig,
        schema_registry: Optional[SchemaRegistry] = None,
        mapping: Optional[MigrationMapping] = None
    ):
        """
        Initialize the orchestrator.

        Args:
            config: Migration configuration
            schema_registry: Schema registry with loaded schemas
            mapping: Migration mapping configuration
        """
        self.config = config
        self.registry = schema_registry or SchemaRegistry()
        self.mapping = mapping
        self.transformer = TransformEngine()
        self.validator = RecordValidator()
        self.llm_inference = None

        # Runtime state
        self.run: Optional[MigrationRun] = None
        self.loader: Optional[BaseLoader] = None
        self._extracted_data: Dict[str, List[SourceRecord]] = {}
        self._transformed_data: Dict[str, List[TransformedRecord]] = {}

        # Initialize LLM inference if configured
        if config.use_llm_inference:
            self.llm_inference = LLMSchemaInference(
                api_key=config.llm_api_key,
                model=config.llm_model,
            )

        # Set up directories
        self._setup_directories()

    def _setup_directories(self):
        """Create output directories."""
        base = Path(self.config.output_dir)
        self.extracted_dir = base / "extracted"
        self.transformed_dir = base / "transformed"
        self.logs_dir = base / "logs"

        for dir in [self.extracted_dir, self.transformed_dir, self.logs_dir]:
            dir.mkdir(parents=True, exist_ok=True)

    def run_migration(self) -> MigrationRun:
        """
        Run the complete migration.

        Returns:
            MigrationRun with results and statistics
        """
        self.run = MigrationRun(
            name=self.config.name,
            description=self.config.description,
            config_path=self.config.mapping_file,
            dry_run=self.config.dry_run,
        )
        self.run.started_at = datetime.utcnow()
        self.run.status = MigrationStatus.EXTRACTING

        try:
            # Phase 1: Extraction
            logger.info("=== PHASE 1: EXTRACTION ===")
            self._run_extraction()

            # Phase 2: Transformation
            logger.info("=== PHASE 2: TRANSFORMATION ===")
            self.run.status = MigrationStatus.TRANSFORMING
            self._run_transformation()

            # Phase 3: Validation
            logger.info("=== PHASE 3: VALIDATION ===")
            self.run.status = MigrationStatus.VALIDATING
            self._run_validation()

            # Phase 4: Loading
            logger.info("=== PHASE 4: LOADING ===")
            self.run.status = MigrationStatus.LOADING
            self._run_loading()

            self.run.status = MigrationStatus.COMPLETED
            logger.info("=== MIGRATION COMPLETED ===")

        except Exception as e:
            logger.error(f"Migration failed: {e}")
            self.run.status = MigrationStatus.FAILED
            self.run.errors.append({
                "phase": self.run.status.value,
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat(),
            })

        finally:
            self.run.completed_at = datetime.utcnow()
            self.run.update_totals()
            self._save_report()

        return self.run

    def _run_extraction(self):
        """Run the extraction phase."""
        for source in self.config.sources:
            step = self.run.add_step(
                name=f"Extract {source.entity} from {source.service}",
                entity=source.entity,
            )
            step.status = MigrationStatus.EXTRACTING
            step.started_at = datetime.utcnow()
            self.run.current_step = step.id

            try:
                extractor = self._create_extractor(source)
                result = extractor.extract()

                key = f"{source.service}_{source.entity}"
                self._extracted_data[key] = result.records

                step.records_processed = result.total_extracted
                step.records_succeeded = result.total_extracted - len(result.errors)
                step.records_failed = len(result.errors)
                step.errors = result.errors

                if self.config.save_extracted:
                    self._save_extracted(key, result.records)

                step.status = MigrationStatus.COMPLETED
                logger.info(f"Extracted {result.total_extracted} {source.entity} records from {source.service}")

            except Exception as e:
                step.status = MigrationStatus.FAILED
                step.errors.append({"error": str(e)})
                logger.error(f"Extraction failed for {source.entity}: {e}")

                if not self.config.continue_on_error:
                    raise

            finally:
                step.completed_at = datetime.utcnow()

    def _run_transformation(self):
        """Run the transformation phase."""
        # Load mapping if not provided
        if not self.mapping and self.config.mapping_file:
            self.mapping = MigrationMapping.from_json_file(self.config.mapping_file)

        if not self.mapping:
            logger.warning("No mapping provided, attempting auto-mapping")
            self.mapping = self._auto_generate_mapping()

        # Transform each entity according to mapping
        for mapping_name, entity_mapping in self.mapping.entity_mappings.items():
            step = self.run.add_step(
                name=f"Transform {entity_mapping.source_entity} to {entity_mapping.target_entity}",
                entity=entity_mapping.target_entity,
            )
            step.status = MigrationStatus.TRANSFORMING
            step.started_at = datetime.utcnow()
            self.run.current_step = step.id

            try:
                # Find source data
                source_key = f"{entity_mapping.source_service}_{entity_mapping.source_entity}"
                source_records = self._extracted_data.get(source_key, [])

                if not source_records:
                    step.warnings.append(f"No source data found for {source_key}")
                    step.status = MigrationStatus.COMPLETED
                    continue

                # Transform records
                transformed = []
                for record in source_records:
                    try:
                        result = self.transformer.transform_record(
                            source_records=[record],
                            mapping=entity_mapping,
                            target_service=entity_mapping.target_service,
                            target_entity=entity_mapping.target_entity,
                        )
                        transformed.append(result)
                        step.records_processed += 1
                        step.records_succeeded += 1

                    except Exception as e:
                        step.records_processed += 1
                        step.records_failed += 1
                        step.errors.append({
                            "record_id": record.id,
                            "error": str(e),
                        })

                        if len(step.errors) >= self.config.max_errors:
                            raise RuntimeError(f"Max errors ({self.config.max_errors}) exceeded")

                target_key = f"{entity_mapping.target_service}_{entity_mapping.target_entity}"
                self._transformed_data[target_key] = transformed

                if self.config.save_transformed:
                    self._save_transformed(target_key, transformed)

                step.status = MigrationStatus.COMPLETED
                logger.info(f"Transformed {len(transformed)} {entity_mapping.target_entity} records")

            except Exception as e:
                step.status = MigrationStatus.FAILED
                step.errors.append({"error": str(e)})
                logger.error(f"Transformation failed: {e}")

                if not self.config.continue_on_error:
                    raise

            finally:
                step.completed_at = datetime.utcnow()

    def _run_validation(self):
        """Run the validation phase."""
        for key, records in self._transformed_data.items():
            parts = key.split("_")
            target_service = parts[0]
            target_entity = "_".join(parts[1:])

            step = self.run.add_step(
                name=f"Validate {target_entity}",
                entity=target_entity,
            )
            step.status = MigrationStatus.VALIDATING
            step.started_at = datetime.utcnow()

            try:
                schema = self.registry.get_entity_schema(target_service, target_entity)

                valid_records = []
                for record in records:
                    step.records_processed += 1

                    if schema:
                        errors = self.validator.validate_record(record, schema)
                        record.validation_errors.extend(errors)

                    if record.is_valid:
                        valid_records.append(record)
                        step.records_succeeded += 1
                    else:
                        step.records_failed += 1
                        step.errors.append({
                            "record_id": record.id,
                            "errors": [e.to_dict() for e in record.validation_errors],
                        })

                self._transformed_data[key] = valid_records
                step.status = MigrationStatus.COMPLETED

            except Exception as e:
                step.status = MigrationStatus.FAILED
                step.errors.append({"error": str(e)})

            finally:
                step.completed_at = datetime.utcnow()

    def _run_loading(self):
        """Run the loading phase."""
        # Initialize loader
        self.loader = self._create_loader()

        if not self.loader.validate_connection():
            raise RuntimeError("Failed to connect to target service")

        # Determine loading order
        order = self.mapping.migration_order if self.mapping else None

        # Organize records by target entity
        records_by_entity: Dict[str, List[TransformedRecord]] = {}
        for key, records in self._transformed_data.items():
            parts = key.split("_")
            entity = "_".join(parts[1:])
            if entity not in records_by_entity:
                records_by_entity[entity] = []
            records_by_entity[entity].extend(records)

        # Deduplicate if configured
        if self.config.deduplication:
            records_by_entity = self._deduplicate_records(records_by_entity)

        # Load each entity
        for entity, records in records_by_entity.items():
            step = self.run.add_step(
                name=f"Load {entity}",
                entity=entity,
            )
            step.status = MigrationStatus.LOADING
            step.started_at = datetime.utcnow()
            self.run.current_step = step.id

            try:
                # Stream in batches
                for batch_records in self._batch_iterator(records, self.config.batch_size):
                    result = self.loader.load_batch(batch_records, entity)

                    step.records_processed += result.total_attempted
                    step.records_succeeded += result.total_succeeded
                    step.records_failed += result.total_failed
                    step.errors.extend(result.errors)

                    # Track for rollback
                    if entity not in self.run.rollback_data:
                        self.run.rollback_data[entity] = []
                    self.run.rollback_data[entity].extend(result.created_ids)

                    if len(step.errors) >= self.config.max_errors:
                        raise RuntimeError(f"Max errors ({self.config.max_errors}) exceeded")

                step.status = MigrationStatus.COMPLETED
                logger.info(f"Loaded {step.records_succeeded}/{step.records_processed} {entity} records")

            except Exception as e:
                step.status = MigrationStatus.FAILED
                step.errors.append({"error": str(e)})
                logger.error(f"Loading failed for {entity}: {e}")

                if not self.config.continue_on_error:
                    raise

            finally:
                step.completed_at = datetime.utcnow()

    def _create_extractor(self, source: DataSource) -> BaseExtractor:
        """Create an appropriate extractor for the source."""
        if source.type == DataSourceType.API:
            return APIExtractor(source, api_key=source.api_key)
        elif source.type in (DataSourceType.CSV, DataSourceType.JSON):
            return CSVExtractor(source)
        elif source.type == DataSourceType.SCREENSHOT:
            return ScreenshotExtractor(source)
        elif source.type == DataSourceType.WEB_SCRAPE:
            return WebScraperExtractor(source)
        else:
            raise ValueError(f"Unsupported source type: {source.type}")

    def _create_loader(self) -> BaseLoader:
        """Create an appropriate loader for the target."""
        target = self.config.target_service.lower()

        if target == "chargebee":
            return ChargebeeLoader(
                site=self.config.target_site or "",
                api_key=self.config.target_api_key or "",
                dry_run=self.config.dry_run,
                batch_size=self.config.batch_size,
            )
        else:
            # Generic API loader
            return APILoader(
                target_service=target,
                base_url=self.config.target_site or "",
                api_key=self.config.target_api_key,
                dry_run=self.config.dry_run,
                batch_size=self.config.batch_size,
            )

    def _auto_generate_mapping(self) -> MigrationMapping:
        """Auto-generate mapping using LLM inference."""
        if not self.llm_inference:
            raise RuntimeError("LLM inference not configured for auto-mapping")

        # TODO: Implement auto-mapping logic
        raise NotImplementedError("Auto-mapping not yet implemented")

    def _deduplicate_records(
        self,
        records_by_entity: Dict[str, List[TransformedRecord]]
    ) -> Dict[str, List[TransformedRecord]]:
        """Deduplicate records based on configuration."""
        result = {}

        for entity, records in records_by_entity.items():
            key_field = self.config.deduplication.get(entity, "email")
            preferred_source = self.config.dedup_preferred_source

            seen = {}
            for record in records:
                key_value = record.data.get(key_field)

                if not key_value:
                    # Keep records without key
                    if record.id not in seen:
                        seen[record.id] = record
                    continue

                key_value = str(key_value).lower()

                if key_value not in seen:
                    seen[key_value] = record
                else:
                    # Check if we should replace
                    existing = seen[key_value]
                    new_source = record.source_records[0].source_service if record.source_records else ""
                    existing_source = existing.source_records[0].source_service if existing.source_records else ""

                    if new_source == preferred_source and existing_source != preferred_source:
                        # Merge metadata
                        existing_meta = existing.data.get("meta_data", {})
                        new_meta = record.data.get("meta_data", {})
                        new_meta.update(existing_meta)
                        record.data["meta_data"] = new_meta
                        seen[key_value] = record

            result[entity] = list(seen.values())
            logger.info(f"Deduplicated {entity}: {len(records)} -> {len(result[entity])}")

        return result

    def _batch_iterator(
        self,
        records: List[TransformedRecord],
        batch_size: int
    ) -> Iterator[List[TransformedRecord]]:
        """Iterate over records in batches."""
        for i in range(0, len(records), batch_size):
            yield records[i:i + batch_size]

    def _save_extracted(self, key: str, records: List[SourceRecord]):
        """Save extracted records to file."""
        filepath = self.extracted_dir / f"{key}.json"
        data = [r.to_dict() for r in records]
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2, default=str)

    def _save_transformed(self, key: str, records: List[TransformedRecord]):
        """Save transformed records to file."""
        filepath = self.transformed_dir / f"{key}.json"
        data = [r.to_dict() for r in records]
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2, default=str)

    def _save_report(self):
        """Save the migration report."""
        filepath = self.logs_dir / f"migration_report_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
        with open(filepath, 'w') as f:
            json.dump(self.run.to_dict(), f, indent=2, default=str)
        logger.info(f"Saved migration report to {filepath}")

    def rollback(self) -> Dict[str, int]:
        """Rollback the migration."""
        if not self.loader:
            logger.error("No loader available for rollback")
            return {}

        self.run.status = MigrationStatus.ROLLING_BACK
        logger.info("Starting rollback...")

        deleted = self.loader.rollback()

        self.run.status = MigrationStatus.ROLLED_BACK
        logger.info(f"Rollback completed: {deleted}")

        return deleted

    def stream_records(
        self,
        source: DataSource,
        batch_size: int = 100
    ) -> Iterator[List[SourceRecord]]:
        """Stream records from a source in batches."""
        extractor = self._create_extractor(source)
        yield from extractor.stream(batch_size)

    def add_source_data(
        self,
        service: str,
        entity: str,
        records: List[Dict[str, Any]]
    ):
        """Add source data manually (for iterative refinement)."""
        key = f"{service}_{entity}"
        source_records = []

        for idx, data in enumerate(records):
            record = SourceRecord(
                id=data.get("id", str(idx)),
                source_service=service,
                source_entity=entity,
                data=data,
            )
            source_records.append(record)

        self._extracted_data[key] = source_records
        logger.info(f"Added {len(source_records)} {entity} records from {service}")

    def preview_transformation(
        self,
        source_record: Dict[str, Any],
        source_service: str,
        source_entity: str,
        target_service: str,
        target_entity: str
    ) -> TransformedRecord:
        """Preview a single record transformation."""
        record = SourceRecord(
            id=source_record.get("id", "preview"),
            source_service=source_service,
            source_entity=source_entity,
            data=source_record,
        )

        mapping = self.registry.get_entity_mapping(
            source_service, source_entity,
            target_service, target_entity
        )

        if not mapping:
            raise ValueError(f"No mapping found for {source_entity} -> {target_entity}")

        return self.transformer.transform_record(
            source_records=[record],
            mapping=mapping,
            target_service=target_service,
            target_entity=target_entity,
        )
