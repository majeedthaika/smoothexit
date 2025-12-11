"""Schema models for service definitions and field mappings."""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Union
from enum import Enum
import json


class FieldType(str, Enum):
    """Supported field types."""
    STRING = "string"
    INTEGER = "integer"
    DECIMAL = "decimal"
    BOOLEAN = "boolean"
    TIMESTAMP = "timestamp"
    DATE = "date"
    DATETIME = "datetime"
    ENUM = "enum"
    OBJECT = "object"
    ARRAY = "array"
    JSON = "json"
    CURRENCY = "currency"


class TransformType(str, Enum):
    """Supported transformation types."""
    DIRECT = "direct"
    PREFIX_ADD = "prefix_add"
    PREFIX_STRIP = "prefix_strip"
    PREFIX_STRIP_AND_ADD = "prefix_strip_and_add"
    SPLIT_NAME = "split_name"
    TRUNCATE = "truncate"
    UPPERCASE = "uppercase"
    LOWERCASE = "lowercase"
    ENUM_MAP = "enum_map"
    BOOLEAN_TO_ENUM = "boolean_to_enum"
    TO_METADATA = "to_metadata"
    MERGE = "merge"
    ARRAY_MAP = "array_map"
    DEFAULT = "default"
    COALESCE = "coalesce"
    COALESCE_FIELDS = "coalesce_fields"
    CONDITIONAL = "conditional"
    TIER_MAPPING = "tier_mapping"
    NEGATE_IF_POSITIVE = "negate_if_positive"
    NEGATE_IF_NEGATIVE = "negate_if_negative"
    ISO_TO_UNIX = "iso_to_unix"
    UNIX_TO_ISO = "unix_to_iso"
    MULTIPLY = "multiply"
    DIVIDE = "divide"
    COUNTRY_CODE = "country_code"
    CLEAN_PHONE = "clean_phone"
    ADDRESS_MAPPING = "address_mapping"
    LOOKUP = "lookup"
    COMPILE_METADATA = "compile_metadata"
    CUSTOM = "custom"


@dataclass
class FieldDefinition:
    """Definition of a field in a service schema."""
    name: str
    type: FieldType
    description: str = ""
    required: bool = False
    max_length: Optional[int] = None
    enum_values: Optional[List[str]] = None
    default: Optional[Any] = None
    example: Optional[Any] = None
    properties: Optional[Dict[str, "FieldDefinition"]] = None  # For object types
    items: Optional["FieldDefinition"] = None  # For array types
    notes: str = ""

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        result = {
            "name": self.name,
            "type": self.type.value if isinstance(self.type, FieldType) else self.type,
            "description": self.description,
            "required": self.required,
        }
        if self.max_length:
            result["max_length"] = self.max_length
        if self.enum_values:
            result["enum"] = self.enum_values
        if self.default is not None:
            result["default"] = self.default
        if self.example is not None:
            result["example"] = self.example
        if self.properties:
            result["properties"] = {k: v.to_dict() for k, v in self.properties.items()}
        if self.items:
            result["items"] = self.items.to_dict()
        if self.notes:
            result["notes"] = self.notes
        return result

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "FieldDefinition":
        """Create from dictionary representation."""
        field_type = data.get("type", "string")
        if isinstance(field_type, str):
            try:
                field_type = FieldType(field_type)
            except ValueError:
                field_type = FieldType.STRING

        properties = None
        if "properties" in data and data["properties"]:
            properties = {k: cls.from_dict(v) for k, v in data["properties"].items()}

        items = None
        if "items" in data and data["items"]:
            items = cls.from_dict(data["items"])

        return cls(
            name=data.get("name", ""),
            type=field_type,
            description=data.get("description", ""),
            required=data.get("required", False),
            max_length=data.get("max_length"),
            enum_values=data.get("enum"),
            default=data.get("default"),
            example=data.get("example"),
            properties=properties,
            items=items,
            notes=data.get("notes", ""),
        )


@dataclass
class EntitySchema:
    """Schema for an entity (e.g., Customer, Product, Subscription)."""
    name: str
    description: str = ""
    api_endpoint: str = ""
    fields: Dict[str, FieldDefinition] = field(default_factory=dict)
    primary_key: str = "id"

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "name": self.name,
            "description": self.description,
            "api_endpoint": self.api_endpoint,
            "fields": {k: v.to_dict() for k, v in self.fields.items()},
            "primary_key": self.primary_key,
        }

    @classmethod
    def from_dict(cls, name: str, data: Dict[str, Any]) -> "EntitySchema":
        """Create from dictionary representation."""
        fields = {}
        for field_name, field_data in data.get("fields", {}).items():
            if isinstance(field_data, dict):
                field_def = FieldDefinition.from_dict({**field_data, "name": field_name})
                fields[field_name] = field_def

        return cls(
            name=name,
            description=data.get("description", ""),
            api_endpoint=data.get("api_endpoint", ""),
            fields=fields,
            primary_key=data.get("primary_key", "id"),
        )


