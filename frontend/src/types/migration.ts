export type DataSourceType = 'api' | 'csv' | 'json' | 'screenshot' | 'web_scrape';

export type MigrationStatus =
  | 'draft'
  | 'pending'
  | 'extracting'
  | 'transforming'
  | 'validating'
  | 'loading'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused';

export interface DataSource {
  type: DataSourceType;
  name: string;
  service: string;
  entity: string;
  api_key?: string;
  api_endpoint?: string;
  file_path?: string;
  url?: string;
  browser_instructions?: string;
  screenshot_path?: string;
  batch_size: number;
  rate_limit?: number;
  filters: Record<string, unknown>;
}

export interface FieldMapping {
  source_field: string;
  target_field: string;
  transform: string;
  config: Record<string, unknown>;
  // For multi-source joins: specify which source schema this field comes from
  source_service?: string;
  source_entity?: string;
}

// Source reference for multi-source mappings
export interface SourceReference {
  service: string;
  entity: string;
  join_key?: string; // Field to join on (e.g., 'customer_id', 'email')
}

// Target reference for 1:many mappings (one source to multiple targets)
export interface TargetReference {
  service: string;
  entity: string;
  // Filter/condition for which records go to this target (optional)
  filter_condition?: string;
}

// Configuration for many-to-one mappings (grouping multiple source rows into one target)
export interface GroupByConfig {
  // Fields to group by (these fields determine unique target records)
  group_by_fields: string[];
  // Aggregation rules for non-group-by fields
  aggregations?: Array<{
    source_field: string;
    target_field: string;
    function: 'first' | 'last' | 'sum' | 'count' | 'min' | 'max' | 'concat' | 'array';
    separator?: string; // For concat aggregation
  }>;
}

// Configuration for one-to-many mappings (splitting one source row into multiple targets)
export interface SplitConfig {
  // Field containing the value to split
  split_field: string;
  // Delimiter to use for splitting
  delimiter: string;
  // Target field where split values will be placed
  target_field: string;
  // Whether to trim whitespace from split values
  trim_values?: boolean;
  // Optional: fields to copy to all split records
  copy_fields?: string[];
}

export interface EntityMapping {
  source_service: string;
  source_entity: string;
  target_service: string;
  target_entity: string;
  field_mappings: FieldMapping[];
  // For multi-source joins (many:1): additional sources that contribute to this target
  additional_sources?: SourceReference[];
  // Join configuration for multi-source mappings
  join_config?: {
    type: 'inner' | 'left' | 'right' | 'full';
    primary_source: SourceReference;
    join_conditions: Array<{
      left_source: SourceReference;
      left_field: string;
      right_source: SourceReference;
      right_field: string;
    }>;
  };
  // For 1:many mappings: additional targets that this source maps to
  additional_targets?: TargetReference[];
  // Mapping cardinality indicator
  cardinality?: '1:1' | '1:many' | 'many:1' | 'many:many';
  // Group-by configuration for many:1 mappings
  group_by_config?: GroupByConfig;
  // Split configuration for 1:many mappings
  split_config?: SplitConfig;
}

export interface MigrationStep {
  id: string;
  name: string;
  entity: string;
  status: string;
  started_at?: string;
  completed_at?: string;
  records_processed: number;
  records_succeeded: number;
  records_failed: number;
  errors: Array<Record<string, unknown>>;
}

export interface Migration {
  id: string;
  name: string;
  description: string;
  status: MigrationStatus;
  sources: DataSource[];
  target_service: string;
  target_site?: string;
  entity_mappings: EntityMapping[];
  dry_run: boolean;
  batch_size: number;
  created_at: string;
  updated_at?: string;
  started_at?: string;
  completed_at?: string;
  steps: MigrationStep[];
  total_records_processed: number;
  total_records_succeeded: number;
  total_records_failed: number;
}

export interface MigrationCreate {
  name: string;
  description?: string;
  sources?: DataSource[];
  target_service?: string;
  target_api_key?: string;
  target_site?: string;
  entity_mappings?: EntityMapping[];
  dry_run?: boolean;
  batch_size?: number;
  deduplication?: Record<string, string>;
}

export interface FieldSchema {
  name: string;
  type: string;
  required: boolean;
  description: string;
  enum_values?: string[];
  default?: unknown;
  properties?: FieldSchema[]; // For nested objects
}

export interface EntitySchema {
  service: string;
  entity: string;
  fields: FieldSchema[];
  description?: string;
}

export interface ServiceSchema {
  service: string;
  entities: EntitySchema[];
}

// AI Chat types
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  actions?: ChatAction[];
}

export interface ChatAction {
  id: string;
  type: 'add_field' | 'remove_field' | 'add_mapping' | 'remove_mapping' | 'update_schema';
  label: string;
  data: Record<string, unknown>;
  applied?: boolean;
}

export interface TransformType {
  name: string;
  description: string;
  config_schema: Record<string, unknown>;
}

export interface PreviewRequest {
  source_record: Record<string, unknown>;
  source_service: string;
  source_entity: string;
  target_service: string;
  target_entity: string;
  field_mappings: FieldMapping[];
}

export interface PreviewResponse {
  source_data: Record<string, unknown>;
  transformed_data: Record<string, unknown>;
  validation_errors: string[];
  is_valid: boolean;
}

export interface ProgressEvent {
  type: 'progress' | 'step_complete' | 'error' | 'complete';
  phase?: string;
  step_name?: string;
  records_processed: number;
  records_succeeded: number;
  records_failed: number;
  total_records?: number;
  message?: string;
  error?: string;
  timestamp: string;
}
