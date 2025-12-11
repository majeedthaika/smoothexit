"""LLM-powered schema inference and mapping suggestions."""

import json
import logging
import os
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass

from ..models.schema import (
    ServiceSchema,
    EntitySchema,
    FieldDefinition,
    FieldType,
    EntityMapping,
    FieldMapping,
    TransformType,
    MigrationMapping,
)

logger = logging.getLogger(__name__)


@dataclass
class MappingSuggestion:
    """A suggested field mapping from LLM."""
    source_field: str
    target_field: str
    transform: TransformType
    transform_config: Dict[str, Any]
    confidence: float  # 0-1
    reasoning: str


@dataclass
class SchemaInferenceResult:
    """Result of schema inference from sample data."""
    schema: EntitySchema
    confidence: float
    field_descriptions: Dict[str, str]
    suggested_types: Dict[str, str]
    notes: str


class LLMSchemaInference:
    """
    Service for using LLMs to infer schemas and suggest mappings.

    Supports:
    - Schema inference from sample data
    - Field mapping suggestions
    - Transform function recommendations
    - Custom field detection
    - Data type inference
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: str = "gpt-4o",
        provider: str = "openai"
    ):
        """
        Initialize the LLM inference service.

        Args:
            api_key: API key for the LLM provider
            model: Model to use for inference
            provider: LLM provider (openai, anthropic, google)
        """
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")
        self.model = model
        self.provider = provider

    def infer_schema(
        self,
        sample_data: List[Dict[str, Any]],
        service_name: str,
        entity_name: str,
        existing_schema: Optional[EntitySchema] = None
    ) -> SchemaInferenceResult:
        """
        Infer an entity schema from sample data using LLM.

        Args:
            sample_data: List of sample records
            service_name: Name of the service
            entity_name: Name of the entity
            existing_schema: Optional existing schema to enhance

        Returns:
            SchemaInferenceResult with inferred schema
        """
        prompt = self._build_schema_inference_prompt(
            sample_data, service_name, entity_name, existing_schema
        )

        try:
            response = self._call_llm(prompt, expect_json=True)
            return self._parse_schema_response(response, entity_name)
        except Exception as e:
            logger.error(f"Schema inference failed: {e}")
            # Fall back to basic inference
            return self._fallback_schema_inference(sample_data, entity_name)

    def suggest_mappings(
        self,
        source_schema: EntitySchema,
        target_schema: EntitySchema,
        source_service: str,
        target_service: str,
        sample_source_data: Optional[List[Dict[str, Any]]] = None,
        existing_mapping: Optional[EntityMapping] = None
    ) -> List[MappingSuggestion]:
        """
        Suggest field mappings between source and target schemas.

        Args:
            source_schema: Source entity schema
            target_schema: Target entity schema
            source_service: Source service name
            target_service: Target service name
            sample_source_data: Optional sample data for context
            existing_mapping: Optional existing mapping to enhance

        Returns:
            List of mapping suggestions
        """
        prompt = self._build_mapping_prompt(
            source_schema, target_schema,
            source_service, target_service,
            sample_source_data, existing_mapping
        )

        try:
            response = self._call_llm(prompt, expect_json=True)
            return self._parse_mapping_response(response)
        except Exception as e:
            logger.error(f"Mapping suggestion failed: {e}")
            return self._fallback_mapping_suggestions(source_schema, target_schema)

    def analyze_custom_fields(
        self,
        sample_data: List[Dict[str, Any]],
        known_schema: EntitySchema
    ) -> Dict[str, FieldDefinition]:
        """
        Detect and analyze custom fields not in the known schema.

        Args:
            sample_data: Sample records with potential custom fields
            known_schema: Known/standard schema for the entity

        Returns:
            Dictionary of custom field definitions
        """
        known_fields = set(known_schema.fields.keys())
        custom_fields = {}

        # Find fields not in known schema
        for record in sample_data:
            for field in record.keys():
                if field not in known_fields and field not in custom_fields:
                    # Use LLM to analyze the field
                    values = [r.get(field) for r in sample_data if r.get(field) is not None]
                    if values:
                        custom_fields[field] = self._analyze_field(field, values)

        return custom_fields

    def generate_migration_plan(
        self,
        source_services: List[str],
        target_service: str,
        available_mappings: Dict[str, EntityMapping],
        migration_goal: str
    ) -> Dict[str, Any]:
        """
        Generate a migration plan based on available mappings and goals.

        Args:
            source_services: List of source service names
            target_service: Target service name
            available_mappings: Available entity mappings
            migration_goal: Natural language description of migration goal

        Returns:
            Migration plan with steps, order, and recommendations
        """
        prompt = f"""
