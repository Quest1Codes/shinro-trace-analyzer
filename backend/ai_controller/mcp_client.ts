import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { DEFAULT_PORT } from "../../constants";

let client: Client | null = null;
let cachedTools: MCPTool[] = [];
let isConnecting = false;

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export async function connectToMCP(
  serverUrl: string = `http://localhost:${process.env.PORT || DEFAULT_PORT}/mcp`,
): Promise<void> {
  if (isConnecting) return;
  isConnecting = true;

  try {
    if (client) {
      try {
        await client.close();
      } catch {
        /* ignore */
      }
    }

    client = new Client({
      name: "shinro-ai-client",
      version: "1.0.0",
    });

    const transport = new StreamableHTTPClientTransport(new URL(serverUrl));
    await client.connect(transport);


    // Cache tools on connect
    await refreshTools();
  } finally {
    isConnecting = false;
  }
}

export async function refreshTools(): Promise<MCPTool[]> {
  if (!client) {
    throw new Error("MCP client not connected");
  }

  const result = await client.listTools();
  cachedTools = (result.tools ?? []).map((t) => ({
    name: t.name,
    description: t.description ?? "",
    inputSchema: (t.inputSchema as Record<string, unknown>) ?? {},
  }));

  return cachedTools;
}

export function getTools(): MCPTool[] {
  return cachedTools;
}

export async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  if (!client) {
    throw new Error("MCP client not connected");
  }


  const result = await client.callTool({ name, arguments: args });

  // MCP tool results come as content array
  const texts = (result.content as { type: string; text?: string }[])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "");

  return texts.join("\n");
}

export function isConnected(): boolean {
  return client !== null;
}

/**
 * Convert MCP tools to OpenAI function definitions
 */
export function toolsToOpenAIFunctions() {
  return cachedTools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}

/**
 * Convert MCP tools to Anthropic tool definitions
 */
export function toolsToAnthropicTools() {
  return cachedTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema as Record<string, unknown>,
  }));
}
