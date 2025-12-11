#!/usr/bin/env python3
"""
Example: Stripe + Salesforce to Chargebee Migration

This script demonstrates how to use the migrate_services application
to migrate data from Stripe and Salesforce to Chargebee.

Usage:
    # Dry run (simulation)
    python run_migration.py --dry-run

    # Full migration
    python run_migration.py

    # With custom config
    python run_migration.py --config my_config.yaml
"""

import argparse
import json
import logging
import os
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from app.models.migration import (
    MigrationConfig,
    DataSource,
    DataSourceType,
)
from app.models.schema import MigrationMapping
from app.services.schema_registry import SchemaRegistry
from app.orchestrator import MigrationOrchestrator

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('migration.log')
    ]
)
logger = logging.getLogger(__name__)


def create_config(dry_run: bool = True) -> MigrationConfig:
    """Create migration configuration programmatically."""

    # Stripe sources
    stripe_customers = DataSource(
        type=DataSourceType.API,
        name="stripe_customers",
        service="stripe",
        entity="customers",
        api_key=os.environ.get("STRIPE_API_KEY"),
        batch_size=100,
        rate_limit=25,
    )

    stripe_products = DataSource(
        type=DataSourceType.API,
        name="stripe_products",
        service="stripe",
        entity="products",
        api_key=os.environ.get("STRIPE_API_KEY"),
        batch_size=100,
        filters={"active": True},
    )

    stripe_prices = DataSource(
        type=DataSourceType.API,
        name="stripe_prices",
        service="stripe",
        entity="prices",
        api_key=os.environ.get("STRIPE_API_KEY"),
        batch_size=100,
        filters={"active": True},
    )

    stripe_subscriptions = DataSource(
        type=DataSourceType.API,
        name="stripe_subscriptions",
        service="stripe",
        entity="subscriptions",
        api_key=os.environ.get("STRIPE_API_KEY"),
        batch_size=100,
    )

    # Salesforce sources
    salesforce_accounts = DataSource(
        type=DataSourceType.API,
        name="salesforce_accounts",
        service="salesforce",
        entity="Account",
        batch_size=200,
    )

    salesforce_contacts = DataSource(
        type=DataSourceType.API,
        name="salesforce_contacts",
        service="salesforce",
        entity="Contact",
        batch_size=200,
    )

    # Create config
    config = MigrationConfig(
        name="Stripe & Salesforce to Chargebee Migration",
        description="Complete migration from Stripe and Salesforce to Chargebee",
        sources=[
            stripe_customers,
            stripe_products,
            stripe_prices,
            stripe_subscriptions,
            salesforce_accounts,
            salesforce_contacts,
        ],
        target_service="chargebee",
        target_api_key=os.environ.get("CHARGEBEE_API_KEY"),
        target_site=os.environ.get("CHARGEBEE_SITE", "test-site"),
        mapping_file=str(Path(__file__).parent.parent.parent / "mappings" / "stripe_salesforce_combined.json"),
        dry_run=dry_run,
        batch_size=10,
        continue_on_error=True,
        max_errors=100,
        deduplication={"customers": "email", "Customer": "email"},
        dedup_preferred_source="stripe",
        output_dir=str(Path(__file__).parent / "data"),
        save_extracted=True,
        save_transformed=True,
    )

    return config


def load_schemas(registry: SchemaRegistry):
    """Load schema files into registry."""
    base_path = Path(__file__).parent.parent.parent

    # Load source schemas
    sources_dir = base_path / "schemas" / "sources"
    if sources_dir.exists():
        registry.load_schemas_from_directory(str(sources_dir))

    # Load target schemas
    targets_dir = base_path / "schemas" / "targets"
    if targets_dir.exists():
        registry.load_schemas_from_directory(str(targets_dir))


def load_mappings(registry: SchemaRegistry):
    """Load mapping files into registry."""
    base_path = Path(__file__).parent.parent.parent
    mappings_dir = base_path / "mappings"

    if mappings_dir.exists():
        registry.load_mappings_from_directory(str(mappings_dir))


def run_migration(config: MigrationConfig, registry: SchemaRegistry):
    """Run the migration."""
    logger.info("=" * 60)
    logger.info("STARTING MIGRATION")
    logger.info("=" * 60)
    logger.info(f"Name: {config.name}")
    logger.info(f"Dry Run: {config.dry_run}")
    logger.info(f"Target: {config.target_service}")

    # Load mapping if specified
    mapping = None
    if config.mapping_file and Path(config.mapping_file).exists():
        mapping = MigrationMapping.from_json_file(config.mapping_file)
        logger.info(f"Loaded mapping from: {config.mapping_file}")

    # Create orchestrator
    orchestrator = MigrationOrchestrator(config, registry, mapping)

    # Run migration
    result = orchestrator.run_migration()

    # Print results
    logger.info("=" * 60)
    logger.info("MIGRATION COMPLETE")
    logger.info("=" * 60)
    logger.info(f"Status: {result.status.value}")
    logger.info(f"Total Processed: {result.total_records_processed}")
    logger.info(f"Succeeded: {result.total_records_succeeded}")
    logger.info(f"Failed: {result.total_records_failed}")
    logger.info(f"Skipped: {result.total_records_skipped}")

    if result.duration_seconds:
        logger.info(f"Duration: {result.duration_seconds:.2f} seconds")

    if result.errors:
        logger.warning(f"\nErrors ({len(result.errors)}):")
        for error in result.errors[:10]:  # Show first 10
            logger.warning(f"  - {error}")

    return result


