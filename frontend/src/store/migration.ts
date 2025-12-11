import { create } from 'zustand';
import type { DataSource, EntityMapping, ProgressEvent } from '@/types/migration';

type WizardStep = 1 | 2 | 3 | 4 | 5;

interface MigrationWizardState {
  // Current wizard step
  currentStep: WizardStep;
  setCurrentStep: (step: WizardStep) => void;

  // Migration configuration
  name: string;
  setName: (name: string) => void;

  description: string;
  setDescription: (description: string) => void;

  // Sources
  sources: DataSource[];
  addSource: (source: DataSource) => void;
  updateSource: (index: number, source: DataSource) => void;
  removeSource: (index: number) => void;

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

  // Reset wizard
  reset: () => void;
}

// Default seed data: Stripe + Salesforce to Chargebee migration
const seedSources: DataSource[] = [
  {
    type: 'api',
    name: 'Stripe Customers',
    service: 'stripe',
    entity: 'customers',
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
    entity: 'subscriptions',
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
    entity: 'contacts',
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
    source_entity: 'customers',
    target_service: 'chargebee',
    target_entity: 'customers',
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
    source_service: 'stripe',
    source_entity: 'subscriptions',
    target_service: 'chargebee',
    target_entity: 'subscriptions',
    field_mappings: [
      { source_field: 'id', target_field: 'id', transform: 'direct', config: {} },
      { source_field: 'customer', target_field: 'customer_id', transform: 'direct', config: {} },
      { source_field: 'status', target_field: 'status', transform: 'enum_map', config: {
        mapping: { active: 'active', past_due: 'non_renewing', canceled: 'cancelled', trialing: 'in_trial' }
      }},
      { source_field: 'items.data[0].plan.id', target_field: 'plan_id', transform: 'direct', config: {} },
      { source_field: 'current_period_start', target_field: 'current_term_start', transform: 'format_date', config: { format: 'ISO' } },
      { source_field: 'current_period_end', target_field: 'current_term_end', transform: 'format_date', config: { format: 'ISO' } },
      { source_field: 'created', target_field: 'created_at', transform: 'format_date', config: { format: 'ISO' } },
    ],
  },
  {
    source_service: 'salesforce',
    source_entity: 'contacts',
    target_service: 'chargebee',
    target_entity: 'customers',
    field_mappings: [
      { source_field: 'Id', target_field: 'cf_salesforce_id', transform: 'direct', config: {} },
      { source_field: 'Email', target_field: 'email', transform: 'direct', config: {} },
      { source_field: 'FirstName', target_field: 'first_name', transform: 'direct', config: {} },
      { source_field: 'LastName', target_field: 'last_name', transform: 'direct', config: {} },
      { source_field: 'Phone', target_field: 'phone', transform: 'direct', config: {} },
      { source_field: 'Title', target_field: 'cf_job_title', transform: 'direct', config: {} },
      { source_field: 'Account.Name', target_field: 'company', transform: 'direct', config: {} },
    ],
  },
];

const initialState = {
  currentStep: 1 as WizardStep,
  name: 'Stripe + Salesforce to Chargebee Migration',
  description: 'Migrate customer and subscription data from Stripe and contact data from Salesforce into Chargebee',
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
};

export const useMigrationStore = create<MigrationWizardState>((set) => ({
  ...initialState,

  setCurrentStep: (step) => set({ currentStep: step }),

  setName: (name) => set({ name }),
  setDescription: (description) => set({ description }),

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

  setTargetService: (targetService) => set({ targetService }),
  setTargetSite: (targetSite) => set({ targetSite }),
  setTargetApiKey: (targetApiKey) => set({ targetApiKey }),

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

  reset: () => set(initialState),
}));
