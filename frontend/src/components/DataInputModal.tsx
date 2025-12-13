import { useState, useRef, useCallback, useEffect } from 'react';
import {
  X,
  Upload,
  FileJson,
  Globe,
  Image,
  Bot,
  Sparkles,
  Loader2,
  Check,
  AlertCircle,
  FileText,
  Link as LinkIcon,
  Play,
  ChevronRight,
  Server,
  Plug,
  PlugZap,
  RefreshCw,
  Download,
  Key,
} from 'lucide-react';
import { Button, Card, CardContent, Input } from '@/components/ui';
import { mcpAPI, type MCPServer, type MCPSchema } from '@/lib/api';
import type { EntitySchema, EntityMapping } from '@/types/migration';

type InputMethod = 'file' | 'api' | 'screenshot' | 'url' | 'manual' | 'mcp';
type OutputType = 'schema' | 'mapping';

interface DataInputModalProps {
  open: boolean;
  onClose: () => void;
  onSchemaGenerated?: (schema: EntitySchema) => void;
  onMappingGenerated?: (mapping: EntityMapping) => void;
  outputType: OutputType;
  existingSchemas?: EntitySchema[];
}

interface ProcessingState {
  status: 'idle' | 'processing' | 'success' | 'error';
  message?: string;
  progress?: number;
}

