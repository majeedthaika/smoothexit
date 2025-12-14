/**
 * Client-side transformation engine for field mappings
 * Mirrors backend transformation logic for browser-based transformations
 */

import type { FieldMapping } from '@/types/migration';

/**
 * Transform a single record using the provided field mappings
 */
export function transformRecord(
  source: Record<string, unknown>,
  fieldMappings: FieldMapping[]
): { data: Record<string, unknown>; errors: string[] } {
  const result: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const mapping of fieldMappings) {
    try {
      const value = getNestedValue(source, mapping.source_field);
      result[mapping.target_field] = applyTransform(
        value,
        mapping.transform,
        mapping.config || {},
        source
      );
    } catch (err) {
      errors.push(`Field ${mapping.source_field}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { data: result, errors };
}

/**
 * Transform multiple records
 */
export function transformRecords(
  sources: Record<string, unknown>[],
  fieldMappings: FieldMapping[]
): {
  data: Record<string, unknown>[];
  errors: { row: number; errors: string[] }[];
} {
  const data: Record<string, unknown>[] = [];
  const allErrors: { row: number; errors: string[] }[] = [];

  for (let i = 0; i < sources.length; i++) {
    const result = transformRecord(sources[i], fieldMappings);
    data.push(result.data);
    if (result.errors.length > 0) {
      allErrors.push({ row: i, errors: result.errors });
    }
  }

  return { data, errors: allErrors };
}

/**
 * Get a nested value from an object using dot notation
 * e.g., getNestedValue({address: {city: "NYC"}}, "address.city") returns "NYC"
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Apply a transformation to a value
 */
function applyTransform(
  value: unknown,
  transform: string,
  config: Record<string, unknown>,
  source: Record<string, unknown>
): unknown {
  switch (transform) {
    case 'direct':
      return value;

    case 'prefix_add':
      return addPrefix(value, config.prefix as string);

    case 'prefix_strip':
      return stripPrefix(value, config.prefix as string);

    case 'split_name':
      return splitName(value as string, config.part as 'first' | 'last');

    case 'enum_map':
      return mapEnum(value, config.mapping as Record<string, string>);

    case 'iso_to_unix':
      return isoToUnix(value as string);

    case 'unix_to_iso':
      return unixToIso(value as number);

    case 'country_code':
      return countryToCode(value as string);

    case 'currency_convert':
      return convertCurrency(value as number, config);

    case 'concat':
      return concatFields(source, config);

    case 'template':
      return applyTemplate(source, config.template as string);

    case 'default':
      return value ?? config.value;

    case 'computed':
      return computeExpression(source, config.expression as string);

    case 'lowercase':
      return typeof value === 'string' ? value.toLowerCase() : value;

    case 'uppercase':
      return typeof value === 'string' ? value.toUpperCase() : value;

    case 'trim':
      return typeof value === 'string' ? value.trim() : value;

    case 'boolean':
      return toBoolean(value);

    case 'integer':
      return toInteger(value);

    case 'float':
      return toFloat(value);

    case 'string':
      return toString(value);

    case 'date_format':
      return formatDate(value as string, config.format as string);

    default:
      console.warn(`Unknown transform: ${transform}`);
      return value;
  }
}

// Transform implementations

function addPrefix(value: unknown, prefix: string): string {
  if (value === null || value === undefined) return '';
  return `${prefix}${String(value)}`;
}

function stripPrefix(value: unknown, prefix: string): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return str.startsWith(prefix) ? str.slice(prefix.length) : str;
}

function splitName(fullName: string | null | undefined, part: 'first' | 'last'): string {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  if (part === 'first') {
    return parts[0] || '';
  } else {
    return parts.length > 1 ? parts.slice(1).join(' ') : '';
  }
}

function mapEnum(value: unknown, mapping: Record<string, string>): string | null {
  if (value === null || value === undefined) return null;
  const key = String(value);
  return mapping[key] ?? key;
}

function isoToUnix(isoDate: string): number | null {
  if (!isoDate) return null;
  const date = new Date(isoDate);
  return isNaN(date.getTime()) ? null : Math.floor(date.getTime() / 1000);
}

function unixToIso(timestamp: number): string | null {
  if (timestamp === null || timestamp === undefined) return null;
  const date = new Date(timestamp * 1000);
  return isNaN(date.getTime()) ? null : date.toISOString();
}

// Common country name to code mapping
const COUNTRY_CODES: Record<string, string> = {
  'united states': 'US',
  'united states of america': 'US',
  'usa': 'US',
  'united kingdom': 'GB',
  'uk': 'GB',
  'great britain': 'GB',
  'canada': 'CA',
  'australia': 'AU',
  'germany': 'DE',
  'france': 'FR',
  'japan': 'JP',
  'china': 'CN',
  'india': 'IN',
  'brazil': 'BR',
  'mexico': 'MX',
  'spain': 'ES',
  'italy': 'IT',
  'netherlands': 'NL',
  'switzerland': 'CH',
  'sweden': 'SE',
  'norway': 'NO',
  'denmark': 'DK',
  'finland': 'FI',
  'ireland': 'IE',
  'new zealand': 'NZ',
  'singapore': 'SG',
  'south korea': 'KR',
  'korea': 'KR',
};

function countryToCode(country: string): string {
  if (!country) return '';
  // If already a 2-letter code, return as-is
  if (country.length === 2) return country.toUpperCase();
  const normalized = country.toLowerCase().trim();
  return COUNTRY_CODES[normalized] || country;
}

function convertCurrency(value: number, config: Record<string, unknown>): number {
  if (value === null || value === undefined) return 0;
  let result = value;

  if (config.from_cents) {
    result = result / 100;
  }
  if (config.to_cents) {
    result = result * 100;
  }
  if (config.multiply) {
    result = result * (config.multiply as number);
  }
  if (config.divide) {
    result = result / (config.divide as number);
  }

  return result;
}

function concatFields(source: Record<string, unknown>, config: Record<string, unknown>): string {
  const fields = config.fields as string[];
  const separator = (config.separator as string) ?? ' ';

  if (!fields || !Array.isArray(fields)) return '';

  return fields
    .map(field => {
      const value = getNestedValue(source, field);
      return value !== null && value !== undefined ? String(value) : '';
    })
    .filter(v => v !== '')
    .join(separator);
}

function applyTemplate(source: Record<string, unknown>, template: string): string {
  if (!template) return '';

  return template.replace(/\{(\w+(?:\.\w+)*)\}/g, (_, path) => {
    const value = getNestedValue(source, path);
    return value !== null && value !== undefined ? String(value) : '';
  });
}

function computeExpression(source: Record<string, unknown>, expression: string): unknown {
  if (!expression) return null;

  try {
    // Create a safe evaluation context with the source data
    // Note: In production, consider using a proper expression parser
    const func = new Function('source', `return ${expression}`);
    return func(source);
  } catch (err) {
    console.warn(`Error evaluating expression "${expression}":`, err);
    return null;
  }
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    return lower === 'true' || lower === 'yes' || lower === '1';
  }
  if (typeof value === 'number') return value !== 0;
  return Boolean(value);
}

function toInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = parseInt(String(value), 10);
  return isNaN(num) ? null : num;
}

function toFloat(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = parseFloat(String(value));
  return isNaN(num) ? null : num;
}

function toString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function formatDate(value: string, format: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;

  // Simple date formatting
  const tokens: Record<string, string> = {
    'YYYY': String(date.getFullYear()),
    'MM': String(date.getMonth() + 1).padStart(2, '0'),
    'DD': String(date.getDate()).padStart(2, '0'),
    'HH': String(date.getHours()).padStart(2, '0'),
    'mm': String(date.getMinutes()).padStart(2, '0'),
    'ss': String(date.getSeconds()).padStart(2, '0'),
  };

  let result = format;
  for (const [token, replacement] of Object.entries(tokens)) {
    result = result.replace(token, replacement);
  }
  return result;
}

/**
 * Convert records to CSV string
 */
export function recordsToCSV(records: Record<string, unknown>[]): string {
  if (records.length === 0) return '';

  // Get all unique keys across all records
  const allKeys = new Set<string>();
  for (const record of records) {
    Object.keys(record).forEach(key => allKeys.add(key));
  }
  const headers = Array.from(allKeys);

  // Create CSV rows
  const rows: string[] = [];

  // Header row
  rows.push(headers.map(h => escapeCSVField(h)).join(','));

  // Data rows
  for (const record of records) {
    const values = headers.map(key => {
      const value = record[key];
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return escapeCSVField(JSON.stringify(value));
      return escapeCSVField(String(value));
    });
    rows.push(values.join(','));
  }

  return rows.join('\n');
}

function escapeCSVField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * Download data as a CSV file
 */
export function downloadCSV(records: Record<string, unknown>[], filename: string): void {
  const csv = recordsToCSV(records);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
