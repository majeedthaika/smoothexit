import { useState } from 'react';
import { Play, Pause, Download, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@/components/ui';
import { useMigrationStore } from '@/store/migration';
import { recordsToCSV } from '@/lib/transform';

export function UploadTargetStep() {
  const {
    targetSchema,
    targetSite,
    setTargetSite,
    targetApiKey,
    setTargetApiKey,
    batchSize,
    setBatchSize,
    transformedData,
    uploadProgress,
    setUploadProgress,
    uploadResults,
    addUploadResult,
    clearUploadResults,
    uploadStatus,
    setUploadStatus,
  } = useMigrationStore();

  const [currentEntity, setCurrentEntity] = useState<string | null>(null);

  const totalRecords = Object.values(transformedData).reduce((sum, arr) => sum + arr.length, 0);

  const handleStartUpload = async () => {
    if (!targetSchema) {
      alert('No target schema configured');
      return;
    }

    setUploadStatus('running');
    clearUploadResults();
    setUploadProgress({ total: totalRecords, processed: 0, succeeded: 0, failed: 0 });

    try {
      for (const [targetKey, records] of Object.entries(transformedData)) {
        setCurrentEntity(targetKey);
        const [service, entity] = targetKey.split('.');

        // Process in batches
        for (let i = 0; i < records.length; i += batchSize) {
          // Check if paused or cancelled
          const currentStatus = useMigrationStore.getState().uploadStatus;
          if (currentStatus === 'paused') {
            // Wait until resumed
            await new Promise<void>((resolve) => {
              const unsubscribe = useMigrationStore.subscribe((state) => {
                if (state.uploadStatus !== 'paused') {
                  unsubscribe();
                  resolve();
                }
              });
            });
          }
          if (useMigrationStore.getState().uploadStatus === 'idle') {
            // Cancelled
            return;
          }

          const batch = records.slice(i, i + batchSize);

          try {
            // Call backend API to upload batch
            const response = await fetch('/api/migrations/upload-batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                target_service: service,
                target_entity: entity,
                records: batch,
                api_key: targetApiKey,
                site: targetSite || undefined,
                dry_run: false,
              }),
            });

            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();

            // Process results
            for (const r of result.results || []) {
              addUploadResult({
                entity: targetKey,
                sourceIndex: i + r.source_index,
                targetId: r.target_id,
                error: r.error,
              });
            }

            // Update progress
            const currentProgress = useMigrationStore.getState().uploadProgress;
            const batchSucceeded = (result.results || []).filter((r: { error?: string }) => !r.error).length;
            const batchFailed = (result.results || []).filter((r: { error?: string }) => r.error).length;

            setUploadProgress({
              ...currentProgress,
              processed: currentProgress.processed + batch.length,
              succeeded: currentProgress.succeeded + batchSucceeded,
              failed: currentProgress.failed + batchFailed,
            });
          } catch (err) {
            // Mark all records in batch as failed
            for (let j = 0; j < batch.length; j++) {
              addUploadResult({
                entity: targetKey,
                sourceIndex: i + j,
                error: err instanceof Error ? err.message : String(err),
              });
            }

            const currentProgress = useMigrationStore.getState().uploadProgress;
            setUploadProgress({
              ...currentProgress,
              processed: currentProgress.processed + batch.length,
              failed: currentProgress.failed + batch.length,
            });
          }
        }
      }

      setUploadStatus('completed');
      setCurrentEntity(null);
    } catch (err) {
      console.error('Upload error:', err);
      setUploadStatus('failed');
    }
  };

  const handlePauseResume = () => {
    if (uploadStatus === 'running') {
      setUploadStatus('paused');
    } else if (uploadStatus === 'paused') {
      setUploadStatus('running');
    }
  };

  const handleCancel = () => {
    setUploadStatus('idle');
    setCurrentEntity(null);
  };

  const handleDownloadResults = () => {
    const csvData = uploadResults.map((r) => ({
      entity: r.entity,
      source_index: r.sourceIndex,
      target_id: r.targetId || '',
      status: r.error ? 'failed' : 'success',
      error: r.error || '',
    }));
    const csv = recordsToCSV(csvData);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'migration_results.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const progressPercent = uploadProgress.total > 0
    ? Math.round((uploadProgress.processed / uploadProgress.total) * 100)
    : 0;

  const failedResults = uploadResults.filter(r => r.error);

  return (
    <div className="space-y-4">
      {/* Target Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Target Service Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <span className="font-medium">Target:</span>
            <span className="text-[hsl(var(--primary))]">
              {targetSchema ? `${targetSchema.service}.${targetSchema.entity}` : 'Not configured'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Site (if applicable)"
              value={targetSite}
              onChange={(e) => setTargetSite(e.target.value)}
              placeholder="e.g., your-site"
              disabled={uploadStatus === 'running' || uploadStatus === 'paused'}
            />
            <Input
              label="API Key"
              type="password"
              value={targetApiKey}
              onChange={(e) => setTargetApiKey(e.target.value)}
              placeholder="API key for target service"
              disabled={uploadStatus === 'running' || uploadStatus === 'paused'}
            />
          </div>

          <div className="flex items-center gap-4">
            <label className="text-sm font-medium">Batch size:</label>
            <Input
              type="number"
              value={batchSize}
              onChange={(e) => setBatchSize(Math.max(1, parseInt(e.target.value) || 100))}
              className="w-24"
              min={1}
              disabled={uploadStatus === 'running' || uploadStatus === 'paused'}
            />
          </div>

          <div className="flex items-center gap-2">
            {uploadStatus === 'idle' && (
              <Button onClick={handleStartUpload} disabled={!targetApiKey || totalRecords === 0}>
                <Play className="h-4 w-4 mr-2" />
                Start Upload
              </Button>
            )}
            {(uploadStatus === 'running' || uploadStatus === 'paused') && (
              <>
                <Button variant="outline" onClick={handlePauseResume}>
                  {uploadStatus === 'running' ? (
                    <>
                      <Pause className="h-4 w-4 mr-2" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Resume
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Progress */}
      {(uploadStatus !== 'idle' || uploadProgress.processed > 0) && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                {uploadStatus === 'running' && <Loader2 className="h-5 w-5 animate-spin" />}
                {uploadStatus === 'completed' && <CheckCircle className="h-5 w-5 text-green-500" />}
                {uploadStatus === 'failed' && <XCircle className="h-5 w-5 text-red-500" />}
                {uploadStatus === 'paused' && <Pause className="h-5 w-5 text-amber-500" />}
                Upload Progress
              </CardTitle>
              {uploadResults.length > 0 && (
                <Button variant="outline" size="sm" onClick={handleDownloadResults}>
                  <Download className="h-4 w-4 mr-2" />
                  Download Results
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Progress Bar */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>{progressPercent}% complete</span>
                <span>
                  {uploadProgress.processed.toLocaleString()} / {uploadProgress.total.toLocaleString()}
                </span>
              </div>
              <div className="h-3 bg-[hsl(var(--muted))] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[hsl(var(--primary))] transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Stats */}
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm">
                  {uploadProgress.succeeded.toLocaleString()} succeeded
                </span>
              </div>
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="text-sm">
                  {uploadProgress.failed.toLocaleString()} failed
                </span>
              </div>
              {currentEntity && uploadStatus === 'running' && (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-[hsl(var(--muted-foreground))]">
                    Processing {currentEntity}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Errors */}
      {failedResults.length > 0 && (
        <Card className="border-red-500/50 bg-red-500/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Failed Records ({failedResults.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-48 overflow-auto space-y-1">
              {failedResults.slice(0, 20).map((result, index) => (
                <div key={index} className="text-sm">
                  <span className="text-[hsl(var(--muted-foreground))]">
                    {result.entity} #{result.sourceIndex}:
                  </span>{' '}
                  {result.error}
                </div>
              ))}
              {failedResults.length > 20 && (
                <div className="text-sm text-[hsl(var(--muted-foreground))]">
                  ...and {failedResults.length - 20} more errors
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Completion Message */}
      {uploadStatus === 'completed' && (
        <Card className="bg-green-500/5 border-green-500/20">
          <CardContent className="py-6 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <h3 className="font-semibold text-lg mb-1">Upload Complete</h3>
            <p className="text-[hsl(var(--muted-foreground))]">
              {uploadProgress.succeeded.toLocaleString()} records created successfully
              {uploadProgress.failed > 0 && `, ${uploadProgress.failed.toLocaleString()} failed`}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
