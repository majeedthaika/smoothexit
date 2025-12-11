"""API-based data extractor for services like Stripe and Salesforce."""

import time
import logging
from typing import Any, Callable, Dict, List, Optional
from datetime import datetime

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from .base import BaseExtractor, ExtractionResult
from ..models.record import SourceRecord
from ..models.migration import DataSource

logger = logging.getLogger(__name__)


class APIExtractor(BaseExtractor):
    """
    Extractor for REST API data sources.

    Supports:
    - Stripe API
    - Salesforce API
    - Generic REST APIs with pagination
    - Rate limiting
    - Retry logic
    """

    # Service-specific configurations
    SERVICE_CONFIGS = {
        "stripe": {
            "base_url": "https://api.stripe.com/v1",
            "auth_type": "bearer",
            "pagination_type": "cursor",
            "cursor_field": "starting_after",
            "has_more_field": "has_more",
            "data_field": "data",
            "id_field": "id",
        },
        "salesforce": {
            "base_url": None,  # Set dynamically based on instance
            "auth_type": "bearer",
            "pagination_type": "url",
            "next_url_field": "nextRecordsUrl",
            "data_field": "records",
            "id_field": "Id",
        },
        "chargebee": {
            "base_url": None,  # Set based on site
            "auth_type": "basic",
            "pagination_type": "offset",
            "offset_field": "offset",
            "data_field": "list",
            "id_field": "id",
        },
    }

    ENTITY_ENDPOINTS = {
        "stripe": {
            "customers": "/customers",
            "products": "/products",
            "prices": "/prices",
            "subscriptions": "/subscriptions",
            "invoices": "/invoices",
            "payment_methods": "/payment_methods",
        },
        "salesforce": {
            "accounts": "/services/data/v59.0/query?q=SELECT+{fields}+FROM+Account",
            "contacts": "/services/data/v59.0/query?q=SELECT+{fields}+FROM+Contact",
            "leads": "/services/data/v59.0/query?q=SELECT+{fields}+FROM+Lead",
            "opportunities": "/services/data/v59.0/query?q=SELECT+{fields}+FROM+Opportunity",
        },
        "chargebee": {
            "customers": "/api/v2/customers",
            "subscriptions": "/api/v2/subscriptions",
            "items": "/api/v2/items",
            "item_prices": "/api/v2/item_prices",
            "invoices": "/api/v2/invoices",
        },
    }

    def __init__(
        self,
        source: DataSource,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        session: Optional[requests.Session] = None
    ):
        """
        Initialize the API extractor.

        Args:
            source: Data source configuration
            api_key: API key for authentication
            base_url: Override base URL
            session: Custom requests session
        """
        super().__init__(source)
        self.api_key = api_key or source.api_key
        self._base_url = base_url
        self._session = session or self._create_session()
        self._service_config = self.SERVICE_CONFIGS.get(source.service.lower(), {})
        self._rate_limit_delay = 1 / source.rate_limit if source.rate_limit else 0

    def _create_session(self) -> requests.Session:
        """Create a requests session with retry logic."""
        session = requests.Session()

        retry_config = self.source.retry_config
        retries = Retry(
            total=retry_config.get("max_retries", 3),
            backoff_factor=retry_config.get("backoff_factor", 2.0),
            status_forcelist=[429, 500, 502, 503, 504],
        )

        adapter = HTTPAdapter(max_retries=retries)
        session.mount("https://", adapter)
        session.mount("http://", adapter)

        return session

    @property
    def base_url(self) -> str:
        """Get the base URL for API requests."""
        if self._base_url:
            return self._base_url

        if self.source.service.lower() == "salesforce":
            # Salesforce requires instance URL
            domain = self.source.oauth_config.get("domain", "login") if self.source.oauth_config else "login"
            return f"https://{domain}.salesforce.com"

        if self.source.service.lower() == "chargebee":
            site = self.source.api_endpoint or "test"
            return f"https://{site}.chargebee.com"

        return self._service_config.get("base_url", self.source.api_endpoint or "")

    def _get_auth_headers(self) -> Dict[str, str]:
        """Get authentication headers based on service type."""
        auth_type = self._service_config.get("auth_type", "bearer")

        if auth_type == "bearer":
            return {"Authorization": f"Bearer {self.api_key}"}
        elif auth_type == "basic":
            import base64
            credentials = base64.b64encode(f"{self.api_key}:".encode()).decode()
            return {"Authorization": f"Basic {credentials}"}

        return {}

    def _get_endpoint(self, entity: str) -> str:
        """Get the API endpoint for an entity."""
        service_endpoints = self.ENTITY_ENDPOINTS.get(self.source.service.lower(), {})
        endpoint = service_endpoints.get(entity.lower())

        if endpoint:
            return endpoint

        # Fall back to custom endpoint from source
        if self.source.api_endpoint:
            return self.source.api_endpoint

        # Default pattern
        return f"/{entity.lower()}"

    def extract(self) -> ExtractionResult:
        """Extract all data from the API."""
        self.reset()
        started_at = datetime.utcnow()
        all_records = []

        try:
            for batch in self.stream():
                all_records.extend(batch)

            result = self.get_extraction_result(all_records)
            result.started_at = started_at
            result.completed_at = datetime.utcnow()

            logger.info(f"Extracted {len(all_records)} {self.source.entity} records from {self.source.service}")
            return result

        except Exception as e:
            self.add_error(f"Extraction failed: {str(e)}")
            result = self.get_extraction_result(all_records)
            result.started_at = started_at
            result.completed_at = datetime.utcnow()
            return result

    def extract_batch(self, offset: int = 0, limit: int = 100) -> List[SourceRecord]:
        """Extract a batch of records from the API."""
        try:
            endpoint = self._get_endpoint(self.source.entity)
            url = f"{self.base_url}{endpoint}"
            headers = self._get_auth_headers()

            # Build query parameters
            params = self._build_params(offset, limit)

            # Apply rate limiting
            if self._rate_limit_delay > 0:
                time.sleep(self._rate_limit_delay)

            response = self._session.get(url, headers=headers, params=params)
            response.raise_for_status()

            data = response.json()
            records = self._parse_response(data)

            return records

        except requests.exceptions.HTTPError as e:
            self.add_error(f"HTTP error: {e.response.status_code} - {e.response.text}")
            return []
        except Exception as e:
            self.add_error(f"Request failed: {str(e)}")
            return []

    def _build_params(self, offset: int, limit: int) -> Dict[str, Any]:
        """Build query parameters for the request."""
        params = {"limit": limit}

        # Add filters from source configuration
        params.update(self.source.filters)

        pagination_type = self._service_config.get("pagination_type", "offset")

        if pagination_type == "offset":
            offset_field = self._service_config.get("offset_field", "offset")
            params[offset_field] = offset
        elif pagination_type == "cursor" and hasattr(self, "_cursor"):
            cursor_field = self._service_config.get("cursor_field", "starting_after")
            params[cursor_field] = self._cursor

        return params

    def _parse_response(self, data: Dict[str, Any]) -> List[SourceRecord]:
        """Parse API response into SourceRecords."""
        data_field = self._service_config.get("data_field", "data")
        id_field = self._service_config.get("id_field", "id")

        records = []
        items = data.get(data_field, [])

        if not isinstance(items, list):
            items = [items]

        for item in items:
            # Handle nested objects (e.g., Chargebee returns {"customer": {...}})
            if len(item) == 1 and isinstance(list(item.values())[0], dict):
                item = list(item.values())[0]

            record_id = item.get(id_field, str(len(records)))
            record = self.create_record(
                id=record_id,
                data=item,
                raw_data=item,
            )
            records.append(record)

            # Store cursor for pagination
            self._cursor = record_id

        # Check for more data
        has_more_field = self._service_config.get("has_more_field")
        if has_more_field:
            self._has_more = data.get(has_more_field, False)
        else:
            self._has_more = len(items) >= self.source.batch_size

        return records

    def validate_source(self) -> List[str]:
        """Validate the API source configuration."""
        errors = super().validate_source()

        if not self.api_key:
            errors.append("API key is required for API extraction")

        if not self.base_url:
            errors.append("Base URL could not be determined")

        return errors


