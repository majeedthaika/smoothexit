"""MCP (Model Context Protocol) server integration endpoints."""

import asyncio
import json
import subprocess
import os
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class MCPServerConfig(BaseModel):
    """Configuration for an MCP server."""
    name: str
    command: str  # e.g., "npx" or "python"
    args: List[str]  # e.g., ["-y", "@anthropic/mcp-server-stripe"]
    env: Optional[Dict[str, str]] = None
    description: Optional[str] = None


class MCPServerStatus(BaseModel):
    """Status of an MCP server."""
    name: str
    connected: bool
    tools: List[str] = []
    resources: List[str] = []
    error: Optional[str] = None


class MCPToolCall(BaseModel):
    """Request to call an MCP tool."""
    server_name: str
    tool_name: str
    arguments: Dict[str, Any] = {}


class MCPResourceRequest(BaseModel):
    """Request to read an MCP resource."""
    server_name: str
    resource_uri: str


# In-memory storage for configured MCP servers
MCP_SERVERS: Dict[str, MCPServerConfig] = {}

# Predefined MCP server configurations for common services
PREDEFINED_MCP_SERVERS = {
    "stripe": MCPServerConfig(
        name="stripe",
        command="npx",
        args=["-y", "@anthropic/mcp-server-stripe"],
        env={"STRIPE_API_KEY": ""},
        description="Stripe MCP server - provides access to Stripe API for customers, subscriptions, invoices, etc."
    ),
    "salesforce": MCPServerConfig(
        name="salesforce",
        command="npx",
        args=["-y", "@anthropic/mcp-server-salesforce"],
        env={
            "SALESFORCE_USERNAME": "",
            "SALESFORCE_PASSWORD": "",
            "SALESFORCE_SECURITY_TOKEN": "",
        },
        description="Salesforce MCP server - provides access to Salesforce objects and records."
    ),
    "postgres": MCPServerConfig(
        name="postgres",
        command="npx",
        args=["-y", "@anthropic/mcp-server-postgres"],
        env={"DATABASE_URL": ""},
        description="PostgreSQL MCP server - provides database schema and query capabilities."
    ),
    "filesystem": MCPServerConfig(
        name="filesystem",
        command="npx",
        args=["-y", "@anthropic/mcp-server-filesystem", "/data"],
        description="Filesystem MCP server - provides access to files for importing schemas."
    ),
}


class MCPClient:
    """Simple MCP client for communicating with MCP servers."""

    def __init__(self, config: MCPServerConfig):
        self.config = config
        self.process: Optional[subprocess.Popen] = None
        self._tools: List[Dict] = []
        self._resources: List[Dict] = []

    async def connect(self) -> bool:
        """Start the MCP server process and initialize connection."""
        try:
            # Prepare environment
            env = os.environ.copy()
            if self.config.env:
                env.update(self.config.env)

            # Start the MCP server process
            self.process = subprocess.Popen(
                [self.config.command] + self.config.args,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=env,
            )

            # Send initialize request
            init_request = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {
                        "name": "migrate-services",
                        "version": "1.0.0"
                    }
                }
            }

            response = await self._send_request(init_request)
            if response and "result" in response:
                # Send initialized notification
                await self._send_notification({
                    "jsonrpc": "2.0",
                    "method": "notifications/initialized"
                })

                # List available tools
                tools_response = await self._send_request({
                    "jsonrpc": "2.0",
                    "id": 2,
                    "method": "tools/list"
                })
                if tools_response and "result" in tools_response:
                    self._tools = tools_response["result"].get("tools", [])

                # List available resources
                resources_response = await self._send_request({
                    "jsonrpc": "2.0",
                    "id": 3,
                    "method": "resources/list"
                })
                if resources_response and "result" in resources_response:
                    self._resources = resources_response["result"].get("resources", [])

                return True
            return False
        except Exception as e:
            print(f"Failed to connect to MCP server: {e}")
            return False

    async def _send_request(self, request: Dict) -> Optional[Dict]:
        """Send a JSON-RPC request and wait for response."""
        if not self.process or not self.process.stdin or not self.process.stdout:
            return None

        try:
            # Write request
            request_str = json.dumps(request) + "\n"
            self.process.stdin.write(request_str.encode())
            self.process.stdin.flush()

            # Read response (with timeout)
            loop = asyncio.get_event_loop()
            response_line = await asyncio.wait_for(
                loop.run_in_executor(None, self.process.stdout.readline),
                timeout=30.0
            )

            if response_line:
                return json.loads(response_line.decode())
            return None
        except asyncio.TimeoutError:
            return None
        except Exception as e:
            print(f"Error sending MCP request: {e}")
            return None

    async def _send_notification(self, notification: Dict):
        """Send a JSON-RPC notification (no response expected)."""
        if not self.process or not self.process.stdin:
            return

        try:
            notification_str = json.dumps(notification) + "\n"
            self.process.stdin.write(notification_str.encode())
            self.process.stdin.flush()
        except Exception as e:
            print(f"Error sending MCP notification: {e}")

    async def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Optional[Dict]:
        """Call an MCP tool."""
        request = {
            "jsonrpc": "2.0",
            "id": 100,
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments
            }
        }
        return await self._send_request(request)

    async def read_resource(self, uri: str) -> Optional[Dict]:
        """Read an MCP resource."""
        request = {
            "jsonrpc": "2.0",
            "id": 101,
            "method": "resources/read",
            "params": {
                "uri": uri
            }
        }
        return await self._send_request(request)

    def get_tools(self) -> List[Dict]:
        """Get list of available tools."""
        return self._tools

    def get_resources(self) -> List[Dict]:
        """Get list of available resources."""
        return self._resources

    def disconnect(self):
        """Stop the MCP server process."""
        if self.process:
            self.process.terminate()
            self.process = None


