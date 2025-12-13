import { useState } from 'react';
import { Plus, Trash2, Edit2, Check, X, ChevronDown, ChevronRight, Upload, Sparkles, Database } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Select } from '@/components/ui';
import { DataInputModal } from '@/components/DataInputModal';
import { useMigrationStore } from '@/store/migration';
import type { EntitySchema, FieldSchema } from '@/types/migration';

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
    sourceSchemas,
    targetSchema,
    addSourceSchema,
    updateSourceSchema,
    removeSourceSchema,
    setTargetSchema,
  } = useMigrationStore();

  const [showImportModal, setShowImportModal] = useState(false);
  const [importTarget, setImportTarget] = useState<'source' | 'target'>('source');
  const [showSchemaPicker, setShowSchemaPicker] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<'source' | 'target'>('source');

  // Group available schemas by service
  const schemasByService = availableSchemas.reduce((acc, schema) => {
    if (!acc[schema.service]) {
      acc[schema.service] = [];
    }
    acc[schema.service].push(schema);
    return acc;
  }, {} as Record<string, EntitySchema[]>);

  const handlePickSchema = (schema: EntitySchema) => {
    if (pickerTarget === 'source') {
      // Check if already added
      const exists = sourceSchemas.some(
        (s) => s.service === schema.service && s.entity === schema.entity
      );
      if (!exists) {
        addSourceSchema(schema);
      }
    } else {
      setTargetSchema(schema);
    }
    setShowSchemaPicker(false);
  };

  const openSourcePicker = () => {
    setPickerTarget('source');
    setShowSchemaPicker(true);
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold mb-2">Schema Builder</h2>
        <p className="text-[hsl(var(--muted-foreground))]">
          Import schemas from files, APIs, screenshots, or web pages. AI will help transform your data into structured schemas.
        </p>
      </div>

      {/* Import Options Info */}
      <Card className="bg-gradient-to-r from-[hsl(var(--primary))]/5 to-[hsl(var(--primary))]/10 border-[hsl(var(--primary))]/20">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-[hsl(var(--primary))] mt-0.5" />
            <div>
              <h3 className="font-medium mb-1">AI-Powered Schema Import</h3>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mb-3">
                Import schemas from multiple sources with AI assistance:
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  <span>JSON/CSV files</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  <span>API endpoints</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                  <span>Screenshots</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                  <span>Web scraping</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Source Schemas */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium">Source Schemas ({sourceSchemas.length})</h3>
          <div className="flex gap-2">
            <Button onClick={openSourcePicker} variant="outline">
              <Database className="h-4 w-4 mr-2" />
              Browse Schemas
            </Button>
            <Button onClick={handleImportSource}>
              <Upload className="h-4 w-4 mr-2" />
              Import Custom
            </Button>
          </div>
        </div>
        {sourceSchemas.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center">
              <Database className="h-8 w-8 mx-auto mb-3 text-[hsl(var(--muted-foreground))]" />
              <p className="text-[hsl(var(--muted-foreground))] mb-3">No source schemas defined.</p>
              <div className="flex gap-2 justify-center">
                <Button onClick={openSourcePicker} variant="outline">
                  <Database className="h-4 w-4 mr-2" />
                  Browse Available Schemas
                </Button>
                <Button onClick={handleImportSource}>
                  <Upload className="h-4 w-4 mr-2" />
                  Import Custom Schema
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {sourceSchemas.map((schema) => (
              <SchemaEditorCard
                key={`${schema.service}-${schema.entity}`}
                schema={schema}
                onUpdate={(updated) => updateSourceSchema(schema.service, schema.entity, updated)}
                onDelete={() => removeSourceSchema(schema.service, schema.entity)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Target Schemas - Show All Chargebee */}
      <div>
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
            Import Custom
          </Button>
        </div>
        {(schemasByService['chargebee'] || []).length > 0 ? (
          <div className="grid gap-4 max-h-[600px] overflow-y-auto">
            {(schemasByService['chargebee'] || []).map((schema) => (
              <SchemaEditorCard
                key={`${schema.service}-${schema.entity}`}
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
                Import Custom Target
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Schema Picker Modal */}
      {showSchemaPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowSchemaPicker(false)}
          />
          <Card className="relative z-10 w-full max-w-2xl max-h-[80vh] overflow-hidden">
            <CardHeader className="border-b">
              <CardTitle>
                Select {pickerTarget === 'source' ? 'Source' : 'Target'} Schema
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-y-auto max-h-[60vh]">
              {Object.entries(schemasByService).map(([service, schemas]) => (
                <div key={service} className="border-b last:border-b-0">
                  <div className="px-4 py-2 bg-[hsl(var(--muted))] font-medium capitalize">
                    {service} ({schemas.length} entities)
                  </div>
                  <div className="grid grid-cols-2 gap-1 p-2">
                    {schemas.map((schema) => {
                      const isSelected = pickerTarget === 'source'
                        ? sourceSchemas.some(s => s.service === schema.service && s.entity === schema.entity)
                        : targetSchema?.service === schema.service && targetSchema?.entity === schema.entity;
                      return (
                        <button
                          key={`${schema.service}-${schema.entity}`}
                          onClick={() => handlePickSchema(schema)}
                          className={`p-3 text-left rounded-lg border transition-colors ${
                            isSelected
                              ? 'bg-[hsl(var(--primary))]/10 border-[hsl(var(--primary))] text-[hsl(var(--primary))]'
                              : 'hover:bg-[hsl(var(--muted))] border-transparent'
                          }`}
                        >
                          <div className="font-medium">{schema.entity}</div>
                          <div className="text-xs text-[hsl(var(--muted-foreground))]">
                            {schema.fields.length} fields
                            {isSelected && ' (selected)'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </CardContent>
            <div className="border-t p-4 flex justify-end">
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
