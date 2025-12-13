import { useState, useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { ArrowRight, Plus, Trash2, Settings, GripVertical, Upload, Sparkles, Wand2, Link2, X, Edit2, Copy, GitMerge } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Select, Input, Modal } from '@/components/ui';
import { DataInputModal } from '@/components/DataInputModal';
import { useMigrationStore } from '@/store/migration';
import { mappingAPI } from '@/lib/api';
import type { FieldSchema, EntityMapping, FieldMapping, TransformType, SourceReference, EntitySchema } from '@/types/migration';
import { cn } from '@/lib/utils';

interface DraggableFieldProps {
  field: FieldSchema;
  isMapped: boolean;
  sourceService?: string;
  sourceEntity?: string;
  showSource?: boolean;
}

function DraggableField({ field, isMapped, sourceService, sourceEntity, showSource }: DraggableFieldProps) {
  const dragId = showSource && sourceService && sourceEntity
    ? `source-${sourceService}:${sourceEntity}:${field.name}`
    : `source-${field.name}`;

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId,
    data: { field, sourceService, sourceEntity },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        'flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-grab',
        isDragging && 'opacity-50',
        isMapped
          ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10'
          : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/50'
      )}
    >
      <GripVertical className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
      {showSource && sourceService && (
        <span className="text-xs text-[hsl(var(--muted-foreground))] bg-[hsl(var(--secondary))] px-1 py-0.5 rounded">
          {sourceService}
        </span>
      )}
      <span className="flex-1">{field.name}</span>
      <span className="text-xs text-[hsl(var(--muted-foreground))]">{field.type}</span>
      {field.required && <span className="text-xs text-[hsl(var(--destructive))]">*</span>}
    </div>
  );
}

interface DroppableTargetFieldProps {
  field: FieldSchema;
  mapping?: FieldMapping;
  onConfigure: () => void;
  onRemove: () => void;
  showSourceLabel?: boolean;
}

function DroppableTargetField({ field, mapping, onConfigure, onRemove, showSourceLabel }: DroppableTargetFieldProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `target-${field.name}`,
    data: { field },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex items-center gap-2 rounded-md border px-3 py-2 text-sm min-h-[42px]',
        isOver && 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10',
        mapping
          ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5'
          : field.required
          ? 'border-[hsl(var(--destructive))]/50 border-dashed'
          : 'border-[hsl(var(--border))] border-dashed'
      )}
    >
      {mapping ? (
        <>
          {showSourceLabel && mapping.source_service && (
            <span className="text-xs bg-[hsl(var(--accent))] px-1.5 py-0.5 rounded">
              {mapping.source_service}
            </span>
          )}
          <span className="flex-1 font-medium">{mapping.source_field}</span>
          <ArrowRight className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
          <span className="flex-1">{field.name}</span>
          <span className="text-xs text-[hsl(var(--muted-foreground))] bg-[hsl(var(--secondary))] px-1.5 py-0.5 rounded">
            {mapping.transform}
          </span>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onConfigure}>
            <Settings className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-[hsl(var(--destructive))]" onClick={onRemove}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </>
      ) : (
        <>
          <span className="flex-1 text-[hsl(var(--muted-foreground))]">Drop source field here</span>
          <span>{field.name}</span>
          <span className="text-xs text-[hsl(var(--muted-foreground))]">{field.type}</span>
          {field.required && <span className="text-xs text-[hsl(var(--destructive))]">*</span>}
        </>
      )}
    </div>
  );
}

interface TransformConfigModalProps {
  open: boolean;
  onClose: () => void;
  mapping: FieldMapping | null;
  transforms: TransformType[];
  onSave: (mapping: FieldMapping) => void;
}

