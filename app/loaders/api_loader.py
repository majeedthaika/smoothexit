"""Generic API loader for custom target services."""

import time
import logging
import requests
from typing import Any, Dict, List, Optional
from datetime import datetime

from .base import BaseLoader, LoadResult
from ..models.record import TransformedRecord, MigrationResult

logger = logging.getLogger(__name__)


class APILoader(BaseLoader):
    """
    Generic API loader for REST endpoints.

    Can be configured for any REST API that follows standard patterns.
    """

    def __init__(
        self,
        target_service: str,
        base_url: str,
        api_key: Optional[str] = None,
        auth_type: str = "bearer",  # bearer, basic, header
        auth_header: str = "Authorization",
        dry_run: bool = False,
        batch_size: int = 10,
        rate_limit: float = 10.0,
        endpoints: Optional[Dict[str, str]] = None
    ):
        """
        Initialize the API loader.

        Args:
            target_service: Name of the target service
            base_url: Base URL for the API
            api_key: API key for authentication
            auth_type: Type of authentication
            auth_header: Header name for authentication
            dry_run: If True, simulate without making changes
            batch_size: Number of records per batch
            rate_limit: Max requests per second
            endpoints: Mapping of entity -> endpoint path
        """
        super().__init__(target_service, api_key, dry_run, batch_size)
        self.base_url = base_url.rstrip("/")
        self.auth_type = auth_type
        self.auth_header = auth_header
        self.rate_limit = rate_limit
        self.endpoints = endpoints or {}
        self._last_request_time = 0.0
        self._session = self._create_session()

    def _create_session(self) -> requests.Session:
        """Create a requests session with authentication."""
        session = requests.Session()

        if self.api_key:
            if self.auth_type == "bearer":
                session.headers["Authorization"] = f"Bearer {self.api_key}"
            elif self.auth_type == "basic":
                import base64
                credentials = base64.b64encode(f"{self.api_key}:".encode()).decode()
                session.headers["Authorization"] = f"Basic {credentials}"
            elif self.auth_type == "header":
                session.headers[self.auth_header] = self.api_key

        session.headers["Content-Type"] = "application/json"

        return session

    def _rate_limit_wait(self):
        """Wait to respect rate limits."""
        if self.rate_limit > 0:
            elapsed = time.time() - self._last_request_time
            wait_time = (1.0 / self.rate_limit) - elapsed
            if wait_time > 0:
                time.sleep(wait_time)
        self._last_request_time = time.time()

    def _get_endpoint(self, entity: str) -> str:
        """Get the API endpoint for an entity."""
        if entity in self.endpoints:
            return self.endpoints[entity]
        return f"/{entity}"

    def load_record(
        self,
        record: TransformedRecord,
        upsert: bool = True
    ) -> MigrationResult:
        """Load a single record to the API."""
        if self.dry_run:
            return MigrationResult(
                record_id=record.id,
                target_id=record.id,
                success=True,
                loaded_at=datetime.utcnow(),
            )

        entity = record.target_entity.lower()
        endpoint = self._get_endpoint(entity)
        url = f"{self.base_url}{endpoint}"

        self._rate_limit_wait()

        try:
            # Try POST first (create)
            response = self._session.post(url, json=record.data)

            if response.status_code == 409 and upsert:
                # Conflict - try PUT (update)
                record_id = record.data.get("id", record.id)
                update_url = f"{url}/{record_id}"
                response = self._session.put(update_url, json=record.data)

            response.raise_for_status()
            response_data = response.json() if response.text else {}

            target_id = (
                response_data.get("id") or
                response_data.get("data", {}).get("id") or
                record.id
            )

            return MigrationResult(
                record_id=record.id,
                target_id=str(target_id),
                success=True,
                loaded_at=datetime.utcnow(),
                response_data=response_data,
            )

        except requests.exceptions.HTTPError as e:
            error_msg = str(e)
            try:
                error_data = e.response.json()
                error_msg = error_data.get("message") or error_data.get("error") or str(error_data)
            except:
                pass

            return MigrationResult(
                record_id=record.id,
                success=False,
                error=error_msg,
                error_code=str(e.response.status_code),
            )

        except Exception as e:
            return MigrationResult(
                record_id=record.id,
                success=False,
                error=str(e),
            )

    def delete_record(self, entity: str, record_id: str) -> bool:
        """Delete a record from the API."""
        if self.dry_run:
            return True

        endpoint = self._get_endpoint(entity)
        url = f"{self.base_url}{endpoint}/{record_id}"

        self._rate_limit_wait()

        try:
            response = self._session.delete(url)
            response.raise_for_status()
            return True
        except Exception as e:
            logger.error(f"Failed to delete {entity} {record_id}: {e}")
            return False

    def validate_connection(self) -> bool:
        """Validate connection to the API."""
        try:
            self._rate_limit_wait()
            response = self._session.get(self.base_url)
            return response.status_code < 500
        except Exception as e:
            logger.error(f"API connection validation failed: {e}")
            return False


