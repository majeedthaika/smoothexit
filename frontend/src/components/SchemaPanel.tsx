import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Database, Target, GitBranch, Circle, Search, X, ExternalLink } from 'lucide-react';
import { useMigrationStore } from '@/store/migration';
import { Input } from '@/components/ui';
import type { EntitySchema, FieldSchema } from '@/types/migration';

// Helper to highlight search matches
function HighlightText({ text, search }: { text: string; search: string }) {
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

interface SchemaTreeProps {
  schema: EntitySchema;
  isTarget?: boolean;
  searchTerm?: string;
  onSchemaClick?: (schema: EntitySchema) => void;
}

function FieldItem({ field, depth = 0, searchTerm = '' }: { field: FieldSchema; depth?: number; searchTerm?: string }) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = field.properties && field.properties.length > 0;
  const paddingLeft = 12 + depth * 16;

  // Check if this field or any children match search
  const fieldMatches = searchTerm && field.name.toLowerCase().includes(searchTerm.toLowerCase());
  const childMatches = searchTerm && hasChildren && field.properties!.some(
    p => p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Auto-expand if children match
  const shouldExpand = expanded || childMatches;

  return (
    <div>
      <div
        className={`flex items-center gap-1 py-0.5 text-xs hover:bg-[hsl(var(--accent))] rounded cursor-default ${fieldMatches ? 'bg-yellow-500/10' : ''}`}
        style={{ paddingLeft }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {hasChildren ? (
          shouldExpand ? (
            <ChevronDown className="h-3 w-3 text-[hsl(var(--muted-foreground))]" />
          ) : (
            <ChevronRight className="h-3 w-3 text-[hsl(var(--muted-foreground))]" />
          )
        ) : (
          <Circle className="h-2 w-2 text-[hsl(var(--muted-foreground))] ml-0.5 mr-0.5" />
        )}
        <span className={field.required ? 'font-medium' : 'text-[hsl(var(--muted-foreground))]'}>
          <HighlightText text={field.name} search={searchTerm} />
        </span>
        <span className="text-[hsl(var(--muted-foreground))] ml-1">
          {field.type}
          {field.required && <span className="text-[hsl(var(--destructive))]">*</span>}
        </span>
      </div>
      {hasChildren && shouldExpand && (
        <div>
          {field.properties!.map((child) => (
            <FieldItem key={child.name} field={child} depth={depth + 1} searchTerm={searchTerm} />
          ))}
        </div>
      )}
    </div>
  );
}

function SchemaTree({ schema, isTarget, searchTerm = '', onSchemaClick }: SchemaTreeProps) {
  const [expanded, setExpanded] = useState(true);

  // Check if entity name or any field matches
  const entityMatches = searchTerm && schema.entity.toLowerCase().includes(searchTerm.toLowerCase());
  const hasFieldMatches = searchTerm && schema.fields.some(
    f => f.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Auto-expand if there are field matches
  const shouldExpand = expanded || hasFieldMatches;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(!expanded);
  };

  const handleNavigateToSchema = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onSchemaClick) {
      onSchemaClick(schema);
    }
  };

  return (
    <div className="mb-2 group">
      <div className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm font-medium hover:bg-[hsl(var(--accent))] transition-colors ${entityMatches ? 'bg-yellow-500/10' : ''}`}>
        <button onClick={handleClick} className="flex items-center gap-2 flex-1 text-left">
          {shouldExpand ? (
            <ChevronDown className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
          ) : (
            <ChevronRight className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
          )}
          <span className={isTarget ? 'text-[hsl(var(--primary))]' : ''}>
            <HighlightText text={schema.entity} search={searchTerm} />
          </span>
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            ({schema.fields.length} fields)
            {hasFieldMatches && (
              <span className="ml-1 text-yellow-600 dark:text-yellow-400">
                ({schema.fields.filter(f => f.name.toLowerCase().includes(searchTerm.toLowerCase())).length} match)
              </span>
            )}
          </span>
        </button>
        {onSchemaClick && (
          <button
            onClick={handleNavigateToSchema}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[hsl(var(--muted))] rounded transition-opacity"
            title="View in Schema Builder"
          >
            <ExternalLink className="h-3 w-3 text-[hsl(var(--muted-foreground))]" />
          </button>
        )}
      </div>
      {shouldExpand && (
        <div className="ml-2 border-l border-[hsl(var(--border))]">
          {schema.fields.map((field) => (
            <FieldItem key={field.name} field={field} searchTerm={searchTerm} />
          ))}
        </div>
      )}
    </div>
  );
}

interface SchemaPanelProps {
  onSchemaClick?: (schema: EntitySchema) => void;
}

export function SchemaPanel({ onSchemaClick }: SchemaPanelProps = {}) {
  const { sourceSchemas, targetSchema, entityMappings, availableSchemas, setActiveTab, setFocusedSchema } = useMigrationStore();
  const [searchTerm, setSearchTerm] = useState('');

  // Handle clicking a schema - switch to schemas tab and set focused schema
  const handleSchemaClick = (schema: EntitySchema) => {
    setFocusedSchema({ service: schema.service, entity: schema.entity });
    setActiveTab('schemas');
    if (onSchemaClick) {
      onSchemaClick(schema);
    }
  };

  // Get all target schemas (Chargebee)
  const targetSchemas = availableSchemas.filter(s => s.service === 'chargebee');

  // Filter schemas based on search
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

  // Group source schemas by service
  const schemasByService = filteredSourceSchemas.reduce((acc, schema) => {
    if (!acc[schema.service]) {
      acc[schema.service] = [];
    }
    acc[schema.service].push(schema);
    return acc;
  }, {} as Record<string, EntitySchema[]>);

  // Calculate mapping stats
  const totalFieldMappings = entityMappings.reduce(
    (sum, em) => sum + em.field_mappings.length,
    0
  );
  const unmappedRequired = targetSchema
    ? targetSchema.fields.filter((f) => f.required).length -
      entityMappings.reduce((sum, em) => {
        const mappedTargets = new Set(em.field_mappings.map((fm) => fm.target_field.split('.')[0]));
        return sum + targetSchema!.fields.filter((f) => f.required && mappedTargets.has(f.name)).length;
      }, 0)
    : 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Search Bar */}
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
          <Input
            type="text"
            placeholder="Search schemas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-7 pr-7 h-8 text-xs"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {searchTerm && (
          <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
            {filteredSourceSchemas.length + filteredTargetSchemas.length} schemas match
          </p>
        )}
      </div>

      {/* Source Schemas */}
      <div className="flex-1 overflow-auto p-3">
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
            <Database className="h-4 w-4" />
            Source Schemas
          </div>
          {Object.entries(schemasByService).map(([service, schemas]) => (
            <div key={service} className="mb-3">
              <div className="text-xs font-medium text-[hsl(var(--muted-foreground))] px-2 py-1 bg-[hsl(var(--muted))] rounded mb-1">
                {service.charAt(0).toUpperCase() + service.slice(1)}
              </div>
              {schemas.map((schema) => (
                <SchemaTree key={`${schema.service}-${schema.entity}`} schema={schema} searchTerm={searchTerm} onSchemaClick={handleSchemaClick} />
              ))}
            </div>
          ))}
          {filteredSourceSchemas.length === 0 && (
            <p className="text-xs text-[hsl(var(--muted-foreground))] px-2">
              {searchTerm ? 'No matching source schemas' : 'No source schemas defined'}
            </p>
          )}
        </div>

        {/* Target Schemas - Show All Chargebee */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
            <Target className="h-4 w-4" />
            Target Schemas
          </div>
          {filteredTargetSchemas.length > 0 ? (
            <div className="mb-3">
              <div className="text-xs font-medium text-[hsl(var(--muted-foreground))] px-2 py-1 bg-[hsl(var(--muted))] rounded mb-1">
                Chargebee ({filteredTargetSchemas.length} entities)
              </div>
              {filteredTargetSchemas.map((schema) => (
                <SchemaTree key={`${schema.service}-${schema.entity}`} schema={schema} isTarget searchTerm={searchTerm} onSchemaClick={handleSchemaClick} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-[hsl(var(--muted-foreground))] px-2">
              {searchTerm ? 'No matching target schemas' : 'No target schemas defined'}
            </p>
          )}
        </div>
      </div>

      {/* Mapping Summary */}
      <div className="border-t p-3 bg-[hsl(var(--muted))]">
        <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
          <GitBranch className="h-4 w-4" />
          Mapping Summary
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-[hsl(var(--background))] rounded p-2">
            <div className="text-lg font-bold">{entityMappings.length}</div>
            <div className="text-[hsl(var(--muted-foreground))]">Entity mappings</div>
          </div>
          <div className="bg-[hsl(var(--background))] rounded p-2">
            <div className="text-lg font-bold">{totalFieldMappings}</div>
            <div className="text-[hsl(var(--muted-foreground))]">Field mappings</div>
          </div>
          {unmappedRequired > 0 && (
            <div className="col-span-2 bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))] rounded p-2">
              <div className="font-medium">{unmappedRequired} unmapped required fields</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
