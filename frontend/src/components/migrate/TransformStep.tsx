import { useState } from 'react';
import { Play, Download, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@/components/ui';
import { useMigrationStore } from '@/store/migration';
import { transformRecords, downloadCSV } from '@/lib/transform';
import type { EntityMapping } from '@/types/migration';

interface TransformStepProps {
  selectedMappings: EntityMapping[];
}

export function TransformStep({ selectedMappings }: TransformStepProps) {
  const {
    uploadedSourceData,
    transformMode,
    setTransformMode,
    sampleSize,
    setSampleSize,
    transformedData,
    setTransformedData,
    transformErrors,
    setTransformErrors,
  } = useMigrationStore();

  const [isTransforming, setIsTransforming] = useState(false);

  const handleTransform = async () => {
    setIsTransforming(true);
    setTransformErrors([]);

    try {
      const newTransformedData: Record<string, Record<string, unknown>[]> = {};
      const newErrors: { entity: string; row: number; error: string }[] = [];

      for (const mapping of selectedMappings) {
        const sourceKey = `${mapping.source_service}.${mapping.source_entity}`;
        const targetKey = `${mapping.target_service}.${mapping.target_entity}`;
        const sourceData = uploadedSourceData[sourceKey]?.data || [];

        // Apply sample mode
        const dataToTransform = transformMode === 'sample'
          ? sourceData.slice(0, sampleSize)
          : sourceData;

        // Transform records
        const result = transformRecords(dataToTransform, mapping.field_mappings);

        // Merge with existing data for same target entity
        if (newTransformedData[targetKey]) {
          newTransformedData[targetKey] = [...newTransformedData[targetKey], ...result.data];
        } else {
          newTransformedData[targetKey] = result.data;
        }

        // Collect errors
        for (const err of result.errors) {
          for (const errorMsg of err.errors) {
            newErrors.push({
              entity: targetKey,
              row: err.row,
              error: errorMsg,
            });
          }
        }
      }

      setTransformedData(newTransformedData);
      setTransformErrors(newErrors);
    } catch (err) {
      console.error('Transform error:', err);
      alert(`Transform failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsTransforming(false);
    }
  };

  const handleDownload = (targetKey: string) => {
    const data = transformedData[targetKey];
    if (data) {
      const filename = `${targetKey.replace('.', '_')}_transformed.csv`;
      downloadCSV(data, filename);
    }
  };

  const hasTransformedData = Object.keys(transformedData).length > 0;
  const totalRecords = Object.values(transformedData).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div className="space-y-4">
      {/* Transform Options */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transformation Options</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={transformMode === 'sample'}
                onChange={() => setTransformMode('sample')}
                className="w-4 h-4"
              />
              <span className="text-sm">Sample (first N rows)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={transformMode === 'full'}
                onChange={() => setTransformMode('full')}
                className="w-4 h-4"
              />
              <span className="text-sm">Full transformation</span>
            </label>
          </div>

          {transformMode === 'sample' && (
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium">Sample size:</label>
              <Input
                type="number"
                value={sampleSize}
                onChange={(e) => setSampleSize(Math.max(1, parseInt(e.target.value) || 10))}
                className="w-24"
                min={1}
              />
              <span className="text-sm text-[hsl(var(--muted-foreground))]">rows per source</span>
            </div>
          )}

          <Button onClick={handleTransform} disabled={isTransforming}>
            {isTransforming ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            {isTransforming ? 'Transforming...' : 'Run Transformation'}
          </Button>
        </CardContent>
      </Card>

      {/* Transform Errors */}
      {transformErrors.length > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Transformation Warnings ({transformErrors.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-48 overflow-auto space-y-1">
              {transformErrors.slice(0, 20).map((err, index) => (
                <div key={index} className="text-sm">
                  <span className="text-[hsl(var(--muted-foreground))]">
                    {err.entity} row {err.row}:
                  </span>{' '}
                  {err.error}
                </div>
              ))}
              {transformErrors.length > 20 && (
                <div className="text-sm text-[hsl(var(--muted-foreground))]">
                  ...and {transformErrors.length - 20} more warnings
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Output Preview */}
      {hasTransformedData && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                Output Preview ({totalRecords.toLocaleString()} total records)
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(transformedData).map(([targetKey, data]) => (
              <div key={targetKey} className="border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between p-3 bg-[hsl(var(--muted))]">
                  <div>
                    <span className="font-medium">{targetKey}</span>
                    <span className="text-sm text-[hsl(var(--muted-foreground))] ml-2">
                      ({data.length.toLocaleString()} records)
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownload(targetKey)}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download CSV
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[hsl(var(--muted))]/50">
                      <tr>
                        {data.length > 0 &&
                          Object.keys(data[0]).slice(0, 6).map((col) => (
                            <th key={col} className="px-3 py-2 text-left font-medium">
                              {col}
                            </th>
                          ))}
                        {data.length > 0 && Object.keys(data[0]).length > 6 && (
                          <th className="px-3 py-2 text-left font-medium text-[hsl(var(--muted-foreground))]">
                            +{Object.keys(data[0]).length - 6} more
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {data.slice(0, 5).map((row, rowIndex) => (
                        <tr key={rowIndex} className="border-t">
                          {Object.values(row).slice(0, 6).map((value, colIndex) => (
                            <td key={colIndex} className="px-3 py-2 truncate max-w-[200px]">
                              {value === null || value === undefined
                                ? <span className="text-[hsl(var(--muted-foreground))]">null</span>
                                : String(value)}
                            </td>
                          ))}
                          {Object.keys(row).length > 6 && (
                            <td className="px-3 py-2 text-[hsl(var(--muted-foreground))]">...</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.length > 5 && (
                    <div className="p-2 text-center text-sm text-[hsl(var(--muted-foreground))] border-t">
                      Showing 5 of {data.length.toLocaleString()} records
                    </div>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* No Data Message */}
      {!hasTransformedData && !isTransforming && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-[hsl(var(--muted-foreground))]">
              Click "Run Transformation" to transform your source data into target format.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
