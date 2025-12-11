import { create } from 'zustand';
import type { DataSource, EntityMapping, EntitySchema, ProgressEvent, ChatMessage } from '@/types/migration';

type WorkspaceTab = 'migrate' | 'schemas' | 'mappings';

interface MigrationWorkspaceState {
  // Current tab
  activeTab: WorkspaceTab;
  setActiveTab: (tab: WorkspaceTab) => void;

  // Migration configuration
  name: string;
  setName: (name: string) => void;

  description: string;
  setDescription: (description: string) => void;

  // Schemas (schema-first approach)
  sourceSchemas: EntitySchema[];
  setSourceSchemas: (schemas: EntitySchema[]) => void;
  addSourceSchema: (schema: EntitySchema) => void;
  updateSourceSchema: (service: string, entity: string, schema: EntitySchema) => void;
  removeSourceSchema: (service: string, entity: string) => void;

  targetSchema: EntitySchema | null;
  setTargetSchema: (schema: EntitySchema | null) => void;

  // Legacy: Sources (for execution config)
  sources: DataSource[];
  addSource: (source: DataSource) => void;
  updateSource: (index: number, source: DataSource) => void;
  removeSource: (index: number) => void;
  setSources: (sources: DataSource[]) => void;

  // Target
  targetService: string;
  setTargetService: (service: string) => void;

  targetSite: string;
  setTargetSite: (site: string) => void;

  targetApiKey: string;
  setTargetApiKey: (key: string) => void;

  // Mappings
  entityMappings: EntityMapping[];
  setEntityMappings: (mappings: EntityMapping[]) => void;
  addEntityMapping: (mapping: EntityMapping) => void;
  updateEntityMapping: (index: number, mapping: EntityMapping) => void;
  removeEntityMapping: (index: number) => void;

  // Execution options
  dryRun: boolean;
  setDryRun: (dryRun: boolean) => void;

  batchSize: number;
  setBatchSize: (size: number) => void;

  // Migration ID (after creation)
  migrationId: string | null;
  setMigrationId: (id: string | null) => void;

  // Progress tracking
  progress: ProgressEvent | null;
  setProgress: (progress: ProgressEvent | null) => void;

  // Sample data for preview
  sampleData: Record<string, unknown>[];
  setSampleData: (data: Record<string, unknown>[]) => void;

  // AI Chat
  chatMessages: ChatMessage[];
  addChatMessage: (message: ChatMessage) => void;
  clearChatMessages: () => void;

  // Schema panel collapsed state
  schemaPanelCollapsed: boolean;
  setSchemaPanelCollapsed: (collapsed: boolean) => void;

  // Reset workspace
  reset: () => void;
}

// Seed schemas for Stripe + Salesforce to Chargebee migration
const seedSourceSchemas: EntitySchema[] = [
  {
    service: 'stripe',
    entity: 'Customer',
    description: 'Stripe customer record',
    fields: [
      { name: 'id', type: 'string', required: true, description: 'Stripe customer ID' },
      { name: 'email', type: 'string', required: true, description: 'Customer email' },
      { name: 'name', type: 'string', required: false, description: 'Customer name' },
      { name: 'phone', type: 'string', required: false, description: 'Phone number' },
      { name: 'created', type: 'integer', required: false, description: 'Unix timestamp' },
      { name: 'address', type: 'object', required: false, description: 'Address object', properties: [
        { name: 'line1', type: 'string', required: false, description: 'Street address' },
        { name: 'city', type: 'string', required: false, description: 'City' },
        { name: 'state', type: 'string', required: false, description: 'State' },
        { name: 'postal_code', type: 'string', required: false, description: 'Postal code' },
        { name: 'country', type: 'string', required: false, description: 'Country' },
      ]},
      { name: 'metadata', type: 'object', required: false, description: 'Custom metadata' },
    ],
  },
  {
    service: 'stripe',
    entity: 'Subscription',
    description: 'Stripe subscription record',
    fields: [
      { name: 'id', type: 'string', required: true, description: 'Subscription ID' },
      { name: 'customer', type: 'string', required: true, description: 'Customer ID' },
      { name: 'status', type: 'string', required: true, description: 'Status', enum_values: ['active', 'past_due', 'canceled', 'trialing'] },
      { name: 'current_period_start', type: 'integer', required: false, description: 'Period start timestamp' },
      { name: 'current_period_end', type: 'integer', required: false, description: 'Period end timestamp' },
      { name: 'created', type: 'integer', required: false, description: 'Creation timestamp' },
    ],
  },
  {
    service: 'salesforce',
    entity: 'Contact',
    description: 'Salesforce contact record',
    fields: [
      { name: 'Id', type: 'string', required: true, description: 'Salesforce ID' },
      { name: 'Email', type: 'string', required: false, description: 'Email address' },
      { name: 'FirstName', type: 'string', required: false, description: 'First name' },
      { name: 'LastName', type: 'string', required: true, description: 'Last name' },
      { name: 'Phone', type: 'string', required: false, description: 'Phone number' },
      { name: 'Title', type: 'string', required: false, description: 'Job title' },
      { name: 'AccountId', type: 'string', required: false, description: 'Account ID' },
    ],
  },
];

