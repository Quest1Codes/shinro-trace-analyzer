import type { LLMProvider, MCPStatus } from '../types';

const API_BASE = '/api/ai';



export async function getMcpStatus(): Promise<MCPStatus> {
  try {
    const res = await fetch(`${API_BASE}/mcp/status`);
    if (!res.ok) throw new Error();
    return res.json();
  } catch {
    return { connected: false, tools: [] };
  }
}

export async function connectMcp(serverUrl?: string): Promise<MCPStatus> {
  const res = await fetch(`${API_BASE}/mcp/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serverUrl }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to connect to MCP');
  }
  return res.json();
}

type AIKeyStatus = Record<LLMProvider, boolean> & { [K in LLMProvider as `${K}Model`]?: string }

export async function getAIKeyStatus(): Promise<AIKeyStatus> {
  try {
    const res = await fetch(`${API_BASE}/keys`);
    if (!res.ok) throw new Error();
    const data = await res.json() as { provider: LLMProvider, model: string, hasKey: boolean }[];
    const aiKeys: AIKeyStatus = { openai: false, anthropic: false, openrouter: false }
    for (const entry of data) {
      aiKeys[entry.provider] = entry.hasKey
      aiKeys[`${entry.provider}Model`] = entry.model
    }
    return aiKeys
  } catch {
    return { openai: false, anthropic: false, openrouter: false };
  }
}

export async function saveProviderKeyConfig(
  provider: LLMProvider,
  key: string,
  model: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, apiKey: key, model }),
  });
  if (!res.ok) throw new Error('Failed to save key');
}

export async function deleteProviderKeyConfig(provider: LLMProvider): Promise<void> {
  const res = await fetch(`${API_BASE}/keys`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider }),
  });
  if (!res.ok) throw new Error('Failed to delete key');
}



export interface StreamCallbacks {
  onToken: (token: string) => void;
  onToolCall: (name: string, args: Record<string, unknown>) => void;
  onToolResult: (name: string, result: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

interface ChatPayloadMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}


export async function streamChat(
  messages: ChatPayloadMessage[],
  provider: LLMProvider,
  model: string,
  callbacks: StreamCallbacks,
  query_id?: string | null,
  skill_ids?: string[],
): Promise<void> {
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      provider,
      model,
      query_id: query_id || undefined,
      skill_ids: skill_ids && skill_ids.length > 0 ? skill_ids : undefined,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    callbacks.onError(err.error || 'Chat request failed');
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    callbacks.onError('No response stream');
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;

      const data = line.slice(6).trim();
      if (data === '[DONE]') {
        callbacks.onDone();
        return;
      }

      try {
        const event = JSON.parse(data);
        switch (event.type) {
          case 'token':
            callbacks.onToken(event.content || '');
            break;
          case 'tool_call':
            callbacks.onToolCall(event.toolName, event.toolArgs || {});
            break;
          case 'tool_result':
            callbacks.onToolResult(event.toolName, event.toolResult || '');
            break;
          case 'done':
            callbacks.onDone();
            return;
          case 'error':
            callbacks.onError(event.content || 'Unknown error');
            return;
        }
      } catch {
      }
    }
  }

  callbacks.onDone();
}