function TransformConfigModal({ open, onClose, mapping, transforms, onSave }: TransformConfigModalProps) {
  const [transform, setTransform] = useState(mapping?.transform || 'direct');
  const [config, setConfig] = useState<Record<string, unknown>>(mapping?.config || {});

  useEffect(() => {
    if (mapping) {
      setTransform(mapping.transform);
      setConfig(mapping.config);
    }
  }, [mapping]);

  const selectedTransform = transforms.find((t) => t.name === transform);

  const handleSave = () => {
    if (mapping) {
      onSave({ ...mapping, transform, config });
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Configure Transformation">
      <div className="space-y-4">
        {mapping && (
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">{mapping.source_field}</span>
            <ArrowRight className="h-4 w-4" />
            <span className="font-medium">{mapping.target_field}</span>
          </div>
        )}

        <Select
          label="Transformation Type"
          options={transforms.map((t) => ({ value: t.name, label: `${t.name} - ${t.description}` }))}
          value={transform}
          onChange={(e) => {
            setTransform(e.target.value);
            setConfig({});
          }}
        />

        {selectedTransform && Object.keys(selectedTransform.config_schema).length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Configuration</h4>
            {Object.entries(selectedTransform.config_schema).map(([key, schema]: [string, any]) => (
              <div key={key}>
                {schema.type === 'object' ? (
                  <div>
                    <label className="mb-1.5 block text-sm">{key}</label>
                    <textarea
                      className="w-full rounded-md border border-[hsl(var(--input))] bg-transparent px-3 py-2 text-sm font-mono"
                      rows={4}
                      value={JSON.stringify(config[key] || {}, null, 2)}
                      onChange={(e) => {
                        try {
                          setConfig({ ...config, [key]: JSON.parse(e.target.value) });
                        } catch {
                          // Invalid JSON, ignore
                        }
                      }}
                      placeholder='{"source_value": "target_value"}'
                    />
                  </div>
                ) : schema.enum ? (
                  <Select
                    label={key}
                    options={schema.enum.map((v: string) => ({ value: v, label: v }))}
                    value={(config[key] as string) || ''}
                    onChange={(e) => setConfig({ ...config, [key]: e.target.value })}
                  />
                ) : (
                  <Input
                    label={key}
                    type={schema.type === 'boolean' ? 'checkbox' : 'text'}
                    value={(config[key] as string) || ''}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        [key]: schema.type === 'boolean' ? e.target.checked : e.target.value,
                      })
                    }
                    placeholder={schema.default?.toString()}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

// Entity Mapping Card - shows summary of a mapping with multi-source indicators
interface MappingCardProps {
  mapping: EntityMapping;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

function MappingCard({ mapping, isSelected, onSelect, onEdit, onDelete, onDuplicate }: MappingCardProps) {
  const isMultiSource = mapping.additional_sources && mapping.additional_sources.length > 0;
  const isMultiTarget = mapping.additional_targets && mapping.additional_targets.length > 0;

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

  // Check if join_config exists and has conditions
  const hasJoinConfig = isMultiSource && mapping.join_config;
  const joinConditions = hasJoinConfig ? mapping.join_config?.join_conditions || [] : [];

  return (
    <div
      onClick={onSelect}
      className={cn(
        'p-4 rounded-lg border cursor-pointer transition-all',
        isSelected
          ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5 ring-1 ring-[hsl(var(--primary))]'
          : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/50'
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Cardinality badge */}
          <div className={cn(
            "px-2 py-0.5 rounded-full text-xs font-medium",
            cardinality === '1:1' && "bg-gray-500/10 text-gray-600 dark:text-gray-400",
            cardinality === 'many:1' && "bg-purple-500/10 text-purple-600 dark:text-purple-400",
            cardinality === '1:many' && "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
            cardinality === 'many:many' && "bg-pink-500/10 text-pink-600 dark:text-pink-400"
          )}>
            {cardinality}
          </div>
          {isMultiSource && (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-full text-xs font-medium">
              <GitMerge className="h-3 w-3" />
              {allSources.length} sources
            </div>
          )}
          {isMultiTarget && (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 rounded-full text-xs font-medium">
              <GitMerge className="h-3 w-3 rotate-180" />
              {allTargets.length} targets
            </div>
          )}
          {hasJoinConfig && mapping.join_config?.type && (
            <div className="px-2 py-0.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-full text-xs font-medium uppercase">
              {mapping.join_config.type} join
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); onDuplicate(); }}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-[hsl(var(--destructive))]" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Source(s) -> Target(s) visualization */}
      <div className="flex items-center gap-3">
        {/* Sources */}
        <div className={cn("flex-1", isMultiSource && "space-y-1")}>
          {allSources.map((src, idx) => (
            <div
              key={`${src.service}:${src.entity}`}
              className={cn(
                "px-3 py-1.5 rounded text-sm font-medium flex items-center justify-between",
                idx === 0
                  ? "bg-blue-500/10 text-blue-700 dark:text-blue-400"
                  : "bg-green-500/10 text-green-700 dark:text-green-400"
              )}
            >
              <span>{src.service}.{src.entity}</span>
              {idx === 0 && isMultiSource && (
                <span className="text-[10px] opacity-70 ml-2">PRIMARY</span>
              )}
            </div>
          ))}
        </div>

        {/* Arrow with cardinality indicator */}
        <div className="flex flex-col items-center px-2">
          {(isMultiSource || isMultiTarget) && (
            <GitMerge className={cn(
              "h-5 w-5 mb-1",
              isMultiSource && !isMultiTarget && "text-purple-500",
              isMultiTarget && !isMultiSource && "text-cyan-500 rotate-180",
              isMultiSource && isMultiTarget && "text-pink-500"
            )} />
          )}
          <ArrowRight className="h-5 w-5 text-[hsl(var(--muted-foreground))]" />
        </div>

        {/* Targets */}
        <div className={cn("flex-1", isMultiTarget && "space-y-1")}>
          {allTargets.map((tgt, idx) => (
            <div
              key={`${tgt.service}:${tgt.entity}`}
              className={cn(
                "px-3 py-1.5 rounded text-sm font-medium flex items-center justify-between",
                idx === 0
                  ? "bg-orange-500/10 text-orange-700 dark:text-orange-400"
                  : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
              )}
            >
              <span>{tgt.service}.{tgt.entity}</span>
              {idx === 0 && isMultiTarget && (
                <span className="text-[10px] opacity-70 ml-2">PRIMARY</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Join details for multi-source - ALWAYS show if multi-source */}
      {isMultiSource && (
        <div className="mt-3 p-3 bg-purple-500/5 rounded-lg border border-purple-500/20">
          <div className="flex items-center gap-2 mb-2">
            <Link2 className="h-3.5 w-3.5 text-purple-500" />
            <span className="text-xs font-medium text-purple-600 dark:text-purple-400">Source Join Configuration</span>
          </div>
          {joinConditions.length > 0 ? (
            <div className="space-y-1">
              {joinConditions.map((jc, idx) => (
                <div key={idx} className="text-xs flex items-center gap-2">
                  <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-700 dark:text-blue-400 rounded">
                    {jc.left_source.entity}.{jc.left_field}
                  </span>
                  <span className="text-[hsl(var(--muted-foreground))]">=</span>
                  <span className="px-1.5 py-0.5 bg-green-500/10 text-green-700 dark:text-green-400 rounded">
                    {jc.right_source.entity}.{jc.right_field}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-[hsl(var(--muted-foreground))]">
              Join key: {mapping.additional_sources?.map(s => s.join_key || 'not configured').join(', ')}
            </div>
          )}
        </div>
      )}

      {/* Multi-target details */}
      {isMultiTarget && (
        <div className="mt-3 p-3 bg-cyan-500/5 rounded-lg border border-cyan-500/20">
          <div className="flex items-center gap-2 mb-2">
            <GitMerge className="h-3.5 w-3.5 text-cyan-500 rotate-180" />
            <span className="text-xs font-medium text-cyan-600 dark:text-cyan-400">Multiple Target Entities</span>
          </div>
          <div className="text-xs text-[hsl(var(--muted-foreground))]">
            Source data will be mapped to {allTargets.length} target entities
          </div>
        </div>
      )}

      {/* Field mapping count */}
      <div className="mt-3 flex items-center gap-4 text-xs text-[hsl(var(--muted-foreground))]">
        <span>{mapping.field_mappings.length} field mappings</span>
        {isMultiSource && (
          <span className="text-purple-500">{joinConditions.length} join condition(s)</span>
        )}
        {isMultiTarget && (
          <span className="text-cyan-500">{allTargets.length} targets</span>
        )}
      </div>
    </div>
  );
}

// Join Configuration Modal with proper state management
interface JoinConfigModalProps {
  open: boolean;
  onClose: () => void;
  sourceSchemas: EntitySchema[];
  selectedSourceKeys: string[];
  currentJoinConfig?: EntityMapping['join_config'];
  onSave: (joinConfig: EntityMapping['join_config']) => void;
}

function JoinConfigModal({ open, onClose, sourceSchemas, selectedSourceKeys, currentJoinConfig, onSave }: JoinConfigModalProps) {
  const [joinType, setJoinType] = useState<'inner' | 'left' | 'right' | 'full'>(currentJoinConfig?.type || 'left');
  const [joinConditions, setJoinConditions] = useState<Array<{
    left_source: SourceReference;
    left_field: string;
    right_source: SourceReference;
    right_field: string;
  }>>(currentJoinConfig?.join_conditions || []);

  const selectedSourceSchemas = selectedSourceKeys.map((key) => {
    const [service, entity] = key.split(':');
    return sourceSchemas.find((s) => s.service === service && s.entity === entity);
  }).filter(Boolean) as EntitySchema[];

  // Initialize join conditions if empty
  useEffect(() => {
    if (joinConditions.length === 0 && selectedSourceSchemas.length > 1) {
      const primary = selectedSourceSchemas[0];
      const initialConditions = selectedSourceSchemas.slice(1).map((schema) => ({
        left_source: { service: primary.service, entity: primary.entity },
        left_field: '',
        right_source: { service: schema.service, entity: schema.entity },
        right_field: '',
      }));
      setJoinConditions(initialConditions);
    }
  }, [selectedSourceSchemas, joinConditions.length]);

  const handleSave = () => {
    if (selectedSourceSchemas.length < 2) return;

    const primary = selectedSourceSchemas[0];
    onSave({
      type: joinType,
      primary_source: { service: primary.service, entity: primary.entity },
      join_conditions: joinConditions.filter(jc => jc.left_field && jc.right_field),
    });
    onClose();
  };

  const updateCondition = (index: number, field: string, value: string) => {
    const updated = [...joinConditions];
    if (field === 'left_field') {
      updated[index] = { ...updated[index], left_field: value };
    } else if (field === 'right_field') {
      updated[index] = { ...updated[index], right_field: value };
    }
    setJoinConditions(updated);
  };

  if (selectedSourceSchemas.length < 2) {
    return (
      <Modal open={open} onClose={onClose} title="Configure Join">
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Select at least 2 source entities to configure a join.
        </p>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Configure Multi-Source Join">
      <div className="space-y-6">
        {/* Visual Join Diagram */}
        <div className="p-4 bg-[hsl(var(--muted))]/50 rounded-lg">
          <div className="flex items-center justify-center gap-4">
            <div className="text-center">
              <div className="px-3 py-2 bg-blue-500/10 text-blue-700 dark:text-blue-400 rounded font-medium text-sm">
                {selectedSourceSchemas[0].service}.{selectedSourceSchemas[0].entity}
              </div>
              <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">Primary</div>
            </div>
            <div className="flex flex-col items-center">
              <GitMerge className="h-6 w-6 text-purple-500" />
              <span className="text-xs font-medium text-purple-500 uppercase mt-1">{joinType}</span>
            </div>
            <div className="space-y-2">
              {selectedSourceSchemas.slice(1).map((schema) => (
                <div key={`${schema.service}:${schema.entity}`} className="px-3 py-2 bg-green-500/10 text-green-700 dark:text-green-400 rounded font-medium text-sm text-center">
                  {schema.service}.{schema.entity}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Join Type Selection */}
        <div>
          <label className="block text-sm font-medium mb-2">Join Type</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 'left', label: 'Left Join', desc: 'All from primary + matching from others' },
              { value: 'inner', label: 'Inner Join', desc: 'Only matching records' },
              { value: 'right', label: 'Right Join', desc: 'All from secondary + matching from primary' },
              { value: 'full', label: 'Full Join', desc: 'All records from all sources' },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setJoinType(option.value as any)}
                className={cn(
                  'p-3 rounded-lg border text-left transition-colors',
                  joinType === option.value
                    ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10'
                    : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/50'
                )}
              >
                <div className="font-medium text-sm">{option.label}</div>
                <div className="text-xs text-[hsl(var(--muted-foreground))]">{option.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Join Conditions */}
        <div>
          <label className="block text-sm font-medium mb-2">Join Conditions</label>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mb-3">
            Specify which fields should be used to match records between sources.
          </p>
          <div className="space-y-3">
            {joinConditions.map((condition, index) => (
              <div key={index} className="p-4 border rounded-lg space-y-3 bg-[hsl(var(--card))]">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="px-2 py-0.5 bg-blue-500/10 text-blue-700 dark:text-blue-400 rounded">
                    {condition.left_source.entity}
                  </span>
                  <span>=</span>
                  <span className="px-2 py-0.5 bg-green-500/10 text-green-700 dark:text-green-400 rounded">
                    {condition.right_source.entity}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Select
                    label={`${condition.left_source.entity} field`}
                    options={selectedSourceSchemas[0]?.fields.map(f => ({ value: f.name, label: `${f.name} (${f.type})` })) || []}
                    value={condition.left_field}
                    onChange={(e) => updateCondition(index, 'left_field', e.target.value)}
                    placeholder="Select join field..."
                  />
                  <Select
                    label={`${condition.right_source.entity} field`}
                    options={selectedSourceSchemas.find(s => s.entity === condition.right_source.entity)?.fields.map(f => ({ value: f.name, label: `${f.name} (${f.type})` })) || []}
                    value={condition.right_field}
                    onChange={(e) => updateCondition(index, 'right_field', e.target.value)}
                    placeholder="Select join field..."
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Common join field suggestions */}
        <div className="p-3 bg-[hsl(var(--muted))]/30 rounded-lg">
          <div className="text-xs font-medium mb-2">Common Join Fields</div>
          <div className="flex flex-wrap gap-1">
            {['email', 'Email', 'id', 'Id', 'customer_id', 'AccountId', 'user_id'].map((field) => (
              <button
                key={field}
                onClick={() => {
                  // Auto-fill first empty condition with this field
                  const emptyIdx = joinConditions.findIndex(jc => !jc.left_field || !jc.right_field);
                  if (emptyIdx >= 0) {
                    const updated = [...joinConditions];
                    // Find matching fields in both schemas
                    const leftMatch = selectedSourceSchemas[0]?.fields.find(f => f.name.toLowerCase() === field.toLowerCase());
                    const rightSchema = selectedSourceSchemas.find(s => s.entity === joinConditions[emptyIdx].right_source.entity);
                    const rightMatch = rightSchema?.fields.find(f => f.name.toLowerCase() === field.toLowerCase());
                    if (leftMatch) updated[emptyIdx].left_field = leftMatch.name;
                    if (rightMatch) updated[emptyIdx].right_field = rightMatch.name;
                    setJoinConditions(updated);
                  }
                }}
                className="px-2 py-1 text-xs bg-[hsl(var(--background))] border rounded hover:border-[hsl(var(--primary))] transition-colors"
              >
                {field}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Join Configuration
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function MappingEditor() {
  const {
    sourceSchemas,
    targetSchema,
    setTargetSchema,
    entityMappings,
    setEntityMappings,
    addEntityMapping,
    availableSchemas,
  } = useMigrationStore();

  const [transforms, setTransforms] = useState<TransformType[]>([]);
  const [activeField, setActiveField] = useState<FieldSchema | null>(null);
  const [configureMapping, setConfigureMapping] = useState<FieldMapping | null>(null);
  const [selectedSourceKeys, setSelectedSourceKeys] = useState<string[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [multiSourceMode, setMultiSourceMode] = useState(false);
  const [showJoinConfig, setShowJoinConfig] = useState(false);
  const [selectedMappingIndex, setSelectedMappingIndex] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'edit'>('list');
  const [multiTargetMode, setMultiTargetMode] = useState(false);
  const [selectedTargetKeys, setSelectedTargetKeys] = useState<string[]>([]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // For single-source mode: parse first selected source
  const selectedSourceKey = selectedSourceKeys[0] || '';
  const [selectedSourceService, selectedSourceEntity] = selectedSourceKey.split(':');
  const selectedSourceSchema = sourceSchemas.find(
    (s) => s.service === selectedSourceService && s.entity === selectedSourceEntity
  );

  // For multi-source mode: get all selected schemas
  const selectedSourceSchemas = selectedSourceKeys.map((key) => {
    const [service, entity] = key.split(':');
    return sourceSchemas.find((s) => s.service === service && s.entity === entity);
  }).filter(Boolean) as EntitySchema[];

  // Get all target schemas (Chargebee schemas) - moved here so it can be used in effects
  const targetSchemas = availableSchemas.filter(s => s.service === 'chargebee');

  // Get current entity mapping based on selection
  const currentMapping = selectedMappingIndex !== null
    ? entityMappings[selectedMappingIndex]
    : entityMappings.find(
        (m) =>
          m.source_service === selectedSourceService &&
          m.source_entity === selectedSourceEntity &&
          m.target_service === targetSchema?.service &&
          m.target_entity === targetSchema?.entity
      );
  const fieldMappings = currentMapping?.field_mappings || [];

  // Load transforms
  useEffect(() => {
    const loadData = async () => {
      const transformsRes = await mappingAPI.getTransformTypes();
      if (transformsRes.data) {
        setTransforms(transformsRes.data.transforms);
      }
    };
    loadData();
  }, []);

  // Auto-select first source schema
  useEffect(() => {
    if (sourceSchemas.length > 0 && selectedSourceKeys.length === 0) {
      const first = sourceSchemas[0];
      setSelectedSourceKeys([`${first.service}:${first.entity}`]);
    }
  }, [sourceSchemas, selectedSourceKeys.length]);

  // When selecting a mapping from the list, update the source and target keys
  useEffect(() => {
    if (selectedMappingIndex !== null && entityMappings[selectedMappingIndex]) {
      const mapping = entityMappings[selectedMappingIndex];
      // Set source keys
      const sourceKeys = [`${mapping.source_service}:${mapping.source_entity}`];
      if (mapping.additional_sources) {
        mapping.additional_sources.forEach(src => {
          sourceKeys.push(`${src.service}:${src.entity}`);
        });
      }
      setSelectedSourceKeys(sourceKeys);
      setMultiSourceMode(sourceKeys.length > 1);

      // Set target keys
      const targetKeys = [`${mapping.target_service}:${mapping.target_entity}`];
      if (mapping.additional_targets) {
        mapping.additional_targets.forEach(tgt => {
          targetKeys.push(`${tgt.service}:${tgt.entity}`);
        });
      }
      setSelectedTargetKeys(targetKeys);
      setMultiTargetMode(targetKeys.length > 1);

      // Also set the primary target schema
      const primaryTargetSchema = targetSchemas.find(
        s => s.service === mapping.target_service && s.entity === mapping.target_entity
      );
      if (primaryTargetSchema) {
        setTargetSchema(primaryTargetSchema);
      }
    }
  }, [selectedMappingIndex, entityMappings, targetSchemas, setTargetSchema]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveField(event.active.data.current?.field);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveField(null);

    const { active, over } = event;
    if (!over || !targetSchema) return;

    const sourceField = active.data.current?.field as FieldSchema;
    const targetField = over.data.current?.field as FieldSchema;
    const dragSourceService = active.data.current?.sourceService || selectedSourceService;
    const dragSourceEntity = active.data.current?.sourceEntity || selectedSourceEntity;

    if (sourceField && targetField) {
      const newMapping: FieldMapping = {
        source_field: sourceField.name,
        target_field: targetField.name,
        transform: 'direct',
        config: {},
        source_service: multiSourceMode ? dragSourceService : undefined,
        source_entity: multiSourceMode ? dragSourceEntity : undefined,
      };

      const existingIndex = selectedMappingIndex !== null
        ? selectedMappingIndex
        : entityMappings.findIndex(
            (m) =>
              m.source_service === dragSourceService &&
              m.source_entity === dragSourceEntity &&
              m.target_service === targetSchema.service &&
              m.target_entity === targetSchema.entity
          );

      if (existingIndex >= 0) {
        const updated = { ...entityMappings[existingIndex] };
        const fieldIndex = updated.field_mappings.findIndex((f) => f.target_field === targetField.name);

        if (fieldIndex >= 0) {
          updated.field_mappings[fieldIndex] = newMapping;
        } else {
          updated.field_mappings = [...updated.field_mappings, newMapping];
        }

        if (multiSourceMode && selectedSourceKeys.length > 1) {
          const additionalSources: SourceReference[] = selectedSourceKeys
            .filter((key) => key !== `${updated.source_service}:${updated.source_entity}`)
            .map((key) => {
              const [service, entity] = key.split(':');
              return { service, entity };
            });
          updated.additional_sources = additionalSources;
        }

        const newEntityMappings = [...entityMappings];
        newEntityMappings[existingIndex] = updated;
        setEntityMappings(newEntityMappings);
      } else {
        const newEntityMapping: EntityMapping = {
          source_service: dragSourceService,
          source_entity: dragSourceEntity,
          target_service: targetSchema.service,
          target_entity: targetSchema.entity,
          field_mappings: [newMapping],
          additional_sources: multiSourceMode && selectedSourceKeys.length > 1
            ? selectedSourceKeys
                .filter((key) => key !== `${dragSourceService}:${dragSourceEntity}`)
                .map((key) => {
                  const [service, entity] = key.split(':');
                  return { service, entity };
                })
            : undefined,
        };
        setEntityMappings([...entityMappings, newEntityMapping]);
        setSelectedMappingIndex(entityMappings.length);
      }
    }
  };

  const handleRemoveMapping = (targetField: string) => {
    if (selectedMappingIndex === null) return;

    const updated = { ...entityMappings[selectedMappingIndex] };
    updated.field_mappings = updated.field_mappings.filter((f) => f.target_field !== targetField);

    const newEntityMappings = [...entityMappings];
    newEntityMappings[selectedMappingIndex] = updated;
    setEntityMappings(newEntityMappings);
  };

  const handleUpdateMapping = (updatedMapping: FieldMapping) => {
    if (selectedMappingIndex === null) return;

    const updated = { ...entityMappings[selectedMappingIndex] };
    const fieldIndex = updated.field_mappings.findIndex((f) => f.target_field === updatedMapping.target_field);

    if (fieldIndex >= 0) {
      updated.field_mappings = [...updated.field_mappings];
      updated.field_mappings[fieldIndex] = updatedMapping;
    }

    const newEntityMappings = [...entityMappings];
    newEntityMappings[selectedMappingIndex] = updated;
    setEntityMappings(newEntityMappings);
  };

  const handleDeleteEntityMapping = (index: number) => {
    const newMappings = entityMappings.filter((_, i) => i !== index);
    setEntityMappings(newMappings);
    if (selectedMappingIndex === index) {
      setSelectedMappingIndex(null);
      setViewMode('list');
    } else if (selectedMappingIndex !== null && selectedMappingIndex > index) {
      setSelectedMappingIndex(selectedMappingIndex - 1);
    }
  };

  const handleDuplicateMapping = (index: number) => {
    const original = entityMappings[index];
    const duplicate: EntityMapping = {
      ...original,
      field_mappings: [...original.field_mappings],
      additional_sources: original.additional_sources ? [...original.additional_sources] : undefined,
      join_config: original.join_config ? { ...original.join_config } : undefined,
    };
    setEntityMappings([...entityMappings, duplicate]);
  };

  const handleMappingGenerated = (mapping: EntityMapping) => {
    const existingIndex = entityMappings.findIndex(
      (m) =>
        m.source_service === mapping.source_service &&
        m.source_entity === mapping.source_entity &&
        m.target_service === mapping.target_service &&
        m.target_entity === mapping.target_entity
    );

    if (existingIndex >= 0) {
      const newEntityMappings = [...entityMappings];
      newEntityMappings[existingIndex] = mapping;
      setEntityMappings(newEntityMappings);
    } else {
      addEntityMapping(mapping);
    }
  };

  const handleAiSuggestMappings = async () => {
    if (!selectedSourceSchema || !targetSchema) return;

    setAiSuggesting(true);
    try {
      const response = await fetch('/api/ai/suggest-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_schema: selectedSourceSchema,
          target_schema: targetSchema,
          existing_mappings: fieldMappings,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.mappings) {
          handleMappingGenerated({
            source_service: selectedSourceService,
            source_entity: selectedSourceEntity,
            target_service: targetSchema.service,
            target_entity: targetSchema.entity,
            field_mappings: result.mappings,
          });
        }
      }
    } catch (error) {
      console.error('AI suggestion failed:', error);
    } finally {
      setAiSuggesting(false);
    }
  };

  const handleSaveJoinConfig = (joinConfig: EntityMapping['join_config']) => {
    if (selectedMappingIndex !== null) {
      const updated = { ...entityMappings[selectedMappingIndex], join_config: joinConfig };
      const newEntityMappings = [...entityMappings];
      newEntityMappings[selectedMappingIndex] = updated;
      setEntityMappings(newEntityMappings);
    }
  };

  const handleCreateNewMapping = () => {
    if (!targetSchema || selectedSourceKeys.length === 0) return;

    const [primaryService, primaryEntity] = selectedSourceKeys[0].split(':');

    // Get target keys
    const targetKeysToUse = multiTargetMode && selectedTargetKeys.length > 0
      ? selectedTargetKeys
      : [`${targetSchema.service}:${targetSchema.entity}`];

    const [primaryTargetService, primaryTargetEntity] = targetKeysToUse[0].split(':');

    const newMapping: EntityMapping = {
      source_service: primaryService,
      source_entity: primaryEntity,
      target_service: primaryTargetService,
      target_entity: primaryTargetEntity,
      field_mappings: [],
      additional_sources: multiSourceMode && selectedSourceKeys.length > 1
        ? selectedSourceKeys.slice(1).map((key) => {
            const [service, entity] = key.split(':');
            return { service, entity };
          })
        : undefined,
      additional_targets: multiTargetMode && targetKeysToUse.length > 1
        ? targetKeysToUse.slice(1).map((key) => {
            const [service, entity] = key.split(':');
            return { service, entity };
          })
        : undefined,
      cardinality: (multiSourceMode && selectedSourceKeys.length > 1) && (multiTargetMode && targetKeysToUse.length > 1)
        ? 'many:many'
        : multiSourceMode && selectedSourceKeys.length > 1
          ? 'many:1'
          : multiTargetMode && targetKeysToUse.length > 1
            ? '1:many'
            : '1:1',
    };

    setEntityMappings([...entityMappings, newMapping]);
    setSelectedMappingIndex(entityMappings.length);
    setViewMode('edit');
  };

  const getMappingForTarget = (targetField: string) => {
    return fieldMappings.find((m) => m.target_field === targetField);
  };

  const isSourceMapped = (sourceField: string, sourceService?: string, sourceEntity?: string) => {
    return fieldMappings.some((m) => {
      if (multiSourceMode && sourceService && sourceEntity) {
        return m.source_field === sourceField &&
               m.source_service === sourceService &&
               m.source_entity === sourceEntity;
      }
      return m.source_field === sourceField;
    });
  };

  const sourceOptions = sourceSchemas.map((s) => ({
    value: `${s.service}:${s.entity}`,
    label: `${s.service}.${s.entity}`,
  }));

  const targetOptions = targetSchemas.map((s) => ({
    value: `${s.service}:${s.entity}`,
    label: `${s.entity}`,
  }));

  // Group mappings by target service/entity for organized display
  const mappingsByTarget = entityMappings.reduce((acc, mapping, index) => {
    const key = `${mapping.target_service}:${mapping.target_entity}`;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push({ mapping, index });
    return acc;
  }, {} as Record<string, { mapping: EntityMapping; index: number }[]>);

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold mb-1">Mapping Editor</h2>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {entityMappings.length} entity mappings configured
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === 'list' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setViewMode('list')}
            >
              All Mappings
            </Button>
            <Button
              variant={viewMode === 'edit' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setViewMode('edit')}
              disabled={entityMappings.length === 0}
            >
              Field Editor
            </Button>
          </div>
        </div>

        {viewMode === 'list' ? (
          <>
            {/* Quick Stats */}
            <div className="grid grid-cols-4 gap-4">
              <Card>
                <CardContent className="py-4">
                  <div className="text-2xl font-bold">{entityMappings.length}</div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">Entity Mappings</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4">
                  <div className="text-2xl font-bold">
                    {entityMappings.reduce((sum, em) => sum + em.field_mappings.length, 0)}
                  </div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">Field Mappings</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4">
                  <div className="text-2xl font-bold text-purple-600">
                    {entityMappings.filter(em => em.additional_sources && em.additional_sources.length > 0).length}
                  </div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">Multi-Source Joins</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4">
                  <div className="text-2xl font-bold">
                    {new Set(entityMappings.map(em => `${em.target_service}:${em.target_entity}`)).size}
                  </div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">Target Entities</div>
                </CardContent>
              </Card>
            </div>

            {/* Mapping List View - Grouped by Target */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Entity Mappings by Target</CardTitle>
                    <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                      {Object.keys(mappingsByTarget).length} Chargebee entities have mappings configured
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowImportModal(true)}>
                      <Upload className="h-4 w-4 mr-2" />
                      Import
                    </Button>
                    <Button size="sm" onClick={() => { setSelectedMappingIndex(null); setViewMode('edit'); }}>
                      <Plus className="h-4 w-4 mr-2" />
                      New Mapping
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {entityMappings.length === 0 ? (
                  <div className="text-center py-8">
                    <GitMerge className="h-12 w-12 mx-auto mb-3 text-[hsl(var(--muted-foreground))]" />
                    <p className="text-[hsl(var(--muted-foreground))] mb-4">
                      No entity mappings configured yet.
                    </p>
                    <Button onClick={() => setViewMode('edit')}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create First Mapping
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Grouped by target entity */}
                    {Object.entries(mappingsByTarget).map(([targetKey, mappings]) => {
                      const [targetService, targetEntity] = targetKey.split(':');
                      const multiSourceCount = mappings.filter(
                        m => m.mapping.additional_sources && m.mapping.additional_sources.length > 0
                      ).length;

                      return (
                        <div key={targetKey} className="border rounded-lg overflow-hidden">
                          {/* Target header */}
                          <div className="bg-orange-500/10 px-4 py-3 border-b">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="px-3 py-1 bg-orange-500/20 rounded-full text-orange-700 dark:text-orange-400 text-sm font-semibold">
                                  {targetService}.{targetEntity}
                                </div>
                                <span className="text-sm text-[hsl(var(--muted-foreground))]">
                                  {mappings.length} mapping{mappings.length !== 1 ? 's' : ''}
                                </span>
                                {multiSourceCount > 0 && (
                                  <span className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400">
                                    <GitMerge className="h-3 w-3" />
                                    {multiSourceCount} multi-source
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Mappings for this target */}
                          <div className="p-4 space-y-3">
                            {mappings.map(({ mapping, index }) => (
                              <MappingCard
                                key={`${mapping.source_service}:${mapping.source_entity}:${mapping.target_entity}:${index}`}
                                mapping={mapping}
                                isSelected={selectedMappingIndex === index}
                                onSelect={() => {
                                  setSelectedMappingIndex(index);
                                  setViewMode('edit');
                                }}
                                onEdit={() => {
                                  setSelectedMappingIndex(index);
                                  setViewMode('edit');
                                }}
                                onDelete={() => handleDeleteEntityMapping(index)}
                                onDuplicate={() => handleDuplicateMapping(index)}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* All Chargebee Target Entities */}
            <Card>
              <CardHeader>
                <CardTitle>All Chargebee Target Entities</CardTitle>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  {targetSchemas.length} available target entities
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {targetSchemas.map((schema) => {
                    const hasMappings = mappingsByTarget[`${schema.service}:${schema.entity}`];
                    const mappingCount = hasMappings?.length || 0;
                    return (
                      <button
                        key={`${schema.service}:${schema.entity}`}
                        onClick={() => {
                          setTargetSchema(schema);
                          setViewMode('edit');
                        }}
                        className={cn(
                          'p-3 rounded-lg border text-left transition-all hover:border-[hsl(var(--primary))]',
                          hasMappings
                            ? 'border-orange-500/50 bg-orange-500/5'
                            : 'border-[hsl(var(--border))]'
                        )}
                      >
                        <div className="font-medium text-sm">{schema.entity}</div>
                        <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                          {mappingCount > 0 ? (
                            <span className="text-orange-600 dark:text-orange-400">{mappingCount} mapping(s)</span>
                          ) : (
                            <span>No mappings</span>
                          )}
                        </div>
                        <div className="text-xs text-[hsl(var(--muted-foreground))]">
                          {schema.fields.length} fields
                        </div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            {/* Field Editor View */}
            {/* AI Suggestion Card */}
            <Card className="bg-gradient-to-r from-[hsl(var(--primary))]/5 to-[hsl(var(--primary))]/10 border-[hsl(var(--primary))]/20">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-3">
                    <Sparkles className="h-5 w-5 text-[hsl(var(--primary))] mt-0.5" />
                    <div>
                      <h3 className="font-medium mb-1">AI-Powered Mapping</h3>
                      <p className="text-sm text-[hsl(var(--muted-foreground))]">
                        Drag and drop fields or use AI to suggest mappings.
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={handleAiSuggestMappings}
                    disabled={!selectedSourceSchema || !targetSchema || aiSuggesting}
                  >
                    <Wand2 className="h-4 w-4 mr-2" />
                    {aiSuggesting ? 'Suggesting...' : 'AI Suggest'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Entity Selection */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>
                    {selectedMappingIndex !== null ? 'Edit Mapping' : 'New Mapping'}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={multiSourceMode}
                        onChange={(e) => {
                          setMultiSourceMode(e.target.checked);
                          if (!e.target.checked && selectedSourceKeys.length > 1) {
                            setSelectedSourceKeys([selectedSourceKeys[0]]);
                          }
                        }}
                        className="rounded"
                      />
                      <GitMerge className="h-4 w-4 text-purple-500" />
                      Multi-Source Join
                    </label>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  {multiSourceMode ? (
                    <div>
                      <label className="mb-1.5 block text-sm font-medium">Source Entities (Join)</label>
                      <div className="space-y-2">
                        {selectedSourceKeys.map((key, index) => (
                          <div key={key} className="flex items-center gap-2">
                            <div className={cn(
                              "w-2 h-2 rounded-full",
                              index === 0 ? "bg-blue-500" : "bg-green-500"
                            )} />
                            <Select
                              options={sourceOptions}
                              value={key}
                              onChange={(e) => {
                                const newKeys = [...selectedSourceKeys];
                                newKeys[index] = e.target.value;
                                setSelectedSourceKeys(newKeys);
                              }}
                              placeholder="Select source entity"
                            />
                            {selectedSourceKeys.length > 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-[hsl(var(--destructive))]"
                                onClick={() => {
                                  setSelectedSourceKeys(selectedSourceKeys.filter((_, i) => i !== index));
                                }}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const availableOptions = sourceOptions.filter(
                                (opt) => !selectedSourceKeys.includes(opt.value)
                              );
                              if (availableOptions.length > 0) {
                                setSelectedSourceKeys([...selectedSourceKeys, availableOptions[0].value]);
                              }
                            }}
                            disabled={selectedSourceKeys.length >= sourceOptions.length}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Add Source
                          </Button>
                          {selectedSourceKeys.length > 1 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setShowJoinConfig(true)}
                            >
                              <Settings className="h-3 w-3 mr-1" />
                              Configure Join
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <Select
                      label="Source Entity"
                      options={sourceOptions}
                      value={selectedSourceKey}
                      onChange={(e) => setSelectedSourceKeys([e.target.value])}
                      placeholder="Select source entity"
                    />
                  )}
                  {multiTargetMode ? (
                    <div>
                      <label className="mb-1.5 block text-sm font-medium">Target Entities (1:Many)</label>
                      <div className="space-y-2">
                        {selectedTargetKeys.map((key, index) => (
                          <div key={key} className="flex items-center gap-2">
                            <div className={cn(
                              "w-2 h-2 rounded-full",
                              index === 0 ? "bg-orange-500" : "bg-amber-500"
                            )} />
                            <Select
                              options={targetOptions}
                              value={key}
                              onChange={(e) => {
                                const newKeys = [...selectedTargetKeys];
                                newKeys[index] = e.target.value;
                                setSelectedTargetKeys(newKeys);
                                // Update primary target schema if first key changed
                                if (index === 0) {
                                  const [service, entity] = e.target.value.split(':');
                                  const schema = targetSchemas.find(s => s.service === service && s.entity === entity);
                                  if (schema) setTargetSchema(schema);
                                }
                              }}
                              placeholder="Select target entity"
                            />
                            {selectedTargetKeys.length > 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-[hsl(var(--destructive))]"
                                onClick={() => {
                                  setSelectedTargetKeys(selectedTargetKeys.filter((_, i) => i !== index));
                                }}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const availableOptions = targetOptions.filter(
                              (opt) => !selectedTargetKeys.includes(opt.value)
                            );
                            if (availableOptions.length > 0) {
                              setSelectedTargetKeys([...selectedTargetKeys, availableOptions[0].value]);
                            }
                          }}
                          disabled={selectedTargetKeys.length >= targetOptions.length}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add Target
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="mb-1.5 block text-sm font-medium">Target Entity</label>
                      <Select
                        options={targetOptions}
                        value={targetSchema ? `${targetSchema.service}:${targetSchema.entity}` : ''}
                        onChange={(e) => {
                          const [service, entity] = e.target.value.split(':');
                          const schema = targetSchemas.find(s => s.service === service && s.entity === entity);
                          if (schema) {
                            setTargetSchema(schema);
                            setSelectedTargetKeys([e.target.value]);
                          }
                        }}
                        placeholder="Select target entity"
                      />
                    </div>
                  )}
                </div>

                {/* Multi-target toggle */}
                <div className="mt-2 flex items-center gap-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={multiTargetMode}
                      onChange={(e) => {
                        setMultiTargetMode(e.target.checked);
                        if (e.target.checked && selectedTargetKeys.length === 0 && targetSchema) {
                          setSelectedTargetKeys([`${targetSchema.service}:${targetSchema.entity}`]);
                        } else if (!e.target.checked && selectedTargetKeys.length > 1) {
                          setSelectedTargetKeys([selectedTargetKeys[0]]);
                        }
                      }}
                      className="rounded"
                    />
                    <GitMerge className="h-4 w-4 text-cyan-500 rotate-180" />
                    1:Many Mapping (one source to multiple targets)
                  </label>
                </div>

                {/* Create/Update button */}
                {selectedMappingIndex === null && (
                  <div className="mt-4 flex justify-end">
                    <Button onClick={handleCreateNewMapping} disabled={!targetSchema || selectedSourceKeys.length === 0}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Mapping
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Field Mapping */}
            {(selectedMappingIndex !== null || currentMapping) && targetSchema ? (
              <div className="grid grid-cols-2 gap-6">
                {/* Source Fields */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {multiSourceMode
                        ? `Sources: ${selectedSourceSchemas.map(s => `${s.service}.${s.entity}`).join(' + ')}`
                        : `Source: ${selectedSourceService}.${selectedSourceEntity}`}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="max-h-[500px] overflow-y-auto">
                    <div className="space-y-2">
                      {multiSourceMode ? (
                        selectedSourceSchemas.length === 0 ? (
                          <p className="text-sm text-[hsl(var(--muted-foreground))] text-center py-4">
                            Select source entities to see fields.
                          </p>
                        ) : (
                          selectedSourceSchemas.map((schema, schemaIndex) => (
                            <div key={`${schema.service}:${schema.entity}`} className="mb-4">
                              <div className={cn(
                                "flex items-center gap-2 text-xs font-medium mb-2 uppercase px-2 py-1 rounded",
                                schemaIndex === 0 ? "bg-blue-500/10 text-blue-700 dark:text-blue-400" : "bg-green-500/10 text-green-700 dark:text-green-400"
                              )}>
                                {schema.service}.{schema.entity}
                              </div>
                              <div className="space-y-1">
                                {schema.fields.map((field) => (
                                  <DraggableField
                                    key={`${schema.service}:${schema.entity}:${field.name}`}
                                    field={field}
                                    isMapped={isSourceMapped(field.name, schema.service, schema.entity)}
                                    sourceService={schema.service}
                                    sourceEntity={schema.entity}
                                    showSource={true}
                                  />
                                ))}
                              </div>
                            </div>
                          ))
                        )
                      ) : (
                        selectedSourceSchema?.fields.length === 0 ? (
                          <p className="text-sm text-[hsl(var(--muted-foreground))] text-center py-4">
                            No fields in this schema.
                          </p>
                        ) : (
                          selectedSourceSchema?.fields.map((field) => (
                            <DraggableField key={field.name} field={field} isMapped={isSourceMapped(field.name)} />
                          ))
                        )
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Target Fields */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Target: {targetSchema.service}.{targetSchema.entity}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="max-h-[500px] overflow-y-auto">
                    <div className="space-y-2">
                      {targetSchema.fields.length === 0 ? (
                        <p className="text-sm text-[hsl(var(--muted-foreground))] text-center py-4">
                          No fields in target schema.
                        </p>
                      ) : (
                        targetSchema.fields.map((field) => (
                          <DroppableTargetField
                            key={field.name}
                            field={field}
                            mapping={getMappingForTarget(field.name)}
                            onConfigure={() => setConfigureMapping(getMappingForTarget(field.name) || null)}
                            onRemove={() => handleRemoveMapping(field.name)}
                            showSourceLabel={multiSourceMode}
                          />
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center">
                  <p className="text-[hsl(var(--muted-foreground))]">
                    {!targetSchema
                      ? 'Define a target schema in the Schemas tab first.'
                      : 'Select source entities and create a mapping to start.'}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Mapping Summary */}
            {currentMapping && (
              <Card>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm">
                        <span className="font-medium">{fieldMappings.length}</span> field mappings
                        {multiSourceMode && currentMapping.join_config && (
                          <span className="ml-2 text-purple-600">
                            ({currentMapping.join_config.type} join on {currentMapping.join_config.join_conditions?.length || 0} field(s))
                          </span>
                        )}
                      </p>
                      {targetSchema && (
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">
                          {targetSchema.fields.filter((f) => f.required && !getMappingForTarget(f.name)).length} required
                          fields unmapped
                        </p>
                      )}
                    </div>
                    <Button variant="outline" onClick={() => setViewMode('list')}>
                      Back to List
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeField && (
          <div className="rounded-md border border-[hsl(var(--primary))] bg-[hsl(var(--card))] px-3 py-2 text-sm shadow-lg">
            <span>{activeField.name}</span>
          </div>
        )}
      </DragOverlay>

      {/* Transform Config Modal */}
      <TransformConfigModal
        open={!!configureMapping}
        onClose={() => setConfigureMapping(null)}
        mapping={configureMapping}
        transforms={transforms}
        onSave={handleUpdateMapping}
      />

      {/* Import Modal */}
      <DataInputModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        onMappingGenerated={handleMappingGenerated}
        outputType="mapping"
        existingSchemas={sourceSchemas}
      />

      {/* Join Configuration Modal */}
      <JoinConfigModal
        open={showJoinConfig}
        onClose={() => setShowJoinConfig(false)}
        sourceSchemas={sourceSchemas}
        selectedSourceKeys={selectedSourceKeys}
        currentJoinConfig={currentMapping?.join_config}
        onSave={handleSaveJoinConfig}
      />
    </DndContext>
  );
}
