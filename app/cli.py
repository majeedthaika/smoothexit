"""Interactive CLI for the service migration application."""

import argparse
import json
import logging
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from .models.schema import (
    ServiceSchema,
    EntitySchema,
    MigrationMapping,
    EntityMapping,
    FieldMapping,
    TransformType,
)
from .models.migration import (
    MigrationConfig,
    DataSource,
    DataSourceType,
)
from .services.schema_registry import SchemaRegistry
from .services.llm_inference import LLMSchemaInference
from .orchestrator import MigrationOrchestrator

logger = logging.getLogger(__name__)


class InteractiveMappingCLI:
    """
    Interactive CLI for creating and refining field mappings.

    Supports:
    - Viewing source and target schemas
    - Creating field mappings interactively
    - Previewing transformations
    - Saving/loading mapping configurations
    """

    def __init__(
        self,
        registry: SchemaRegistry,
        llm_inference: Optional[LLMSchemaInference] = None
    ):
        """
        Initialize the interactive CLI.

        Args:
            registry: Schema registry with loaded schemas
            llm_inference: Optional LLM inference service
        """
        self.registry = registry
        self.llm = llm_inference
        self.current_mapping: Optional[EntityMapping] = None

    def run(self):
        """Run the interactive CLI loop."""
        print("\n" + "=" * 60)
        print("  Service Migration - Interactive Mapping Tool")
        print("=" * 60)

        while True:
            self._print_menu()
            choice = input("\nEnter choice: ").strip()

            if choice == "1":
                self._list_schemas()
            elif choice == "2":
                self._view_schema()
            elif choice == "3":
                self._create_mapping()
            elif choice == "4":
                self._edit_mapping()
            elif choice == "5":
                self._preview_transform()
            elif choice == "6":
                self._suggest_mappings()
            elif choice == "7":
                self._save_mapping()
            elif choice == "8":
                self._load_mapping()
            elif choice == "9" or choice.lower() == "q":
                print("\nGoodbye!")
                break
            else:
                print("\nInvalid choice. Please try again.")

    def _print_menu(self):
        """Print the main menu."""
        print("\n" + "-" * 40)
        print("Options:")
        print("  1. List available schemas")
        print("  2. View schema details")
        print("  3. Create new mapping")
        print("  4. Edit current mapping")
        print("  5. Preview transformation")
        print("  6. Get AI mapping suggestions")
        print("  7. Save mapping to file")
        print("  8. Load mapping from file")
        print("  9. Quit")
        print("-" * 40)

    def _list_schemas(self):
        """List all available schemas."""
        print("\n=== Available Schemas ===")

        schemas = self.registry.list_schemas()
        if not schemas:
            print("No schemas loaded. Load schemas using --schemas-dir")
            return

        for i, name in enumerate(schemas, 1):
            schema = self.registry.get_schema(name)
            print(f"\n{i}. {schema.name}")
            print(f"   Entities: {', '.join(schema.entities.keys())}")

    def _view_schema(self):
        """View details of a schema."""
        service = input("Enter service name: ").strip()
        entity = input("Enter entity name (or 'all'): ").strip()

        schema = self.registry.get_schema(service)
        if not schema:
            print(f"Schema not found: {service}")
            return

        if entity.lower() == "all":
            for ent_name, ent_schema in schema.entities.items():
                self._print_entity_schema(ent_schema)
        else:
            ent_schema = schema.entities.get(entity)
            if ent_schema:
                self._print_entity_schema(ent_schema)
            else:
                print(f"Entity not found: {entity}")

    def _print_entity_schema(self, schema: EntitySchema):
        """Print an entity schema."""
        print(f"\n=== {schema.name} ===")
        print(f"Description: {schema.description}")
        print(f"Primary Key: {schema.primary_key}")
        print(f"\nFields ({len(schema.fields)}):")

        for name, field in schema.fields.items():
            req = "*" if field.required else " "
            print(f"  {req} {name}: {field.type.value}", end="")
            if field.max_length:
                print(f" (max: {field.max_length})", end="")
            if field.enum_values:
                print(f" [{', '.join(field.enum_values[:3])}...]", end="")
            print()
            if field.description:
                print(f"      {field.description[:60]}...")

    def _create_mapping(self):
        """Create a new entity mapping interactively."""
        print("\n=== Create New Mapping ===")

        source_service = input("Source service: ").strip()
        source_entity = input("Source entity: ").strip()
        target_service = input("Target service: ").strip()
        target_entity = input("Target entity: ").strip()

        # Get schemas
        source_schema = self.registry.get_entity_schema(source_service, source_entity)
        target_schema = self.registry.get_entity_schema(target_service, target_entity)

        if not source_schema:
            print(f"Source schema not found: {source_service}.{source_entity}")
            return

        if not target_schema:
            print(f"Target schema not found: {target_service}.{target_entity}")
            return

        # Create empty mapping
        self.current_mapping = EntityMapping(
            name=f"{source_service}_{source_entity}_to_{target_service}_{target_entity}",
            source_entity=source_entity,
            target_entity=target_entity,
            source_service=source_service,
            target_service=target_service,
        )

        print(f"\nCreated mapping: {self.current_mapping.name}")
        print("Use 'Edit mapping' to add field mappings")

    def _edit_mapping(self):
        """Edit the current mapping."""
        if not self.current_mapping:
            print("No current mapping. Create or load one first.")
            return

        print(f"\n=== Editing: {self.current_mapping.name} ===")
        print(f"Source: {self.current_mapping.source_service}.{self.current_mapping.source_entity}")
        print(f"Target: {self.current_mapping.target_service}.{self.current_mapping.target_entity}")
        print(f"\nCurrent field mappings: {len(self.current_mapping.field_mappings)}")

        for i, fm in enumerate(self.current_mapping.field_mappings, 1):
            print(f"  {i}. {fm.source_field} -> {fm.target_field} ({fm.transform.value})")

        while True:
            print("\nOptions: (a)dd, (r)emove, (v)iew, (d)one")
            action = input("Action: ").strip().lower()

            if action == "a":
                self._add_field_mapping()
            elif action == "r":
                self._remove_field_mapping()
            elif action == "v":
                self._view_field_mapping()
            elif action == "d":
                break

    def _add_field_mapping(self):
        """Add a field mapping."""
        source_field = input("Source field (or 'null' for generated): ").strip()
        target_field = input("Target field: ").strip()

        if source_field.lower() == "null":
            source_field = None

        print("\nAvailable transforms:")
        transforms = list(TransformType)
        for i, t in enumerate(transforms[:15], 1):
            print(f"  {i}. {t.value}")
        print("  ... (enter name for others)")

        transform_input = input("Transform (number or name): ").strip()

        try:
            if transform_input.isdigit():
                transform = transforms[int(transform_input) - 1]
            else:
                transform = TransformType(transform_input)
        except (IndexError, ValueError):
            transform = TransformType.DIRECT

        # Get transform config if needed
        config = {}
        if transform in [TransformType.PREFIX_ADD, TransformType.PREFIX_STRIP]:
            prefix = input("Prefix: ").strip()
            config["prefix"] = prefix
            if transform == TransformType.PREFIX_STRIP:
                new_prefix = input("New prefix (optional): ").strip()
                if new_prefix:
                    config["new_prefix"] = new_prefix
        elif transform == TransformType.TRUNCATE:
            max_len = input("Max length: ").strip()
            config["max_length"] = int(max_len)
        elif transform == TransformType.ENUM_MAP:
            print("Enter mappings (format: old=new, one per line, empty line to finish):")
            mapping = {}
            while True:
                line = input().strip()
                if not line:
                    break
                if "=" in line:
                    old, new = line.split("=", 1)
                    mapping[old.strip()] = new.strip()
            config["mapping"] = mapping

        notes = input("Notes (optional): ").strip()

        fm = FieldMapping(
            source_field=source_field,
            target_field=target_field,
            transform=transform,
            transform_config=config,
            notes=notes,
        )

        self.current_mapping.field_mappings.append(fm)
        print(f"Added: {source_field} -> {target_field}")

    def _remove_field_mapping(self):
        """Remove a field mapping."""
        if not self.current_mapping.field_mappings:
            print("No mappings to remove")
            return

        idx = input("Enter mapping number to remove: ").strip()
        try:
            idx = int(idx) - 1
            removed = self.current_mapping.field_mappings.pop(idx)
            print(f"Removed: {removed.source_field} -> {removed.target_field}")
        except (ValueError, IndexError):
            print("Invalid number")

    def _view_field_mapping(self):
        """View details of a field mapping."""
        if not self.current_mapping.field_mappings:
            print("No mappings to view")
            return

        idx = input("Enter mapping number to view: ").strip()
        try:
            idx = int(idx) - 1
            fm = self.current_mapping.field_mappings[idx]
            print(f"\nSource: {fm.source_field}")
            print(f"Target: {fm.target_field}")
            print(f"Transform: {fm.transform.value}")
            if fm.transform_config:
                print(f"Config: {json.dumps(fm.transform_config, indent=2)}")
            if fm.notes:
                print(f"Notes: {fm.notes}")
        except (ValueError, IndexError):
            print("Invalid number")

    def _preview_transform(self):
        """Preview a transformation with sample data."""
        if not self.current_mapping:
            print("No current mapping. Create or load one first.")
            return

        print("\nEnter sample source record as JSON:")
        try:
            json_input = input().strip()
            sample_data = json.loads(json_input)
        except json.JSONDecodeError:
            print("Invalid JSON")
            return

        from .services.transformer import TransformEngine
        from .models.record import SourceRecord

        transformer = TransformEngine()
        record = SourceRecord(
            id=sample_data.get("id", "preview"),
            source_service=self.current_mapping.source_service,
            source_entity=self.current_mapping.source_entity,
            data=sample_data,
        )

        result = transformer.transform_record(
            source_records=[record],
            mapping=self.current_mapping,
            target_service=self.current_mapping.target_service,
            target_entity=self.current_mapping.target_entity,
        )

        print("\n=== Transformed Result ===")
        print(json.dumps(result.to_dict(), indent=2, default=str))

    def _suggest_mappings(self):
        """Get AI-powered mapping suggestions."""
        if not self.llm:
            print("LLM inference not configured. Set OPENAI_API_KEY environment variable.")
            return

        if not self.current_mapping:
            print("No current mapping. Create one first.")
            return

        source_schema = self.registry.get_entity_schema(
            self.current_mapping.source_service,
            self.current_mapping.source_entity
        )
        target_schema = self.registry.get_entity_schema(
            self.current_mapping.target_service,
            self.current_mapping.target_entity
        )

        if not source_schema or not target_schema:
            print("Could not find source or target schema")
            return

        print("\nGenerating AI suggestions...")

        suggestions = self.llm.suggest_mappings(
            source_schema=source_schema,
            target_schema=target_schema,
            source_service=self.current_mapping.source_service,
            target_service=self.current_mapping.target_service,
        )

        print(f"\n=== {len(suggestions)} Suggestions ===")

        for i, s in enumerate(suggestions, 1):
            print(f"\n{i}. {s.source_field} -> {s.target_field}")
            print(f"   Transform: {s.transform.value}")
            print(f"   Confidence: {s.confidence:.0%}")
            print(f"   Reasoning: {s.reasoning}")

        apply = input("\nApply all suggestions? (y/n): ").strip().lower()
        if apply == "y":
            for s in suggestions:
                fm = FieldMapping(
                    source_field=s.source_field,
                    target_field=s.target_field,
                    transform=s.transform,
                    transform_config=s.transform_config,
                    notes=s.reasoning,
                )
                self.current_mapping.field_mappings.append(fm)
            print(f"Added {len(suggestions)} mappings")

    def _save_mapping(self):
        """Save current mapping to file."""
        if not self.current_mapping:
            print("No current mapping to save")
            return

        filepath = input("Save to file (default: mapping.json): ").strip()
        if not filepath:
            filepath = "mapping.json"

        mapping = MigrationMapping(
            name=self.current_mapping.name,
            entity_mappings={self.current_mapping.name: self.current_mapping},
        )

        with open(filepath, 'w') as f:
            json.dump(mapping.to_dict(), f, indent=2)

        print(f"Saved to {filepath}")

    def _load_mapping(self):
        """Load mapping from file."""
        filepath = input("Load from file: ").strip()

        if not os.path.exists(filepath):
            print(f"File not found: {filepath}")
            return

        try:
            mapping = MigrationMapping.from_json_file(filepath)

            if mapping.entity_mappings:
                # Use first entity mapping
                first_key = list(mapping.entity_mappings.keys())[0]
                self.current_mapping = mapping.entity_mappings[first_key]
                print(f"Loaded mapping: {self.current_mapping.name}")
            else:
                print("No entity mappings found in file")

        except Exception as e:
            print(f"Error loading mapping: {e}")


