"""Web scraping and browser automation data extractor."""

import json
import logging
import os
import re
from typing import Any, Dict, List, Optional
from datetime import datetime

from .base import BaseExtractor, ExtractionResult
from ..models.record import SourceRecord
from ..models.migration import DataSource

logger = logging.getLogger(__name__)


class WebScraperExtractor(BaseExtractor):
    """
    Extractor for data via web scraping and browser automation.

    Supports:
    - Browser-use AI-driven automation
    - Playwright-based scraping
    - Natural language instructions
    - Login and authentication
    - Table extraction
    - Pagination handling
    """

    def __init__(
        self,
        source: DataSource,
        browser_api_key: Optional[str] = None,
        llm_api_key: Optional[str] = None,
        headless: bool = True,
        use_browser_use: bool = True
    ):
        """
        Initialize the web scraper extractor.

        Args:
            source: Data source configuration
            browser_api_key: API key for browser-use cloud
            llm_api_key: API key for LLM (for browser-use)
            headless: Whether to run browser headlessly
            use_browser_use: Whether to use browser-use package
        """
        super().__init__(source)
        self.browser_api_key = browser_api_key or os.environ.get("BROWSER_USE_API_KEY")
        self.llm_api_key = llm_api_key or os.environ.get("OPENAI_API_KEY")
        self.headless = headless
        self.use_browser_use = use_browser_use

    def extract(self) -> ExtractionResult:
        """Extract data via web scraping."""
        self.reset()
        started_at = datetime.utcnow()
        all_records = []

        try:
            if not self.source.url:
                self.add_error("URL is required for web scraping extraction")
                return self.get_extraction_result([])

            if self.use_browser_use:
                records = self._extract_with_browser_use()
            else:
                records = self._extract_with_playwright()

            all_records.extend(records)

            result = self.get_extraction_result(all_records)
            result.started_at = started_at
            result.completed_at = datetime.utcnow()

            logger.info(f"Extracted {len(all_records)} records via web scraping")
            return result

        except Exception as e:
            self.add_error(f"Web scraping failed: {str(e)}")
            result = self.get_extraction_result(all_records)
            result.started_at = started_at
            result.completed_at = datetime.utcnow()
            return result

    def extract_batch(self, offset: int = 0, limit: int = 100) -> List[SourceRecord]:
        """Extract a batch of records."""
        # Web scraping typically extracts all at once
        result = self.extract()
        return result.records[offset:offset + limit]

    def _extract_with_browser_use(self) -> List[SourceRecord]:
        """Extract data using browser-use AI automation."""
        try:
            import asyncio
            from browser_use import Agent, Browser, BrowserConfig
            from langchain_openai import ChatOpenAI

            # Build extraction instructions
            instructions = self._build_browser_instructions()

            async def run_extraction():
                # Configure browser
                browser_config = BrowserConfig(
                    headless=self.headless,
                )

                browser = Browser(config=browser_config)

                # Configure LLM
                llm = ChatOpenAI(
                    model="gpt-4o",
                    api_key=self.llm_api_key
                )

                # Create agent
                agent = Agent(
                    task=instructions,
                    llm=llm,
                    browser=browser,
                )

                # Run the agent
                result = await agent.run()
                await browser.close()

                return result

            # Run the async extraction
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                result = loop.run_until_complete(run_extraction())
            finally:
                loop.close()

            # Parse the result
            return self._parse_browser_result(result)

        except ImportError:
            logger.warning("browser-use not available, falling back to playwright")
            return self._extract_with_playwright()
        except Exception as e:
            logger.error(f"Browser-use extraction failed: {e}")
            raise

    def _extract_with_playwright(self) -> List[SourceRecord]:
        """Extract data using Playwright browser automation."""
        try:
            from playwright.sync_api import sync_playwright

            with sync_playwright() as p:
                browser = p.chromium.launch(headless=self.headless)
                page = browser.new_page()

                # Navigate to URL
                page.goto(self.source.url)

                # Wait for page to load
                page.wait_for_load_state("networkidle")

                # Get scrape configuration
                scrape_config = self.source.scrape_config or {}

                # Handle login if configured
                if scrape_config.get("login"):
                    self._handle_login(page, scrape_config["login"])

                # Extract data based on configuration
                if scrape_config.get("table_selector"):
                    data = self._extract_table(page, scrape_config["table_selector"])
                elif scrape_config.get("item_selector"):
                    data = self._extract_items(page, scrape_config)
                else:
                    # Use AI to extract data
                    data = self._extract_with_ai(page)

                browser.close()

                return self._parse_scraped_data(data)

        except ImportError:
            raise ImportError("playwright package required for web scraping")
        except Exception as e:
            logger.error(f"Playwright extraction failed: {e}")
            raise

    def _build_browser_instructions(self) -> str:
        """Build instructions for browser-use agent."""
        if self.source.browser_instructions:
            return self.source.browser_instructions

        # Default instructions
        instructions = f"""
Navigate to: {self.source.url}

Task: Extract all {self.source.entity} data from this page.

Instructions:
1. Go to the URL
2. If there's a login required, look for login credentials in the scrape_config
3. Find and extract all {self.source.entity} records
4. Extract all visible fields for each record
5. If data is in a table, extract all rows
6. If there's pagination, navigate through all pages
7. Return the extracted data as JSON

Expected output format:
{{
  "records": [
    {{"id": "...", "field1": "value1", ...}},
    ...
  ],
  "total_pages": N,
  "total_records": N
}}
"""

        if self.source.scrape_config:
            instructions += f"""
Additional configuration:
{json.dumps(self.source.scrape_config, indent=2)}
"""

        return instructions

    def _handle_login(self, page: Any, login_config: Dict[str, str]) -> None:
        """Handle login on the page."""
        username_selector = login_config.get("username_selector", "input[name='username']")
        password_selector = login_config.get("password_selector", "input[name='password']")
        submit_selector = login_config.get("submit_selector", "button[type='submit']")

        username = login_config.get("username", "")
        password = login_config.get("password", "")

        if username and password:
            page.fill(username_selector, username)
            page.fill(password_selector, password)
            page.click(submit_selector)
            page.wait_for_load_state("networkidle")

    def _extract_table(self, page: Any, table_selector: str) -> List[Dict[str, Any]]:
        """Extract data from a table."""
        records = []

        # Get headers
        headers = page.query_selector_all(f"{table_selector} th")
        header_texts = [h.text_content().strip() for h in headers]

        # Get rows
        rows = page.query_selector_all(f"{table_selector} tbody tr")

        for row in rows:
            cells = row.query_selector_all("td")
            cell_texts = [c.text_content().strip() for c in cells]

            if len(cell_texts) == len(header_texts):
                record = dict(zip(header_texts, cell_texts))
                records.append(record)

        return records

    def _extract_items(self, page: Any, config: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Extract data from repeated item elements."""
        records = []

        item_selector = config.get("item_selector")
        field_selectors = config.get("field_selectors", {})

        items = page.query_selector_all(item_selector)

        for item in items:
            record = {}
            for field_name, selector in field_selectors.items():
                element = item.query_selector(selector)
                if element:
                    record[field_name] = element.text_content().strip()

            if record:
                records.append(record)

        return records

    def _extract_with_ai(self, page: Any) -> List[Dict[str, Any]]:
        """Use AI to extract data from page content."""
        # Get page content
        content = page.content()

        # Use screenshot extraction as fallback
        screenshot_data = page.screenshot()

        # For now, return empty - this would integrate with screenshot extractor
        logger.warning("AI-based extraction not fully implemented, returning empty")
        return []

    def _parse_browser_result(self, result: Any) -> List[SourceRecord]:
        """Parse browser-use agent result into SourceRecords."""
        records = []

        # The result structure depends on browser-use version
        if hasattr(result, "final_result"):
            data = result.final_result
        elif isinstance(result, dict):
            data = result
        elif isinstance(result, str):
            try:
                # Try to parse as JSON
                json_match = re.search(r'\{[\s\S]*\}', result)
                if json_match:
                    data = json.loads(json_match.group())
                else:
                    data = {"raw_text": result}
            except json.JSONDecodeError:
                data = {"raw_text": result}
        else:
            data = {"raw_result": str(result)}

        raw_records = data.get("records", [])
        if not isinstance(raw_records, list):
            raw_records = [raw_records] if raw_records else []

        for idx, item in enumerate(raw_records):
            if not isinstance(item, dict):
                continue

            record_id = item.get("id") or str(idx)

            record = self.create_record(
                id=record_id,
                data=item,
                raw_data=item,
                metadata={
                    "source_url": self.source.url,
                    "extraction_method": "browser_use",
                }
            )
            records.append(record)

        return records

    def _parse_scraped_data(self, data: List[Dict[str, Any]]) -> List[SourceRecord]:
        """Parse scraped data into SourceRecords."""
        records = []

        for idx, item in enumerate(data):
            if not isinstance(item, dict):
                continue

            record_id = item.get("id") or str(idx)

            record = self.create_record(
                id=record_id,
                data=item,
                raw_data=item,
                metadata={
                    "source_url": self.source.url,
                    "extraction_method": "playwright",
                }
            )
            records.append(record)

        return records

    def validate_source(self) -> List[str]:
        """Validate the web scraping source configuration."""
        errors = super().validate_source()

        if not self.source.url:
            errors.append("URL is required for web scraping extraction")

        if self.use_browser_use and not self.llm_api_key:
            errors.append("LLM API key is required for browser-use extraction")

        return errors


class AIWebScraperExtractor(WebScraperExtractor):
    """
    Enhanced web scraper that uses AI for intelligent data extraction.

    This extractor can:
    - Navigate complex web applications
    - Handle dynamic content
    - Follow multi-step processes
    - Extract data from any UI
    """

    def __init__(
        self,
        source: DataSource,
        llm_api_key: Optional[str] = None,
        schema_hint: Optional[Dict[str, Any]] = None,
        max_steps: int = 50
    ):
        """
        Initialize the AI web scraper.

        Args:
            source: Data source configuration
            llm_api_key: API key for LLM
            schema_hint: Expected schema for extraction
            max_steps: Maximum browser automation steps
        """
        super().__init__(source, llm_api_key=llm_api_key)
        self.schema_hint = schema_hint
        self.max_steps = max_steps

    def _build_browser_instructions(self) -> str:
        """Build enhanced instructions with schema hints."""
        base_instructions = super()._build_browser_instructions()

        if self.schema_hint:
            base_instructions += f"""

Expected data schema:
{json.dumps(self.schema_hint, indent=2)}

Make sure to extract all these fields if they are visible on the page.
"""

        return base_instructions
