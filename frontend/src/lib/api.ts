import type {
  Migration,
  MigrationCreate,
  EntitySchema,
  TransformType,
  PreviewRequest,
  PreviewResponse,
  FieldMapping,
} from '@/types/migration';

const API_URL = '/api';

interface ApiResponse<T> {
  data?: T;
  error?: string;
}

async function handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    return { error: error.detail || 'Request failed' };
  }
  const data = await response.json();
  return { data };
}

// Migration API
export const migrationAPI = {
  async list(): Promise<ApiResponse<{ migrations: Migration[]; total: number }>> {
    const response = await fetch(`${API_URL}/migrations`);
    return handleResponse(response);
  },

  async get(id: string): Promise<ApiResponse<Migration>> {
    const response = await fetch(`${API_URL}/migrations/${id}`);
    return handleResponse(response);
  },

  async create(data: MigrationCreate): Promise<ApiResponse<Migration>> {
    const response = await fetch(`${API_URL}/migrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async update(id: string, data: Partial<MigrationCreate>): Promise<ApiResponse<Migration>> {
    const response = await fetch(`${API_URL}/migrations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async delete(id: string): Promise<ApiResponse<{ status: string }>> {
    const response = await fetch(`${API_URL}/migrations/${id}`, {
      method: 'DELETE',
    });
    return handleResponse(response);
  },

  async start(id: string): Promise<ApiResponse<{ status: string; migration_id: string }>> {
    const response = await fetch(`${API_URL}/migrations/${id}/start`, {
      method: 'POST',
    });
    return handleResponse(response);
  },

  async pause(id: string): Promise<ApiResponse<{ status: string }>> {
    const response = await fetch(`${API_URL}/migrations/${id}/pause`, {
      method: 'POST',
    });
    return handleResponse(response);
  },

  async resume(id: string): Promise<ApiResponse<{ status: string }>> {
    const response = await fetch(`${API_URL}/migrations/${id}/resume`, {
      method: 'POST',
    });
    return handleResponse(response);
  },

  async cancel(id: string): Promise<ApiResponse<{ status: string }>> {
    const response = await fetch(`${API_URL}/migrations/${id}/cancel`, {
      method: 'POST',
    });
    return handleResponse(response);
  },

  async rollback(id: string): Promise<ApiResponse<{ status: string }>> {
    const response = await fetch(`${API_URL}/migrations/${id}/rollback`, {
      method: 'POST',
    });
    return handleResponse(response);
  },

  createEventStream(migrationId: string): EventSource {
    return new EventSource(`${API_URL}/events/migration/${migrationId}`);
  },
};

// Schema API
export const schemaAPI = {
  async list(): Promise<ApiResponse<{ schemas: Record<string, string[]> }>> {
    const response = await fetch(`${API_URL}/schemas`);
    return handleResponse(response);
  },

  async getService(service: string): Promise<ApiResponse<{ service: string; entities: string[] }>> {
    const response = await fetch(`${API_URL}/schemas/${service}`);
    return handleResponse(response);
  },

  async getEntity(service: string, entity: string): Promise<ApiResponse<EntitySchema>> {
    const response = await fetch(`${API_URL}/schemas/${service}/${entity}`);
    return handleResponse(response);
  },

  async infer(
    data: unknown[],
    service: string,
    entity: string
  ): Promise<ApiResponse<{ schema: EntitySchema; sample_values: Record<string, unknown> }>> {
    const response = await fetch(`${API_URL}/schemas/infer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, service, entity }),
    });
    return handleResponse(response);
  },
};

// Mapping API
export const mappingAPI = {
  async list(): Promise<ApiResponse<{ mappings: unknown[]; total: number }>> {
    const response = await fetch(`${API_URL}/mappings`);
    return handleResponse(response);
  },

  async save(data: {
    name: string;
    source_service: string;
    source_entity: string;
    target_service: string;
    target_entity: string;
    field_mappings: FieldMapping[];
  }): Promise<ApiResponse<unknown>> {
    const response = await fetch(`${API_URL}/mappings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async delete(id: string): Promise<ApiResponse<{ status: string }>> {
    const response = await fetch(`${API_URL}/mappings/${id}`, {
      method: 'DELETE',
    });
    return handleResponse(response);
  },

  async getTransformTypes(): Promise<ApiResponse<{ transforms: TransformType[] }>> {
    const response = await fetch(`${API_URL}/mappings/transforms/types`);
    return handleResponse(response);
  },
};

// Preview API
export const previewAPI = {
  async transform(data: PreviewRequest): Promise<ApiResponse<PreviewResponse>> {
    const response = await fetch(`${API_URL}/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async transformBatch(data: PreviewRequest[]): Promise<ApiResponse<PreviewResponse[]>> {
    const response = await fetch(`${API_URL}/preview/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },
};

// MCP Server types
export interface MCPServer {
  name: string;
  command: string;
  args: string[];
  description?: string;
  predefined: boolean;
  configured: boolean;
  connected: boolean;
}

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface MCPResource {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

export interface MCPSchema {
  service: string;
  entity: string;
  fields: Array<{
    name: string;
    type: string;
    required: boolean;
    description?: string;
  }>;
  source?: string;
  description?: string;
}

// MCP API
export const mcpAPI = {
  async listServers(): Promise<ApiResponse<{ servers: MCPServer[] }>> {
    const response = await fetch(`${API_URL}/mcp/servers`);
    return handleResponse(response);
  },

  async addServer(config: {
    name: string;
    command: string;
    args: string[];
    env?: Record<string, string>;
    description?: string;
  }): Promise<ApiResponse<{ status: string; server: string }>> {
    const response = await fetch(`${API_URL}/mcp/servers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    return handleResponse(response);
  },

  async removeServer(serverName: string): Promise<ApiResponse<{ status: string }>> {
    const response = await fetch(`${API_URL}/mcp/servers/${serverName}`, {
      method: 'DELETE',
    });
    return handleResponse(response);
  },

  async connectServer(
    serverName: string,
    apiKey?: string,
    envVars?: Record<string, string>
  ): Promise<ApiResponse<{ status: string; server: string; tools: string[]; resources: string[] }>> {
    const params = new URLSearchParams();
    if (apiKey) params.append('api_key', apiKey);

    const response = await fetch(`${API_URL}/mcp/servers/${serverName}/connect?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: envVars ? JSON.stringify(envVars) : undefined,
    });
    return handleResponse(response);
  },

  async disconnectServer(serverName: string): Promise<ApiResponse<{ status: string; server: string }>> {
    const response = await fetch(`${API_URL}/mcp/servers/${serverName}/disconnect`, {
      method: 'POST',
    });
    return handleResponse(response);
  },

  async getServerStatus(serverName: string): Promise<ApiResponse<{
    name: string;
    connected: boolean;
    tools: string[];
    resources: string[];
    error?: string;
  }>> {
    const response = await fetch(`${API_URL}/mcp/servers/${serverName}/status`);
    return handleResponse(response);
  },

  async listTools(serverName: string): Promise<ApiResponse<{ server: string; tools: MCPTool[] }>> {
    const response = await fetch(`${API_URL}/mcp/servers/${serverName}/tools`);
    return handleResponse(response);
  },

  async listResources(serverName: string): Promise<ApiResponse<{ server: string; resources: MCPResource[] }>> {
    const response = await fetch(`${API_URL}/mcp/servers/${serverName}/resources`);
    return handleResponse(response);
  },

  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown> = {}
  ): Promise<ApiResponse<unknown>> {
    const response = await fetch(`${API_URL}/mcp/tools/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        server_name: serverName,
        tool_name: toolName,
        arguments: args,
      }),
    });
    return handleResponse(response);
  },

  async readResource(serverName: string, resourceUri: string): Promise<ApiResponse<unknown>> {
    const response = await fetch(`${API_URL}/mcp/resources/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        server_name: serverName,
        resource_uri: resourceUri,
      }),
    });
    return handleResponse(response);
  },

  async fetchSchemas(serverName: string, entity?: string): Promise<ApiResponse<{
    server: string;
    schemas: MCPSchema[];
    tools_available: string[];
    resources_available: string[];
  }>> {
    const params = new URLSearchParams();
    if (entity) params.append('entity', entity);

    const response = await fetch(`${API_URL}/mcp/servers/${serverName}/fetch-schema?${params}`, {
      method: 'POST',
    });
    return handleResponse(response);
  },
};