def main():
    """Main entry point for the CLI."""
    parser = argparse.ArgumentParser(
        description="Service Migration Tool - Migrate data between SaaS services"
    )

    subparsers = parser.add_subparsers(dest="command", help="Commands")

    # Run migration
    run_parser = subparsers.add_parser("run", help="Run a migration")
    run_parser.add_argument("--config", required=True, help="Path to migration config file")
    run_parser.add_argument("--dry-run", action="store_true", help="Simulate without changes")
    run_parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")

    # Interactive mapping
    map_parser = subparsers.add_parser("map", help="Interactive mapping tool")
    map_parser.add_argument("--schemas-dir", help="Directory containing schema files")
    map_parser.add_argument("--mappings-dir", help="Directory containing mapping files")

    # Preview transformation
    preview_parser = subparsers.add_parser("preview", help="Preview a transformation")
    preview_parser.add_argument("--mapping", required=True, help="Path to mapping file")
    preview_parser.add_argument("--input", required=True, help="Path to input JSON file")
    preview_parser.add_argument("--entity", required=True, help="Entity to transform")

    # Validate mapping
    validate_parser = subparsers.add_parser("validate", help="Validate a mapping")
    validate_parser.add_argument("--mapping", required=True, help="Path to mapping file")
    validate_parser.add_argument("--schemas-dir", help="Directory containing schema files")

    # Infer schema
    infer_parser = subparsers.add_parser("infer", help="Infer schema from sample data")
    infer_parser.add_argument("--input", required=True, help="Path to sample data JSON file")
    infer_parser.add_argument("--service", required=True, help="Service name")
    infer_parser.add_argument("--entity", required=True, help="Entity name")
    infer_parser.add_argument("--output", help="Output file path")

    args = parser.parse_args()

    # Set up logging
    log_level = logging.DEBUG if getattr(args, "verbose", False) else logging.INFO
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )

    if args.command == "run":
        run_migration(args)
    elif args.command == "map":
        run_interactive_mapping(args)
    elif args.command == "preview":
        run_preview(args)
    elif args.command == "validate":
        run_validation(args)
    elif args.command == "infer":
        run_inference(args)
    else:
        parser.print_help()