# Active MCP client connections
_active_clients: Dict[str, MCPClient] = {}


@router.get("/servers")
async def list_mcp_servers():
    """List all available MCP server configurations."""
    servers = []

    # Add predefined servers
    for name, config in PREDEFINED_MCP_SERVERS.items():
        servers.append({
            "name": config.name,
            "command": config.command,
            "args": config.args,
            "description": config.description,
            "predefined": True,
            "configured": name in MCP_SERVERS,
            "connected": name in _active_clients,
        })

    # Add custom configured servers
    for name, config in MCP_SERVERS.items():
        if name not in PREDEFINED_MCP_SERVERS:
            servers.append({
                "name": config.name,
                "command": config.command,
                "args": config.args,
                "description": config.description,
                "predefined": False,
                "configured": True,
                "connected": name in _active_clients,
            })

    return {"servers": servers}


@router.post("/servers")
async def add_mcp_server(config: MCPServerConfig):
    """Add or update an MCP server configuration."""
    MCP_SERVERS[config.name] = config
    return {"status": "ok", "server": config.name}


@router.delete("/servers/{server_name}")
async def remove_mcp_server(server_name: str):
    """Remove an MCP server configuration."""
    # Disconnect if connected
    if server_name in _active_clients:
        _active_clients[server_name].disconnect()
        del _active_clients[server_name]

    if server_name in MCP_SERVERS:
        del MCP_SERVERS[server_name]
        return {"status": "ok"}

    raise HTTPException(status_code=404, detail=f"Server '{server_name}' not found")


@router.post("/servers/{server_name}/connect")
async def connect_mcp_server(server_name: str, api_key: Optional[str] = None, env_vars: Optional[Dict[str, str]] = None):
    """Connect to an MCP server."""
    # Get config
    config = MCP_SERVERS.get(server_name) or PREDEFINED_MCP_SERVERS.get(server_name)
    if not config:
        raise HTTPException(status_code=404, detail=f"Server '{server_name}' not found")

    # Update env vars if provided
    if api_key or env_vars:
        config = MCPServerConfig(
            name=config.name,
            command=config.command,
            args=config.args,
            env={**(config.env or {}), **(env_vars or {})},
            description=config.description,
        )
        if api_key:
            # Set the appropriate API key based on server type
            if server_name == "stripe":
                config.env["STRIPE_API_KEY"] = api_key
            elif server_name == "salesforce":
                config.env["SALESFORCE_PASSWORD"] = api_key

    # Create and connect client
    client = MCPClient(config)
    connected = await client.connect()

    if connected:
        _active_clients[server_name] = client
        return {
            "status": "connected",
            "server": server_name,
            "tools": [t.get("name") for t in client.get_tools()],
            "resources": [r.get("uri") for r in client.get_resources()],
        }
    else:
        raise HTTPException(status_code=500, detail=f"Failed to connect to '{server_name}'")


@router.post("/servers/{server_name}/disconnect")
async def disconnect_mcp_server(server_name: str):
    """Disconnect from an MCP server."""
    if server_name not in _active_clients:
        raise HTTPException(status_code=404, detail=f"Server '{server_name}' not connected")

    _active_clients[server_name].disconnect()
    del _active_clients[server_name]
    return {"status": "disconnected", "server": server_name}


@router.get("/servers/{server_name}/status")
async def get_mcp_server_status(server_name: str) -> MCPServerStatus:
    """Get the status of an MCP server."""
    if server_name in _active_clients:
        client = _active_clients[server_name]
        return MCPServerStatus(
            name=server_name,
            connected=True,
            tools=[t.get("name", "") for t in client.get_tools()],
            resources=[r.get("uri", "") for r in client.get_resources()],
        )

    config = MCP_SERVERS.get(server_name) or PREDEFINED_MCP_SERVERS.get(server_name)
    if config:
        return MCPServerStatus(
            name=server_name,
            connected=False,
            error="Not connected"
        )

    raise HTTPException(status_code=404, detail=f"Server '{server_name}' not found")


