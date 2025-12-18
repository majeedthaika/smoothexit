import { useCallback, useState } from 'react';
import Papa from 'papaparse';
import { Upload, FileText, CheckCircle, AlertCircle, X, ChevronDown, ChevronUp, Sparkles, ArrowRight } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Select } from '@/components/ui';
import { useMigrationStore } from '@/store/migration';

interface UploadSourcesStepProps {
  requiredSourceKeys: string[];
}

/**
 * Smart matching algorithm to suggest CSV column -> schema field mappings.
 * Uses fuzzy matching based on:
 * 1. Exact match (case-insensitive)
 * 2. Normalized match (remove underscores, spaces, compare)
 * 3. Contains match (column contains field name or vice versa)
 * 4. Common aliases (e.g., 'email' -> 'email_address')
 */
function suggestColumnMappings(
  csvColumns: string[],
  schemaFields: string[]
): Record<string, string> {
  const mappings: Record<string, string> = {};
  const usedFields = new Set<string>();

  // Normalize a string for comparison
  const normalize = (s: string) => s.toLowerCase().replace(/[_\s-]/g, '');

  // Common field aliases
  const aliases: Record<string, string[]> = {
    'email': ['email_address', 'emailaddress', 'e_mail', 'mail'],
    'phone': ['phone_number', 'phonenumber', 'telephone', 'tel', 'mobile'],
    'name': ['full_name', 'fullname', 'display_name'],
    'firstname': ['first_name', 'fname', 'given_name'],
    'lastname': ['last_name', 'lname', 'surname', 'family_name'],
    'id': ['identifier', 'uuid', 'key'],
    'created': ['created_at', 'createdat', 'creation_date', 'date_created'],
    'updated': ['updated_at', 'updatedat', 'modified_at', 'last_modified'],
    'address': ['street_address', 'address_line', 'address1'],
    'city': ['town', 'locality'],
    'state': ['province', 'region', 'state_code'],
    'country': ['country_code', 'nation'],
    'zip': ['postal_code', 'postalcode', 'zipcode', 'zip_code'],
    'amount': ['total', 'price', 'value', 'sum'],
    'description': ['desc', 'details', 'note', 'notes'],
    'status': ['state', 'condition'],
    'type': ['kind', 'category'],
  };

  // Build reverse alias map
  const reverseAliases: Record<string, string> = {};
  for (const [key, values] of Object.entries(aliases)) {
    for (const v of values) {
      reverseAliases[normalize(v)] = key;
    }
    reverseAliases[normalize(key)] = key;
  }

  for (const csvCol of csvColumns) {
    const normalizedCol = normalize(csvCol);
    let bestMatch: string | null = null;
    let bestScore = 0;

    for (const field of schemaFields) {
      if (usedFields.has(field)) continue;

      const normalizedField = normalize(field);
      let score = 0;

      // Exact match (case-insensitive)
      if (csvCol.toLowerCase() === field.toLowerCase()) {
        score = 100;
      }
      // Normalized exact match
      else if (normalizedCol === normalizedField) {
        score = 95;
      }
      // Alias match
      else if (reverseAliases[normalizedCol] && normalize(reverseAliases[normalizedCol]) === normalizedField) {
        score = 90;
      }
      else if (reverseAliases[normalizedField] && normalize(reverseAliases[normalizedField]) === normalizedCol) {
        score = 90;
      }
      // Contains match (field in column or column in field)
      else if (normalizedCol.includes(normalizedField) && normalizedField.length > 2) {
        score = 70 + Math.min(20, normalizedField.length * 2);
      }
      else if (normalizedField.includes(normalizedCol) && normalizedCol.length > 2) {
        score = 60 + Math.min(20, normalizedCol.length * 2);
      }
      // Partial word match
      else {
        const colWords = normalizedCol.split(/(?=[A-Z])|[_\s-]/).filter(Boolean);
        const fieldWords = normalizedField.split(/(?=[A-Z])|[_\s-]/).filter(Boolean);
        const matchingWords = colWords.filter(w => fieldWords.some(fw => fw.includes(w) || w.includes(fw)));
        if (matchingWords.length > 0) {
          score = 30 + matchingWords.length * 10;
        }
      }

      if (score > bestScore && score >= 50) {
        bestScore = score;
        bestMatch = field;
      }
    }

    if (bestMatch) {
      mappings[csvCol] = bestMatch;
      usedFields.add(bestMatch);
    }
  }

  return mappings;
}

