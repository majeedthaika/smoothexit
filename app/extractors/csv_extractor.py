"""CSV/JSON file-based data extractor."""

import csv
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
from datetime import datetime
import glob as globmodule

from .base import BaseExtractor, ExtractionResult
from ..models.record import SourceRecord
from ..models.migration import DataSource

logger = logging.getLogger(__name__)


class CSVExtractor(BaseExtractor):
    """
    Extractor for CSV and JSON file exports.

    Supports:
    - Single CSV/JSON files
    - Multiple files via glob patterns
    - Column mapping
    - Data type inference
    - Encoding detection
    """

    def __init__(
        self,
        source: DataSource,
        column_mapping: Optional[Dict[str, str]] = None,
        id_column: Optional[str] = None,
        encoding: str = "utf-8",
        delimiter: str = ","
    ):
        """
        Initialize the CSV extractor.

        Args:
            source: Data source configuration
            column_mapping: Optional mapping of CSV columns to field names
            id_column: Column to use as record ID
            encoding: File encoding
            delimiter: CSV delimiter character
        """
        super().__init__(source)
        self.column_mapping = column_mapping or {}
        self.id_column = id_column or "id"
        self.encoding = encoding
        self.delimiter = delimiter
        self._current_file = None

    def extract(self) -> ExtractionResult:
        """Extract all data from CSV/JSON files."""
        self.reset()
        started_at = datetime.utcnow()
        all_records = []

        try:
            files = self._get_files()

            if not files:
                self.add_warning(f"No files found matching: {self.source.file_path or self.source.file_pattern}")
                return self.get_extraction_result([])

            for file_path in files:
                self._current_file = str(file_path)
                logger.info(f"Processing file: {file_path}")

                if file_path.suffix.lower() == ".json":
                    records = self._extract_json(file_path)
                else:
                    records = self._extract_csv(file_path)

                all_records.extend(records)

            result = self.get_extraction_result(all_records)
            result.started_at = started_at
            result.completed_at = datetime.utcnow()
            result.metadata["files_processed"] = len(files)

            logger.info(f"Extracted {len(all_records)} records from {len(files)} file(s)")
            return result

        except Exception as e:
            self.add_error(f"Extraction failed: {str(e)}")
            result = self.get_extraction_result(all_records)
            result.started_at = started_at
            result.completed_at = datetime.utcnow()
            return result

    def extract_batch(self, offset: int = 0, limit: int = 100) -> List[SourceRecord]:
        """Extract a batch of records (loads entire file, returns slice)."""
        # For file-based extraction, we load the entire file
        # This could be optimized for very large files
        result = self.extract()
        return result.records[offset:offset + limit]

    def _get_files(self) -> List[Path]:
        """Get list of files to process."""
        files = []

        if self.source.file_path:
            path = Path(self.source.file_path)
            if path.exists():
                files.append(path)

        if self.source.file_pattern:
            pattern_files = globmodule.glob(self.source.file_pattern, recursive=True)
            files.extend(Path(f) for f in pattern_files)

        return sorted(set(files))

    def _extract_csv(self, file_path: Path) -> List[SourceRecord]:
        """Extract records from a CSV file."""
        records = []

        try:
            with open(file_path, "r", encoding=self.encoding, newline="") as f:
                # Try to detect delimiter if not specified
                sample = f.read(8192)
                f.seek(0)

                try:
                    dialect = csv.Sniffer().sniff(sample)
                    delimiter = dialect.delimiter
                except csv.Error:
                    delimiter = self.delimiter

                reader = csv.DictReader(f, delimiter=delimiter)

                for row_num, row in enumerate(reader, start=1):
                    try:
                        record = self._process_row(row, row_num)
                        if record:
                            records.append(record)
                    except Exception as e:
                        self.add_error(
                            f"Error processing row {row_num}: {str(e)}",
                            record_id=str(row_num)
                        )

        except UnicodeDecodeError:
            # Try with different encoding
            logger.warning(f"UTF-8 decode failed, trying latin-1 for {file_path}")
            return self._extract_csv_with_encoding(file_path, "latin-1")
        except Exception as e:
            self.add_error(f"Failed to read CSV file {file_path}: {str(e)}")

        return records

    def _extract_csv_with_encoding(self, file_path: Path, encoding: str) -> List[SourceRecord]:
        """Extract CSV with alternative encoding."""
        records = []

        with open(file_path, "r", encoding=encoding, newline="") as f:
            reader = csv.DictReader(f, delimiter=self.delimiter)

            for row_num, row in enumerate(reader, start=1):
                try:
                    record = self._process_row(row, row_num)
                    if record:
                        records.append(record)
                except Exception as e:
                    self.add_error(
                        f"Error processing row {row_num}: {str(e)}",
                        record_id=str(row_num)
                    )

        return records

    def _extract_json(self, file_path: Path) -> List[SourceRecord]:
        """Extract records from a JSON file."""
        records = []

        try:
            with open(file_path, "r", encoding=self.encoding) as f:
                data = json.load(f)

            # Handle different JSON structures
            if isinstance(data, list):
                items = data
            elif isinstance(data, dict):
                # Look for common data fields
                for key in ["data", "records", "items", "results"]:
                    if key in data and isinstance(data[key], list):
                        items = data[key]
                        break
                else:
                    # Single record
                    items = [data]
            else:
                self.add_error(f"Unexpected JSON structure in {file_path}")
                return []

            for idx, item in enumerate(items):
                try:
                    record = self._process_json_item(item, idx)
                    if record:
                        records.append(record)
                except Exception as e:
                    self.add_error(
                        f"Error processing item {idx}: {str(e)}",
                        record_id=str(idx)
                    )

        except json.JSONDecodeError as e:
            self.add_error(f"Invalid JSON in {file_path}: {str(e)}")
        except Exception as e:
            self.add_error(f"Failed to read JSON file {file_path}: {str(e)}")

        return records

    def _process_row(self, row: Dict[str, str], row_num: int) -> Optional[SourceRecord]:
        """Process a CSV row into a SourceRecord."""
        # Apply column mapping
        data = {}
        for csv_col, value in row.items():
            if csv_col is None:
                continue

            # Map column name if mapping exists
            field_name = self.column_mapping.get(csv_col, csv_col)

            # Clean up the value
            if value is not None:
                value = value.strip()
                if value == "":
                    value = None
                else:
                    # Try to infer types
                    value = self._infer_type(value)

            data[field_name] = value

        # Get record ID
        record_id = data.get(self.id_column) or data.get("id") or str(row_num)

        # Skip empty records
        if all(v is None for v in data.values()):
            return None

        return self.create_record(
            id=str(record_id),
            data=data,
            raw_data=dict(row),
            metadata={"source_file": self._current_file, "row_number": row_num},
        )

    def _process_json_item(self, item: Dict[str, Any], idx: int) -> Optional[SourceRecord]:
        """Process a JSON item into a SourceRecord."""
        # Apply column mapping if specified
        if self.column_mapping:
            data = {}
            for json_key, value in item.items():
                field_name = self.column_mapping.get(json_key, json_key)
                data[field_name] = value
        else:
            data = item

        # Get record ID
        record_id = data.get(self.id_column) or data.get("id") or str(idx)

        return self.create_record(
            id=str(record_id),
            data=data,
            raw_data=item,
            metadata={"source_file": self._current_file, "item_index": idx},
        )

    def _infer_type(self, value: str) -> Union[str, int, float, bool, None]:
        """Infer the type of a string value."""
        if value is None or value == "":
            return None

        # Check for boolean
        if value.lower() in ("true", "yes", "1"):
            return True
        if value.lower() in ("false", "no", "0"):
            return False

        # Check for null
        if value.lower() in ("null", "none", "n/a", "na", ""):
            return None

        # Check for integer
        try:
            if "." not in value:
                return int(value)
        except ValueError:
            pass

        # Check for float
        try:
            return float(value)
        except ValueError:
            pass

        # Return as string
        return value

    def validate_source(self) -> List[str]:
        """Validate the file source configuration."""
        errors = super().validate_source()

        if not self.source.file_path and not self.source.file_pattern:
            errors.append("Either file_path or file_pattern is required")

        if self.source.file_path:
            path = Path(self.source.file_path)
            if not path.exists():
                errors.append(f"File not found: {self.source.file_path}")
            elif not path.suffix.lower() in (".csv", ".json", ".jsonl"):
                errors.append(f"Unsupported file format: {path.suffix}")

        return errors


class JSONLExtractor(CSVExtractor):
    """Extractor for JSON Lines (JSONL) files."""

    def _extract_json(self, file_path: Path) -> List[SourceRecord]:
        """Extract records from a JSONL file."""
        records = []

        try:
            with open(file_path, "r", encoding=self.encoding) as f:
                for line_num, line in enumerate(f, start=1):
                    line = line.strip()
                    if not line:
                        continue

                    try:
                        item = json.loads(line)
                        record = self._process_json_item(item, line_num)
                        if record:
                            records.append(record)
                    except json.JSONDecodeError as e:
                        self.add_error(
                            f"Invalid JSON on line {line_num}: {str(e)}",
                            record_id=str(line_num)
                        )
                    except Exception as e:
                        self.add_error(
                            f"Error processing line {line_num}: {str(e)}",
                            record_id=str(line_num)
                        )

        except Exception as e:
            self.add_error(f"Failed to read JSONL file {file_path}: {str(e)}")

        return records
