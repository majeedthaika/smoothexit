"""Validation service for migration records."""

import re
import logging
from typing import Any, Dict, List, Optional, Callable
from datetime import datetime

from ..models.schema import (
    FieldType,
    EntitySchema,
    FieldDefinition,
)
from ..models.record import (
    TransformedRecord,
    ValidationError,
)

logger = logging.getLogger(__name__)


class RecordValidator:
    """
    Validator for transformed records before loading.

    Supports:
    - Type validation
    - Required field validation
    - Max length validation
    - Enum validation
    - Custom validation rules
    """

    def __init__(self):
        """Initialize the validator."""
        self._custom_validators: Dict[str, Callable] = {}

    def register_validator(self, name: str, func: Callable) -> None:
        """Register a custom validation function."""
        self._custom_validators[name] = func

    def validate_record(
        self,
        record: TransformedRecord,
        schema: EntitySchema,
        strict: bool = False
    ) -> List[ValidationError]:
        """
        Validate a transformed record against a schema.

        Args:
            record: The transformed record to validate
            schema: The target entity schema
            strict: If True, unknown fields are errors; if False, they're warnings

        Returns:
            List of validation errors
        """
        errors = []

        # Validate each field in the schema
        for field_name, field_def in schema.fields.items():
            value = self._get_nested_value(record.data, field_name)
            field_errors = self._validate_field(field_name, value, field_def)
            errors.extend(field_errors)

        # Check for unknown fields if strict
        if strict:
            record_fields = self._get_all_field_paths(record.data)
            schema_fields = set(schema.fields.keys())

            for field in record_fields:
                root_field = field.split(".")[0]
                if root_field not in schema_fields and not field.startswith("meta_data"):
                    errors.append(ValidationError(
                        field=field,
                        message=f"Unknown field in target schema: {field}",
                        severity="warning" if not strict else "error",
                    ))

        return errors

    def _validate_field(
        self,
        field_name: str,
        value: Any,
        field_def: FieldDefinition
    ) -> List[ValidationError]:
        """Validate a single field."""
        errors = []

        # Check required
        if field_def.required and value is None:
            errors.append(ValidationError(
                field=field_name,
                message=f"Required field is missing",
                error_type="required",
                severity="error",
            ))
            return errors  # No point checking further

        if value is None:
            return errors  # Optional field with no value is OK

        # Check type
        type_error = self._validate_type(field_name, value, field_def.type)
        if type_error:
            errors.append(type_error)

        # Check max length
        if field_def.max_length and isinstance(value, str):
            if len(value) > field_def.max_length:
                errors.append(ValidationError(
                    field=field_name,
                    message=f"Value exceeds max length of {field_def.max_length}",
                    error_type="max_length",
                    severity="error",
                    value=len(value),
                    suggested_fix=f"Truncate to {field_def.max_length} characters",
                ))

        # Check enum values
        if field_def.enum_values:
            if value not in field_def.enum_values:
                errors.append(ValidationError(
                    field=field_name,
                    message=f"Invalid enum value. Must be one of: {field_def.enum_values}",
                    error_type="enum",
                    severity="error",
                    value=value,
                    suggested_fix=f"Use one of: {', '.join(field_def.enum_values)}",
                ))

        # Validate nested object fields
        if field_def.type == FieldType.OBJECT and field_def.properties and isinstance(value, dict):
            for prop_name, prop_def in field_def.properties.items():
                prop_value = value.get(prop_name)
                nested_errors = self._validate_field(
                    f"{field_name}.{prop_name}",
                    prop_value,
                    prop_def
                )
                errors.extend(nested_errors)

        # Validate array items
        if field_def.type == FieldType.ARRAY and field_def.items and isinstance(value, list):
            for i, item in enumerate(value):
                item_errors = self._validate_field(
                    f"{field_name}[{i}]",
                    item,
                    field_def.items
                )
                errors.extend(item_errors)

        return errors

    def _validate_type(
        self,
        field_name: str,
        value: Any,
        expected_type: FieldType
    ) -> Optional[ValidationError]:
        """Validate the type of a value."""
        type_checks = {
            FieldType.STRING: lambda v: isinstance(v, str),
            FieldType.INTEGER: lambda v: isinstance(v, int) and not isinstance(v, bool),
            FieldType.DECIMAL: lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
            FieldType.BOOLEAN: lambda v: isinstance(v, bool),
            FieldType.TIMESTAMP: lambda v: isinstance(v, (int, float)),
            FieldType.DATE: lambda v: isinstance(v, str) and self._is_valid_date(v),
            FieldType.DATETIME: lambda v: isinstance(v, str) and self._is_valid_datetime(v),
            FieldType.ENUM: lambda v: isinstance(v, str),
            FieldType.OBJECT: lambda v: isinstance(v, dict),
            FieldType.ARRAY: lambda v: isinstance(v, list),
            FieldType.JSON: lambda v: isinstance(v, (dict, list, str)),
            FieldType.CURRENCY: lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
        }

        check_func = type_checks.get(expected_type)
        if check_func and not check_func(value):
            return ValidationError(
                field=field_name,
                message=f"Invalid type. Expected {expected_type.value}, got {type(value).__name__}",
                error_type="type",
                severity="error",
                value=value,
            )

        return None

    def _is_valid_date(self, value: str) -> bool:
        """Check if string is a valid date."""
        try:
            datetime.strptime(value, "%Y-%m-%d")
            return True
        except ValueError:
            return False

    def _is_valid_datetime(self, value: str) -> bool:
        """Check if string is a valid datetime."""
        try:
            # Try ISO format
            datetime.fromisoformat(value.replace("Z", "+00:00"))
            return True
        except ValueError:
            try:
                # Try other common formats
                datetime.strptime(value, "%Y-%m-%dT%H:%M:%S")
                return True
            except ValueError:
                return False

    def _get_nested_value(self, data: Dict[str, Any], path: str) -> Any:
        """Get a nested value using dot notation."""
        parts = path.split(".")
        value = data

        for part in parts:
            if value is None:
                return None
            if isinstance(value, dict):
                value = value.get(part)
            else:
                return None

        return value

    def _get_all_field_paths(self, data: Dict[str, Any], prefix: str = "") -> List[str]:
        """Get all field paths in a nested dictionary."""
        paths = []

        for key, value in data.items():
            path = f"{prefix}.{key}" if prefix else key
            paths.append(path)

            if isinstance(value, dict):
                paths.extend(self._get_all_field_paths(value, path))

        return paths

    def validate_batch(
        self,
        records: List[TransformedRecord],
        schema: EntitySchema,
        stop_on_first_error: bool = False
    ) -> Dict[str, List[ValidationError]]:
        """
        Validate a batch of records.

        Args:
            records: List of transformed records
            schema: Target entity schema
            stop_on_first_error: If True, stop on first record with errors

        Returns:
            Dictionary mapping record IDs to their validation errors
        """
        all_errors = {}

        for record in records:
            errors = self.validate_record(record, schema)
            if errors:
                all_errors[record.id] = errors
                if stop_on_first_error:
                    break

        return all_errors

    def is_valid(self, record: TransformedRecord, schema: EntitySchema) -> bool:
        """Quick check if a record is valid."""
        errors = self.validate_record(record, schema)
        return not any(e.severity == "error" for e in errors)