def run_migration(args):
    """Run a migration from config file."""
    with open(args.config) as f:
        config_data = json.load(f)

    config = MigrationConfig.from_dict(config_data)

    if args.dry_run:
        config.dry_run = True

    # Set up registry
    registry = SchemaRegistry()
    if config_data.get("schemas_dir"):
        registry.load_schemas_from_directory(config_data["schemas_dir"])

    # Load mapping
    mapping = None
    if config.mapping_file:
        mapping = MigrationMapping.from_json_file(config.mapping_file)

    # Run migration
    orchestrator = MigrationOrchestrator(config, registry, mapping)
    result = orchestrator.run_migration()

    print("\n" + "=" * 60)
    print("MIGRATION COMPLETE")
    print("=" * 60)
    print(f"Status: {result.status.value}")
    print(f"Records Processed: {result.total_records_processed}")
    print(f"Succeeded: {result.total_records_succeeded}")
    print(f"Failed: {result.total_records_failed}")
    if result.duration_seconds:
        print(f"Duration: {result.duration_seconds:.2f} seconds")


def run_interactive_mapping(args):
    """Run the interactive mapping tool."""
    registry = SchemaRegistry(
        schemas_dir=args.schemas_dir,
        mappings_dir=args.mappings_dir,
    )

    llm = None
    if os.environ.get("OPENAI_API_KEY"):
        llm = LLMSchemaInference()

    cli = InteractiveMappingCLI(registry, llm)
    cli.run()


