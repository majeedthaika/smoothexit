import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Clock, CheckCircle, XCircle, Loader2, Trash2, Play, Database, GitBranch, GitMerge, ChevronDown, ChevronRight, ArrowRight, Edit2, Link2, Search, X } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, Input } from '@/components/ui';
import { ThemeToggle } from '@/components/ThemeToggle';
import { migrationAPI } from '@/lib/api';
import { useMigrationStore } from '@/store/migration';
import type { Migration, EntitySchema, EntityMapping, FieldSchema } from '@/types/migration';
import { formatDate, getStatusColor, cn } from '@/lib/utils';

// Helper to highlight search matches in text
function HighlightMatch({ text, search }: { text: string; search: string }) {
  if (!search.trim()) return <>{text}</>;

  const parts = text.split(new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === search.toLowerCase()
          ? <mark key={i} className="bg-yellow-300 dark:bg-yellow-600 text-inherit rounded px-0.5">{part}</mark>
          : part
      )}
    </>
  );
}

// Collapsible schema viewer with search highlighting
function SchemaCard({ schema, searchTerm = '' }: { schema: EntitySchema; searchTerm?: string }) {
  const [expanded, setExpanded] = useState(false);

  // Auto-expand if there are field matches
  const hasFieldMatch = searchTerm && schema.fields.some(f =>
    f.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Filter fields based on search term (only when searching)
  const displayFields = searchTerm
    ? schema.fields.filter(f => f.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : schema.fields;

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-[hsl(var(--muted))] transition-colors"
      >
        <div className="flex items-center gap-2">
          {expanded || hasFieldMatch ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="text-xs uppercase text-[hsl(var(--muted-foreground))] bg-[hsl(var(--secondary))] px-2 py-0.5 rounded">
            {schema.service}
          </span>
          <span className="font-medium">
            <HighlightMatch text={schema.entity} search={searchTerm} />
          </span>
          {hasFieldMatch && (
            <span className="text-xs bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 px-1.5 py-0.5 rounded">
              {displayFields.length} match{displayFields.length !== 1 ? 'es' : ''}
            </span>
          )}
        </div>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">
          {schema.fields.length} fields
        </span>
      </button>
      {(expanded || hasFieldMatch) && (
        <div className="border-t px-3 py-2 bg-[hsl(var(--muted))]/50 max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-[hsl(var(--muted-foreground))] uppercase">
                <th className="text-left py-1">Field</th>
                <th className="text-left py-1">Type</th>
                <th className="text-left py-1">Required</th>
              </tr>
            </thead>
            <tbody>
              {(searchTerm ? displayFields : schema.fields).map((field: FieldSchema) => (
                <tr key={field.name} className="border-t border-[hsl(var(--border))]/50">
                  <td className="py-1 font-mono text-xs">
                    <HighlightMatch text={field.name} search={searchTerm} />
                  </td>
                  <td className="py-1 text-[hsl(var(--muted-foreground))]">{field.type}</td>
                  <td className="py-1">
                    {field.required && <span className="text-[hsl(var(--destructive))]">*</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Enhanced Mapping summary card with multi-source/multi-target support
function DashboardMappingCard({ mapping, searchTerm = '' }: { mapping: EntityMapping; searchTerm?: string }) {
  const [expanded, setExpanded] = useState(false);

  const isMultiSource = mapping.additional_sources && mapping.additional_sources.length > 0;
  const isMultiTarget = mapping.additional_targets && mapping.additional_targets.length > 0;

  // Check for field matches
  const hasFieldMatch = searchTerm && mapping.field_mappings.some(fm =>
    fm.source_field.toLowerCase().includes(searchTerm.toLowerCase()) ||
    fm.target_field.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Filter field mappings when searching
  const displayFieldMappings = searchTerm
    ? mapping.field_mappings.filter(fm =>
        fm.source_field.toLowerCase().includes(searchTerm.toLowerCase()) ||
        fm.target_field.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : mapping.field_mappings;

  const allSources = isMultiSource
    ? [{ service: mapping.source_service, entity: mapping.source_entity }, ...mapping.additional_sources!]
    : [{ service: mapping.source_service, entity: mapping.source_entity }];

  const allTargets = isMultiTarget
    ? [{ service: mapping.target_service, entity: mapping.target_entity }, ...mapping.additional_targets!]
    : [{ service: mapping.target_service, entity: mapping.target_entity }];

  // Determine cardinality
  const cardinality = mapping.cardinality ||
    (isMultiSource && isMultiTarget ? 'many:many' :
     isMultiSource ? 'many:1' :
     isMultiTarget ? '1:many' : '1:1');

  const joinConditions = mapping.join_config?.join_conditions || [];

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-[hsl(var(--muted))] transition-colors"
      >
        <div className="flex items-center gap-2 flex-wrap">
          {expanded || hasFieldMatch ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}

          {/* Cardinality badge */}
          <span className={cn(
            "px-1.5 py-0.5 rounded text-[10px] font-medium",
            cardinality === '1:1' && "bg-gray-500/10 text-gray-600 dark:text-gray-400",
            cardinality === 'many:1' && "bg-purple-500/10 text-purple-600 dark:text-purple-400",
            cardinality === '1:many' && "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
            cardinality === 'many:many' && "bg-pink-500/10 text-pink-600 dark:text-pink-400"
          )}>
            {cardinality}
          </span>

          {/* Sources */}
          <div className="flex items-center gap-1">
            {allSources.map((src, idx) => (
              <span key={`${src.service}:${src.entity}`} className={cn(
                "text-sm font-medium",
                idx === 0 ? "text-blue-600 dark:text-blue-400" : "text-green-600 dark:text-green-400"
              )}>
                {idx > 0 && <span className="text-[hsl(var(--muted-foreground))] mx-1">+</span>}
                <HighlightMatch text={`${src.service}.${src.entity}`} search={searchTerm} />
              </span>
            ))}
          </div>

          {/* Arrow */}
          <ArrowRight className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />

          {/* Targets */}
          <div className="flex items-center gap-1">
            {allTargets.map((tgt, idx) => (
              <span key={`${tgt.service}:${tgt.entity}`} className={cn(
                "text-sm font-medium",
                idx === 0 ? "text-orange-600 dark:text-orange-400" : "text-amber-600 dark:text-amber-400"
              )}>
                {idx > 0 && <span className="text-[hsl(var(--muted-foreground))] mx-1">+</span>}
                <HighlightMatch text={`${tgt.service}.${tgt.entity}`} search={searchTerm} />
              </span>
            ))}
          </div>

          {/* Field match indicator */}
          {hasFieldMatch && (
            <span className="text-xs bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 px-1.5 py-0.5 rounded">
              {displayFieldMappings.length} field match{displayFieldMappings.length !== 1 ? 'es' : ''}
            </span>
          )}
        </div>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">
          {mapping.field_mappings.length} fields
        </span>
      </button>
      {(expanded || hasFieldMatch) && (
        <div className="border-t bg-[hsl(var(--muted))]/50">
          {/* Join info for multi-source */}
          {isMultiSource && (
            <div className="px-3 py-2 border-b border-[hsl(var(--border))]/50">
              <div className="flex items-center gap-2 text-xs">
                <Link2 className="h-3 w-3 text-purple-500" />
                <span className="text-purple-600 dark:text-purple-400 font-medium">
                  {mapping.join_config?.type?.toUpperCase() || 'LEFT'} JOIN
                </span>
                {joinConditions.length > 0 && (
                  <span className="text-[hsl(var(--muted-foreground))]">
                    on {joinConditions.map((jc, idx) => (
                      <span key={idx}>
                        {idx > 0 && ', '}
                        <span className="font-mono">{jc.left_source.entity}.{jc.left_field}</span>
                        {' = '}
                        <span className="font-mono">{jc.right_source.entity}.{jc.right_field}</span>
                      </span>
                    ))}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Multi-target info */}
          {isMultiTarget && (
            <div className="px-3 py-2 border-b border-[hsl(var(--border))]/50">
              <div className="flex items-center gap-2 text-xs">
                <GitMerge className="h-3 w-3 text-cyan-500 rotate-180" />
                <span className="text-cyan-600 dark:text-cyan-400 font-medium">
                  Maps to {allTargets.length} target entities
                </span>
              </div>
            </div>
          )}

          {/* Field mappings */}
          <div className="px-3 py-2 max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-[hsl(var(--muted-foreground))] uppercase">
                  <th className="text-left py-1">Source</th>
                  <th className="text-left py-1"></th>
                  <th className="text-left py-1">Target</th>
                  <th className="text-left py-1">Transform</th>
                </tr>
              </thead>
              <tbody>
                {(searchTerm ? displayFieldMappings : mapping.field_mappings.slice(0, 10)).map((fm, idx) => (
                  <tr key={idx} className="border-t border-[hsl(var(--border))]/50">
                    <td className="py-1 font-mono text-xs">
                      {fm.source_service && (
                        <span className="text-[hsl(var(--muted-foreground))]">{fm.source_entity}.</span>
                      )}
                      <HighlightMatch text={fm.source_field} search={searchTerm} />
                    </td>
                    <td className="py-1 text-[hsl(var(--muted-foreground))]">→</td>
                    <td className="py-1 font-mono text-xs">
                      <HighlightMatch text={fm.target_field} search={searchTerm} />
                    </td>
                    <td className="py-1">
                      <Badge variant="outline" className="text-xs">{fm.transform}</Badge>
                    </td>
                  </tr>
                ))}
                {!searchTerm && mapping.field_mappings.length > 10 && (
                  <tr>
                    <td colSpan={4} className="py-1 text-xs text-[hsl(var(--muted-foreground))] text-center">
                      ... and {mapping.field_mappings.length - 10} more fields
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function Dashboard() {
  const [migrations, setMigrations] = useState<Migration[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Get schemas and mappings from store
  const { sourceSchemas, entityMappings, setActiveTab, availableSchemas } = useMigrationStore();

  // Get all target schemas (Chargebee)
  const targetSchemas = availableSchemas.filter(s => s.service === 'chargebee');

  // Filter schemas and mappings based on search
  const filteredSourceSchemas = useMemo(() => {
    if (!searchTerm) return sourceSchemas;
    return sourceSchemas.filter(s =>
      s.entity.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.service.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.fields.some(f => f.name.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [sourceSchemas, searchTerm]);

  const filteredTargetSchemas = useMemo(() => {
    if (!searchTerm) return targetSchemas;
    return targetSchemas.filter(s =>
      s.entity.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.service.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.fields.some(f => f.name.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [targetSchemas, searchTerm]);

  const filteredMappings = useMemo(() => {
    if (!searchTerm) return entityMappings;
    return entityMappings.filter(m =>
      m.source_entity.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.source_service.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.target_entity.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.target_service.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.field_mappings.some(fm =>
        fm.source_field.toLowerCase().includes(searchTerm.toLowerCase()) ||
        fm.target_field.toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
  }, [entityMappings, searchTerm]);

  const loadMigrations = async () => {
    setLoading(true);
    const res = await migrationAPI.list();
    if (res.data) {
      setMigrations(res.data.migrations);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadMigrations();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this migration?')) return;

    const res = await migrationAPI.delete(id);
    if (!res.error) {
      setMigrations((prev) => prev.filter((m) => m.id !== id));
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'extracting':
      case 'transforming':
      case 'validating':
      case 'loading':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  // Stats
  const stats = {
    total: migrations.length,
    completed: migrations.filter((m) => m.status === 'completed').length,
    failed: migrations.filter((m) => m.status === 'failed').length,
    running: migrations.filter((m) =>
      ['extracting', 'transforming', 'validating', 'loading'].includes(m.status)
    ).length,
  };

  // Group filtered source schemas by service
  const schemasByService = filteredSourceSchemas.reduce((acc, schema) => {
    if (!acc[schema.service]) acc[schema.service] = [];
    acc[schema.service].push(schema);
    return acc;
  }, {} as Record<string, EntitySchema[]>);

  // Group filtered mappings by target entity
  const mappingsByTarget = filteredMappings.reduce((acc, mapping) => {
    const key = `${mapping.target_service}:${mapping.target_entity}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(mapping);
    return acc;
  }, {} as Record<string, EntityMapping[]>);

  // Mapping stats
  const mappingStats = {
    total: entityMappings.length,
    multiSource: entityMappings.filter(m => m.additional_sources && m.additional_sources.length > 0).length,
    multiTarget: entityMappings.filter(m => m.additional_targets && m.additional_targets.length > 0).length,
    fieldMappings: entityMappings.reduce((sum, m) => sum + m.field_mappings.length, 0),
  };

  // Search result counts
  const searchCounts = searchTerm ? {
    schemas: filteredSourceSchemas.length + filteredTargetSchemas.length,
    mappings: filteredMappings.length,
  } : null;

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Migrate Services</h1>
            <p className="text-[hsl(var(--muted-foreground))]">
              Manage schemas, mappings, and run data migrations
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/workspace">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Migration
              </Button>
            </Link>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--muted-foreground))]" />
            <Input
              type="text"
              placeholder="Search schemas and mappings by name or field..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-8"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {searchCounts && (
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
              Found {searchCounts.schemas} schema{searchCounts.schemas !== 1 ? 's' : ''} and{' '}
              {searchCounts.mappings} mapping{searchCounts.mappings !== 1 ? 's' : ''} matching "{searchTerm}"
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Left column: Schemas & Mappings */}
          <div className="col-span-2 space-y-6">
            {/* Source Schemas - Grouped by Service */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Database className="h-4 w-4" />
                    Source Schemas
                    <span className="text-xs font-normal text-[hsl(var(--muted-foreground))]">
                      ({sourceSchemas.length} entities)
                    </span>
                  </CardTitle>
                  <Link to="/workspace" onClick={() => setActiveTab('schemas')}>
                    <Button variant="ghost" size="sm">
                      <Edit2 className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {filteredSourceSchemas.length === 0 ? (
                  <p className="text-sm text-[hsl(var(--muted-foreground))] py-4 text-center">
                    {searchTerm ? 'No matching source schemas' : 'No source schemas defined'}
                  </p>
                ) : (
                  Object.entries(schemasByService).map(([service, schemas]) => (
                    <div key={service}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-xs font-medium uppercase",
                          service === 'stripe' && "bg-blue-500/10 text-blue-600 dark:text-blue-400",
                          service === 'salesforce' && "bg-green-500/10 text-green-600 dark:text-green-400"
                        )}>
                          {service}
                        </span>
                        <span className="text-xs text-[hsl(var(--muted-foreground))]">
                          {schemas.length} entities
                        </span>
                      </div>
                      <div className="space-y-2 pl-2 border-l-2 border-[hsl(var(--border))]">
                        {schemas.map((schema) => (
                          <SchemaCard key={`${schema.service}-${schema.entity}`} schema={schema} searchTerm={searchTerm} />
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Target Schemas - Chargebee */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Database className="h-4 w-4 text-orange-500" />
                    Target Schemas
                    <span className="px-2 py-0.5 rounded text-xs font-medium uppercase bg-orange-500/10 text-orange-600 dark:text-orange-400">
                      chargebee
                    </span>
                    <span className="text-xs font-normal text-[hsl(var(--muted-foreground))]">
                      ({targetSchemas.length} entities)
                    </span>
                  </CardTitle>
                  <Link to="/workspace" onClick={() => setActiveTab('schemas')}>
                    <Button variant="ghost" size="sm">
                      <Edit2 className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {filteredTargetSchemas.length === 0 ? (
                  <p className="text-sm text-[hsl(var(--muted-foreground))] py-4 text-center">
                    {searchTerm ? 'No matching target schemas' : 'No target schemas defined'}
                  </p>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {filteredTargetSchemas.map((schema) => {
                      const hasMappings = mappingsByTarget[`${schema.service}:${schema.entity}`];
                      return (
                        <div key={`${schema.service}-${schema.entity}`} className="relative">
                          {hasMappings && (
                            <div className="absolute -left-1 top-3 w-2 h-2 rounded-full bg-orange-500" title={`${hasMappings.length} mapping(s)`} />
                          )}
                          <SchemaCard schema={schema} searchTerm={searchTerm} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Mappings - Grouped by Target */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <GitBranch className="h-4 w-4" />
                    Entity Mappings
                    <span className="text-xs font-normal text-[hsl(var(--muted-foreground))]">
                      ({mappingStats.total} mappings, {mappingStats.fieldMappings} fields)
                    </span>
                  </CardTitle>
                  <Link to="/workspace" onClick={() => setActiveTab('mappings')}>
                    <Button variant="ghost" size="sm">
                      <Edit2 className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                  </Link>
                </div>
                {/* Mapping type summary */}
                <div className="flex items-center gap-3 mt-2">
                  <span className="px-2 py-0.5 rounded text-xs bg-gray-500/10 text-gray-600 dark:text-gray-400">
                    {mappingStats.total - mappingStats.multiSource - mappingStats.multiTarget} x 1:1
                  </span>
                  {mappingStats.multiSource > 0 && (
                    <span className="px-2 py-0.5 rounded text-xs bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center gap-1">
                      <GitMerge className="h-3 w-3" />
                      {mappingStats.multiSource} many:1
                    </span>
                  )}
                  {mappingStats.multiTarget > 0 && (
                    <span className="px-2 py-0.5 rounded text-xs bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center gap-1">
                      <GitMerge className="h-3 w-3 rotate-180" />
                      {mappingStats.multiTarget} 1:many
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {filteredMappings.length === 0 ? (
                  <p className="text-sm text-[hsl(var(--muted-foreground))] py-4 text-center">
                    {searchTerm ? 'No matching mappings' : 'No mappings defined'}
                  </p>
                ) : (
                  Object.entries(mappingsByTarget).map(([targetKey, mappings]) => {
                    const [, targetEntity] = targetKey.split(':');
                    return (
                      <div key={targetKey}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-orange-500/10 text-orange-600 dark:text-orange-400">
                            → <HighlightMatch text={targetEntity} search={searchTerm} />
                          </span>
                          <span className="text-xs text-[hsl(var(--muted-foreground))]">
                            {mappings.length} mapping{mappings.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="space-y-2 pl-2 border-l-2 border-orange-500/30">
                          {mappings.map((mapping, idx) => (
                            <DashboardMappingCard key={idx} mapping={mapping} searchTerm={searchTerm} />
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right column: Migration History & Stats */}
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardContent className="py-3">
                  <p className="text-xl font-bold">{stats.total}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">Total Migrations</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-3">
                  <p className="text-xl font-bold text-green-500">{stats.completed}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">Completed</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-3">
                  <p className="text-xl font-bold text-blue-500">{stats.running}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">Running</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-3">
                  <p className="text-xl font-bold text-red-500">{stats.failed}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">Failed</p>
                </CardContent>
              </Card>
            </div>

            {/* Migration History */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Migration History</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))]" />
                  </div>
                ) : migrations.length === 0 ? (
                  <div className="text-center py-8">
                    <Play className="h-8 w-8 mx-auto mb-2 text-[hsl(var(--muted-foreground))]" />
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">No migrations yet</p>
                    <Link to="/workspace" className="mt-2 inline-block">
                      <Button size="sm">
                        <Plus className="mr-1 h-3 w-3" />
                        New Migration
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {migrations.map((migration) => (
                      <div
                        key={migration.id}
                        className="flex items-center justify-between p-2 rounded border hover:bg-[hsl(var(--muted))] transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {getStatusIcon(migration.status)}
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{migration.name}</p>
                            <p className="text-xs text-[hsl(var(--muted-foreground))]">
                              {formatDate(migration.created_at)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={`${getStatusColor(migration.status)} text-xs`}>
                            {migration.status}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-[hsl(var(--destructive))]"
                            onClick={() => handleDelete(migration.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