export function UploadSourcesStep({ requiredSourceKeys }: UploadSourcesStepProps) {
  const {
    uploadedSourceData,
    setUploadedSourceData,
    sourceSchemas,
  } = useMigrationStore();

  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());

  const handleFileUpload = useCallback((sourceKey: string, file: File) => {
    const [service, entity] = sourceKey.split('.');
    const schema = sourceSchemas.find(s => s.service === service && s.entity === entity);
    const schemaFields = schema?.fields.map(f => f.name) || [];

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const columns = results.meta.fields || [];
        const data = results.data as Record<string, unknown>[];

        // Auto-suggest column mappings
        const columnMappings = suggestColumnMappings(columns, schemaFields);

        setUploadedSourceData(sourceKey, {
          fileName: file.name,
          data,
          columns,
          rowCount: data.length,
          columnMappings,
        });

        // Auto-expand to show mappings
        setExpandedSources(prev => new Set([...prev, sourceKey]));
      },
      error: (error) => {
        console.error('CSV parse error:', error);
        alert(`Error parsing CSV: ${error.message}`);
      },
    });
  }, [setUploadedSourceData, sourceSchemas]);

  const handleDrop = useCallback((sourceKey: string, e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.type === 'text/csv' || file.name.endsWith('.csv'))) {
      handleFileUpload(sourceKey, file);
    }
  }, [handleFileUpload]);

  const handleFileSelect = useCallback((sourceKey: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(sourceKey, file);
    }
  }, [handleFileUpload]);

  const updateColumnMapping = (sourceKey: string, csvColumn: string, schemaField: string) => {
    const uploaded = uploadedSourceData[sourceKey];
    if (!uploaded) return;

    const newMappings = { ...uploaded.columnMappings };
    if (schemaField === '') {
      delete newMappings[csvColumn];
    } else {
      newMappings[csvColumn] = schemaField;
    }

    setUploadedSourceData(sourceKey, {
      ...uploaded,
      columnMappings: newMappings,
    });
  };

  const clearUpload = (sourceKey: string) => {
    setUploadedSourceData(sourceKey, { fileName: '', data: [], columns: [], rowCount: 0, columnMappings: {} });
    setExpandedSources(prev => {
      const next = new Set(prev);
      next.delete(sourceKey);
      return next;
    });
  };

  const toggleExpanded = (sourceKey: string) => {
    setExpandedSources(prev => {
      const next = new Set(prev);
      if (next.has(sourceKey)) {
        next.delete(sourceKey);
      } else {
        next.add(sourceKey);
      }
      return next;
    });
  };

  // Get schema for a source key
  const getSchemaForSource = (sourceKey: string) => {
    const [service, entity] = sourceKey.split('.');
    return sourceSchemas.find(s => s.service === service && s.entity === entity);
  };

  if (requiredSourceKeys.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-[hsl(var(--muted-foreground))]">
            No source schemas selected. Go back and select at least one mapping.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload CSV Files</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {requiredSourceKeys.map((sourceKey) => {
            const uploaded = uploadedSourceData[sourceKey];
            const schema = getSchemaForSource(sourceKey);
            const schemaFields = schema?.fields || [];
            const expectedFieldNames = schemaFields.map(f => f.name);
            const isExpanded = expandedSources.has(sourceKey);
            const firstRow = uploaded?.data?.[0] as Record<string, unknown> | undefined;
            const mappedCount = Object.keys(uploaded?.columnMappings || {}).length;

            return (
              <div key={sourceKey} className="border rounded-lg overflow-hidden">
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-medium">{sourceKey}</h3>
                      {expectedFieldNames.length > 0 && !uploaded?.rowCount && (
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">
                          Expected fields: {expectedFieldNames.slice(0, 5).join(', ')}
                          {expectedFieldNames.length > 5 && ` +${expectedFieldNames.length - 5} more`}
                        </p>
                      )}
                    </div>
                    {uploaded && uploaded.rowCount > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => clearUpload(sourceKey)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  {uploaded && uploaded.rowCount > 0 ? (
                    <div>
                      <div
                        className="flex items-center gap-4 p-4 bg-[hsl(var(--primary))]/5 rounded-lg cursor-pointer"
                        onClick={() => toggleExpanded(sourceKey)}
                      >
                        <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                            <span className="font-medium truncate">{uploaded.fileName}</span>
                          </div>
                          <p className="text-sm text-[hsl(var(--muted-foreground))]">
                            {uploaded.rowCount.toLocaleString()} rows, {uploaded.columns.length} columns
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <Sparkles className="h-3 w-3 text-purple-500" />
                            <span className="text-xs text-purple-600 dark:text-purple-400">
                              {mappedCount} of {uploaded.columns.length} columns auto-mapped
                            </span>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm">
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleDrop(sourceKey, e)}
                      className="border-2 border-dashed border-[hsl(var(--border))] rounded-lg p-8 text-center hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/5 transition-colors cursor-pointer"
                    >
                      <input
                        type="file"
                        accept=".csv"
                        onChange={(e) => handleFileSelect(sourceKey, e)}
                        className="hidden"
                        id={`file-${sourceKey}`}
                      />
                      <label htmlFor={`file-${sourceKey}`} className="cursor-pointer">
                        <Upload className="h-8 w-8 mx-auto mb-2 text-[hsl(var(--muted-foreground))]" />
                        <p className="text-sm font-medium">
                          Drop CSV file here or click to browse
                        </p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                          CSV file with headers
                        </p>
                      </label>
                    </div>
                  )}
                </div>

                {/* Expanded mapping view */}
                {isExpanded && uploaded && uploaded.rowCount > 0 && (
                  <div className="border-t bg-[hsl(var(--muted))]/30 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium">Column Mappings</h4>
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">
                        Preview: Row 1 of {uploaded.rowCount.toLocaleString()}
                      </span>
                    </div>

                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {/* Header row */}
                      <div className="grid grid-cols-[1fr_32px_1fr_1fr] gap-2 text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase px-2 pb-2 border-b">
                        <span>CSV Column</span>
                        <span></span>
                        <span>Maps To</span>
                        <span>Preview Value</span>
                      </div>

                      {uploaded.columns.map((col) => {
                        const mappedField = uploaded.columnMappings?.[col] || '';
                        const previewValue = firstRow?.[col];
                        const displayValue = previewValue === null ? 'null' :
                          previewValue === undefined ? '' :
                          typeof previewValue === 'object' ? JSON.stringify(previewValue) :
                          String(previewValue);

                        return (
                          <div
                            key={col}
                            className={`grid grid-cols-[1fr_32px_1fr_1fr] gap-2 items-center p-2 rounded ${
                              mappedField ? 'bg-green-500/5' : 'bg-amber-500/5'
                            }`}
                          >
                            <div className="min-w-0">
                              <span className="font-mono text-sm truncate block">{col}</span>
                            </div>
                            <div className="flex justify-center">
                              <ArrowRight className={`h-4 w-4 ${mappedField ? 'text-green-500' : 'text-[hsl(var(--muted-foreground))]'}`} />
                            </div>
                            <div>
                              <Select
                                value={mappedField}
                                onChange={(e) => updateColumnMapping(sourceKey, col, e.target.value)}
                                options={[
                                  { value: '', label: '-- Skip --' },
                                  ...expectedFieldNames.map(f => ({ value: f, label: f }))
                                ]}
                                className="text-sm"
                              />
                            </div>
                            <div className="min-w-0">
                              <span className="text-sm text-[hsl(var(--muted-foreground))] truncate block font-mono">
                                {displayValue.length > 40 ? displayValue.slice(0, 40) + '...' : displayValue || '(empty)'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Mapping summary */}
                    <div className="mt-3 pt-3 border-t flex items-center justify-between text-sm">
                      <span className="text-[hsl(var(--muted-foreground))]">
                        {mappedCount} mapped, {uploaded.columns.length - mappedCount} skipped
                      </span>
                      {mappedCount < uploaded.columns.length && (
                        <span className="text-amber-600 dark:text-amber-400 text-xs">
                          Unmapped columns will be ignored during transformation
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Summary */}
      <Card className={`${
        requiredSourceKeys.every(k => uploadedSourceData[k]?.rowCount > 0)
          ? 'bg-green-500/5 border-green-500/20'
          : 'bg-amber-500/5 border-amber-500/20'
      }`}>
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            {requiredSourceKeys.every(k => uploadedSourceData[k]?.rowCount > 0) ? (
              <>
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="font-medium">All source files uploaded</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-5 w-5 text-amber-500" />
                <span className="font-medium">
                  {requiredSourceKeys.filter(k => uploadedSourceData[k]?.rowCount > 0).length} of{' '}
                  {requiredSourceKeys.length} files uploaded
                </span>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