class BatchAPILoader(APILoader):
    """
    API loader that supports batch operations.

    Some APIs support creating/updating multiple records in a single request.
    """

    def __init__(
        self,
        target_service: str,
        base_url: str,
        api_key: Optional[str] = None,
        batch_endpoint_suffix: str = "/batch",
        max_batch_size: int = 100,
        **kwargs
    ):
        """
        Initialize the batch API loader.

        Args:
            target_service: Name of the target service
            base_url: Base URL for the API
            api_key: API key for authentication
            batch_endpoint_suffix: Suffix for batch endpoints
            max_batch_size: Maximum records per batch request
            **kwargs: Additional arguments for APILoader
        """
        super().__init__(target_service, base_url, api_key, **kwargs)
        self.batch_endpoint_suffix = batch_endpoint_suffix
        self.max_batch_size = max_batch_size

    def load_batch(
        self,
        records: List[TransformedRecord],
        entity: str,
        upsert: bool = True
    ) -> LoadResult:
        """Load a batch of records using batch API."""
        result = LoadResult(entity=entity)
        result.started_at = datetime.utcnow()

        if self.dry_run:
            result.total_attempted = len(records)
            result.total_succeeded = len(records)
            result.created_ids = [r.id for r in records]
            result.completed_at = datetime.utcnow()
            return result

        endpoint = self._get_endpoint(entity)
        batch_url = f"{self.base_url}{endpoint}{self.batch_endpoint_suffix}"

        # Process in chunks
        for i in range(0, len(records), self.max_batch_size):
            chunk = records[i:i + self.max_batch_size]
            chunk_data = [r.data for r in chunk]

            self._rate_limit_wait()

            try:
                response = self._session.post(batch_url, json={"records": chunk_data})
                response.raise_for_status()
                response_data = response.json()

                # Parse batch response
                results = response_data.get("results", [])
                for j, record in enumerate(chunk):
                    result.total_attempted += 1

                    if j < len(results):
                        item_result = results[j]
                        if item_result.get("success", True):
                            result.total_succeeded += 1
                            target_id = item_result.get("id", record.id)
                            result.created_ids.append(str(target_id))
                            result.results.append(MigrationResult(
                                record_id=record.id,
                                target_id=str(target_id),
                                success=True,
                                loaded_at=datetime.utcnow(),
                            ))
                        else:
                            result.total_failed += 1
                            result.errors.append({
                                "record_id": record.id,
                                "error": item_result.get("error"),
                            })
                            result.results.append(MigrationResult(
                                record_id=record.id,
                                success=False,
                                error=item_result.get("error"),
                            ))
                    else:
                        # Assume success if no specific result
                        result.total_succeeded += 1
                        result.created_ids.append(record.id)

            except Exception as e:
                # Batch failed - fall back to individual loading
                logger.warning(f"Batch load failed, falling back to individual: {e}")
                for record in chunk:
                    individual_result = self.load_record(record, upsert)
                    result.total_attempted += 1
                    result.results.append(individual_result)

                    if individual_result.success:
                        result.total_succeeded += 1
                        if individual_result.target_id:
                            result.created_ids.append(individual_result.target_id)
                    else:
                        result.total_failed += 1
                        result.errors.append({
                            "record_id": record.id,
                            "error": individual_result.error,
                        })

        result.completed_at = datetime.utcnow()
        return result
