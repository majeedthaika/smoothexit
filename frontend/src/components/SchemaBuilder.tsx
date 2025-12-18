import { useState, useMemo, useEffect, useRef } from 'react';
import { Plus, Trash2, Edit2, Check, X, ChevronDown, ChevronRight, Upload, Database, Search, Save, Loader2, RotateCcw, Hash, GitBranch } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Select } from '@/components/ui';
import { DataInputModal } from '@/components/DataInputModal';
import { SchemaRelationshipDiagram } from '@/components/SchemaRelationshipDiagram';
import { useMigrationStore } from '@/store/migration';
import { schemaAPI } from '@/lib/api';
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

const FIELD_TYPES = [
  { value: 'string', label: 'String' },
  { value: 'integer', label: 'Integer' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'object', label: 'Object' },
  { value: 'array', label: 'Array' },
  { value: 'timestamp', label: 'Timestamp' },
];

interface FieldEditorProps {
  field: FieldSchema;
  onUpdate: (field: FieldSchema) => void;
  onDelete: () => void;
  depth?: number;
}

function FieldEditor({ field, onUpdate, onDelete, depth = 0 }: FieldEditorProps) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [editedField, setEditedField] = useState(field);
  const hasChildren = field.type === 'object' && field.properties;

  const handleSave = () => {
    onUpdate(editedField);
    setEditing(false);
  };

  const handleCancel = () => {
    setEditedField(field);
    setEditing(false);
  };

  const handleAddChild = () => {
    const newChild: FieldSchema = {
      name: 'new_field',
      type: 'string',
      required: false,
      description: '',
    };
    onUpdate({
      ...field,
      properties: [...(field.properties || []), newChild],
    });
  };

  const handleUpdateChild = (index: number, updatedChild: FieldSchema) => {
    const newProperties = [...(field.properties || [])];
    newProperties[index] = updatedChild;
    onUpdate({ ...field, properties: newProperties });
  };

  const handleDeleteChild = (index: number) => {
    const newProperties = (field.properties || []).filter((_, i) => i !== index);
    onUpdate({ ...field, properties: newProperties });
  };

  const paddingLeft = depth * 24;

  if (editing) {
    return (
      <div className="border rounded p-2 mb-2 bg-[hsl(var(--muted))]" style={{ marginLeft: paddingLeft }}>
        <div className="grid grid-cols-4 gap-2 mb-2">
          <Input
            value={editedField.name}
            onChange={(e) => setEditedField({ ...editedField, name: e.target.value })}
            placeholder="Field name"
          />
          <Select
            options={FIELD_TYPES}
            value={editedField.type}
            onChange={(e) => setEditedField({ ...editedField, type: e.target.value })}
          />
          <Input
            value={editedField.description}
            onChange={(e) => setEditedField({ ...editedField, description: e.target.value })}
            placeholder="Description"
          />
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={editedField.required}
                onChange={(e) => setEditedField({ ...editedField, required: e.target.checked })}
              />
              Required
            </label>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave}>
            <Check className="h-3 w-3 mr-1" />
            Save
          </Button>
          <Button size="sm" variant="outline" onClick={handleCancel}>
            <X className="h-3 w-3 mr-1" />
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginLeft: paddingLeft }}>
      <div className="flex items-center gap-2 py-1.5 px-2 hover:bg-[hsl(var(--muted))] rounded group">
        {hasChildren && (
          <button onClick={() => setExpanded(!expanded)} className="p-0.5">
            {expanded ? (
              <ChevronDown className="h-3 w-3 text-[hsl(var(--muted-foreground))]" />
            ) : (
              <ChevronRight className="h-3 w-3 text-[hsl(var(--muted-foreground))]" />
            )}
          </button>
        )}
        <span className={`font-medium ${field.required ? '' : 'text-[hsl(var(--muted-foreground))]'}`}>
          {field.name}
        </span>
        <span className="text-xs text-[hsl(var(--muted-foreground))] bg-[hsl(var(--secondary))] px-1.5 py-0.5 rounded">
          {field.type}
        </span>
        {field.required && (
          <span className="text-xs text-[hsl(var(--destructive))]">required</span>
        )}
        {field.description && (
          <span className="text-xs text-[hsl(var(--muted-foreground))] truncate flex-1">
            - {field.description}
          </span>
        )}
        <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
          <button
            onClick={() => setEditing(true)}
            className="p-1 hover:bg-[hsl(var(--accent))] rounded"
          >
            <Edit2 className="h-3 w-3" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 hover:bg-[hsl(var(--destructive))]/20 rounded text-[hsl(var(--destructive))]"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
      {hasChildren && expanded && (
        <div className="border-l ml-4 pl-2">
          {field.properties!.map((child, index) => (
            <FieldEditor
              key={child.name}
              field={child}
              onUpdate={(updated) => handleUpdateChild(index, updated)}
              onDelete={() => handleDeleteChild(index)}
              depth={0}
            />
          ))}
          <button
            onClick={handleAddChild}
            className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] py-1 px-2"
          >
            <Plus className="h-3 w-3" />
            Add nested field
          </button>
        </div>
      )}
    </div>
  );
}

