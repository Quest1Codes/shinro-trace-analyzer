import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider } from "./keys";
import {
  toolsToOpenAIFunctions,
  toolsToAnthropicTools,
  callTool,
  getTools,
} from "./mcp_client";
import { DEFAULT_PORT } from "../../constants";

import { getSystemPrompt } from "./system_prompt";


interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface StreamEvent {
  type: "token" | "tool_call" | "tool_result" | "done" | "error";
  content?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
}

/**
 * Stream chat completion with tool-call loop.
 * Yields StreamEvent objects for the caller to write as SSE.
 */
export async function* streamChat(
  provider: LLMProvider,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  query_id?: string,
  skill_ids?: string[],
  cluster_id?: string | null,
): AsyncGenerator<StreamEvent> {
  const hasTools = getTools().length > 0;

  if (provider === "openai") {
    yield* streamOpenAI(apiKey, model, messages, hasTools, query_id, undefined, skill_ids, cluster_id);
  } else if (provider === "anthropic") {
    yield* streamAnthropic(apiKey, model, messages, hasTools, query_id, skill_ids, cluster_id);
  } else if (provider === "openrouter") {
    yield* streamOpenAI(apiKey, model, messages, hasTools, query_id, "https://openrouter.ai/api/v1", skill_ids, cluster_id);
  } else {
    yield { type: "error", content: `Unknown provider: ${provider}` };
  }
}

// ─── OpenAI ──────────────────────────────────────────────

async function* streamOpenAI(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  hasTools: boolean,
  query_id?: string,
  baseURL?: string,
  skill_ids?: string[],
  cluster_id?: string | null,
): AsyncGenerator<StreamEvent> {
  const openai = new OpenAI({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
    ...(baseURL?.includes("openrouter")
      ? {
        defaultHeaders: {
          "HTTP-Referer": `http://localhost:${process.env.PORT || DEFAULT_PORT}`,
          "X-OpenRouter-Title": "Shinro AI",
          "Authorization": `Bearer ${apiKey}`,
        },
      }
      : {}),
  });

  const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: await getSystemPrompt(query_id, skill_ids, cluster_id) },
    ...messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  const tools = hasTools ? toolsToOpenAIFunctions() : undefined;

  // Tool-call loop: keep going until we get a final text response
  let maxIterations = 30;
  while (maxIterations-- > 0) {
    const stream = await openai.chat.completions.create({
      model,
      messages: openaiMessages,
      tools,
      stream: true,
    });

    let fullContent = "";
    let toolCalls: {
      id: string;
      name: string;
      arguments: string;
    }[] = [];

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      // Text content
      if (delta.content) {
        fullContent += delta.content;
        yield { type: "token", content: delta.content };
      }

      // Tool calls accumulation
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.index !== undefined) {
            while (toolCalls.length <= tc.index) {
              toolCalls.push({ id: "", name: "", arguments: "" });
            }
            if (tc.id) toolCalls[tc.index].id = tc.id;
            if (tc.function?.name) toolCalls[tc.index].name = tc.function.name;
            if (tc.function?.arguments)
              toolCalls[tc.index].arguments += tc.function.arguments;
          }
        }
      }
    }

    // If no tool calls, we're done
    if (toolCalls.length === 0) {
      yield { type: "done" };
      return;
    }

    // Process tool calls
    openaiMessages.push({
      role: "assistant",
      content: fullContent || null,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.arguments },
      })),
    });

    for (const tc of toolCalls) {
      const args = JSON.parse(tc.arguments || "{}");
      yield { type: "tool_call", toolName: tc.name, toolArgs: args };

      try {
        const result = await callTool(tc.name, args);
        yield { type: "tool_result", toolName: tc.name, toolResult: result };

        openaiMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result,
        });
      } catch (err: any) {
        const errorMsg = `Tool error: ${err.message}`;
        yield { type: "tool_result", toolName: tc.name, toolResult: errorMsg };

        openaiMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: errorMsg,
        });
      }
    }

    // Loop continues — LLM will process tool results and respond
  }

  yield { type: "error", content: "Max tool-call iterations reached" };
}

// ─── Anthropic ───────────────────────────────────────────

async function* streamAnthropic(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  hasTools: boolean,
  query_id?: string,
  skill_ids?: string[],
  cluster_id?: string | null,
): AsyncGenerator<StreamEvent> {
  const anthropic = new Anthropic({ apiKey });

  const anthropicMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role === "system" ? "user" : (m.role as "user" | "assistant"),
    content: m.content,
  }));

  const tools = hasTools ? toolsToAnthropicTools() : undefined;

  let maxIterations = 30;
  while (maxIterations-- > 0) {
    const stream = anthropic.messages.stream({
      model,
      max_tokens: 4096,
      system: await getSystemPrompt(query_id, skill_ids, cluster_id),
      messages: anthropicMessages,
      tools: tools as any,
    });

    let fullContent = "";
    let currentToolUseId = "";
    let currentToolName = "";
    let currentToolInput = "";
    let hasToolUse = false;
    const toolUseBlocks: Anthropic.ToolUseBlockParam[] = [];
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        fullContent += event.delta.text;
        yield { type: "token", content: event.delta.text };
      }

      if (
        event.type === "content_block_start" &&
        event.content_block.type === "tool_use"
      ) {
        hasToolUse = true;
        currentToolUseId = event.content_block.id;
        currentToolName = event.content_block.name;
        currentToolInput = "";
      }

      if (
        event.type === "content_block_delta" &&
        event.delta.type === "input_json_delta"
      ) {
        currentToolInput += event.delta.partial_json;
      }

      if (event.type === "content_block_stop" && currentToolName) {
        const args = JSON.parse(currentToolInput || "{}");
        toolUseBlocks.push({
          type: "tool_use",
          id: currentToolUseId,
          name: currentToolName,
          input: args,
        });
        yield { type: "tool_call", toolName: currentToolName, toolArgs: args };

        try {
          const result = await callTool(currentToolName, args);
          yield {
            type: "tool_result",
            toolName: currentToolName,
            toolResult: result,
          };
          toolResults.push({
            type: "tool_result",
            tool_use_id: currentToolUseId,
            content: result,
          });
        } catch (err: any) {
          const errorMsg = `Tool error: ${err.message}`;
          yield {
            type: "tool_result",
            toolName: currentToolName,
            toolResult: errorMsg,
          };
          toolResults.push({
            type: "tool_result",
            tool_use_id: currentToolUseId,
            content: errorMsg,
          });
        }

        currentToolName = "";
        currentToolInput = "";
      }
    }

    if (!hasToolUse) {
      yield { type: "done" };
      return;
    }

    // Feed tool results back — assistant message must include the tool_use blocks
    const assistantContent: Anthropic.ContentBlockParam[] = [];
    if (fullContent) {
      assistantContent.push({ type: "text", text: fullContent });
    }
    assistantContent.push(...toolUseBlocks);
    anthropicMessages.push({ role: "assistant", content: assistantContent });
    anthropicMessages.push({ role: "user", content: toolResults });
  }

  yield { type: "error", content: "Max tool-call iterations reached" };
}