class ValidationRules:
    """Common validation rules that can be composed."""

    @staticmethod
    def email(value: Any) -> Optional[str]:
        """Validate email format."""
        if value is None:
            return None

        email_pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
        if not re.match(email_pattern, str(value)):
            return "Invalid email format"
        return None

    @staticmethod
    def phone(value: Any) -> Optional[str]:
        """Validate phone number format."""
        if value is None:
            return None

        # Remove common formatting
        digits = re.sub(r"[^\d+]", "", str(value))
        if len(digits) < 7 or len(digits) > 15:
            return "Invalid phone number length"
        return None

    @staticmethod
    def url(value: Any) -> Optional[str]:
        """Validate URL format."""
        if value is None:
            return None

        url_pattern = r"^https?://[^\s/$.?#].[^\s]*$"
        if not re.match(url_pattern, str(value), re.IGNORECASE):
            return "Invalid URL format"
        return None

    @staticmethod
    def currency_code(value: Any) -> Optional[str]:
        """Validate ISO 4217 currency code."""
        if value is None:
            return None

        valid_codes = {
            "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "CNY", "INR",
            "MXN", "BRL", "KRW", "HKD", "SGD", "SEK", "NOK", "DKK", "NZD",
        }

        if str(value).upper() not in valid_codes:
            return f"Invalid currency code. Common codes: USD, EUR, GBP"
        return None

    @staticmethod
    def country_code(value: Any) -> Optional[str]:
        """Validate ISO 3166-1 alpha-2 country code."""
        if value is None:
            return None

        # This is a simplified check - a full implementation would use a country code library
        if not re.match(r"^[A-Z]{2}$", str(value).upper()):
            return "Country code must be a 2-letter ISO code (e.g., US, GB, DE)"
        return None

    @staticmethod
    def positive_integer(value: Any) -> Optional[str]:
        """Validate positive integer."""
        if value is None:
            return None

        try:
            if int(value) < 0:
                return "Value must be a positive integer"
        except (ValueError, TypeError):
            return "Value must be an integer"
        return None

    @staticmethod
    def timestamp(value: Any) -> Optional[str]:
        """Validate Unix timestamp."""
        if value is None:
            return None

        try:
            ts = int(value)
            # Reasonable range: 1970 to 2100
            if ts < 0 or ts > 4102444800:
                return "Timestamp out of reasonable range"
        except (ValueError, TypeError):
            return "Invalid timestamp format"
        return None