export function DataInputModal({
  open,
  onClose,
  onSchemaGenerated,
  onMappingGenerated,
  outputType,
  existingSchemas = [],
}: DataInputModalProps) {
  const [activeMethod, setActiveMethod] = useState<InputMethod>('file');
  const [aiInstructions, setAiInstructions] = useState('');
  const [processing, setProcessing] = useState<ProcessingState>({ status: 'idle' });

  // File upload state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // API docs state
  const [apiEndpoint, setApiEndpoint] = useState('');
  const [apiHeaders, setApiHeaders] = useState('');

  // Screenshot state
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string>('');
  const screenshotInputRef = useRef<HTMLInputElement>(null);

  // URL scraping state
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [scrapeSelector, setScrapeSelector] = useState('');

  // Manual input state
  const [serviceName, setServiceName] = useState('');
  const [entityName, setEntityName] = useState('');

  // MCP state
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [mcpConnecting, setMcpConnecting] = useState<string | null>(null);
  const [mcpFetchingSchemas, setMcpFetchingSchemas] = useState<string | null>(null);
  const [mcpSchemas, setMcpSchemas] = useState<Record<string, MCPSchema[]>>({});
  const [mcpApiKeyInputs, setMcpApiKeyInputs] = useState<Record<string, string>>({});
  const [showMcpApiKeyInput, setShowMcpApiKeyInput] = useState<string | null>(null);
  const [selectedMcpSchema, setSelectedMcpSchema] = useState<MCPSchema | null>(null);

  // Load MCP servers when MCP method is selected
  useEffect(() => {
    if (activeMethod === 'mcp' && mcpServers.length === 0) {
      loadMcpServers();
    }
  }, [activeMethod]);

  const loadMcpServers = async () => {
    setMcpLoading(true);
    const result = await mcpAPI.listServers();
    if (result.data) {
      setMcpServers(result.data.servers);
    }
    setMcpLoading(false);
  };

  const handleMcpConnect = async (serverName: string) => {
    const apiKey = mcpApiKeyInputs[serverName];
    if (!apiKey && showMcpApiKeyInput !== serverName) {
      setShowMcpApiKeyInput(serverName);
      return;
    }

    setMcpConnecting(serverName);
    setShowMcpApiKeyInput(null);

    const result = await mcpAPI.connectServer(serverName, apiKey);
    if (result.data) {
      await loadMcpServers();
    }
    setMcpConnecting(null);
  };

  const handleMcpDisconnect = async (serverName: string) => {
    setMcpConnecting(serverName);
    await mcpAPI.disconnectServer(serverName);
    await loadMcpServers();
    setMcpSchemas(prev => {
      const newSchemas = { ...prev };
      delete newSchemas[serverName];
      return newSchemas;
    });
    setMcpConnecting(null);
  };

  const handleMcpFetchSchemas = async (serverName: string) => {
    setMcpFetchingSchemas(serverName);
    const result = await mcpAPI.fetchSchemas(serverName);
    if (result.data) {
      setMcpSchemas(prev => ({ ...prev, [serverName]: result.data!.schemas }));
    }
    setMcpFetchingSchemas(null);
  };

  const handleSelectMcpSchema = (schema: MCPSchema) => {
    setSelectedMcpSchema(schema);
    setServiceName(schema.service);
    setEntityName(schema.entity);
  };

  const inputMethods = [
    { id: 'file' as const, label: 'File Upload', icon: FileJson, description: 'CSV or JSON file' },
    { id: 'api' as const, label: 'API Docs', icon: Globe, description: 'Parse API documentation' },
    { id: 'mcp' as const, label: 'MCP Server', icon: Server, description: 'Connect to services' },
    { id: 'screenshot' as const, label: 'Screenshot', icon: Image, description: 'Extract from image' },
    { id: 'url' as const, label: 'Web Scrape', icon: LinkIcon, description: 'AI browser agent' },
    { id: 'manual' as const, label: 'Manual', icon: FileText, description: 'Enter directly' },
  ];

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, []);

  const handleFileSelect = async (file: File) => {
    setUploadedFile(file);

    // Read file for preview
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      // Show first 1000 chars as preview
      setFilePreview(content.slice(0, 1000) + (content.length > 1000 ? '\n...' : ''));
    };
    reader.readAsText(file);
  };

  const handleScreenshotSelect = async (file: File) => {
    setScreenshotFile(file);

    // Create preview URL
    const url = URL.createObjectURL(file);
    setScreenshotPreview(url);
  };

  const processInput = async () => {
    setProcessing({ status: 'processing', message: 'Processing input...' });

    try {
      let inputData: unknown = null;
      let inputType = activeMethod;

      // Gather input data based on method
      switch (activeMethod) {
        case 'file':
          if (!uploadedFile) throw new Error('No file uploaded');
          const fileContent = await uploadedFile.text();
          if (uploadedFile.name.endsWith('.json')) {
            inputData = JSON.parse(fileContent);
          } else if (uploadedFile.name.endsWith('.csv')) {
            inputData = parseCSV(fileContent);
          } else {
            inputData = fileContent;
          }
          break;

        case 'api':
          if (!apiEndpoint) throw new Error('No API docs URL specified');
          setProcessing({ status: 'processing', message: 'Parsing API documentation...' });
          const response = await fetch('/api/ai/parse-api-docs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              docs_url: apiEndpoint,
              api_key: apiHeaders || undefined,
              instructions: aiInstructions,
            }),
          });
          if (!response.ok) throw new Error('API docs parsing failed');
          inputData = await response.json();
          break;

        case 'screenshot':
          if (!screenshotFile) throw new Error('No screenshot uploaded');
          setProcessing({ status: 'processing', message: 'Extracting from image...' });
          const formData = new FormData();
          formData.append('file', screenshotFile);
          formData.append('instructions', aiInstructions || 'Extract the data schema or field mappings from this image');
          const imgResponse = await fetch('/api/ai/extract-from-image', {
            method: 'POST',
            body: formData,
          });
          if (!imgResponse.ok) throw new Error('Image extraction failed');
          inputData = await imgResponse.json();
          inputType = 'screenshot';
          break;

        case 'url':
          if (!scrapeUrl) throw new Error('No URL specified');
          setProcessing({ status: 'processing', message: 'Scraping with AI agent...', progress: 0 });
          const scrapeResponse = await fetch('/api/ai/scrape-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: scrapeUrl,
              selector: scrapeSelector || undefined,
              instructions: aiInstructions || 'Extract data schema information from this page',
            }),
          });
          if (!scrapeResponse.ok) throw new Error('Web scraping failed');
          inputData = await scrapeResponse.json();
          break;

        case 'manual':
          inputData = { service: serviceName, entity: entityName };
          break;

        case 'mcp':
          if (!selectedMcpSchema) throw new Error('No MCP schema selected');
          // For MCP, we already have schema data
          inputData = {
            service: selectedMcpSchema.service,
            entity: selectedMcpSchema.entity,
            fields: selectedMcpSchema.fields,
            description: selectedMcpSchema.description,
          };
          break;
      }

      // Now send to AI for transformation
      setProcessing({ status: 'processing', message: 'AI is analyzing and transforming data...' });

      const transformResponse = await fetch('/api/ai/transform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input_data: inputData,
          input_type: inputType,
          output_type: outputType,
          instructions: aiInstructions,
          existing_schemas: existingSchemas,
          service_name: serviceName,
          entity_name: entityName,
        }),
      });

      if (!transformResponse.ok) {
        const error = await transformResponse.json();
        throw new Error(error.detail || 'Transformation failed');
      }

      const result = await transformResponse.json();

      setProcessing({ status: 'success', message: 'Successfully generated!' });

      // Call appropriate callback
      if (outputType === 'schema' && onSchemaGenerated && result.schema) {
        onSchemaGenerated(result.schema);
      } else if (outputType === 'mapping' && onMappingGenerated && result.mapping) {
        onMappingGenerated(result.mapping);
      }

      // Close modal after brief delay
      setTimeout(() => {
        onClose();
        resetState();
      }, 1000);

    } catch (error) {
      setProcessing({
        status: 'error',
        message: error instanceof Error ? error.message : 'Processing failed',
      });
    }
  };

  const parseCSV = (content: string): Record<string, unknown>[] => {
    const lines = content.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const rows: Record<string, unknown>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row: Record<string, unknown> = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] || '';
      });
      rows.push(row);
    }

    return rows;
  };

  const resetState = () => {
    setProcessing({ status: 'idle' });
    setUploadedFile(null);
    setFilePreview('');
    setScreenshotFile(null);
    setScreenshotPreview('');
    setApiEndpoint('');
    setApiHeaders('');
    setScrapeUrl('');
    setScrapeSelector('');
    setAiInstructions('');
    setServiceName('');
    setEntityName('');
    setSelectedMcpSchema(null);
    setShowMcpApiKeyInput(null);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-50 w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-lg bg-[hsl(var(--card))] shadow-lg flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-lg font-semibold">
              {outputType === 'schema' ? 'Import Schema' : 'Import Mapping'}
            </h2>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Choose an input method and let AI help transform your data
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-3 gap-4">
            {/* Left: Input Method Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Input Method</label>
              {inputMethods.map((method) => {
                const Icon = method.icon;
                const isActive = activeMethod === method.id;
                return (
                  <button
                    key={method.id}
                    onClick={() => setActiveMethod(method.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                      isActive
                        ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10'
                        : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]'
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${isActive ? 'text-[hsl(var(--primary))]' : ''}`} />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{method.label}</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">{method.description}</p>
                    </div>
                    {isActive && <ChevronRight className="h-4 w-4 text-[hsl(var(--primary))]" />}
                  </button>
                );
              })}
            </div>

            {/* Middle: Input Configuration */}
            <div className="space-y-4">
              <label className="text-sm font-medium">Configuration</label>

              {/* File Upload */}
              {activeMethod === 'file' && (
                <div className="space-y-3">
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleFileDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--muted))] transition-colors"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json,.csv"
                      onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                      className="hidden"
                    />
                    <Upload className="h-8 w-8 mx-auto mb-2 text-[hsl(var(--muted-foreground))]" />
                    <p className="text-sm font-medium">Drop file here or click to upload</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">JSON or CSV files</p>
                  </div>

                  {uploadedFile && (
                    <Card>
                      <CardContent className="p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <FileJson className="h-4 w-4 text-[hsl(var(--primary))]" />
                          <span className="text-sm font-medium truncate">{uploadedFile.name}</span>
                          <span className="text-xs text-[hsl(var(--muted-foreground))]">
                            ({(uploadedFile.size / 1024).toFixed(1)} KB)
                          </span>
                        </div>
                        {filePreview && (
                          <pre className="text-xs bg-[hsl(var(--muted))] p-2 rounded max-h-32 overflow-auto">
                            {filePreview}
                          </pre>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* API Docs */}
              {activeMethod === 'api' && (
                <div className="space-y-3">
                  <Input
                    value={apiEndpoint}
                    onChange={(e) => setApiEndpoint(e.target.value)}
                    placeholder="https://docs.stripe.com/api/customers"
                    label="API Documentation URL"
                  />
                  <Input
                    value={apiHeaders}
                    onChange={(e) => setApiHeaders(e.target.value)}
                    placeholder="Optional API key if docs require auth"
                    label="API Key (optional)"
                    type="password"
                  />
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-[hsl(var(--muted))]">
                    <Globe className="h-4 w-4 mt-0.5 text-[hsl(var(--primary))]" />
                    <div className="text-xs text-[hsl(var(--muted-foreground))]">
                      <p className="font-medium mb-1">Supported documentation formats:</p>
                      <ul className="list-disc list-inside space-y-0.5">
                        <li>OpenAPI/Swagger specs (JSON/YAML)</li>
                        <li>REST API documentation pages</li>
                        <li>GraphQL schema docs</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Screenshot Upload */}
              {activeMethod === 'screenshot' && (
                <div className="space-y-3">
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files[0];
                      if (file) handleScreenshotSelect(file);
                    }}
                    onClick={() => screenshotInputRef.current?.click()}
                    className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--muted))] transition-colors"
                  >
                    <input
                      ref={screenshotInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => e.target.files?.[0] && handleScreenshotSelect(e.target.files[0])}
                      className="hidden"
                    />
                    <Image className="h-8 w-8 mx-auto mb-2 text-[hsl(var(--muted-foreground))]" />
                    <p className="text-sm font-medium">Drop screenshot or click to upload</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">PNG, JPG, or other image formats</p>
                  </div>

                  {screenshotPreview && (
                    <div className="relative rounded-lg overflow-hidden border">
                      <img
                        src={screenshotPreview}
                        alt="Screenshot preview"
                        className="w-full max-h-48 object-contain bg-[hsl(var(--muted))]"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* URL Scraping */}
              {activeMethod === 'url' && (
                <div className="space-y-3">
                  <Input
                    value={scrapeUrl}
                    onChange={(e) => setScrapeUrl(e.target.value)}
                    placeholder="https://docs.example.com/api-reference"
                    label="URL to Scrape"
                  />
                  <Input
                    value={scrapeSelector}
                    onChange={(e) => setScrapeSelector(e.target.value)}
                    placeholder="table.api-fields, .schema-definition (optional)"
                    label="CSS Selector (optional)"
                  />
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-[hsl(var(--muted))]">
                    <Bot className="h-4 w-4 mt-0.5 text-[hsl(var(--primary))]" />
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      An AI agent will navigate to this URL and extract schema/mapping information.
                      This may take a moment.
                    </p>
                  </div>
                </div>
              )}

              {/* Manual Entry */}
              {activeMethod === 'manual' && (
                <div className="space-y-3">
                  <Input
                    value={serviceName}
                    onChange={(e) => setServiceName(e.target.value)}
                    placeholder="e.g., stripe, salesforce"
                    label="Service Name"
                  />
                  <Input
                    value={entityName}
                    onChange={(e) => setEntityName(e.target.value)}
                    placeholder="e.g., Customer, Order"
                    label="Entity Name"
                  />
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    Provide AI instructions below to define the fields or mappings you need.
                  </p>
                </div>
              )}

              {/* MCP Server */}
              {activeMethod === 'mcp' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Available Servers</span>
                    <Button variant="ghost" size="sm" onClick={loadMcpServers} disabled={mcpLoading}>
                      <RefreshCw className={`h-3 w-3 ${mcpLoading ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>

                  {mcpLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--muted-foreground))]" />
                    </div>
                  ) : mcpServers.length === 0 ? (
                    <p className="text-sm text-[hsl(var(--muted-foreground))] text-center py-4">
                      No MCP servers available
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {mcpServers.map((server) => (
                        <div key={server.name} className="border rounded-lg p-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${server.connected ? 'bg-green-500' : 'bg-gray-400'}`} />
                              <span className="font-medium text-sm capitalize">{server.name}</span>
                            </div>
                            {server.connected ? (
                              <div className="flex gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleMcpFetchSchemas(server.name)}
                                  disabled={mcpFetchingSchemas === server.name}
                                  className="h-7 text-xs"
                                >
                                  {mcpFetchingSchemas === server.name ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Download className="h-3 w-3" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleMcpDisconnect(server.name)}
                                  disabled={mcpConnecting === server.name}
                                  className="h-7 text-xs"
                                >
                                  <PlugZap className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleMcpConnect(server.name)}
                                disabled={mcpConnecting === server.name}
                                className="h-7 text-xs"
                              >
                                {mcpConnecting === server.name ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Plug className="h-3 w-3" />
                                )}
                              </Button>
                            )}
                          </div>

                          {/* API Key Input */}
                          {showMcpApiKeyInput === server.name && (
                            <div className="flex items-center gap-2 mt-2">
                              <Key className="h-3 w-3 text-[hsl(var(--muted-foreground))]" />
                              <Input
                                type="password"
                                placeholder="API key..."
                                value={mcpApiKeyInputs[server.name] || ''}
                                onChange={(e) => setMcpApiKeyInputs(prev => ({ ...prev, [server.name]: e.target.value }))}
                                className="h-7 text-xs flex-1"
                              />
                              <Button size="sm" className="h-7 text-xs" onClick={() => handleMcpConnect(server.name)}>
                                Connect
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowMcpApiKeyInput(null)}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          )}

                          {/* Discovered Schemas */}
                          {mcpSchemas[server.name] && mcpSchemas[server.name].length > 0 && (
                            <div className="mt-2 pt-2 border-t space-y-1">
                              <span className="text-xs text-[hsl(var(--muted-foreground))]">
                                Discovered Schemas ({mcpSchemas[server.name].length})
                              </span>
                              {mcpSchemas[server.name].map((schema, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => handleSelectMcpSchema(schema)}
                                  className={`w-full text-left px-2 py-1 rounded text-xs hover:bg-[hsl(var(--accent))] ${
                                    selectedMcpSchema === schema ? 'bg-[hsl(var(--primary))]/10 border border-[hsl(var(--primary))]' : ''
                                  }`}
                                >
                                  <span className="font-medium">{schema.entity}</span>
                                  <span className="text-[hsl(var(--muted-foreground))] ml-1">
                                    ({schema.fields.length} fields)
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedMcpSchema && (
                    <div className="p-2 rounded-lg bg-[hsl(var(--primary))]/10 border border-[hsl(var(--primary))]/30">
                      <div className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-[hsl(var(--primary))]" />
                        <span className="text-sm font-medium">
                          Selected: {selectedMcpSchema.service}.{selectedMcpSchema.entity}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right: AI Instructions */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[hsl(var(--primary))]" />
                <label className="text-sm font-medium">AI Instructions</label>
              </div>
              <textarea
                value={aiInstructions}
                onChange={(e) => setAiInstructions(e.target.value)}
                placeholder={
                  outputType === 'schema'
                    ? "Help the AI understand your data:\n\n• Which fields are required?\n• What data types should be used?\n• Are there nested objects?\n• Any specific field naming conventions?"
                    : "Help the AI create mappings:\n\n• Which source fields map to which target fields?\n• What transformations are needed?\n• How should data be combined or split?\n• Any default values?"
                }
                className="w-full h-48 rounded-md border border-[hsl(var(--input))] bg-transparent px-3 py-2 text-sm resize-none"
              />

              {/* Quick prompts */}
              <div className="space-y-1">
                <p className="text-xs text-[hsl(var(--muted-foreground))]">Quick prompts:</p>
                <div className="flex flex-wrap gap-1">
                  {(outputType === 'schema'
                    ? [
                        'Mark ID fields as required',
                        'Infer types from values',
                        'Flatten nested objects',
                        'Add descriptions',
                      ]
                    : [
                        'Map by field name similarity',
                        'Split name into first/last',
                        'Convert dates to ISO format',
                        'Map address fields',
                      ]
                  ).map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => setAiInstructions((prev) => prev + (prev ? '\n' : '') + prompt)}
                      className="text-xs px-2 py-1 rounded bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--accent))] transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t bg-[hsl(var(--muted))]/50">
          {/* Status */}
          <div className="flex items-center gap-2">
            {processing.status === 'processing' && (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-[hsl(var(--primary))]" />
                <span className="text-sm">{processing.message}</span>
              </>
            )}
            {processing.status === 'success' && (
              <>
                <Check className="h-4 w-4 text-green-500" />
                <span className="text-sm text-green-500">{processing.message}</span>
              </>
            )}
            {processing.status === 'error' && (
              <>
                <AlertCircle className="h-4 w-4 text-[hsl(var(--destructive))]" />
                <span className="text-sm text-[hsl(var(--destructive))]">{processing.message}</span>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={processInput}
              disabled={processing.status === 'processing'}
            >
              {processing.status === 'processing' ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Generate {outputType === 'schema' ? 'Schema' : 'Mapping'}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
