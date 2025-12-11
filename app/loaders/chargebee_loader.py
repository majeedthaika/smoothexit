"""Chargebee-specific data loader."""

import time
import logging
from typing import Any, Dict, List, Optional
from datetime import datetime

from .base import BaseLoader, LoadResult
from ..models.record import TransformedRecord, MigrationResult

logger = logging.getLogger(__name__)


class ChargebeeLoader(BaseLoader):
    """
    Loader for Chargebee API.

    Handles loading:
    - Item Families
    - Items (Products)
    - Item Prices
    - Customers
    - Subscriptions
    - Invoices
    """

    # Entity loading order (respects dependencies)
    ENTITY_ORDER = [
        "item_families",
        "items",
        "item_prices",
        "customers",
        "payment_sources",
        "subscriptions",
        "invoices",
    ]

    def __init__(
        self,
        site: str,
        api_key: str,
        dry_run: bool = False,
        batch_size: int = 10,
        rate_limit: float = 10.0  # Requests per second
    ):
        """
        Initialize the Chargebee loader.

        Args:
            site: Chargebee site name (subdomain)
            api_key: Chargebee API key
            dry_run: If True, simulate without making changes
            batch_size: Number of records per batch
            rate_limit: Max requests per second
        """
        super().__init__("chargebee", api_key, dry_run, batch_size)
        self.site = site
        self.rate_limit = rate_limit
        self._last_request_time = 0.0
        self._client = None

    @property
    def client(self):
        """Get or create Chargebee client."""
        if self._client is None:
            try:
                import chargebee
                chargebee.configure(self.api_key, self.site)
                self._client = chargebee
            except ImportError:
                raise ImportError("chargebee package required for Chargebee loading")
        return self._client

    def _rate_limit_wait(self):
        """Wait to respect rate limits."""
        if self.rate_limit > 0:
            elapsed = time.time() - self._last_request_time
            wait_time = (1.0 / self.rate_limit) - elapsed
            if wait_time > 0:
                time.sleep(wait_time)
        self._last_request_time = time.time()

    def load_record(
        self,
        record: TransformedRecord,
        upsert: bool = True
    ) -> MigrationResult:
        """Load a single record to Chargebee."""
        entity = record.target_entity.lower()

        # Route to appropriate method
        loaders = {
            "item_family": self._load_item_family,
            "item_families": self._load_item_family,
            "item": self._load_item,
            "items": self._load_item,
            "item_price": self._load_item_price,
            "item_prices": self._load_item_price,
            "customer": self._load_customer,
            "customers": self._load_customer,
            "subscription": self._load_subscription,
            "subscriptions": self._load_subscription,
        }

        loader = loaders.get(entity)
        if not loader:
            return MigrationResult(
                record_id=record.id,
                success=False,
                error=f"Unknown entity type: {entity}",
            )

        try:
            self._rate_limit_wait()
            return loader(record, upsert)
        except Exception as e:
            logger.error(f"Failed to load {entity} {record.id}: {e}")
            return MigrationResult(
                record_id=record.id,
                success=False,
                error=str(e),
            )

    def _load_item_family(
        self,
        record: TransformedRecord,
        upsert: bool
    ) -> MigrationResult:
        """Load an Item Family."""
        if self.dry_run:
            return MigrationResult(
                record_id=record.id,
                target_id=record.id,
                success=True,
                loaded_at=datetime.utcnow(),
            )

        data = record.data
        params = {
            "id": data.get("id"),
            "name": data.get("name"),
        }

        if data.get("description"):
            params["description"] = data["description"]

        try:
            result = self.client.ItemFamily.create(params)
            return MigrationResult(
                record_id=record.id,
                target_id=result.item_family.id,
                success=True,
                loaded_at=datetime.utcnow(),
                response_data={"id": result.item_family.id},
            )
        except self.client.APIError as e:
            if "already exists" in str(e) and upsert:
                # Already exists, consider it success
                return MigrationResult(
                    record_id=record.id,
                    target_id=data.get("id"),
                    success=True,
                    loaded_at=datetime.utcnow(),
                )
            raise

    def _load_item(
        self,
        record: TransformedRecord,
        upsert: bool
    ) -> MigrationResult:
        """Load an Item (Product)."""
        if self.dry_run:
            return MigrationResult(
                record_id=record.id,
                target_id=record.id,
                success=True,
                loaded_at=datetime.utcnow(),
            )

        data = record.data
        params = {
            "id": data.get("id"),
            "name": data.get("name", "")[:50],  # Chargebee limit
            "type": data.get("type", "plan"),
            "item_family_id": data.get("item_family_id"),
        }

        if data.get("description"):
            params["description"] = data["description"][:500]
        if data.get("external_name"):
            params["external_name"] = data["external_name"][:100]
        if data.get("status"):
            params["status"] = data["status"]
        if data.get("meta_data"):
            params["metadata"] = data["meta_data"]

        try:
            result = self.client.Item.create(params)
            return MigrationResult(
                record_id=record.id,
                target_id=result.item.id,
                success=True,
                loaded_at=datetime.utcnow(),
                response_data={"id": result.item.id},
            )
        except self.client.APIError as e:
            if "already exists" in str(e) and upsert:
                try:
                    result = self.client.Item.update(data.get("id"), params)
                    return MigrationResult(
                        record_id=record.id,
                        target_id=result.item.id,
                        success=True,
                        loaded_at=datetime.utcnow(),
                    )
                except:
                    pass
            raise

    def _load_item_price(
        self,
        record: TransformedRecord,
        upsert: bool
    ) -> MigrationResult:
        """Load an Item Price."""
        if self.dry_run:
            return MigrationResult(
                record_id=record.id,
                target_id=record.id,
                success=True,
                loaded_at=datetime.utcnow(),
            )

        data = record.data
        params = {
            "id": data.get("id"),
            "name": data.get("name", "")[:50],
            "item_id": data.get("item_id"),
            "pricing_model": data.get("pricing_model", "flat_fee"),
            "currency_code": data.get("currency_code", "USD"),
        }

        if data.get("price") is not None:
            params["price"] = data["price"]
        if data.get("period"):
            params["period"] = data["period"]
        if data.get("period_unit"):
            params["period_unit"] = data["period_unit"]
        if data.get("trial_period"):
            params["trial_period"] = data["trial_period"]
        if data.get("trial_period_unit"):
            params["trial_period_unit"] = data["trial_period_unit"]
        if data.get("item_type"):
            params["item_type"] = data["item_type"]
        if data.get("status"):
            params["status"] = data["status"]
        if data.get("meta_data"):
            params["metadata"] = data["meta_data"]

        try:
            result = self.client.ItemPrice.create(params)
            return MigrationResult(
                record_id=record.id,
                target_id=result.item_price.id,
                success=True,
                loaded_at=datetime.utcnow(),
                response_data={"id": result.item_price.id},
            )
        except self.client.APIError as e:
            if "already exists" in str(e) and upsert:
                try:
                    result = self.client.ItemPrice.update(data.get("id"), params)
                    return MigrationResult(
                        record_id=record.id,
                        target_id=result.item_price.id,
                        success=True,
                        loaded_at=datetime.utcnow(),
                    )
                except:
                    pass
            raise

    def _load_customer(
        self,
        record: TransformedRecord,
        upsert: bool
    ) -> MigrationResult:
        """Load a Customer."""
        if self.dry_run:
            return MigrationResult(
                record_id=record.id,
                target_id=record.id,
                success=True,
                loaded_at=datetime.utcnow(),
            )

        data = record.data
        params = {"id": data.get("id")}

        # Basic fields
        if data.get("first_name"):
            params["first_name"] = data["first_name"][:150]
        if data.get("last_name"):
            params["last_name"] = data["last_name"][:150]
        if data.get("email"):
            params["email"] = data["email"][:70]
        if data.get("phone"):
            params["phone"] = data["phone"][:50]
        if data.get("company"):
            params["company"] = data["company"][:250]

        # Billing address
        if data.get("billing_address"):
            addr = data["billing_address"]
            params["billing_address"] = {
                "first_name": addr.get("first_name"),
                "last_name": addr.get("last_name"),
                "line1": addr.get("line1"),
                "line2": addr.get("line2"),
                "city": addr.get("city"),
                "state": addr.get("state"),
                "zip": addr.get("zip"),
                "country": addr.get("country"),
            }
            params["billing_address"] = {
                k: v for k, v in params["billing_address"].items() if v
            }

        # Other fields
        if data.get("preferred_currency_code"):
            params["preferred_currency_code"] = data["preferred_currency_code"]
        if data.get("taxability"):
            params["taxability"] = data["taxability"]
        if data.get("auto_collection"):
            params["auto_collection"] = data["auto_collection"]
        if data.get("meta_data"):
            params["meta_data"] = data["meta_data"]

        try:
            result = self.client.Customer.create(params)
            return MigrationResult(
                record_id=record.id,
                target_id=result.customer.id,
                success=True,
                loaded_at=datetime.utcnow(),
                response_data={"id": result.customer.id},
            )
        except self.client.APIError as e:
            if "already exists" in str(e) and upsert:
                try:
                    result = self.client.Customer.update(data.get("id"), params)
                    return MigrationResult(
                        record_id=record.id,
                        target_id=result.customer.id,
                        success=True,
                        loaded_at=datetime.utcnow(),
                    )
                except:
                    pass
            raise

    def _load_subscription(
        self,
        record: TransformedRecord,
        upsert: bool
    ) -> MigrationResult:
        """Load a Subscription."""
        if self.dry_run:
            return MigrationResult(
                record_id=record.id,
                target_id=record.id,
                success=True,
                loaded_at=datetime.utcnow(),
            )

        data = record.data
        params = {
            "id": data.get("id"),
            "customer_id": data.get("customer_id"),
        }

        # Subscription items
        if data.get("subscription_items"):
            items = []
            for item in data["subscription_items"]:
                item_data = {"item_price_id": item.get("item_price_id")}
                if item.get("quantity"):
                    item_data["quantity"] = item["quantity"]
                items.append(item_data)
            params["subscription_items"] = items

        # Dates
        if data.get("start_date"):
            params["start_date"] = data["start_date"]
        if data.get("trial_end"):
            params["trial_end"] = data["trial_end"]

        # Status handling for imports
        if data.get("status"):
            # For importing with specific status
            params["status"] = data["status"]

        # Other fields
        if data.get("currency_code"):
            params["currency_code"] = data["currency_code"]
        if data.get("auto_collection"):
            params["auto_collection"] = data["auto_collection"]
        if data.get("meta_data"):
            params["meta_data"] = data["meta_data"]

        try:
            # Use create_with_items for new subscriptions
            result = self.client.Subscription.create_with_items(params)
            return MigrationResult(
                record_id=record.id,
                target_id=result.subscription.id,
                success=True,
                loaded_at=datetime.utcnow(),
                response_data={"id": result.subscription.id},
            )
        except self.client.APIError as e:
            if "already exists" in str(e) and upsert:
                # Try import for existing subscriptions
                try:
                    params["customer"] = {"id": params.pop("customer_id")}
                    result = self.client.Subscription.import_subscription(params)
                    return MigrationResult(
                        record_id=record.id,
                        target_id=result.subscription.id,
                        success=True,
                        loaded_at=datetime.utcnow(),
                    )
                except:
                    pass
            raise

    def delete_record(self, entity: str, record_id: str) -> bool:
        """Delete a record from Chargebee."""
        if self.dry_run:
            return True

        self._rate_limit_wait()

        entity_lower = entity.lower()
        try:
            if entity_lower in ("customer", "customers"):
                self.client.Customer.delete(record_id)
            elif entity_lower in ("item", "items"):
                self.client.Item.delete(record_id)
            elif entity_lower in ("item_price", "item_prices"):
                self.client.ItemPrice.delete(record_id)
            elif entity_lower in ("subscription", "subscriptions"):
                self.client.Subscription.cancel(record_id)
            elif entity_lower in ("item_family", "item_families"):
                self.client.ItemFamily.delete(record_id)
            else:
                logger.warning(f"Unknown entity type for deletion: {entity}")
                return False

            return True

        except Exception as e:
            logger.error(f"Failed to delete {entity} {record_id}: {e}")
            return False

    def validate_connection(self) -> bool:
        """Validate connection to Chargebee."""
        try:
            self._rate_limit_wait()
            # Try to list customers with limit 1
            self.client.Customer.list({"limit": 1})
            return True
        except Exception as e:
            logger.error(f"Chargebee connection validation failed: {e}")
            return False

    def load_all(
        self,
        records_by_entity: Dict[str, List[TransformedRecord]],
        order: Optional[List[str]] = None
    ) -> Dict[str, LoadResult]:
        """Load all records respecting Chargebee dependencies."""
        # Use Chargebee-specific order if not provided
        if order is None:
            order = self.ENTITY_ORDER

        return super().load_all(records_by_entity, order)