@dataclass
class ServiceSchema:
    """Schema for a complete service (e.g., Stripe, Chargebee)."""
    name: str
    version: str = ""
    description: str = ""
    entities: Dict[str, EntitySchema] = field(default_factory=dict)
    api_version: str = ""
    base_url: str = ""

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "name": self.name,
            "version": self.version,
            "description": self.description,
            "entities": {k: v.to_dict() for k, v in self.entities.items()},
            "api_version": self.api_version,
            "base_url": self.base_url,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ServiceSchema":
        """Create from dictionary representation."""
        entities = {}
        for entity_name, entity_data in data.get("entities", {}).items():
            entities[entity_name] = EntitySchema.from_dict(entity_name, entity_data)

        return cls(
            name=data.get("name", ""),
            version=data.get("version", ""),
            description=data.get("description", ""),
            entities=entities,
            api_version=data.get("api_version", ""),
            base_url=data.get("base_url", ""),
        )

    @classmethod
    def from_json_file(cls, file_path: str) -> "ServiceSchema":
        """Load schema from JSON file."""
        with open(file_path, 'r') as f:
            data = json.load(f)
        return cls.from_dict(data)


@dataclass
class FieldMapping:
    """Mapping between a source field and target field."""
    source_field: Optional[str]  # None if generated/default
    target_field: str
    transform: TransformType = TransformType.DIRECT
    transform_config: Dict[str, Any] = field(default_factory=dict)
    notes: str = ""
    required: bool = False
    default_value: Optional[Any] = None
    condition: Optional[str] = None  # Condition for when to apply this mapping

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        result = {
            "source_field": self.source_field,
            "target_field": self.target_field,
            "transform": self.transform.value if isinstance(self.transform, TransformType) else self.transform,
        }
        if self.transform_config:
            result["transform_config"] = self.transform_config
        if self.notes:
            result["notes"] = self.notes
        if self.required:
            result["required"] = self.required
        if self.default_value is not None:
            result["default"] = self.default_value
        if self.condition:
            result["condition"] = self.condition
        return result

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "FieldMapping":
        """Create from dictionary representation."""
        transform = data.get("transform", "direct")
        if isinstance(transform, str):
            try:
                transform = TransformType(transform)
            except ValueError:
                transform = TransformType.CUSTOM

        return cls(
            source_field=data.get("source_field"),
            target_field=data.get("target_field", ""),
            transform=transform,
            transform_config=data.get("transform_config", {}),
            notes=data.get("notes", ""),
            required=data.get("required", False),
            default_value=data.get("default"),
            condition=data.get("condition"),
        )


@dataclass
class EntityMapping:
    """Mapping between source and target entities."""
    name: str
    source_entity: str
    target_entity: str
    source_service: str
    target_service: str
    description: str = ""
    field_mappings: List[FieldMapping] = field(default_factory=list)
    dependencies: List[str] = field(default_factory=list)
    notes: str = ""

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "name": self.name,
            "source": f"{self.source_service}.{self.source_entity}",
            "target": f"{self.target_service}.{self.target_entity}",
            "description": self.description,
            "field_mappings": [m.to_dict() for m in self.field_mappings],
            "dependencies": self.dependencies,
            "notes": self.notes,
        }

    @classmethod
    def from_dict(cls, name: str, data: Dict[str, Any]) -> "EntityMapping":
        """Create from dictionary representation."""
        source_parts = data.get("source", ".").split(".")
        target_parts = data.get("target", ".").split(".")

        field_mappings = []
        for fm_data in data.get("field_mappings", []):
            field_mappings.append(FieldMapping.from_dict(fm_data))

        return cls(
            name=name,
            source_entity=source_parts[-1] if source_parts else "",
            target_entity=target_parts[-1] if target_parts else "",
            source_service=source_parts[0] if len(source_parts) > 1 else "",
            target_service=target_parts[0] if len(target_parts) > 1 else "",
            description=data.get("description", ""),
            field_mappings=field_mappings,
            dependencies=data.get("dependencies", []),
            notes=data.get("notes", ""),
        )


@dataclass
class MigrationMapping:
    """Complete mapping configuration for a migration."""
    name: str
    version: str = "1.0"
    description: str = ""
    source_services: List[str] = field(default_factory=list)
    target_service: str = ""
    entity_mappings: Dict[str, EntityMapping] = field(default_factory=dict)
    migration_order: List[str] = field(default_factory=list)
    transform_functions: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    status_mappings: Dict[str, Dict[str, str]] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "name": self.name,
            "version": self.version,
            "description": self.description,
            "source_services": self.source_services,
            "target_service": self.target_service,
            "mappings": {k: v.to_dict() for k, v in self.entity_mappings.items()},
            "migration_order": self.migration_order,
            "transform_functions": self.transform_functions,
            "status_mappings": self.status_mappings,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "MigrationMapping":
        """Create from dictionary representation."""
        entity_mappings = {}
        for name, mapping_data in data.get("mappings", {}).items():
            entity_mappings[name] = EntityMapping.from_dict(name, mapping_data)

        return cls(
            name=data.get("name", ""),
            version=data.get("version", "1.0"),
            description=data.get("description", ""),
            source_services=data.get("source_services", []),
            target_service=data.get("target_service", ""),
            entity_mappings=entity_mappings,
            migration_order=data.get("migration_order", []),
            transform_functions=data.get("transform_functions", {}),
            status_mappings=data.get("status_mappings", {}),
        )

    @classmethod
    def from_json_file(cls, file_path: str) -> "MigrationMapping":
        """Load mapping from JSON file."""
        with open(file_path, 'r') as f:
            data = json.load(f)
        return cls.from_dict(data)

    def save_to_json(self, file_path: str) -> None:
        """Save mapping to JSON file."""
        with open(file_path, 'w') as f:
            json.dump(self.to_dict(), f, indent=2)
