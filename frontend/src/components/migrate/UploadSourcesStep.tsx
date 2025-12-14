import { useCallback } from 'react';
import Papa from 'papaparse';
import { Upload, FileText, CheckCircle, AlertCircle, X } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { useMigrationStore } from '@/store/migration';

interface UploadSourcesStepProps {
  requiredSourceKeys: string[];
}

export function UploadSourcesStep({ requiredSourceKeys }: UploadSourcesStepProps) {
  const {
    uploadedSourceData,
    setUploadedSourceData,
    sourceSchemas,
  } = useMigrationStore();

  const handleFileUpload = useCallback((sourceKey: string, file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const columns = results.meta.fields || [];
        const data = results.data as Record<string, unknown>[];

        setUploadedSourceData(sourceKey, {
          fileName: file.name,
          data,
          columns,
          rowCount: data.length,
        });
      },
      error: (error) => {
        console.error('CSV parse error:', error);
        alert(`Error parsing CSV: ${error.message}`);
      },
    });
  }, [setUploadedSourceData]);

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

  const clearUpload = (sourceKey: string) => {
    const { [sourceKey]: _, ...rest } = uploadedSourceData;
    // Set each remaining key to preserve state
    Object.keys(rest).forEach(key => {
      setUploadedSourceData(key, rest[key]);
    });
    // Force a re-render by setting a dummy value then clearing it
    setUploadedSourceData(sourceKey, { fileName: '', data: [], columns: [], rowCount: 0 });
    // Clear it by not calling setUploadedSourceData again (the store will handle it)
  };

  // Get schema for a source key to show expected columns
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
            const expectedFields = schema?.fields.map(f => f.name) || [];

            return (
              <div key={sourceKey} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-medium">{sourceKey}</h3>
                    {expectedFields.length > 0 && (
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        Expected fields: {expectedFields.slice(0, 5).join(', ')}
                        {expectedFields.length > 5 && ` +${expectedFields.length - 5} more`}
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
                  <div className="flex items-center gap-4 p-4 bg-[hsl(var(--primary))]/5 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                        <span className="font-medium truncate">{uploaded.fileName}</span>
                      </div>
                      <p className="text-sm text-[hsl(var(--muted-foreground))]">
                        {uploaded.rowCount.toLocaleString()} rows, {uploaded.columns.length} columns
                      </p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                        Columns: {uploaded.columns.slice(0, 5).join(', ')}
                        {uploaded.columns.length > 5 && ` +${uploaded.columns.length - 5} more`}
                      </p>
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