@router.get("/servers/{server_name}/tools")
async def list_mcp_tools(server_name: str):
    """List available tools from an MCP server."""
    if server_name not in _active_clients:
        raise HTTPException(status_code=400, detail=f"Server '{server_name}' not connected")

    client = _active_clients[server_name]
    return {"server": server_name, "tools": client.get_tools()}


@router.get("/servers/{server_name}/resources")
async def list_mcp_resources(server_name: str):
    """List available resources from an MCP server."""
    if server_name not in _active_clients:
        raise HTTPException(status_code=400, detail=f"Server '{server_name}' not connected")

    client = _active_clients[server_name]
    return {"server": server_name, "resources": client.get_resources()}


@router.post("/tools/call")
async def call_mcp_tool(request: MCPToolCall):
    """Call a tool on an MCP server."""
    if request.server_name not in _active_clients:
        raise HTTPException(status_code=400, detail=f"Server '{request.server_name}' not connected")

    client = _active_clients[request.server_name]
    result = await client.call_tool(request.tool_name, request.arguments)

    if result is None:
        raise HTTPException(status_code=500, detail="Tool call failed")

    return result


@router.post("/resources/read")
async def read_mcp_resource(request: MCPResourceRequest):
    """Read a resource from an MCP server."""
    if request.server_name not in _active_clients:
        raise HTTPException(status_code=400, detail=f"Server '{request.server_name}' not connected")

    client = _active_clients[request.server_name]
    result = await client.read_resource(request.resource_uri)

    if result is None:
        raise HTTPException(status_code=500, detail="Resource read failed")

    return result


@router.post("/servers/{server_name}/fetch-schema")
async def fetch_schema_from_mcp(server_name: str, entity: Optional[str] = None):
    """Fetch schema information from an MCP server.

    This attempts to discover the schema by:
    1. Looking for schema-related resources
    2. Calling list/describe tools
    3. Inferring from sample data
    """
    if server_name not in _active_clients:
        raise HTTPException(status_code=400, detail=f"Server '{server_name}' not connected")

    client = _active_clients[server_name]
    schemas = []

    # Look for tools that can list entities or describe schemas
    tools = client.get_tools()

    for tool in tools:
        tool_name = tool.get("name", "")
        tool_desc = tool.get("description", "").lower()

        # Look for list/search tools to discover entities
        if "list" in tool_name.lower() or "search" in tool_name.lower():
            # Try to call the tool to get sample data
            try:
                result = await client.call_tool(tool_name, {"limit": 5})
                if result and "result" in result:
                    content = result["result"].get("content", [])
                    if content and len(content) > 0:
                        # Try to parse the content and infer schema
                        text_content = content[0].get("text", "")
                        try:
                            data = json.loads(text_content)
                            if isinstance(data, list) and len(data) > 0:
                                sample = data[0]
                            elif isinstance(data, dict):
                                # Might be paginated response
                                if "data" in data and isinstance(data["data"], list):
                                    sample = data["data"][0] if data["data"] else {}
                                else:
                                    sample = data
                            else:
                                sample = {}

                            if sample:
                                # Infer entity name from tool name
                                entity_name = tool_name.replace("list_", "").replace("search_", "").replace("_", " ").title().replace(" ", "")

                                fields = []
                                for key, value in sample.items():
                                    field_type = "string"
                                    if isinstance(value, bool):
                                        field_type = "boolean"
                                    elif isinstance(value, int):
                                        field_type = "integer"
                                    elif isinstance(value, float):
                                        field_type = "number"
                                    elif isinstance(value, dict):
                                        field_type = "object"
                                    elif isinstance(value, list):
                                        field_type = "array"

                                    fields.append({
                                        "name": key,
                                        "type": field_type,
                                        "required": value is not None,
                                        "description": f"Field from {server_name}"
                                    })

                                schemas.append({
                                    "service": server_name,
                                    "entity": entity_name,
                                    "fields": fields,
                                    "source": f"MCP tool: {tool_name}",
                                    "description": tool.get("description", "")
                                })
                        except json.JSONDecodeError:
                            pass
            except Exception as e:
                print(f"Error calling tool {tool_name}: {e}")

    # Also check resources for schema info
    resources = client.get_resources()
    for resource in resources:
        uri = resource.get("uri", "")
        if "schema" in uri.lower() or "type" in uri.lower():
            try:
                result = await client.read_resource(uri)
                if result and "result" in result:
                    # Process resource content
                    pass
            except Exception:
                pass

    return {
        "server": server_name,
        "schemas": schemas,
        "tools_available": [t.get("name") for t in tools],
        "resources_available": [r.get("uri") for r in resources],
    }