class StripeExtractor(APIExtractor):
    """Specialized extractor for Stripe API."""

    def __init__(
        self,
        source: DataSource,
        api_key: Optional[str] = None
    ):
        source.service = "stripe"
        super().__init__(source, api_key)

    def extract_customers(self, **filters) -> List[SourceRecord]:
        """Extract all customers."""
        self.source.entity = "customers"
        self.source.filters = filters
        return self.extract().records

    def extract_products(self, **filters) -> List[SourceRecord]:
        """Extract all products."""
        self.source.entity = "products"
        self.source.filters = filters
        return self.extract().records

    def extract_prices(self, **filters) -> List[SourceRecord]:
        """Extract all prices."""
        self.source.entity = "prices"
        self.source.filters = filters
        return self.extract().records

    def extract_subscriptions(self, **filters) -> List[SourceRecord]:
        """Extract all subscriptions."""
        self.source.entity = "subscriptions"
        self.source.filters = filters
        return self.extract().records

    def extract_all(self) -> Dict[str, List[SourceRecord]]:
        """Extract all entity types."""
        return {
            "customers": self.extract_customers(),
            "products": self.extract_products(),
            "prices": self.extract_prices(),
            "subscriptions": self.extract_subscriptions(),
        }


class SalesforceExtractor(APIExtractor):
    """Specialized extractor for Salesforce API."""

    def __init__(
        self,
        source: DataSource,
        access_token: Optional[str] = None,
        instance_url: Optional[str] = None
    ):
        source.service = "salesforce"
        super().__init__(source, access_token, instance_url)

    def _get_endpoint(self, entity: str) -> str:
        """Build Salesforce SOQL query endpoint."""
        # Get fields for the entity from schema or use default
        fields = self._get_entity_fields(entity)
        query = f"SELECT {fields} FROM {entity}"

        # Add filters
        if self.source.filters:
            where_clauses = []
            for field, value in self.source.filters.items():
                if isinstance(value, str):
                    where_clauses.append(f"{field} = '{value}'")
                else:
                    where_clauses.append(f"{field} = {value}")
            if where_clauses:
                query += f" WHERE {' AND '.join(where_clauses)}"

        return f"/services/data/v59.0/query?q={query.replace(' ', '+')}"

    def _get_entity_fields(self, entity: str) -> str:
        """Get field list for an entity."""
        # Common fields for each entity type
        entity_fields = {
            "account": "Id, Name, Type, Industry, Phone, Website, BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry, CreatedDate",
            "contact": "Id, AccountId, FirstName, LastName, Email, Phone, MailingStreet, MailingCity, MailingState, MailingPostalCode, MailingCountry, CreatedDate",
            "lead": "Id, FirstName, LastName, Company, Email, Phone, Street, City, State, PostalCode, Country, Status, CreatedDate",
            "opportunity": "Id, AccountId, Name, Amount, StageName, CloseDate, Type, CreatedDate",
        }
        return entity_fields.get(entity.lower(), "Id, Name, CreatedDate")

    def extract_accounts(self, **filters) -> List[SourceRecord]:
        """Extract all accounts."""
        self.source.entity = "Account"
        self.source.filters = filters
        return self.extract().records

    def extract_contacts(self, **filters) -> List[SourceRecord]:
        """Extract all contacts."""
        self.source.entity = "Contact"
        self.source.filters = filters
        return self.extract().records

    def extract_leads(self, **filters) -> List[SourceRecord]:
        """Extract all leads."""
        self.source.entity = "Lead"
        self.source.filters = filters
        return self.extract().records

    def extract_opportunities(self, **filters) -> List[SourceRecord]:
        """Extract all opportunities."""
        self.source.entity = "Opportunity"
        self.source.filters = filters
        return self.extract().records

    def extract_all(self) -> Dict[str, List[SourceRecord]]:
        """Extract all entity types."""
        return {
            "accounts": self.extract_accounts(),
            "contacts": self.extract_contacts(),
            "leads": self.extract_leads(),
            "opportunities": self.extract_opportunities(),
        }
