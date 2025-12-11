"""Schema registry for managing service schemas and mappings."""

import os
import json
import logging
from typing import Any, Dict, List, Optional
from pathlib import Path

from ..models.schema import (
    ServiceSchema,
    EntitySchema,
    FieldDefinition,
    MigrationMapping,
    EntityMapping,
    FieldMapping,
)

logger = logging.getLogger(__name__)


class SchemaRegistry:
    """
    Registry for managing service schemas and field mappings.

    Supports:
    - Loading schemas from JSON files
    - Registering custom schemas programmatically
    - Looking up field mappings between services
    - Inferring schemas from sample data
    """

    def __init__(self, schemas_dir: Optional[str] = None, mappings_dir: Optional[str] = None):
        """
        Initialize the schema registry.

        Args:
            schemas_dir: Directory containing schema JSON files
            mappings_dir: Directory containing mapping JSON files
        """
        self.schemas: Dict[str, ServiceSchema] = {}
        self.mappings: Dict[str, MigrationMapping] = {}
        self._schemas_dir = schemas_dir
        self._mappings_dir = mappings_dir

        if schemas_dir:
            self.load_schemas_from_directory(schemas_dir)
        if mappings_dir:
            self.load_mappings_from_directory(mappings_dir)

    def load_schemas_from_directory(self, directory: str) -> int:
        """
        Load all schema files from a directory.

        Args:
            directory: Path to directory containing schema JSON files

        Returns:
            Number of schemas loaded
        """
        loaded = 0
        path = Path(directory)

        if not path.exists():
            logger.warning(f"Schema directory does not exist: {directory}")
            return 0

        for file_path in path.glob("**/*.json"):
            try:
                schema = ServiceSchema.from_json_file(str(file_path))
                self.register_schema(schema)
                loaded += 1
                logger.info(f"Loaded schema: {schema.name} from {file_path}")
            except Exception as e:
                logger.error(f"Failed to load schema from {file_path}: {e}")

        return loaded

    def load_mappings_from_directory(self, directory: str) -> int:
        """
        Load all mapping files from a directory.

        Args:
            directory: Path to directory containing mapping JSON files

        Returns:
            Number of mappings loaded
        """
        loaded = 0
        path = Path(directory)

        if not path.exists():
            logger.warning(f"Mappings directory does not exist: {directory}")
            return 0

        for file_path in path.glob("**/*.json"):
            try:
                mapping = MigrationMapping.from_json_file(str(file_path))
                self.register_mapping(mapping)
                loaded += 1
                logger.info(f"Loaded mapping: {mapping.name} from {file_path}")
            except Exception as e:
                logger.error(f"Failed to load mapping from {file_path}: {e}")

        return loaded

    def register_schema(self, schema: ServiceSchema) -> None:
        """Register a service schema."""
        self.schemas[schema.name.lower()] = schema

    def register_mapping(self, mapping: MigrationMapping) -> None:
        """Register a migration mapping."""
        self.mappings[mapping.name.lower()] = mapping

    def get_schema(self, service_name: str) -> Optional[ServiceSchema]:
        """Get a schema by service name."""
        return self.schemas.get(service_name.lower())

    def get_entity_schema(self, service_name: str, entity_name: str) -> Optional[EntitySchema]:
        """Get an entity schema from a service."""
        schema = self.get_schema(service_name)
        if schema:
            return schema.entities.get(entity_name)
        return None

    def get_mapping(self, mapping_name: str) -> Optional[MigrationMapping]:
        """Get a migration mapping by name."""
        return self.mappings.get(mapping_name.lower())

    def get_entity_mapping(
        self,
        source_service: str,
        source_entity: str,
        target_service: str,
        target_entity: str
    ) -> Optional[EntityMapping]:
        """
        Find an entity mapping between source and target.

        Args:
            source_service: Source service name
            source_entity: Source entity name
            target_service: Target service name
            target_entity: Target entity name

        Returns:
            EntityMapping if found, None otherwise
        """
        for mapping in self.mappings.values():
            for entity_mapping in mapping.entity_mappings.values():
                if (entity_mapping.source_service.lower() == source_service.lower() and
                    entity_mapping.source_entity.lower() == source_entity.lower() and
                    entity_mapping.target_service.lower() == target_service.lower() and
                    entity_mapping.target_entity.lower() == target_entity.lower()):
                    return entity_mapping
        return None

    def list_schemas(self) -> List[str]:
        """List all registered schema names."""
        return list(self.schemas.keys())

    def list_mappings(self) -> List[str]:
        """List all registered mapping names."""
        return list(self.mappings.keys())

    def list_entities(self, service_name: str) -> List[str]:
        """List all entities in a service schema."""
        schema = self.get_schema(service_name)
        if schema:
            return list(schema.entities.keys())
        return []

    def infer_schema_from_data(
        self,
        data: List[Dict[str, Any]],
        service_name: str,
        entity_name: str
    ) -> EntitySchema:
        """
        Infer an entity schema from sample data.

        Args:
            data: List of sample records
            service_name: Name of the service
            entity_name: Name of the entity

        Returns:
            Inferred EntitySchema
        """
        fields = {}

        # Analyze all records to build field definitions
        field_types: Dict[str, set] = {}
        field_examples: Dict[str, Any] = {}
        field_required: Dict[str, bool] = {}

        for record in data:
            self._analyze_record(record, "", field_types, field_examples, field_required)

        # Convert analysis to field definitions
        for field_path, types in field_types.items():
            field_name = field_path.split(".")[-1] if "." in field_path else field_path
            field_type = self._determine_field_type(types)

            fields[field_path] = FieldDefinition(
                name=field_name,
                type=field_type,
                required=field_required.get(field_path, False),
                example=field_examples.get(field_path),
            )

        return EntitySchema(
            name=entity_name,
            description=f"Auto-inferred schema for {entity_name}",
            fields=fields,
        )

    def _analyze_record(
        self,
        data: Any,
        prefix: str,
        field_types: Dict[str, set],
        field_examples: Dict[str, Any],
        field_required: Dict[str, bool]
    ) -> None:
        """Recursively analyze a record to infer field types."""
        if isinstance(data, dict):
            for key, value in data.items():
                path = f"{prefix}.{key}" if prefix else key

                if path not in field_types:
                    field_types[path] = set()
                    field_required[path] = True

                if value is None:
                    field_required[path] = False
                else:
                    value_type = self._get_python_type(value)
                    field_types[path].add(value_type)

                    if path not in field_examples and value is not None:
                        field_examples[path] = value

                    # Recurse into nested structures
                    if isinstance(value, dict):
                        self._analyze_record(value, path, field_types, field_examples, field_required)
                    elif isinstance(value, list) and value and isinstance(value[0], dict):
                        self._analyze_record(value[0], f"{path}[]", field_types, field_examples, field_required)

    def _get_python_type(self, value: Any) -> str:
        """Get the type name for a Python value."""
        if isinstance(value, bool):
            return "boolean"
        elif isinstance(value, int):
            return "integer"
        elif isinstance(value, float):
            return "decimal"
        elif isinstance(value, str):
            return "string"
        elif isinstance(value, list):
            return "array"
        elif isinstance(value, dict):
            return "object"
        else:
            return "string"

    def _determine_field_type(self, types: set) -> str:
        """Determine the best field type from observed types."""
        from ..models.schema import FieldType

        if not types:
            return FieldType.STRING

        # Priority order for type coercion
        if "object" in types:
            return FieldType.OBJECT
        elif "array" in types:
            return FieldType.ARRAY
        elif types == {"integer"}:
            return FieldType.INTEGER
        elif types == {"decimal"} or types == {"integer", "decimal"}:
            return FieldType.DECIMAL
        elif types == {"boolean"}:
            return FieldType.BOOLEAN
        else:
            return FieldType.STRING

    def create_mapping_from_schemas(
        self,
        source_schema: EntitySchema,
        target_schema: EntitySchema,
        source_service: str,
        target_service: str,
        auto_match: bool = True
    ) -> EntityMapping:
        """
        Create a mapping between two entity schemas.

        Args:
            source_schema: Source entity schema
            target_schema: Target entity schema
            source_service: Source service name
            target_service: Target service name
            auto_match: Whether to auto-match fields by name

        Returns:
            Created EntityMapping
        """
        field_mappings = []

        if auto_match:
            # Auto-match fields by normalized name
            source_fields = {self._normalize_field_name(f): f for f in source_schema.fields.keys()}
            target_fields = {self._normalize_field_name(f): f for f in target_schema.fields.keys()}

            for normalized_name, target_field in target_fields.items():
                if normalized_name in source_fields:
                    source_field = source_fields[normalized_name]
                    from ..models.schema import TransformType, FieldMapping as FM

                    field_mappings.append(FM(
                        source_field=source_field,
                        target_field=target_field,
                        transform=TransformType.DIRECT,
                        notes="Auto-matched by name",
                    ))

        mapping_name = f"{source_service}_{source_schema.name}_to_{target_service}_{target_schema.name}"

        return EntityMapping(
            name=mapping_name,
            source_entity=source_schema.name,
            target_entity=target_schema.name,
            source_service=source_service,
            target_service=target_service,
            field_mappings=field_mappings,
        )

    def _normalize_field_name(self, name: str) -> str:
        """Normalize a field name for matching."""
        # Convert to lowercase, remove underscores/dashes, handle common variations
        normalized = name.lower().replace("_", "").replace("-", "")

        # Handle common variations
        variations = {
            "firstname": "firstname",
            "first_name": "firstname",
            "lastName": "lastname",
            "last_name": "lastname",
            "email": "email",
            "emailaddress": "email",
            "phone": "phone",
            "phonenumber": "phone",
            "createdat": "createdat",
            "created": "createdat",
            "createddate": "createdat",
            "updatedat": "updatedat",
            "updated": "updatedat",
            "modifieddate": "updatedat",
            "lastmodifieddate": "updatedat",
        }

        return variations.get(normalized, normalized)

    def export_schema(self, service_name: str, file_path: str) -> bool:
        """Export a schema to a JSON file."""
        schema = self.get_schema(service_name)
        if not schema:
            return False

        with open(file_path, 'w') as f:
            json.dump(schema.to_dict(), f, indent=2)
        return True

    def export_mapping(self, mapping_name: str, file_path: str) -> bool:
        """Export a mapping to a JSON file."""
        mapping = self.get_mapping(mapping_name)
        if not mapping:
            return False

        with open(file_path, 'w') as f:
            json.dump(mapping.to_dict(), f, indent=2)
        return True

    def validate_mapping(self, mapping: EntityMapping) -> List[str]:
        """
        Validate an entity mapping against registered schemas.

        Returns:
            List of validation error messages
        """
        errors = []

        source_schema = self.get_entity_schema(mapping.source_service, mapping.source_entity)
        target_schema = self.get_entity_schema(mapping.target_service, mapping.target_entity)

        if not source_schema:
            errors.append(f"Source schema not found: {mapping.source_service}.{mapping.source_entity}")

        if not target_schema:
            errors.append(f"Target schema not found: {mapping.target_service}.{mapping.target_entity}")

        if source_schema and target_schema:
            for fm in mapping.field_mappings:
                # Check source field exists
                if fm.source_field and fm.source_field not in source_schema.fields:
                    # Allow dot notation for nested fields
                    root_field = fm.source_field.split(".")[0]
                    if root_field not in source_schema.fields:
                        errors.append(f"Source field not found: {fm.source_field}")

                # Check target field exists
                if fm.target_field:
                    root_field = fm.target_field.split(".")[0]
                    if root_field not in target_schema.fields and not fm.target_field.startswith("meta_data"):
                        errors.append(f"Target field not found: {fm.target_field}")

            # Check required target fields have mappings
            mapped_targets = {fm.target_field for fm in mapping.field_mappings}
            for field_name, field_def in target_schema.fields.items():
                if field_def.required and field_name not in mapped_targets:
                    errors.append(f"Required target field has no mapping: {field_name}")

        return errors