You are a data migration expert. Generate a detailed migration plan.

Source Services: {', '.join(source_services)}
Target Service: {target_service}
Migration Goal: {migration_goal}

Available Entity Mappings:
{json.dumps([m.name for m in available_mappings.values()], indent=2)}

Generate a migration plan in JSON format:
{{
    "summary": "Brief summary of the migration",
    "steps": [
        {{
            "order": 1,
            "entity": "entity name",
            "source": "source service",
            "action": "create/update/merge",
            "dependencies": ["list of dependent entities"],
            "batch_size": 100,
            "notes": "any special handling needed"
        }}
    ],
    "data_flow": "Description of how data flows between systems",
    "risks": ["List of potential risks"],
    "recommendations": ["List of recommendations"],
    "estimated_complexity": "low/medium/high"
}}
"""

        try:
            response = self._call_llm(prompt, expect_json=True)
            return response
        except Exception as e:
            logger.error(f"Migration plan generation failed: {e}")
            return {"error": str(e)}

    def _build_schema_inference_prompt(
        self,
        sample_data: List[Dict[str, Any]],
        service_name: str,
        entity_name: str,
        existing_schema: Optional[EntitySchema]
    ) -> str:
        """Build prompt for schema inference."""
        # Limit sample size for prompt
        samples = sample_data[:5]

        prompt = f"""
Analyze the following sample data and infer a detailed schema.

Service: {service_name}
Entity: {entity_name}

Sample Data:
{json.dumps(samples, indent=2, default=str)}

"""

        if existing_schema:
            prompt += f"""
Existing Schema (enhance this):
{json.dumps(existing_schema.to_dict(), indent=2)}

"""

        prompt += """
Return a JSON object with the following structure:
{
    "fields": {
        "field_name": {
            "type": "string|integer|decimal|boolean|timestamp|date|datetime|enum|object|array|json",
            "description": "Description of the field",
            "required": true/false,
            "max_length": null or number,
            "enum_values": null or ["list", "of", "values"],
            "example": "example value"
        }
    },
    "primary_key": "field name",
    "confidence": 0.0-1.0,
    "notes": "Any important observations about the data"
}

Be thorough in analyzing:
1. Data types (look at actual values, not just presence)
2. Required fields (present in all samples)
3. Enum values (repeated specific values)
4. Relationships (IDs referencing other entities)
5. Timestamps (dates in various formats)
"""

        return prompt

    def _build_mapping_prompt(
        self,
        source_schema: EntitySchema,
        target_schema: EntitySchema,
        source_service: str,
        target_service: str,
        sample_data: Optional[List[Dict[str, Any]]],
        existing_mapping: Optional[EntityMapping]
    ) -> str:
        """Build prompt for mapping suggestions."""
        prompt = f"""
Suggest field mappings from source to target schema.

Source: {source_service}.{source_schema.name}
Target: {target_service}.{target_schema.name}

Source Schema:
{json.dumps(source_schema.to_dict(), indent=2)}

Target Schema:
{json.dumps(target_schema.to_dict(), indent=2)}

"""

        if sample_data:
            prompt += f"""
Sample Source Data:
{json.dumps(sample_data[:3], indent=2, default=str)}

"""

        if existing_mapping:
            prompt += f"""
Existing Mapping (enhance this):
{json.dumps(existing_mapping.to_dict(), indent=2)}

"""

        prompt += """
