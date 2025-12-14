# smoothexit

A schema-first data migration platform for seamlessly moving data between SaaS platforms (e.g., Stripe + Salesforce to Chargebee).

## Features

- **Interactive Web UI**: Schema-first workflow with always-visible schemas and mappings
- **Multiple Data Sources**: Extract data from APIs, CSV/JSON files, screenshots (with vision AI), and web scraping
- **Schema Registry**: Manage source and target service schemas with validation
- **Flexible Transformations**: 25+ built-in transformation types for field mapping
- **Drag-and-Drop Mapping**: Visual field mapping editor with transformation configuration
- **LLM-Powered Inference**: Use AI to infer schemas and suggest mappings
- **Real-time Progress**: Server-sent events for live migration monitoring
- **Batch Streaming**: Process large datasets efficiently with configurable batch sizes
- **Rollback Support**: Track created records for potential rollback
- **Dry Run Mode**: Test migrations without making actual changes

## Quick Start with Docker

```bash
# Start the application
docker-compose up -d

# Access the UI
open http://localhost:3000
```

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000

## Web UI

The web interface provides a schema-first workflow:

### Workspace Layout
- **Schema Panel** (left sidebar): Always-visible view of source schemas, target schema, and mapping summary
- **Tabs**: Switch between Schemas, Mappings, and Execute views

### Schemas Tab
- View and edit source/target schemas
- Add/remove fields with inline editing
- Support for nested object fields
- Upload JSON/CSV to infer schemas (coming soon)
- API discovery to auto-detect schemas (coming soon)

### Mappings Tab
- Drag-and-drop field mapping editor
- Configure transformations (direct, split_name, enum_map, etc.)
- Visual connection lines between mapped fields
- Unmapped required fields highlighted

### Execute Tab
- Configure dry-run or live migration
- Real-time progress monitoring via SSE
- View success/failure counts and errors

## Installation (Development)

```bash
cd smoothexit
pip install -r requirements.txt

# For browser automation (optional)
playwright install chromium
```

## Quick Start

### 1. Using the Example Migration

```bash
cd examples/stripe_salesforce_to_chargebee

# Run demo with sample data (no API keys needed)
python run_migration.py --demo

# Dry run with actual APIs
export STRIPE_API_KEY=sk_test_...
export CHARGEBEE_API_KEY=test_...
export CHARGEBEE_SITE=your-site
python run_migration.py --dry-run

# Full migration
python run_migration.py
```

### 2. Using the CLI

```bash
# Interactive mapping editor
python -m app.cli map

# Preview transformations
python -m app.cli preview \
    --source-file data/stripe_customers.json \
    --mapping mappings/stripe_to_chargebee.json \
    --entity Stripe_Customer_to_Chargebee_Customer

# Validate a mapping
python -m app.cli validate --mapping mappings/stripe_to_chargebee.json

# Run migration from config
python -m app.cli run --config examples/stripe_salesforce_to_chargebee/config.yaml

# Infer schema from sample data
python -m app.cli infer --input data/sample.json --service custom --entity records
```

## Project Structure

```
smoothexit/
├── app/
│   ├── models/
│   │   ├── schema.py       # Schema and mapping definitions
│   │   ├── migration.py    # Migration execution models
│   │   └── record.py       # Record models for data flow
│   ├── services/
│   │   ├── schema_registry.py  # Schema and mapping management
│   │   ├── transformer.py      # Field transformation engine
│   │   ├── validator.py        # Record validation
│   │   └── llm_inference.py    # AI-powered schema inference
│   ├── extractors/
│   │   ├── api_extractor.py       # API data extraction
│   │   ├── csv_extractor.py       # CSV/JSON file extraction
│   │   ├── screenshot_extractor.py # Vision AI extraction
│   │   └── web_scraper.py         # Browser automation
│   ├── loaders/
│   │   ├── chargebee_loader.py    # Chargebee-specific loader
│   │   └── api_loader.py          # Generic API loader
│   ├── orchestrator.py    # Main migration orchestrator
│   └── cli.py             # Command-line interface
├── schemas/
│   ├── sources/           # Source service schemas
│   └── targets/           # Target service schemas
├── mappings/              # Field mapping definitions
├── examples/              # Example migrations
└── data/                  # Extracted/transformed data
```

## Data Sources

### API Extraction
```yaml
sources:
  - type: api
    name: stripe_customers
    service: stripe
    entity: customers
    batch_size: 100
    rate_limit: 25
```

