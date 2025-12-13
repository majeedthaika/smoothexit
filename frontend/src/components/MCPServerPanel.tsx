import { useState, useEffect } from 'react';
import { Server, Plug, PlugZap, RefreshCw, Loader2, ChevronDown, ChevronRight, Wrench, FileText, Download, X, Key } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@/components/ui';
import { mcpAPI, type MCPServer, type MCPTool, type MCPResource, type MCPSchema } from '@/lib/api';
import { useMigrationStore } from '@/store/migration';
import type { EntitySchema, FieldSchema } from '@/types/migration';

interface MCPServerPanelProps {
  onSchemasImported?: (schemas: EntitySchema[]) => void;
}

export function MCPServerPanel({ onSchemasImported }: MCPServerPanelProps) {
  const { addSourceSchema } = useMigrationStore();
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [fetchingSchemas, setFetchingSchemas] = useState<string | null>(null);
  const [serverTools, setServerTools] = useState<Record<string, MCPTool[]>>({});
  const [serverResources, setServerResources] = useState<Record<string, MCPResource[]>>({});
  const [fetchedSchemas, setFetchedSchemas] = useState<Record<string, MCPSchema[]>>({});
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [showApiKeyInput, setShowApiKeyInput] = useState<string | null>(null);

  useEffect(() => {
    loadServers();
  }, []);

  const loadServers = async () => {
    setLoading(true);
    const result = await mcpAPI.listServers();
    if (result.data) {
      setServers(result.data.servers);
    }
    setLoading(false);
  };

  const handleConnect = async (serverName: string) => {
    const apiKey = apiKeyInputs[serverName];
    if (!apiKey && showApiKeyInput !== serverName) {
      setShowApiKeyInput(serverName);
      return;
    }

    setConnecting(serverName);
    setShowApiKeyInput(null);

    const result = await mcpAPI.connectServer(serverName, apiKey);
    if (result.data) {
      // Refresh server list
      await loadServers();

      // Load tools and resources
      const toolsResult = await mcpAPI.listTools(serverName);
      if (toolsResult.data) {
        setServerTools(prev => ({ ...prev, [serverName]: toolsResult.data!.tools }));
      }

      const resourcesResult = await mcpAPI.listResources(serverName);
      if (resourcesResult.data) {
        setServerResources(prev => ({ ...prev, [serverName]: resourcesResult.data!.resources }));
      }

      setExpandedServer(serverName);
    }
    setConnecting(null);
  };

  const handleDisconnect = async (serverName: string) => {
    setConnecting(serverName);
    await mcpAPI.disconnectServer(serverName);
    await loadServers();
    setServerTools(prev => {
      const newTools = { ...prev };
      delete newTools[serverName];
      return newTools;
    });
    setServerResources(prev => {
      const newResources = { ...prev };
      delete newResources[serverName];
      return newResources;
    });
    setFetchedSchemas(prev => {
      const newSchemas = { ...prev };
      delete newSchemas[serverName];
      return newSchemas;
    });
    setConnecting(null);
  };

  const handleFetchSchemas = async (serverName: string) => {
    setFetchingSchemas(serverName);
    const result = await mcpAPI.fetchSchemas(serverName);
    if (result.data) {
      setFetchedSchemas(prev => ({ ...prev, [serverName]: result.data!.schemas }));
    }
    setFetchingSchemas(null);
  };

  const handleImportSchema = (schema: MCPSchema) => {
    const entitySchema: EntitySchema = {
      service: schema.service,
      entity: schema.entity,
      fields: schema.fields.map(f => ({
        name: f.name,
        type: f.type,
        required: f.required,
        description: f.description || '',
      })) as FieldSchema[],
      description: schema.description,
    };

    addSourceSchema(entitySchema);

    if (onSchemasImported) {
      onSchemasImported([entitySchema]);
    }
  };

  const handleImportAllSchemas = (serverName: string) => {
    const schemas = fetchedSchemas[serverName] || [];
    const entitySchemas: EntitySchema[] = schemas.map(schema => ({
      service: schema.service,
      entity: schema.entity,
      fields: schema.fields.map(f => ({
        name: f.name,
        type: f.type,
        required: f.required,
        description: f.description || '',
      })) as FieldSchema[],
      description: schema.description,
    }));

    entitySchemas.forEach(schema => addSourceSchema(schema));

    if (onSchemasImported) {
      onSchemasImported(entitySchemas);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-[hsl(var(--muted-foreground))]" />
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading MCP servers...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            MCP Servers
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={loadServers}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Connect to MCP servers to fetch schemas directly from services like Stripe, Salesforce, and more.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {servers.length === 0 ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))] text-center py-4">
            No MCP servers available
          </p>
        ) : (
          servers.map((server) => (
            <div
              key={server.name}
              className="border rounded-lg overflow-hidden"
            >
              {/* Server Header */}
              <button
                onClick={() => setExpandedServer(expandedServer === server.name ? null : server.name)}
                className="w-full flex items-center justify-between p-3 hover:bg-[hsl(var(--muted))] transition-colors"
              >
                <div className="flex items-center gap-3">
                  {expandedServer === server.name ? (
                    <ChevronDown className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                  )}
                  <div className={`w-2 h-2 rounded-full ${server.connected ? 'bg-green-500' : 'bg-gray-400'}`} />
                  <span className="font-medium capitalize">{server.name}</span>
                  {server.predefined && (
                    <span className="text-[10px] bg-blue-500/10 text-blue-600 px-1.5 py-0.5 rounded">
                      Built-in
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {server.connected ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDisconnect(server.name)}
                      disabled={connecting === server.name}
                    >
                      {connecting === server.name ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <PlugZap className="h-3 w-3 mr-1" />
                      )}
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleConnect(server.name)}
                      disabled={connecting === server.name}
                    >
                      {connecting === server.name ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Plug className="h-3 w-3 mr-1" />
                      )}
                      Connect
                    </Button>
                  )}
                </div>
              </button>

              {/* API Key Input */}
              {showApiKeyInput === server.name && (
                <div className="px-3 pb-3 border-t bg-[hsl(var(--muted))]/50">
                  <div className="flex items-center gap-2 mt-3">
                    <Key className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                    <Input
                      type="password"
                      placeholder={`Enter ${server.name} API key...`}
                      value={apiKeyInputs[server.name] || ''}
                      onChange={(e) => setApiKeyInputs(prev => ({ ...prev, [server.name]: e.target.value }))}
                      className="flex-1"
                    />
                    <Button size="sm" onClick={() => handleConnect(server.name)}>
                      Connect
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowApiKeyInput(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Expanded Content */}
              {expandedServer === server.name && (
                <div className="border-t px-3 py-3 bg-[hsl(var(--muted))]/30 space-y-3">
                  {server.description && (
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      {server.description}
                    </p>
                  )}

                  {server.connected ? (
                    <>
                      {/* Tools */}
                      {serverTools[server.name] && serverTools[server.name].length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 text-xs font-medium text-[hsl(var(--muted-foreground))] mb-2">
                            <Wrench className="h-3 w-3" />
                            Available Tools ({serverTools[server.name].length})
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {serverTools[server.name].slice(0, 10).map((tool) => (
                              <span
                                key={tool.name}
                                className="text-[10px] bg-[hsl(var(--secondary))] px-2 py-0.5 rounded"
                                title={tool.description}
                              >
                                {tool.name}
                              </span>
                            ))}
                            {serverTools[server.name].length > 10 && (
                              <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                                +{serverTools[server.name].length - 10} more
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Resources */}
                      {serverResources[server.name] && serverResources[server.name].length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 text-xs font-medium text-[hsl(var(--muted-foreground))] mb-2">
                            <FileText className="h-3 w-3" />
                            Available Resources ({serverResources[server.name].length})
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {serverResources[server.name].slice(0, 5).map((resource) => (
                              <span
                                key={resource.uri}
                                className="text-[10px] bg-[hsl(var(--secondary))] px-2 py-0.5 rounded"
                                title={resource.description}
                              >
                                {resource.name || resource.uri}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Fetch Schemas Button */}
                      <div className="pt-2">
                        <Button
                          size="sm"
                          onClick={() => handleFetchSchemas(server.name)}
                          disabled={fetchingSchemas === server.name}
                        >
                          {fetchingSchemas === server.name ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-2" />
                          ) : (
                            <Download className="h-3 w-3 mr-2" />
                          )}
                          Discover Schemas
                        </Button>
                      </div>

                      {/* Fetched Schemas */}
                      {fetchedSchemas[server.name] && fetchedSchemas[server.name].length > 0 && (
                        <div className="mt-3 pt-3 border-t">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium">
                              Discovered Schemas ({fetchedSchemas[server.name].length})
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleImportAllSchemas(server.name)}
                            >
                              Import All
                            </Button>
                          </div>
                          <div className="space-y-2">
                            {fetchedSchemas[server.name].map((schema, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between p-2 bg-[hsl(var(--background))] rounded border"
                              >
                                <div>
                                  <span className="font-medium text-sm">{schema.entity}</span>
                                  <span className="text-xs text-[hsl(var(--muted-foreground))] ml-2">
                                    ({schema.fields.length} fields)
                                  </span>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleImportSchema(schema)}
                                >
                                  <Download className="h-3 w-3 mr-1" />
                                  Import
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {fetchedSchemas[server.name] && fetchedSchemas[server.name].length === 0 && (
                        <p className="text-xs text-[hsl(var(--muted-foreground))] italic">
                          No schemas discovered. Try using the available tools to fetch data.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      Connect to this server to discover available schemas and tools.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