const seedTargetSchema: EntitySchema = {
  service: 'chargebee',
  entity: 'Customer',
  description: 'Chargebee customer record',
  fields: [
    { name: 'id', type: 'string', required: true, description: 'Customer ID' },
    { name: 'email', type: 'string', required: true, description: 'Email address' },
    { name: 'first_name', type: 'string', required: false, description: 'First name' },
    { name: 'last_name', type: 'string', required: false, description: 'Last name' },
    { name: 'phone', type: 'string', required: false, description: 'Phone number' },
    { name: 'company', type: 'string', required: false, description: 'Company name' },
    { name: 'billing_address', type: 'object', required: false, description: 'Billing address', properties: [
      { name: 'line1', type: 'string', required: false, description: 'Street address' },
      { name: 'city', type: 'string', required: false, description: 'City' },
      { name: 'state', type: 'string', required: false, description: 'State' },
      { name: 'zip', type: 'string', required: false, description: 'Postal code' },
      { name: 'country', type: 'string', required: false, description: 'Country' },
    ]},
    { name: 'cf_salesforce_id', type: 'string', required: false, description: 'Custom field: Salesforce ID' },
    { name: 'cf_job_title', type: 'string', required: false, description: 'Custom field: Job title' },
    { name: 'created_at', type: 'integer', required: false, description: 'Creation timestamp' },
  ],
};

const seedSources: DataSource[] = [
  {
    type: 'api',
    name: 'Stripe Customers',
    service: 'stripe',
    entity: 'Customer',
    api_key: '',
    api_endpoint: 'https://api.stripe.com/v1',
    batch_size: 100,
    rate_limit: 25,
    filters: {},
  },
  {
    type: 'api',
    name: 'Stripe Subscriptions',
    service: 'stripe',
    entity: 'Subscription',
    api_key: '',
    api_endpoint: 'https://api.stripe.com/v1',
    batch_size: 100,
    rate_limit: 25,
    filters: {},
  },
  {
    type: 'api',
    name: 'Salesforce Contacts',
    service: 'salesforce',
    entity: 'Contact',
    api_key: '',
    api_endpoint: '',
    batch_size: 200,
    rate_limit: 100,
    filters: {},
  },
];

const seedEntityMappings: EntityMapping[] = [
  {
    source_service: 'stripe',
    source_entity: 'Customer',
    target_service: 'chargebee',
    target_entity: 'Customer',
    field_mappings: [
      { source_field: 'id', target_field: 'id', transform: 'direct', config: {} },
      { source_field: 'email', target_field: 'email', transform: 'direct', config: {} },
      { source_field: 'name', target_field: 'first_name', transform: 'split_name', config: { part: 'first' } },
      { source_field: 'name', target_field: 'last_name', transform: 'split_name', config: { part: 'last' } },
      { source_field: 'phone', target_field: 'phone', transform: 'direct', config: {} },
      { source_field: 'address.line1', target_field: 'billing_address.line1', transform: 'direct', config: {} },
      { source_field: 'address.city', target_field: 'billing_address.city', transform: 'direct', config: {} },
      { source_field: 'address.state', target_field: 'billing_address.state', transform: 'direct', config: {} },
      { source_field: 'address.postal_code', target_field: 'billing_address.zip', transform: 'direct', config: {} },
      { source_field: 'address.country', target_field: 'billing_address.country', transform: 'direct', config: {} },
      { source_field: 'created', target_field: 'created_at', transform: 'format_date', config: { format: 'ISO' } },
    ],
  },
  {
    source_service: 'salesforce',
    source_entity: 'Contact',
    target_service: 'chargebee',
    target_entity: 'Customer',
    field_mappings: [
      { source_field: 'Id', target_field: 'cf_salesforce_id', transform: 'direct', config: {} },
      { source_field: 'Email', target_field: 'email', transform: 'direct', config: {} },
      { source_field: 'FirstName', target_field: 'first_name', transform: 'direct', config: {} },
      { source_field: 'LastName', target_field: 'last_name', transform: 'direct', config: {} },
      { source_field: 'Phone', target_field: 'phone', transform: 'direct', config: {} },
      { source_field: 'Title', target_field: 'cf_job_title', transform: 'direct', config: {} },
    ],
  },
];