### CSV/JSON Files
```yaml
sources:
  - type: csv
    name: exported_data
    service: stripe
    entity: customers
    file_path: ./data/exports/customers.csv
```

### Screenshot Extraction (Vision AI)
```yaml
sources:
  - type: screenshot
    name: dashboard_data
    service: custom
    entity: metrics
    screenshot_path: ./data/screenshots/
    vision_provider: openai  # or anthropic, google
```

### Web Scraping
```yaml
sources:
  - type: web_scrape
    name: legacy_records
    service: legacy_system
    entity: records
    url: https://app.example.com/records
    browser_instructions: |
      1. Log in with credentials
      2. Navigate to Records page
      3. Export visible table data
```

## Field Mappings

Mappings define how source fields transform to target fields:

```json
{
  "source_field": "email",
  "target_field": "email",
  "transform": "direct"
}
```

### Transform Types

| Transform | Description | Config |
|-----------|-------------|--------|
| `direct` | Copy value as-is | - |
| `prefix_add` | Add prefix | `{"prefix": "stripe_"}` |
| `prefix_strip` | Remove prefix | `{"prefix": "cus_"}` |
| `split_name` | Split full name | `{"part": "first"}` |
| `enum_map` | Map enum values | `{"mapping": {"active": "Active"}}` |
| `iso_to_unix` | ISO date to Unix timestamp | - |
| `unix_to_iso` | Unix timestamp to ISO date | - |
| `country_code` | Country name to code | - |
| `currency_convert` | Convert currency amounts | `{"from_cents": true}` |
| `concat` | Concatenate fields | `{"fields": ["a", "b"], "separator": " "}` |
| `template` | String template | `{"template": "{first} {last}"}` |
| `default` | Set default value | `{"value": "default"}` |
| `computed` | Python expression | `{"expression": "source.get('a', 0) * 100"}` |

## LLM Schema Inference

Use AI to analyze data and suggest schemas/mappings:

```python
from app.services.llm_inference import LLMSchemaInference

inference = LLMSchemaInference(provider="openai")

# Infer schema from sample data
result = inference.infer_schema(sample_data, "custom", "records")

# Get mapping suggestions
suggestions = inference.suggest_mappings(
    source_schema,
    target_schema,
    sample_source_data=source_data
)
```

## Deduplication

When migrating from multiple sources, deduplicate by key fields:

```yaml
deduplication:
  customers: email
  Customer: email

dedup_preferred_source: stripe  # Prefer Stripe data over Salesforce
```

## Environment Variables

```bash
# API Keys
STRIPE_API_KEY=sk_...
SALESFORCE_USERNAME=user@example.com
SALESFORCE_PASSWORD=...
SALESFORCE_SECURITY_TOKEN=...
CHARGEBEE_API_KEY=...
CHARGEBEE_SITE=your-site

# LLM Providers (optional)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
```

## Programmatic Usage

```python
from app.models.migration import MigrationConfig, DataSource, DataSourceType
from app.services.schema_registry import SchemaRegistry
from app.orchestrator import MigrationOrchestrator

# Create config
config = MigrationConfig(
    name="My Migration",
    sources=[
        DataSource(
            type=DataSourceType.API,
            name="stripe_customers",
            service="stripe",
            entity="customers",
        )
    ],
    target_service="chargebee",
    dry_run=True,
)

# Set up registry
registry = SchemaRegistry()
registry.load_schemas_from_directory("schemas/sources")
registry.load_schemas_from_directory("schemas/targets")
registry.load_mappings_from_directory("mappings")

# Run migration
orchestrator = MigrationOrchestrator(config, registry)
result = orchestrator.run_migration()

print(f"Processed: {result.total_records_processed}")
print(f"Succeeded: {result.total_records_succeeded}")
print(f"Failed: {result.total_records_failed}")
```

## Iterative Refinement

Add sample data and preview transformations:

```python
# Add sample records
orchestrator.add_source_data("stripe", "customers", sample_customers)

# Preview transformation
result = orchestrator.preview_transformation(
    sample_customers[0],
    source_service="stripe",
    source_entity="Customer",
    target_service="chargebee",
    target_entity="Customer"
)

print(result.data)  # See transformed output
```

## Tech Stack

### Frontend
- React 19 + TypeScript
- Vite for build tooling
- Tailwind CSS 4 for styling
- Zustand for state management
- @dnd-kit for drag-and-drop

### Backend
- FastAPI with async support
- SSE (Server-Sent Events) for real-time updates
- Pydantic for data validation

### Infrastructure
- Docker + docker-compose
- nginx for frontend serving and API proxy

## License

MIT