def demo_with_sample_data():
    """
    Demo migration with sample data (no API calls needed).

    This demonstrates the transformation logic without
    requiring actual API credentials.
    """
    logger.info("Running demo with sample data...")

    # Sample Stripe customer
    stripe_customers = [
        {
            "id": "cus_ABC123",
            "name": "John Doe",
            "email": "john@example.com",
            "phone": "+1-555-123-4567",
            "address": {
                "line1": "123 Main St",
                "city": "San Francisco",
                "state": "CA",
                "postal_code": "94102",
                "country": "US"
            },
            "metadata": {"source": "website"},
            "created": 1704067200,
            "currency": "usd"
        }
    ]

    # Sample Stripe product
    stripe_products = [
        {
            "id": "prod_XYZ789",
            "name": "Premium Plan",
            "description": "Our premium subscription plan",
            "active": True,
            "metadata": {},
            "created": 1704067200
        }
    ]

    # Sample Stripe price
    stripe_prices = [
        {
            "id": "price_ABC123",
            "product": "prod_XYZ789",
            "nickname": "Premium Monthly",
            "unit_amount": 9900,
            "currency": "usd",
            "billing_scheme": "per_unit",
            "type": "recurring",
            "recurring": {
                "interval": "month",
                "interval_count": 1
            },
            "active": True,
            "created": 1704067200
        }
    ]

    # Sample Salesforce account
    salesforce_accounts = [
        {
            "Id": "001xx000003DIoXAAW",
            "Name": "Acme Corporation",
            "Phone": "+1-555-987-6543",
            "BillingStreet": "456 Business Ave",
            "BillingCity": "New York",
            "BillingState": "NY",
            "BillingPostalCode": "10001",
            "BillingCountry": "United States",
            "Industry": "Technology",
            "CreatedDate": "2024-01-01T00:00:00.000Z"
        }
    ]

    # Create config for demo
    config = MigrationConfig(
        name="Demo Migration",
        description="Demo with sample data",
        sources=[],  # No actual sources - we'll add data manually
        target_service="chargebee",
        target_site="demo-site",
        dry_run=True,
        output_dir=str(Path(__file__).parent / "demo_output"),
    )

    # Set up registry
    registry = SchemaRegistry()
    load_schemas(registry)
    load_mappings(registry)

    # Create orchestrator
    orchestrator = MigrationOrchestrator(config, registry)

    # Add sample data manually
    orchestrator.add_source_data("stripe", "customers", stripe_customers)
    orchestrator.add_source_data("stripe", "products", stripe_products)
    orchestrator.add_source_data("stripe", "prices", stripe_prices)
    orchestrator.add_source_data("salesforce", "Account", salesforce_accounts)

    # Preview transformations
    logger.info("\n=== Transformation Preview ===")

    try:
        result = orchestrator.preview_transformation(
            stripe_customers[0],
            "stripe", "Customer",
            "chargebee", "Customer"
        )
        logger.info("\nStripe Customer -> Chargebee Customer:")
        logger.info(json.dumps(result.data, indent=2))
    except Exception as e:
        logger.warning(f"Could not preview customer transformation: {e}")

    try:
        result = orchestrator.preview_transformation(
            stripe_products[0],
            "stripe", "Product",
            "chargebee", "Item"
        )
        logger.info("\nStripe Product -> Chargebee Item:")
        logger.info(json.dumps(result.data, indent=2))
    except Exception as e:
        logger.warning(f"Could not preview product transformation: {e}")

    logger.info("\nDemo complete! Check demo_output/ for saved data.")


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Stripe + Salesforce to Chargebee Migration"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate migration without making changes"
    )
    parser.add_argument(
        "--demo",
        action="store_true",
        help="Run demo with sample data (no API keys needed)"
    )
    parser.add_argument(
        "--config",
        help="Path to YAML config file"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Verbose output"
    )

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    if args.demo:
        demo_with_sample_data()
        return

    # Check for required environment variables
    required_env = ["CHARGEBEE_API_KEY", "CHARGEBEE_SITE"]
    missing = [var for var in required_env if not os.environ.get(var)]

    if missing and not args.dry_run:
        logger.error(f"Missing required environment variables: {', '.join(missing)}")
        logger.info("Set these or use --dry-run for simulation")
        sys.exit(1)

    # Create config
    config = create_config(dry_run=args.dry_run or bool(missing))

    # Set up registry
    registry = SchemaRegistry()
    load_schemas(registry)
    load_mappings(registry)

    # Run migration
    run_migration(config, registry)


if __name__ == "__main__":
    main()