const initialState = {
  activeTab: 'migrate' as WorkspaceTab,
  name: 'Stripe + Salesforce to Chargebee Migration',
  description: 'Migrate customer and subscription data from Stripe and contact data from Salesforce into Chargebee',
  sourceSchemas: seedSourceSchemas,
  targetSchema: seedTargetSchema,
  sources: seedSources,
  targetService: 'chargebee',
  targetSite: '',
  targetApiKey: '',
  entityMappings: seedEntityMappings,
  dryRun: true,
  batchSize: 100,
  migrationId: null as string | null,
  progress: null as ProgressEvent | null,
  sampleData: [] as Record<string, unknown>[],
  chatMessages: [] as ChatMessage[],
  schemaPanelCollapsed: false,
};

export const useMigrationStore = create<MigrationWorkspaceState>((set) => ({
  ...initialState,

  setActiveTab: (activeTab) => set({ activeTab }),

  setName: (name) => set({ name }),
  setDescription: (description) => set({ description }),

  // Schema management
  setSourceSchemas: (sourceSchemas) => set({ sourceSchemas }),
  addSourceSchema: (schema) =>
    set((state) => ({ sourceSchemas: [...state.sourceSchemas, schema] })),
  updateSourceSchema: (service, entity, schema) =>
    set((state) => ({
      sourceSchemas: state.sourceSchemas.map((s) =>
        s.service === service && s.entity === entity ? schema : s
      ),
    })),
  removeSourceSchema: (service, entity) =>
    set((state) => ({
      sourceSchemas: state.sourceSchemas.filter(
        (s) => !(s.service === service && s.entity === entity)
      ),
    })),

  setTargetSchema: (targetSchema) => set({ targetSchema }),

  // Source management
  addSource: (source) =>
    set((state) => ({ sources: [...state.sources, source] })),
  updateSource: (index, source) =>
    set((state) => ({
      sources: state.sources.map((s, i) => (i === index ? source : s)),
    })),
  removeSource: (index) =>
    set((state) => ({
      sources: state.sources.filter((_, i) => i !== index),
    })),
  setSources: (sources) => set({ sources }),

  setTargetService: (targetService) => set({ targetService }),
  setTargetSite: (targetSite) => set({ targetSite }),
  setTargetApiKey: (targetApiKey) => set({ targetApiKey }),

  // Mapping management
  setEntityMappings: (entityMappings) => set({ entityMappings }),
  addEntityMapping: (mapping) =>
    set((state) => ({ entityMappings: [...state.entityMappings, mapping] })),
  updateEntityMapping: (index, mapping) =>
    set((state) => ({
      entityMappings: state.entityMappings.map((m, i) =>
        i === index ? mapping : m
      ),
    })),
  removeEntityMapping: (index) =>
    set((state) => ({
      entityMappings: state.entityMappings.filter((_, i) => i !== index),
    })),

  setDryRun: (dryRun) => set({ dryRun }),
  setBatchSize: (batchSize) => set({ batchSize }),

  setMigrationId: (migrationId) => set({ migrationId }),
  setProgress: (progress) => set({ progress }),
  setSampleData: (sampleData) => set({ sampleData }),

  // Chat
  addChatMessage: (message) =>
    set((state) => ({ chatMessages: [...state.chatMessages, message] })),
  clearChatMessages: () => set({ chatMessages: [] }),

  setSchemaPanelCollapsed: (schemaPanelCollapsed) => set({ schemaPanelCollapsed }),

  reset: () => set(initialState),
}));
