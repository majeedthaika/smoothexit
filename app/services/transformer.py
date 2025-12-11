"""Transformation engine for converting records between service formats."""

import re
import logging
from typing import Any, Callable, Dict, List, Optional, Tuple
from datetime import datetime
from dateutil import parser as date_parser

from ..models.schema import (
    TransformType,
    EntityMapping,
    FieldMapping,
)
from ..models.record import (
    SourceRecord,
    TransformedRecord,
    ValidationError,
)

logger = logging.getLogger(__name__)


class TransformEngine:
    """
    Engine for transforming source records to target format.

    Supports:
    - Built-in transformation functions
    - Custom transformation functions
    - Nested field access
    - Multiple source records merging
    """

    def __init__(self):
        """Initialize the transform engine."""
        self._custom_transforms: Dict[str, Callable] = {}
        self._builtin_transforms = self._register_builtin_transforms()

    def _register_builtin_transforms(self) -> Dict[str, Callable]:
        """Register all built-in transformation functions."""
        return {
            TransformType.DIRECT.value: self._transform_direct,
            TransformType.PREFIX_ADD.value: self._transform_prefix_add,
            TransformType.PREFIX_STRIP.value: self._transform_prefix_strip,
            TransformType.PREFIX_STRIP_AND_ADD.value: self._transform_prefix_strip_and_add,
            TransformType.SPLIT_NAME.value: self._transform_split_name,
            TransformType.TRUNCATE.value: self._transform_truncate,
            TransformType.UPPERCASE.value: self._transform_uppercase,
            TransformType.LOWERCASE.value: self._transform_lowercase,
            TransformType.ENUM_MAP.value: self._transform_enum_map,
            TransformType.BOOLEAN_TO_ENUM.value: self._transform_boolean_to_enum,
            TransformType.TO_METADATA.value: self._transform_to_metadata,
            TransformType.MERGE.value: self._transform_merge,
            TransformType.ARRAY_MAP.value: self._transform_array_map,
            TransformType.DEFAULT.value: self._transform_default,
            TransformType.COALESCE.value: self._transform_coalesce,
            TransformType.COALESCE_FIELDS.value: self._transform_coalesce_fields,
            TransformType.CONDITIONAL.value: self._transform_conditional,
            TransformType.TIER_MAPPING.value: self._transform_tier_mapping,
            TransformType.NEGATE_IF_POSITIVE.value: self._transform_negate_if_positive,
            TransformType.NEGATE_IF_NEGATIVE.value: self._transform_negate_if_negative,
            TransformType.ISO_TO_UNIX.value: self._transform_iso_to_unix,
            TransformType.UNIX_TO_ISO.value: self._transform_unix_to_iso,
            TransformType.MULTIPLY.value: self._transform_multiply,
            TransformType.DIVIDE.value: self._transform_divide,
            TransformType.COUNTRY_CODE.value: self._transform_country_code,
            TransformType.CLEAN_PHONE.value: self._transform_clean_phone,
            TransformType.ADDRESS_MAPPING.value: self._transform_address_mapping,
            TransformType.LOOKUP.value: self._transform_lookup,
            TransformType.COMPILE_METADATA.value: self._transform_compile_metadata,
        }

    def register_transform(self, name: str, func: Callable) -> None:
        """Register a custom transformation function."""
        self._custom_transforms[name] = func

    def transform_record(
        self,
        source_records: List[SourceRecord],
        mapping: EntityMapping,
        target_service: str,
        target_entity: str,
        context: Optional[Dict[str, Any]] = None
    ) -> TransformedRecord:
        """
        Transform source record(s) to target format.

        Args:
            source_records: List of source records (allows merging from multiple sources)
            mapping: Entity mapping to use
            target_service: Target service name
            target_entity: Target entity name
            context: Additional context (e.g., lookup tables)

        Returns:
            Transformed record
        """
        context = context or {}

        # Build combined source data for lookups
        combined_data = {}
        for record in source_records:
            combined_data[record.source_service] = record.data

        # Determine the target ID
        target_id = self._generate_target_id(source_records, mapping)

        # Transform each field
        target_data = {}
        errors = []
        warnings = []

        for field_mapping in mapping.field_mappings:
            try:
                # Check condition if present
                if field_mapping.condition:
                    if not self._evaluate_condition(field_mapping.condition, combined_data, context):
                        continue

                # Get source value
                source_value = self._get_source_value(
                    field_mapping.source_field,
                    source_records,
                    combined_data
                )

                # Apply transformation
                transform_name = (
                    field_mapping.transform.value
                    if isinstance(field_mapping.transform, TransformType)
                    else field_mapping.transform
                )

                transform_func = (
                    self._custom_transforms.get(transform_name) or
                    self._builtin_transforms.get(transform_name)
                )

                if not transform_func:
                    if transform_name == TransformType.CUSTOM.value:
                        # Custom transform requires a registered function
                        func_name = field_mapping.transform_config.get("function")
                        transform_func = self._custom_transforms.get(func_name)

                if transform_func:
                    transformed_value = transform_func(
                        source_value,
                        field_mapping.transform_config,
                        combined_data,
                        context
                    )
                else:
                    transformed_value = source_value
                    warnings.append(f"Unknown transform: {transform_name}, using direct copy")

                # Handle default values
                if transformed_value is None and field_mapping.default_value is not None:
                    transformed_value = field_mapping.default_value

                # Set the value in target data
                if transformed_value is not None:
                    self._set_nested_value(target_data, field_mapping.target_field, transformed_value)

            except Exception as e:
                error = ValidationError(
                    field=field_mapping.target_field,
                    message=f"Transform error: {str(e)}",
                    error_type="transform",
                    value=field_mapping.source_field,
                )
                errors.append(error)
                logger.error(f"Transform error for {field_mapping.target_field}: {e}")

        return TransformedRecord(
            id=target_id,
            target_service=target_service,
            target_entity=target_entity,
            data=target_data,
            source_records=source_records,
            validation_errors=errors,
            warnings=warnings,
        )

    def _generate_target_id(
        self,
        source_records: List[SourceRecord],
        mapping: EntityMapping
    ) -> str:
        """Generate the target ID from source records."""
        # Look for ID mapping in field mappings
        for fm in mapping.field_mappings:
            if fm.target_field == "id":
                source_value = self._get_source_value(fm.source_field, source_records, {})
                if source_value:
                    transform_name = (
                        fm.transform.value
                        if isinstance(fm.transform, TransformType)
                        else fm.transform
                    )
                    transform_func = self._builtin_transforms.get(transform_name)
                    if transform_func:
                        return transform_func(source_value, fm.transform_config, {}, {})
                    return str(source_value)

        # Default: use first source record ID with prefix
        if source_records:
            return f"{source_records[0].source_service}_{source_records[0].id}"
        return ""

    def _get_source_value(
        self,
        field_path: Optional[str],
        source_records: List[SourceRecord],
        combined_data: Dict[str, Dict]
    ) -> Any:
        """Get a value from source records by field path."""
        if not field_path:
            return None

        # Check if path specifies a service (e.g., "stripe.customer.email")
        parts = field_path.split(".")

        if len(parts) > 1 and parts[0].lower() in [r.source_service.lower() for r in source_records]:
            service = parts[0].lower()
            remaining_path = ".".join(parts[1:])
            data = combined_data.get(service, {})
            return self._get_nested_value(data, remaining_path)

        # Otherwise, try each source record
        for record in source_records:
            value = self._get_nested_value(record.data, field_path)
            if value is not None:
                return value

        return None

    def _get_nested_value(self, data: Dict[str, Any], path: str) -> Any:
        """Get a nested value using dot notation."""
        parts = path.split(".")
        value = data

        for part in parts:
            if value is None:
                return None

            # Handle array indexing (e.g., "items[0]" or "items.0")
            array_match = re.match(r"^(\w+)\[(\d+)\]$", part)
            if array_match:
                key, index = array_match.groups()
                if isinstance(value, dict):
                    value = value.get(key)
                if isinstance(value, list) and int(index) < len(value):
                    value = value[int(index)]
                else:
                    return None
            elif isinstance(value, dict):
                value = value.get(part)
            elif isinstance(value, list) and part.isdigit():
                idx = int(part)
                value = value[idx] if idx < len(value) else None
            else:
                return None

        return value

    def _set_nested_value(self, data: Dict[str, Any], path: str, value: Any) -> None:
        """Set a nested value using dot notation."""
        parts = path.split(".")
        current = data

        for i, part in enumerate(parts[:-1]):
            if part not in current:
                current[part] = {}
            current = current[part]

        current[parts[-1]] = value

    def _evaluate_condition(
        self,
        condition: str,
        combined_data: Dict[str, Dict],
        context: Dict[str, Any]
    ) -> bool:
        """Evaluate a condition expression."""
        # Simple condition evaluator
        # Supports: "field exists", "field == value", "field != value"
        try:
            if " exists" in condition:
                field = condition.replace(" exists", "").strip()
                for service_data in combined_data.values():
                    if self._get_nested_value(service_data, field) is not None:
                        return True
                return False

            if " == " in condition:
                field, expected = condition.split(" == ")
                for service_data in combined_data.values():
                    value = self._get_nested_value(service_data, field.strip())
                    if str(value) == expected.strip().strip("'\""):
                        return True
                return False

            if " != " in condition:
                field, expected = condition.split(" != ")
                for service_data in combined_data.values():
                    value = self._get_nested_value(service_data, field.strip())
                    if str(value) != expected.strip().strip("'\""):
                        return True
                return False

            return True

        except Exception as e:
            logger.warning(f"Condition evaluation failed: {condition}, error: {e}")
            return True

    # Built-in transform functions

    def _transform_direct(self, value: Any, config: Dict, data: Dict, ctx: Dict) -> Any:
        """Direct copy without transformation."""
        return value

    def _transform_prefix_add(self, value: Any, config: Dict, data: Dict, ctx: Dict) -> Any:
        """Add a prefix to the value."""
        if value is None:
            return None
        prefix = config.get("prefix", "")
        return f"{prefix}{value}"

    def _transform_prefix_strip(self, value: Any, config: Dict, data: Dict, ctx: Dict) -> Any:
        """Strip a prefix and optionally add a new one."""
        if value is None:
            return None
        value_str = str(value)
        prefix = config.get("prefix", "")
        new_prefix = config.get("new_prefix", "")

        if value_str.startswith(prefix):
            value_str = value_str[len(prefix):]

        return f"{new_prefix}{value_str}"

    def _transform_prefix_strip_and_add(self, value: Any, config: Dict, data: Dict, ctx: Dict) -> Any:
        """Strip one prefix and add another."""
        if value is None:
            return None
        value_str = str(value)
        strip = config.get("strip", "")
        add = config.get("add", "")

        if value_str.startswith(strip):
            value_str = value_str[len(strip):]

        return f"{add}{value_str}"

    def _transform_split_name(self, value: Any, config: Dict, data: Dict, ctx: Dict) -> Any:
        """Split a name into first/last parts."""
        if not value:
            return None

        part = config.get("part", "first")
        parts = str(value).split(" ", 1)

        if part == "first":
            return parts[0] if parts else None
        elif part == "last":
            return parts[1] if len(parts) > 1 else None

        return value

    def _transform_truncate(self, value: Any, config: Dict, data: Dict, ctx: Dict) -> Any:
        """Truncate to max length."""
        if value is None:
            return None
        max_length = config.get("max_length", 255)
        return str(value)[:max_length]

    def _transform_uppercase(self, value: Any, config: Dict, data: Dict, ctx: Dict) -> Any:
        """Convert to uppercase."""
        if value is None:
            return None
        return str(value).upper()

    def _transform_lowercase(self, value: Any, config: Dict, data: Dict, ctx: Dict) -> Any:
        """Convert to lowercase."""
        if value is None:
            return None
        return str(value).lower()

    def _transform_enum_map(self, value: Any, config: Dict, data: Dict, ctx: Dict) -> Any:
        """Map value using a lookup table."""
        if value is None:
            return config.get("default")

        mapping = config.get("mapping", {})
        return mapping.get(str(value), config.get("default"))

    def _transform_boolean_to_enum(self, value: Any, config: Dict, data: Dict, ctx: Dict) -> Any:
        """Convert boolean to enum value."""
        if value is None:
            return config.get("false_value") or config.get("false")

        true_value = config.get("true_value") or config.get("true")
        false_value = config.get("false_value") or config.get("false")

        if isinstance(value, bool):
            return true_value if value else false_value
        elif isinstance(value, str):
            return true_value if value.lower() in ("true", "1", "yes") else false_value
        else:
            return true_value if value else false_value

    def _transform_to_metadata(self, value: Any, config: Dict, data: Dict, ctx: Dict) -> Any:
        """Store value in metadata (returns value as-is, path handles placement)."""
        return value

    def _transform_merge(self, value: Any, config: Dict, data: Dict, ctx: Dict) -> Any:
        """Merge dictionaries."""
        if not isinstance(value, dict):
            return value

        additional = config.get("additional_fields", {})
        result = dict(value)

        for key, path in additional.items():
            for service_data in data.values():
                nested_value = self._get_nested_value(service_data, path)
                if nested_value is not None:
                    result[key] = nested_value
                    break

        return result

    def _transform_array_map(self, value: Any, config: Dict, data: Dict, ctx: Dict) -> Any:
        """Map array items using a sub-mapping."""
        if not isinstance(value, list):
            return value

        item_mapping = config.get("item_mapping", {})
        id_transform = config.get("id_transform", {})
        result = []

        for item in value:
            mapped_item = {}
            for source_key, target_key in item_mapping.items():
                item_value = self._get_nested_value(item, source_key)

                # Apply ID transform if specified
                if target_key.endswith("_id") and id_transform and item_value:
                    prefix = id_transform.get("prefix", "")
                    new_prefix = id_transform.get("new_prefix", "")
                    item_value = str(item_value)
                    if item_value.startswith(prefix):
                        item_value = item_value[len(prefix):]
                    item_value = f"{new_prefix}{item_value}"

                mapped_item[target_key] = item_value

            result.append(mapped_item)

        return result

    def _transform_default(self, value: Any, config: Dict, data: Dict, ctx: Dict) -> Any:
        """Return default value if source is None."""
        if value is None:
            return config.get("value")
        return value

    def _transform_coalesce(self, value: Any, config: Dict, data: Dict, ctx: Dict) -> Any:
        """Use first non-null value."""
        if value is not None:
            return value

        fallback_field = config.get("fallback_field")
        if fallback_field:
            for service_data in data.values():
                fallback_value = self._get_nested_value(service_data, fallback_field)
                if fallback_value is not None:
                    suffix = config.get("fallback_suffix", "")
                    return f"{fallback_value}{suffix}" if suffix else fallback_value

        return None

    def _transform_coalesce_fields(self, value: Any, config: Dict, data: Dict, ctx: Dict) -> Any:
        """Use first non-null value from multiple fields."""
        if value is not None:
            return value

        fallback_fields = config.get("fallback_fields", [])
        for field in fallback_fields:
            for service_data in data.values():
                fallback_value = self._get_nested_value(service_data, field)
                if fallback_value is not None:
                    return fallback_value

        return None

    def _transform_conditional(self, value: Any, config: Dict, data: Dict, ctx: Dict) -> Any:
        """Apply conditional logic."""
        conditions = config.get("conditions", [])

        for condition in conditions:
            if "value" in condition and str(value) == str(condition["value"]):
                return condition.get("result")
            if "if" in condition:
                if self._evaluate_condition(condition["if"], data, ctx):
                    return condition.get("then")
            if "default" in condition:
                return condition["default"]

        return value

    def _transform_tier_mapping(self, value: Any, config: Dict, data: Dict, ctx: Dict) -> Any:
        """Transform tiered pricing structure."""
        if not isinstance(value, list):
            return value

        field_mapping = config.get("field_mapping", {
            "up_to": "ending_unit",
            "unit_amount": "price",
        })
        null_up_to = config.get("null_up_to", "inf")

        result = []
        starting_unit = 1

        for tier in value:
            mapped_tier = {"starting_unit": starting_unit}

            up_to = tier.get("up_to")
            if up_to is None:
                mapped_tier["ending_unit"] = null_up_to
            else:
                mapped_tier["ending_unit"] = up_to

            # Map price fields
            for source_key, target_key in field_mapping.items():
                if source_key in tier:
                    mapped_tier[target_key] = tier[source_key]

            result.append(mapped_tier)
            starting_unit = (up_to or 0) + 1

        return result

    def _transform_negate_if_positive(self, value: Any, config: Dict, data: Dict, ctx: Dict) -> Any:
        """Negate value if positive."""
        if value is None:
            return None
        try:
            num = float(value)
            return -num if num > 0 else num
        except (ValueError, TypeError):
            return value

    def _transform_negate_if_negative(self, value: Any, config: Dict, data: Dict, ctx: Dict) -> Any:
        """Return absolute value if negative."""
        if value is None:
            return None
        try:
            num = float(value)
            return abs(num)
        except (ValueError, TypeError):
            return value

    def _transform_iso_to_unix(self, value: Any, config: Dict, data: Dict, ctx: Dict) -> Any:
        """Convert ISO datetime string to Unix timestamp."""
        if value is None:
            return None

        try:
            if isinstance(value, (int, float)):
                return int(value)  # Already a timestamp
            dt = date_parser.parse(str(value))
            return int(dt.timestamp())
        except Exception:
            return None

    def _transform_unix_to_iso(self, value: Any, config: Dict, data: Dict, ctx: Dict) -> Any:
        """Convert Unix timestamp to ISO datetime string."""
        if value is None:
            return None

        try:
            timestamp = float(value)
            dt = datetime.fromtimestamp(timestamp)
            return dt.isoformat()
        except Exception:
            return None

    def _transform_multiply(self, value: Any, config: Dict, data: Dict, ctx: Dict) -> Any:
        """Multiply numeric value."""
        if value is None:
            return None
        try:
            multiplier = config.get("multiplier", 1)
            return float(value) * multiplier
        except (ValueError, TypeError):
            return value

    def _transform_divide(self, value: Any, config: Dict, data: Dict, ctx: Dict) -> Any:
        """Divide numeric value."""
        if value is None:
            return None
        try:
            divisor = config.get("divisor", 1)
            return float(value) / divisor if divisor != 0 else value
        except (ValueError, TypeError):
            return value

    def _transform_country_code(self, value: Any, config: Dict, data: Dict, ctx: Dict) -> Any:
        """Convert country name to ISO code."""
        if value is None:
            return None

        # Common country name to code mappings
        country_codes = {
            "united states": "US",
            "united states of america": "US",
            "usa": "US",
            "united kingdom": "GB",
            "uk": "GB",
            "great britain": "GB",
            "germany": "DE",
            "france": "FR",
            "canada": "CA",
            "australia": "AU",
            "japan": "JP",
            "china": "CN",
            "india": "IN",
            "brazil": "BR",
            "mexico": "MX",
            "spain": "ES",
            "italy": "IT",
            "netherlands": "NL",
            "sweden": "SE",
            "switzerland": "CH",
            "belgium": "BE",
            "austria": "AT",
            "denmark": "DK",
            "norway": "NO",
            "finland": "FI",
            "ireland": "IE",
            "portugal": "PT",
            "poland": "PL",
            "new zealand": "NZ",
            "singapore": "SG",
        }

        value_lower = str(value).lower().strip()

        # If already a 2-letter code, return uppercase
        if len(value_lower) == 2:
            return value_lower.upper()

        return country_codes.get(value_lower, value)

    def _transform_clean_phone(self, value: Any, config: Dict, data: Dict, ctx: Dict) -> Any:
        """Clean phone number formatting."""
        if value is None:
            return None

        # Remove common formatting characters
        phone = re.sub(r"[^\d+]", "", str(value))

        # Ensure it starts with + for international
        if phone and not phone.startswith("+") and len(phone) > 10:
            phone = f"+{phone}"

        return phone if phone else None

    def _transform_address_mapping(self, value: Any, config: Dict, data: Dict, ctx: Dict) -> Any:
        """Transform address object between formats."""
        if not isinstance(value, dict):
            return value

        field_map = config.get("field_map", {
            "line1": "line1",
            "line2": "line2",
            "city": "city",
            "state": "state_code",
            "postal_code": "zip",
            "country": "country",
        })

        result = {}
        for source_key, target_key in field_map.items():
            if source_key in value:
                result[target_key] = value[source_key]

        return result

    def _transform_lookup(self, value: Any, config: Dict, data: Dict, ctx: Dict) -> Any:
        """Look up value from related entity or context."""
        if value is None:
            return None

        lookup_table = ctx.get("lookup_tables", {}).get(config.get("table"))
        if lookup_table:
            key_field = config.get("key_field", "id")
            value_field = config.get("value_field")

            for record in lookup_table:
                if record.get(key_field) == value:
                    if value_field:
                        return record.get(value_field)
                    return record

        return None

    def _transform_compile_metadata(self, value: Any, config: Dict, data: Dict, ctx: Dict) -> Any:
        """Compile multiple source fields into a metadata object."""
        source_fields = config.get("source_fields", {})
        result = {}

        for meta_key, source_path in source_fields.items():
            for service_data in data.values():
                field_value = self._get_nested_value(service_data, source_path)
                if field_value is not None:
                    result[meta_key] = field_value
                    break

        return result if result else None
