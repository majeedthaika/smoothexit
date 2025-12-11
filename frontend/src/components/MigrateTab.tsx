import { useState } from 'react';
import { Play, AlertCircle, CheckCircle, Database, Target, ArrowRight } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@/components/ui';
import { ExecuteMonitor } from '@/components/wizard/ExecuteMonitor';
import { useMigrationStore } from '@/store/migration';

export function MigrateTab() {
  const {
    name,
    setName,
    description,
    setDescription,
    sourceSchemas,
    targetSchema,
    entityMappings,
    targetSite,
    setTargetSite,
    targetApiKey,
    setTargetApiKey,
    dryRun,
    setDryRun,
    batchSize,
    setBatchSize,
    migrationId,
  } = useMigrationStore();

  const [showExecute, setShowExecute] = useState(false);

  // Check readiness
  const hasSourceSchemas = sourceSchemas.length > 0;
  const hasTargetSchema = targetSchema !== null;
  const hasMappings = entityMappings.length > 0;
  const isReady = hasSourceSchemas && hasTargetSchema && hasMappings;

  // Get unique source services
  const sourceServices = [...new Set(sourceSchemas.map(s => s.service))];

  // Count mapped fields
  const totalFieldMappings = entityMappings.reduce((sum, em) => sum + em.field_mappings.length, 0);

  if (showExecute || migrationId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Migration Progress</h2>
          <Button variant="outline" onClick={() => setShowExecute(false)}>
            Back to Setup
          </Button>
        </div>
        <ExecuteMonitor />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold mb-2">Run Migration</h2>
        <p className="text-[hsl(var(--muted-foreground))]">
          Execute a data migration using your configured schemas and mappings.
        </p>
      </div>

      {/* Readiness Check */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pre-flight Check</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            {hasSourceSchemas ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <AlertCircle className="h-5 w-5 text-[hsl(var(--destructive))]" />
            )}
            <span className={hasSourceSchemas ? '' : 'text-[hsl(var(--muted-foreground))]'}>
              Source schemas defined ({sourceSchemas.length} entities from {sourceServices.join(', ') || 'none'})
            </span>
          </div>
          <div className="flex items-center gap-3">
            {hasTargetSchema ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <AlertCircle className="h-5 w-5 text-[hsl(var(--destructive))]" />
            )}
            <span className={hasTargetSchema ? '' : 'text-[hsl(var(--muted-foreground))]'}>
              Target schema defined ({targetSchema ? `${targetSchema.service}.${targetSchema.entity}` : 'none'})
            </span>
          </div>
          <div className="flex items-center gap-3">
            {hasMappings ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <AlertCircle className="h-5 w-5 text-[hsl(var(--destructive))]" />
            )}
            <span className={hasMappings ? '' : 'text-[hsl(var(--muted-foreground))]'}>
              Field mappings configured ({entityMappings.length} entity mappings, {totalFieldMappings} field mappings)
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Migration Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Migration Flow</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center gap-4 py-4">
            <div className="text-center">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-[hsl(var(--secondary))] mb-2">
                <Database className="h-8 w-8 text-[hsl(var(--muted-foreground))]" />
              </div>
              <div className="text-sm font-medium">Sources</div>
              <div className="text-xs text-[hsl(var(--muted-foreground))]">
                {sourceServices.length > 0 ? sourceServices.join(', ') : 'Not configured'}
              </div>
            </div>
            <ArrowRight className="h-6 w-6 text-[hsl(var(--muted-foreground))]" />
            <div className="text-center">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-[hsl(var(--primary))]/10 mb-2">
                <Target className="h-8 w-8 text-[hsl(var(--primary))]" />
              </div>
              <div className="text-sm font-medium">Target</div>
              <div className="text-xs text-[hsl(var(--muted-foreground))]">
                {targetSchema ? targetSchema.service : 'Not configured'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Migration Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Migration Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            label="Migration Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Q4 Customer Migration"
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium">Description</label>
            <textarea
              className="w-full rounded-md border border-[hsl(var(--input))] bg-transparent px-3 py-2 text-sm"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Target Site (if applicable)"
              value={targetSite}
              onChange={(e) => setTargetSite(e.target.value)}
              placeholder="e.g., your-site"
            />
            <Input
              label="Target API Key"
              type="password"
              value={targetApiKey}
              onChange={(e) => setTargetApiKey(e.target.value)}
              placeholder="API key for target service"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Batch Size"
              type="number"
              value={batchSize}
              onChange={(e) => setBatchSize(parseInt(e.target.value) || 100)}
            />
            <div>
              <label className="mb-1.5 block text-sm font-medium">Mode</label>
              <div className="flex items-center gap-4 h-10">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={dryRun}
                    onChange={() => setDryRun(true)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Dry Run</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={!dryRun}
                    onChange={() => setDryRun(false)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Live</span>
                </label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Execute Button */}
      <div className="flex justify-end">
        <Button
          size="lg"
          disabled={!isReady}
          onClick={() => setShowExecute(true)}
        >
          <Play className="h-5 w-5 mr-2" />
          {dryRun ? 'Start Dry Run' : 'Start Migration'}
        </Button>
      </div>

      {!isReady && (
        <p className="text-sm text-[hsl(var(--muted-foreground))] text-center">
          Configure schemas and mappings in the other tabs before running a migration.
        </p>
      )}
    </div>
  );
}