Return a JSON array of mapping suggestions:
[
    {
        "source_field": "field name in source (or null if generated)",
        "target_field": "field name in target",
        "transform": "direct|prefix_add|prefix_strip|split_name|truncate|uppercase|lowercase|enum_map|boolean_to_enum|to_metadata|iso_to_unix|country_code|custom",
        "transform_config": {},
        "confidence": 0.0-1.0,
        "reasoning": "Why this mapping makes sense"
    }
]

Available transforms:
- direct: Copy value as-is
- prefix_add: Add prefix (config: {prefix: "..."})
- prefix_strip: Remove prefix, add new (config: {prefix: "old", new_prefix: "new"})
- split_name: Split full name (config: {part: "first|last"})
- truncate: Limit length (config: {max_length: N})
- uppercase/lowercase: Change case
- enum_map: Map enum values (config: {mapping: {old: new}})
- boolean_to_enum: Convert bool (config: {true_value: "...", false_value: "..."})
- to_metadata: Store in metadata object
- iso_to_unix: Convert datetime format
- country_code: Convert country name to ISO code
- custom: Custom logic (config: {function: "function_name"})

Consider:
1. Semantic similarity of field names
2. Data type compatibility
3. Required fields in target
4. Fields that need transformation
5. Fields to store in metadata
"""

        return prompt

    def _call_llm(self, prompt: str, expect_json: bool = False) -> Any:
        """Call the LLM API."""
        if self.provider == "openai":
            return self._call_openai(prompt, expect_json)
        elif self.provider == "anthropic":
            return self._call_anthropic(prompt, expect_json)
        elif self.provider == "google":
            return self._call_google(prompt, expect_json)
        else:
            raise ValueError(f"Unsupported provider: {self.provider}")

    def _call_openai(self, prompt: str, expect_json: bool = False) -> Any:
        """Call OpenAI API."""
        try:
            import openai

            client = openai.OpenAI(api_key=self.api_key)

            kwargs = {
                "model": self.model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.3,
                "max_tokens": 4096,
            }

            if expect_json:
                kwargs["response_format"] = {"type": "json_object"}

            response = client.chat.completions.create(**kwargs)
            content = response.choices[0].message.content

            if expect_json:
                return json.loads(content)
            return content

        except ImportError:
            raise ImportError("openai package required for OpenAI inference")

    def _call_anthropic(self, prompt: str, expect_json: bool = False) -> Any:
        """Call Anthropic API."""
        try:
            import anthropic

            client = anthropic.Anthropic(api_key=self.api_key)

            response = client.messages.create(
                model=self.model,
                max_tokens=4096,
                messages=[{"role": "user", "content": prompt}]
            )

            content = response.content[0].text

            if expect_json:
                # Extract JSON from response
                import re
                json_match = re.search(r'[\[{][\s\S]*[\]}]', content)
                if json_match:
                    return json.loads(json_match.group())

            return content

        except ImportError:
            raise ImportError("anthropic package required for Anthropic inference")

    def _call_google(self, prompt: str, expect_json: bool = False) -> Any:
        """Call Google Gemini API."""
        try:
            import google.generativeai as genai

            genai.configure(api_key=self.api_key)
            model = genai.GenerativeModel(self.model)

            response = model.generate_content(prompt)
            content = response.text

            if expect_json:
                import re
                json_match = re.search(r'[\[{][\s\S]*[\]}]', content)
                if json_match:
                    return json.loads(json_match.group())

            return content

        except ImportError:
            raise ImportError("google-generativeai package required for Google inference")

    def _parse_schema_response(
        self,
        response: Dict[str, Any],
        entity_name: str
    ) -> SchemaInferenceResult:
        """Parse LLM response into SchemaInferenceResult."""
        fields = {}

        for field_name, field_data in response.get("fields", {}).items():
            field_type = field_data.get("type", "string")
            try:
                field_type = FieldType(field_type)
            except ValueError:
                field_type = FieldType.STRING

            fields[field_name] = FieldDefinition(
                name=field_name,
                type=field_type,
                description=field_data.get("description", ""),
                required=field_data.get("required", False),
                max_length=field_data.get("max_length"),
                enum_values=field_data.get("enum_values"),
                example=field_data.get("example"),
            )

        schema = EntitySchema(
            name=entity_name,
            description=f"Inferred schema for {entity_name}",
            fields=fields,
            primary_key=response.get("primary_key", "id"),
        )

        return SchemaInferenceResult(
            schema=schema,
            confidence=response.get("confidence", 0.8),
            field_descriptions={f: d.description for f, d in fields.items()},
            suggested_types={f: d.type.value for f, d in fields.items()},
            notes=response.get("notes", ""),
        )

    def _parse_mapping_response(
        self,
        response: Any
    ) -> List[MappingSuggestion]:
        """Parse LLM response into mapping suggestions."""
        suggestions = []

        if isinstance(response, dict):
            response = response.get("mappings", response.get("suggestions", []))

        if not isinstance(response, list):
            return []

        for item in response:
            transform = item.get("transform", "direct")
            try:
                transform = TransformType(transform)
            except ValueError:
                transform = TransformType.DIRECT

            suggestions.append(MappingSuggestion(
                source_field=item.get("source_field"),
                target_field=item.get("target_field", ""),
                transform=transform,
                transform_config=item.get("transform_config", {}),
                confidence=item.get("confidence", 0.8),
                reasoning=item.get("reasoning", ""),
            ))

        return suggestions

    def _fallback_schema_inference(
        self,
        sample_data: List[Dict[str, Any]],
        entity_name: str
    ) -> SchemaInferenceResult:
        """Basic schema inference without LLM."""
        fields = {}

        for record in sample_data:
            for field, value in record.items():
                if field not in fields:
                    field_type = self._infer_type(value)
                    fields[field] = FieldDefinition(
                        name=field,
                        type=field_type,
                        required=True,
                    )
                elif value is None:
                    fields[field].required = False

        schema = EntitySchema(
            name=entity_name,
            description=f"Auto-inferred schema for {entity_name}",
            fields=fields,
        )

        return SchemaInferenceResult(
            schema=schema,
            confidence=0.5,
            field_descriptions={},
            suggested_types={f: d.type.value for f, d in fields.items()},
            notes="Fallback inference without LLM",
        )

    def _fallback_mapping_suggestions(
        self,
        source_schema: EntitySchema,
        target_schema: EntitySchema
    ) -> List[MappingSuggestion]:
        """Basic mapping suggestions without LLM."""
        suggestions = []

        # Match by normalized field names
        source_normalized = {self._normalize(f): f for f in source_schema.fields}
        target_normalized = {self._normalize(f): f for f in target_schema.fields}

        for normalized, source_field in source_normalized.items():
            if normalized in target_normalized:
                suggestions.append(MappingSuggestion(
                    source_field=source_field,
                    target_field=target_normalized[normalized],
                    transform=TransformType.DIRECT,
                    transform_config={},
                    confidence=0.7,
                    reasoning="Matched by normalized name",
                ))

        return suggestions

    def _normalize(self, name: str) -> str:
        """Normalize field name for matching."""
        return name.lower().replace("_", "").replace("-", "")

    def _infer_type(self, value: Any) -> FieldType:
        """Infer field type from value."""
        if value is None:
            return FieldType.STRING
        elif isinstance(value, bool):
            return FieldType.BOOLEAN
        elif isinstance(value, int):
            return FieldType.INTEGER
        elif isinstance(value, float):
            return FieldType.DECIMAL
        elif isinstance(value, dict):
            return FieldType.OBJECT
        elif isinstance(value, list):
            return FieldType.ARRAY
        else:
            return FieldType.STRING

    def _analyze_field(
        self,
        field_name: str,
        values: List[Any]
    ) -> FieldDefinition:
        """Analyze a field from its values."""
        # Determine most common type
        types = [self._infer_type(v) for v in values if v is not None]
        if types:
            most_common = max(set(types), key=types.count)
        else:
            most_common = FieldType.STRING

        return FieldDefinition(
            name=field_name,
            type=most_common,
            description=f"Custom field: {field_name}",
            required=False,
            example=values[0] if values else None,
        )