interface SchemaEditorCardProps {
  schema: EntitySchema;
  isTarget?: boolean;
  onUpdate: (schema: EntitySchema) => void;
  onDelete: () => void;
}

function SchemaEditorCard({ schema, isTarget, onUpdate, onDelete }: SchemaEditorCardProps) {
  const [editingHeader, setEditingHeader] = useState(false);
  const [editedSchema, setEditedSchema] = useState(schema);

  const handleAddField = () => {
    const newField: FieldSchema = {
      name: 'new_field',
      type: 'string',
      required: false,
      description: '',
    };
    onUpdate({ ...schema, fields: [...schema.fields, newField] });
  };

  const handleUpdateField = (index: number, updatedField: FieldSchema) => {
    const newFields = [...schema.fields];
    newFields[index] = updatedField;
    onUpdate({ ...schema, fields: newFields });
  };

  const handleDeleteField = (index: number) => {
    const newFields = schema.fields.filter((_, i) => i !== index);
    onUpdate({ ...schema, fields: newFields });
  };

  const handleSaveHeader = () => {
    onUpdate(editedSchema);
    setEditingHeader(false);
  };

  return (
    <Card className={isTarget ? 'border-[hsl(var(--primary))]' : ''}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          {editingHeader ? (
            <div className="flex gap-2 flex-1">
              <Input
                value={editedSchema.service}
                onChange={(e) => setEditedSchema({ ...editedSchema, service: e.target.value })}
                placeholder="Service"
                className="w-32"
              />
              <Input
                value={editedSchema.entity}
                onChange={(e) => setEditedSchema({ ...editedSchema, entity: e.target.value })}
                placeholder="Entity"
                className="w-32"
              />
              <Button size="sm" onClick={handleSaveHeader}>
                <Check className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditingHeader(false)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <>
              <CardTitle className="text-base flex items-center gap-2">
                <span className="text-xs uppercase text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))] px-2 py-0.5 rounded">
                  {schema.service}
                </span>
                {schema.entity}
                {isTarget && (
                  <span className="text-xs text-[hsl(var(--primary))]">TARGET</span>
                )}
              </CardTitle>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditingHeader(true)}>
                  <Edit2 className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="ghost" onClick={onDelete} className="text-[hsl(var(--destructive))]">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </>
          )}
        </div>
        {schema.description && (
          <p className="text-xs text-[hsl(var(--muted-foreground))]">{schema.description}</p>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {schema.fields.map((field, index) => (
            <FieldEditor
              key={field.name}
              field={field}
              onUpdate={(updated) => handleUpdateField(index, updated)}
              onDelete={() => handleDeleteField(index)}
            />
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={handleAddField} className="mt-2">
          <Plus className="h-3 w-3 mr-1" />
          Add Field
        </Button>
      </CardContent>
    </Card>
  );
}

export function SchemaBuilder() {
  const {
    availableSchemas,
    removeAvailableSchema,
    sourceSchemas,
    targetSchema,
    addSourceSchema,
    updateSourceSchema,
    removeSourceSchema,
    setTargetSchema,
    focusedSchema,
    setFocusedSchema,
    schemasModified,
    markSchemasSaved,
    discardSchemaChanges,
  } = useMigrationStore();

  const [showImportModal, setShowImportModal] = useState(false);
  const [importTarget, setImportTarget] = useState<'source' | 'target'>('source');
  const [showSchemaPicker, setShowSchemaPicker] = useState(false);
  const [pickerSearchTerm, setPickerSearchTerm] = useState('');
  const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Refs for scrolling to schemas
  const schemaRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Handle focus on a schema from sidebar click
  useEffect(() => {
    if (focusedSchema) {
      const key = `${focusedSchema.service}-${focusedSchema.entity}`;
      const ref = schemaRefs.current[key];
      if (ref) {
        ref.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Add a highlight animation
        ref.classList.add('ring-2', 'ring-[hsl(var(--primary))]', 'ring-offset-2');
        setTimeout(() => {
          ref.classList.remove('ring-2', 'ring-[hsl(var(--primary))]', 'ring-offset-2');
        }, 2000);
      }
      // Clear the focused schema after handling
      setFocusedSchema(null);
    }
  }, [focusedSchema, setFocusedSchema]);

  // Group available schemas by service
  const schemasByService = availableSchemas.reduce((acc, schema) => {
    if (!acc[schema.service]) {
      acc[schema.service] = [];
    }
    acc[schema.service].push(schema);
    return acc;
  }, {} as Record<string, EntitySchema[]>);

  // Compute all services for quick navigation
  const allServices = useMemo(() => {
    const sourceServices = [...new Set(sourceSchemas.map(s => s.service))].map(s => ({
      service: s,
      type: 'source' as const,
      count: sourceSchemas.filter(schema => schema.service === s).length,
    }));
    const chargebeeSchemas = schemasByService['chargebee'] || [];
    const targetServices = chargebeeSchemas.length > 0 ? [{
      service: 'chargebee',
      type: 'target' as const,
      count: chargebeeSchemas.length,
    }] : [];
    return [...sourceServices, ...targetServices];
  }, [sourceSchemas, schemasByService]);

  const scrollToSection = (sectionId: string) => {
    // First try section refs
    const sectionElement = sectionRefs.current[sectionId];
    if (sectionElement) {
      sectionElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    // For source services, scroll to the first schema of that service
    if (sectionId.startsWith('source-')) {
      const service = sectionId.replace('source-', '');
      const firstSchema = sourceSchemas.find(s => s.service === service);
      if (firstSchema) {
        const schemaRef = schemaRefs.current[`${firstSchema.service}-${firstSchema.entity}`];
        if (schemaRef) {
          schemaRef.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    }
  };

  // Filter schemas in picker based on search
  const filteredSchemasByService = useMemo(() => {
    if (!pickerSearchTerm) return schemasByService;

    const filtered: Record<string, EntitySchema[]> = {};
    for (const [service, schemas] of Object.entries(schemasByService)) {
      const matchingSchemas = schemas.filter(s =>
        s.entity.toLowerCase().includes(pickerSearchTerm.toLowerCase()) ||
        s.service.toLowerCase().includes(pickerSearchTerm.toLowerCase()) ||
        s.fields.some(f => f.name.toLowerCase().includes(pickerSearchTerm.toLowerCase()))
      );
      if (matchingSchemas.length > 0) {
        filtered[service] = matchingSchemas;
      }
    }
    return filtered;
  }, [schemasByService, pickerSearchTerm]);

  const openSchemaBrowser = () => {
    setPickerSearchTerm('');
    setSelectedForDelete(new Set());
    setShowSchemaPicker(true);
  };

  const handleToggleSchemaSelection = (service: string, entity: string) => {
    const key = `${service}:${entity}`;
    const newSelected = new Set(selectedForDelete);
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    setSelectedForDelete(newSelected);
  };

  const handleDeleteSelectedSchemas = () => {
    selectedForDelete.forEach(key => {
      const [service, entity] = key.split(':');
      removeAvailableSchema(service, entity);
      // Also remove from source schemas if it was added there
      removeSourceSchema(service, entity);
    });
    setSelectedForDelete(new Set());
  };

  const handleImportSource = () => {
    setImportTarget('source');
    setShowImportModal(true);
  };

  const handleImportTarget = () => {
    setImportTarget('target');
    setShowImportModal(true);
  };

  const handleSchemaGenerated = (schema: EntitySchema) => {
    if (importTarget === 'source') {
      // Check if schema already exists
      const existingIndex = sourceSchemas.findIndex(
        (s) => s.service === schema.service && s.entity === schema.entity
      );
      if (existingIndex >= 0) {
        updateSourceSchema(schema.service, schema.entity, schema);
      } else {
        addSourceSchema(schema);
      }
    } else {
      setTargetSchema(schema);
    }
  };

  const handleSaveSchemas = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      // Combine source schemas and target schema for saving
      const allSchemas = [...sourceSchemas];
      if (targetSchema) {
        allSchemas.push(targetSchema);
      }
      const result = await schemaAPI.saveAll(allSchemas);
      if (result.error) {
        setSaveError(result.error);
      } else {
        markSchemasSaved();
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save schemas');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscardSchemas = () => {
    if (window.confirm('Discard all unsaved schema changes? This cannot be undone.')) {
      discardSchemaChanges();
      setSaveError(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold mb-2">Schema Builder</h2>
          <p className="text-[hsl(var(--muted-foreground))]">
            Import schemas from files, APIs, screenshots, or web pages. AI will help transform your data into structured schemas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {schemasModified && (
            <span className="text-sm text-amber-600 dark:text-amber-400">Unsaved changes</span>
          )}
          {saveError && (
            <span className="text-sm text-[hsl(var(--destructive))]">{saveError}</span>
          )}
          {schemasModified && (
            <Button
              onClick={handleDiscardSchemas}
              variant="outline"
              disabled={saving}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Discard
            </Button>
          )}
          <Button
            onClick={handleSaveSchemas}
            disabled={saving || !schemasModified}
            variant={schemasModified ? 'primary' : 'outline'}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {saving ? 'Saving...' : 'Save Schemas'}
          </Button>
        </div>
      </div>

      {/* Quick Navigation */}
      {allServices.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-[hsl(var(--muted-foreground))] flex items-center gap-1">
            <Hash className="h-3.5 w-3.5" />
            Jump to:
          </span>
          <button
            onClick={() => scrollToSection('relationships')}
            className="px-2.5 py-1 rounded-md text-sm font-medium transition-colors border border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 flex items-center gap-1"
          >
            <GitBranch className="h-3.5 w-3.5" />
            Relationships
          </button>
          {allServices.map(({ service, type, count }) => (
            <button
              key={`${type}-${service}`}
              onClick={() => scrollToSection(`${type}-${service}`)}
              className={`px-2.5 py-1 rounded-md text-sm font-medium transition-colors border ${
                type === 'source' && service === 'stripe' ? "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20" :
                type === 'source' && service === 'salesforce' ? "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20" :
                type === 'source' ? "border-[hsl(var(--border))] bg-[hsl(var(--muted))]/50 text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]" :
                "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400 hover:bg-orange-500/20"
              }`}
            >
              {service} ({count})
            </button>
          ))}
        </div>
      )}

      {/* Entity Relationship Diagram */}
      <div ref={(el) => { sectionRefs.current['relationships'] = el; }} className="scroll-mt-4">
        <SchemaRelationshipDiagram />
      </div>

      {/* Source Schemas */}
      <div ref={(el) => { sectionRefs.current['source-schemas'] = el; }} className="scroll-mt-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium">Source Schemas ({sourceSchemas.length})</h3>
          <div className="flex gap-2">
            <Button onClick={openSchemaBrowser} variant="outline">
              <Database className="h-4 w-4 mr-2" />
              Browse Schemas
            </Button>
            <Button onClick={handleImportSource}>
              <Upload className="h-4 w-4 mr-2" />
              Import Schema
            </Button>
          </div>
        </div>
        {sourceSchemas.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center">
              <Database className="h-8 w-8 mx-auto mb-3 text-[hsl(var(--muted-foreground))]" />
              <p className="text-[hsl(var(--muted-foreground))] mb-3">No source schemas defined.</p>
              <div className="flex gap-2 justify-center">
                <Button onClick={openSchemaBrowser} variant="outline">
                  <Database className="h-4 w-4 mr-2" />
                  Browse Available Schemas
                </Button>
                <Button onClick={handleImportSource}>
                  <Upload className="h-4 w-4 mr-2" />
                  Import Schema
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {sourceSchemas.map((schema) => (
              <div
                key={`${schema.service}-${schema.entity}`}
                ref={(el) => { schemaRefs.current[`${schema.service}-${schema.entity}`] = el; }}
                className="transition-all duration-300"
              >
                <SchemaEditorCard
                  schema={schema}
                  onUpdate={(updated) => updateSourceSchema(schema.service, schema.entity, updated)}
                  onDelete={() => removeSourceSchema(schema.service, schema.entity)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Target Schemas - Show All Chargebee */}
      <div ref={(el) => { sectionRefs.current['target-chargebee'] = el; }} className="scroll-mt-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium flex items-center gap-2">
            Target Schemas
            <span className="px-2 py-0.5 rounded text-xs font-medium uppercase bg-orange-500/10 text-orange-600 dark:text-orange-400">
              chargebee
            </span>
            <span className="text-sm font-normal text-[hsl(var(--muted-foreground))]">
              ({(schemasByService['chargebee'] || []).length} entities)
            </span>
          </h3>
          <Button onClick={handleImportTarget} variant="outline">
            <Upload className="h-4 w-4 mr-2" />
            Import Schema
          </Button>
        </div>
        {(schemasByService['chargebee'] || []).length > 0 ? (
          <div className="grid gap-4 max-h-[600px] overflow-y-auto">
            {(schemasByService['chargebee'] || []).map((schema) => (
              <div
                key={`${schema.service}-${schema.entity}`}
                ref={(el) => { schemaRefs.current[`${schema.service}-${schema.entity}`] = el; }}
                className="transition-all duration-300"
              >
                <SchemaEditorCard
                  schema={schema}
                  isTarget
                  onUpdate={(updated) => {
                    // For now, we update the single targetSchema if it matches
                    if (targetSchema?.service === schema.service && targetSchema?.entity === schema.entity) {
                      setTargetSchema(updated);
                    }
                  }}
                  onDelete={() => {
                    // For now, just clear if it's the currently selected target
                    if (targetSchema?.service === schema.service && targetSchema?.entity === schema.entity) {
                      setTargetSchema(null);
                    }
                  }}
                />
              </div>
            ))}
          </div>
        ) : (
          <Card className="border-dashed border-[hsl(var(--primary))]/50">
            <CardContent className="py-8 text-center">
              <Database className="h-8 w-8 mx-auto mb-3 text-[hsl(var(--primary))]" />
              <p className="text-[hsl(var(--muted-foreground))] mb-3">
                No Chargebee target schemas available.
              </p>
              <Button onClick={handleImportTarget} variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                Import Schema Target
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Schema Browser Modal */}
      {showSchemaPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowSchemaPicker(false)}
          />
          <Card className="relative z-10 w-full max-w-2xl max-h-[80vh] overflow-hidden">
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle>Browse Available Schemas</CardTitle>
                {selectedForDelete.size > 0 && (
                  <span className="text-sm bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))] px-2 py-1 rounded">
                    {selectedForDelete.size} selected
                  </span>
                )}
              </div>
              {/* Search input */}
              <div className="relative mt-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                <Input
                  type="text"
                  placeholder="Search schemas by name or field..."
                  value={pickerSearchTerm}
                  onChange={(e) => setPickerSearchTerm(e.target.value)}
                  className="pl-9 pr-8"
                />
                {pickerSearchTerm && (
                  <button
                    onClick={() => setPickerSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-y-auto max-h-[50vh]">
              {Object.keys(filteredSchemasByService).length === 0 ? (
                <div className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                  No schemas match "{pickerSearchTerm}"
                </div>
              ) : (
                Object.entries(filteredSchemasByService).map(([service, schemas]) => (
                  <div key={service} className="border-b last:border-b-0">
                    <div className="px-4 py-2 bg-[hsl(var(--muted))] font-medium capitalize flex items-center justify-between">
                      <span>{service} ({schemas.length} entities)</span>
                      <button
                        onClick={() => {
                          const serviceSchemaKeys = schemas.map(s => `${s.service}:${s.entity}`);
                          const allSelected = serviceSchemaKeys.every(k => selectedForDelete.has(k));
                          const newSelected = new Set(selectedForDelete);
                          if (allSelected) {
                            serviceSchemaKeys.forEach(k => newSelected.delete(k));
                          } else {
                            serviceSchemaKeys.forEach(k => newSelected.add(k));
                          }
                          setSelectedForDelete(newSelected);
                        }}
                        className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                      >
                        {schemas.every(s => selectedForDelete.has(`${s.service}:${s.entity}`)) ? 'Deselect all' : 'Select all'}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1 p-2">
                      {schemas.map((schema) => {
                        const key = `${schema.service}:${schema.entity}`;
                        const isSelected = selectedForDelete.has(key);
                        return (
                          <button
                            key={key}
                            onClick={() => handleToggleSchemaSelection(schema.service, schema.entity)}
                            className={`p-3 text-left rounded-lg border transition-colors ${
                              isSelected
                                ? 'bg-[hsl(var(--destructive))]/10 border-[hsl(var(--destructive))]'
                                : 'hover:bg-[hsl(var(--muted))] border-transparent'
                            }`}
                          >
                            <div className="font-medium flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                className="rounded"
                              />
                              <HighlightText text={schema.entity} search={pickerSearchTerm} />
                            </div>
                            <div className="text-xs text-[hsl(var(--muted-foreground))] ml-6">
                              {schema.fields.length} fields
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
            <div className="border-t p-4 flex justify-between">
              <div>
                {selectedForDelete.size > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteSelectedSchemas}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete {selectedForDelete.size} Schema{selectedForDelete.size !== 1 ? 's' : ''}
                  </Button>
                )}
              </div>
              <Button variant="outline" onClick={() => setShowSchemaPicker(false)}>
                Close
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Import Modal */}
      <DataInputModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSchemaGenerated={handleSchemaGenerated}
        outputType="schema"
        existingSchemas={sourceSchemas}
      />
    </div>
  );
}
