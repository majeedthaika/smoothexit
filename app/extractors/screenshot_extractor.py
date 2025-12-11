"""Screenshot/image-based data extractor using OCR and vision AI."""

import base64
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional
from datetime import datetime

from .base import BaseExtractor, ExtractionResult
from ..models.record import SourceRecord
from ..models.migration import DataSource

logger = logging.getLogger(__name__)


class ScreenshotExtractor(BaseExtractor):
    """
    Extractor for data from screenshots using OCR and vision AI.

    Supports:
    - Image files (PNG, JPG, WebP)
    - PDFs (with image extraction)
    - Vision AI analysis (OpenAI, Anthropic, Google)
    - Template-based field extraction
    - Table detection
    """

    # Supported vision providers
    VISION_PROVIDERS = ["openai", "anthropic", "google"]

    def __init__(
        self,
        source: DataSource,
        vision_api_key: Optional[str] = None,
        vision_provider: str = "openai",
        extraction_template: Optional[str] = None,
        schema_hint: Optional[Dict[str, Any]] = None
    ):
        """
        Initialize the screenshot extractor.

        Args:
            source: Data source configuration
            vision_api_key: API key for vision service
            vision_provider: Vision AI provider (openai, anthropic, google)
            extraction_template: Template prompt for extraction
            schema_hint: Expected schema to guide extraction
        """
        super().__init__(source)
        self.vision_api_key = vision_api_key or os.environ.get("OPENAI_API_KEY")
        self.vision_provider = vision_provider
        self.extraction_template = extraction_template
        self.schema_hint = schema_hint

    def extract(self) -> ExtractionResult:
        """Extract data from screenshot files."""
        self.reset()
        started_at = datetime.utcnow()
        all_records = []

        try:
            files = self._get_image_files()

            if not files:
                self.add_warning(f"No image files found at: {self.source.screenshot_path}")
                return self.get_extraction_result([])

            for file_path in files:
                logger.info(f"Processing screenshot: {file_path}")

                try:
                    records = self._extract_from_image(file_path)
                    all_records.extend(records)
                except Exception as e:
                    self.add_error(f"Failed to process {file_path}: {str(e)}")

            result = self.get_extraction_result(all_records)
            result.started_at = started_at
            result.completed_at = datetime.utcnow()
            result.metadata["files_processed"] = len(files)

            logger.info(f"Extracted {len(all_records)} records from {len(files)} screenshot(s)")
            return result

        except Exception as e:
            self.add_error(f"Extraction failed: {str(e)}")
            result = self.get_extraction_result(all_records)
            result.started_at = started_at
            result.completed_at = datetime.utcnow()
            return result

    def extract_batch(self, offset: int = 0, limit: int = 100) -> List[SourceRecord]:
        """Extract records from screenshots."""
        result = self.extract()
        return result.records[offset:offset + limit]

    def _get_image_files(self) -> List[Path]:
        """Get list of image files to process."""
        files = []
        image_extensions = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}

        if self.source.screenshot_path:
            path = Path(self.source.screenshot_path)

            if path.is_file():
                if path.suffix.lower() in image_extensions:
                    files.append(path)
            elif path.is_dir():
                for ext in image_extensions:
                    files.extend(path.glob(f"*{ext}"))
                    files.extend(path.glob(f"*{ext.upper()}"))

        return sorted(set(files))

    def _extract_from_image(self, file_path: Path) -> List[SourceRecord]:
        """Extract records from a single image using vision AI."""
        # Read and encode image
        image_data = self._encode_image(file_path)

        # Build extraction prompt
        prompt = self._build_extraction_prompt()

        # Call vision API
        if self.vision_provider == "openai":
            extracted_data = self._extract_with_openai(image_data, prompt)
        elif self.vision_provider == "anthropic":
            extracted_data = self._extract_with_anthropic(image_data, prompt, file_path)
        elif self.vision_provider == "google":
            extracted_data = self._extract_with_google(image_data, prompt)
        else:
            raise ValueError(f"Unsupported vision provider: {self.vision_provider}")

        # Parse extracted data into records
        return self._parse_extracted_data(extracted_data, file_path)

    def _encode_image(self, file_path: Path) -> str:
        """Encode image to base64."""
        with open(file_path, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")

    def _build_extraction_prompt(self) -> str:
        """Build the extraction prompt for the vision AI."""
        if self.extraction_template:
            return self.extraction_template

        # Default extraction prompt
        prompt = f"""Extract structured data from this screenshot.

Entity type: {self.source.entity}
Service: {self.source.service}

Instructions:
1. Identify all {self.source.entity} records visible in the screenshot
2. Extract all available fields for each record
3. Return the data as a JSON array of objects
4. If you see a table, extract each row as a separate record
5. Include all visible fields, even if some values are missing

"""

        if self.schema_hint:
            prompt += f"""
Expected fields (extract these if visible):
{json.dumps(self.schema_hint, indent=2)}

"""

        prompt += """
Return ONLY valid JSON in this format:
{
  "records": [
    {"id": "...", "field1": "value1", ...},
    ...
  ],
  "metadata": {
    "total_records": N,
    "confidence": "high/medium/low",
    "notes": "any relevant notes"
  }
}
"""
        return prompt

    def _extract_with_openai(self, image_data: str, prompt: str) -> Dict[str, Any]:
        """Extract data using OpenAI Vision API."""
        try:
            import openai

            client = openai.OpenAI(api_key=self.vision_api_key)

            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/png;base64,{image_data}",
                                    "detail": "high"
                                }
                            }
                        ]
                    }
                ],
                max_tokens=4096,
                response_format={"type": "json_object"}
            )

            content = response.choices[0].message.content
            return json.loads(content)

        except ImportError:
            raise ImportError("openai package required for OpenAI vision extraction")
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse OpenAI response as JSON: {e}")
            return {"records": [], "error": str(e)}
        except Exception as e:
            logger.error(f"OpenAI vision extraction failed: {e}")
            raise

    def _extract_with_anthropic(self, image_data: str, prompt: str, file_path: Path) -> Dict[str, Any]:
        """Extract data using Anthropic Claude Vision API."""
        try:
            import anthropic

            client = anthropic.Anthropic(api_key=self.vision_api_key)

            # Determine media type
            suffix = file_path.suffix.lower()
            media_type_map = {
                ".png": "image/png",
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".webp": "image/webp",
                ".gif": "image/gif",
            }
            media_type = media_type_map.get(suffix, "image/png")

            response = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=4096,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": media_type,
                                    "data": image_data,
                                }
                            },
                            {"type": "text", "text": prompt}
                        ]
                    }
                ]
            )

            content = response.content[0].text

            # Extract JSON from response
            try:
                # Try to find JSON in the response
                import re
                json_match = re.search(r'\{[\s\S]*\}', content)
                if json_match:
                    return json.loads(json_match.group())
                return {"records": [], "raw_text": content}
            except json.JSONDecodeError:
                return {"records": [], "raw_text": content}

        except ImportError:
            raise ImportError("anthropic package required for Anthropic vision extraction")
        except Exception as e:
            logger.error(f"Anthropic vision extraction failed: {e}")
            raise

    def _extract_with_google(self, image_data: str, prompt: str) -> Dict[str, Any]:
        """Extract data using Google Gemini Vision API."""
        try:
            import google.generativeai as genai

            genai.configure(api_key=self.vision_api_key)
            model = genai.GenerativeModel("gemini-2.0-flash")

            response = model.generate_content([
                {"mime_type": "image/png", "data": image_data},
                prompt
            ])

            content = response.text

            # Extract JSON from response
            try:
                import re
                json_match = re.search(r'\{[\s\S]*\}', content)
                if json_match:
                    return json.loads(json_match.group())
                return {"records": [], "raw_text": content}
            except json.JSONDecodeError:
                return {"records": [], "raw_text": content}

        except ImportError:
            raise ImportError("google-generativeai package required for Google vision extraction")
        except Exception as e:
            logger.error(f"Google vision extraction failed: {e}")
            raise

    def _parse_extracted_data(
        self,
        extracted: Dict[str, Any],
        source_file: Path
    ) -> List[SourceRecord]:
        """Parse extracted data into SourceRecords."""
        records = []

        raw_records = extracted.get("records", [])
        if not isinstance(raw_records, list):
            raw_records = [raw_records]

        for idx, item in enumerate(raw_records):
            if not isinstance(item, dict):
                continue

            record_id = item.get("id") or str(idx)

            record = self.create_record(
                id=record_id,
                data=item,
                raw_data=item,
                metadata={
                    "source_file": str(source_file),
                    "extraction_confidence": extracted.get("metadata", {}).get("confidence", "unknown"),
                    "extraction_notes": extracted.get("metadata", {}).get("notes"),
                }
            )
            records.append(record)

        return records

    def validate_source(self) -> List[str]:
        """Validate the screenshot source configuration."""
        errors = super().validate_source()

        if not self.source.screenshot_path:
            errors.append("screenshot_path is required for screenshot extraction")

        if not self.vision_api_key:
            errors.append("Vision API key is required")

        if self.vision_provider not in self.VISION_PROVIDERS:
            errors.append(f"Invalid vision provider. Must be one of: {self.VISION_PROVIDERS}")

        return errors