def run_preview(args):
    """Preview a transformation."""
    from .services.transformer import TransformEngine
    from .models.record import SourceRecord

    mapping = MigrationMapping.from_json_file(args.mapping)

    with open(args.input) as f:
        input_data = json.load(f)

    if not isinstance(input_data, list):
        input_data = [input_data]

    entity_mapping = mapping.entity_mappings.get(args.entity)
    if not entity_mapping:
        print(f"Entity mapping not found: {args.entity}")
        return

    transformer = TransformEngine()

    for data in input_data:
        record = SourceRecord(
            id=data.get("id", "preview"),
            source_service=entity_mapping.source_service,
            source_entity=entity_mapping.source_entity,
            data=data,
        )

        result = transformer.transform_record(
            source_records=[record],
            mapping=entity_mapping,
            target_service=entity_mapping.target_service,
            target_entity=entity_mapping.target_entity,
        )

        print(json.dumps(result.to_dict(), indent=2, default=str))
        print("-" * 40)


def run_validation(args):
    """Validate a mapping."""
    registry = SchemaRegistry(schemas_dir=args.schemas_dir)
    mapping = MigrationMapping.from_json_file(args.mapping)

    print("\n=== Validating Mapping ===")

    all_errors = []
    for name, entity_mapping in mapping.entity_mappings.items():
        errors = registry.validate_mapping(entity_mapping)
        if errors:
            print(f"\n{name}:")
            for error in errors:
                print(f"  - {error}")
            all_errors.extend(errors)

    if not all_errors:
        print("\nMapping is valid!")
    else:
        print(f"\nFound {len(all_errors)} validation errors")


def run_inference(args):
    """Infer schema from sample data."""
    with open(args.input) as f:
        data = json.load(f)

    if not isinstance(data, list):
        data = [data]

    llm = LLMSchemaInference()
    result = llm.infer_schema(data, args.service, args.entity)

    output = result.schema.to_dict()
    output["confidence"] = result.confidence
    output["notes"] = result.notes

    if args.output:
        with open(args.output, 'w') as f:
            json.dump(output, f, indent=2)
        print(f"Schema saved to {args.output}")
    else:
        print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
