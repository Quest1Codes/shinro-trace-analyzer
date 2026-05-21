import express from "express";
import { isConnected, getTools, connectToMCP } from "./mcp_client";
import { streamChat } from "./llm";
import {
  saveQueryTrace,
  getQueryTrace,
  listQueryTraces,
  appendMessage,
  getMessages,
  clearMessages,
  deleteTrace,
  deleteAllTraces,
  updateTraceTitle,
  updateTraceSuggestions,
  updateTraceQueryText,
} from "../db/index";

import {
  aiKeychain,
  LLM_PROVIDERS,
  type AICredential,
  type LLMProvider,
} from "../keychain/ai_credential";

const router = express.Router();

// ─── MCP Status ──────────────────────────────────────────

router.get("/mcp/status", async (_req: any, res: any) => {
  if (!isConnected()) {
    try {
      await connectToMCP();
    } catch (e) {
      console.error("[MCP] Initial connection failed:", e);
    }
  }

  return res.json({
    connected: isConnected(),
    tools: getTools().map((t) => ({
      name: t.name,
      description: t.description,
    })),
  });
});

router.post("/mcp/connect", async (req: any, res: any) => {
  const { serverUrl } = req.body;
  try {
    await connectToMCP(serverUrl || undefined);
    return res.json({
      success: true,
      tools: getTools().map((t) => ({
        name: t.name,
        description: t.description,
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── AI Keys Management ───────────────────────────────────

router.get("/keys", async (_req: any, res: any) => {
  const keys = (await aiKeychain.getAllCredentials()).map((obj) => {
    return {
      provider: obj.provider,
      model: obj.model || "",
      hasKey: !!obj.apiKey,
    };
  });
  return res.json(keys);
});

router.post("/keys", async (req: any, res: any) => {
  const { provider, apiKey, model } = req.body;

  if (!provider || !LLM_PROVIDERS.includes(provider)) {
    return res.status(400).json({ error: "Invalid provider" });
  }
  if (!apiKey || typeof apiKey !== "string") {
    return res.status(400).json({ error: "apiKey is required" });
  }

  const credential: AICredential = {
    provider: provider as LLMProvider,
    apiKey,
    model: typeof model === "string" && model ? model : undefined,
  };

  try {
    await aiKeychain.upsertCredential(credential);
    return res.json({ success: true });
  } catch (err: any) {
    return res
      .status(500)
      .json({ error: err?.message ?? "Failed to save key" });
  }
});

router.delete("/keys", async (req: any, res: any) => {
  const { provider } = req.body ?? {};

  if (!provider || !LLM_PROVIDERS.includes(provider)) {
    return res.status(400).json({ error: "Invalid provider" });
  }

  try {
    const existing = await aiKeychain.getCredentialFor(provider as LLMProvider);
    if (!existing) {
      return res.status(404).json({ error: "AI credential not found." });
    }
    await aiKeychain.deleteCredential(provider as LLMProvider);
    return res.json({ success: true, message: "AI credential removed." });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Chat (SSE Streaming) ────────────────────────────────

router.post("/chat", async (req: any, res: any) => {
  const { messages, provider, model, query_id, skill_ids } = req.body;

  if (!messages || !provider || !model) {
    return res
      .status(400)
      .json({ error: "messages, provider, and model are required" });
  }

  if (!LLM_PROVIDERS.includes(provider)) {
    return res.status(400).json({ error: "Invalid provider" });
  }

  const cred = await aiKeychain.getCredentialFor(provider);
  if (!cred?.apiKey) {
    return res.status(401).json({
      error: `API key for ${provider} is not configured on the backend.`,
    });
  }

  // Try to connect to MCP if not already connected
  if (!isConnected()) {
    try {
      await connectToMCP();
    } catch (err) {
      console.warn("[AI] MCP server not available, proceeding without tools");
    }
  }

  // Set up SSE
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  try {
    let cluster_id: string | null = null;
    if (query_id) {
      const { getQueryTrace } = await import("../db");
      const trace = getQueryTrace(query_id);
      if (trace) {
        cluster_id = trace.cluster_id;
      }
    }

    const events = streamChat(
      cred.provider,
      cred.apiKey,
      model,
      messages,
      query_id,
      skill_ids,
      cluster_id,
    );

    for await (const event of events) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);

      // Flush if available
      if (typeof (res as any).flush === "function") {
        (res as any).flush();
      }
    }
  } catch (err: any) {
    res.write(
      `data: ${JSON.stringify({ type: "error", content: err.message })}\n\n`,
    );
  }

  res.write("data: [DONE]\n\n");
  res.end();
});

// ─── Trace Meta (name + suggestions) ─────────────────────

/**
 * POST /trace-meta — Generate a human-readable trace name and 4-5
 * tailored suggestion questions for a given SQL query.
 * Uses a single non-streaming LLM call.
 * Body: { query_text: string, provider: string, model: string }
 * Response: { name: string, suggestions: string[] }
 */
router.post("/trace-meta", async (req: any, res: any) => {
  const { query_text, provider, model } = req.body;
  if (!query_text || !provider || !model) {
    return res
      .status(400)
      .json({ error: "query_text, provider, and model are required" });
  }

  if (!LLM_PROVIDERS.includes(provider)) {
    return res.status(400).json({ error: "Invalid provider" });
  }

  const cred = await aiKeychain.getCredentialFor(provider);
  if (!cred?.apiKey) {
    return res
      .status(401)
      .json({ error: `API key for ${provider} is not configured.` });
  }

  const systemPrompt = `You are a ClickHouse SQL query analyst. Your task is to analyze a SQL query and respond with ONLY valid JSON, no markdown, no explanation.

Respond with exactly this JSON shape:
{
  "name": "<Intent> - <Target Table/Operation>",
  "suggestions": [
    "<Optimization question 1>",
    "<Data distribution question 2>",
    "<Index/Partition question 3>",
    "<Resource usage question 4>",
    "<Schema/Alternative question 5>"
  ]
}

Rules for 'name':
- Follow the structure "[Operation Type]: [Main Table/Subject]" (e.g., "SELECT - system.query_log", "INSERT - order_events").
- Keep it under 6 words.
- Be technical and direct.

Rules for 'suggestions':
- Generate exactly 5 questions focused on deep technical optimization.
- KEEP EACH SENTENCE CONCISE (6-10 words maximum).
- Question 1: Indexing/Filtering efficiency.
- Question 2: Join strategy or Subquery optimization (if applicable).
- Question 3: Memory/CPU bottlenecks.
- Question 4: Alternative schema/table engines.
- Question 5: Materialized View or Projection opportunities.
- Be specific to the query text provided.`;

  const userMessage = `SQL Query:\n${query_text}`;

  try {
    let responseText = "";

    if (provider === "openai" || provider === "openrouter") {
      const { default: OpenAI } = await import("openai");
      const baseURL =
        provider === "openrouter" ? "https://openrouter.ai/api/v1" : undefined;
      const headers: Record<string, string> =
        provider === "openrouter"
          ? {
              "HTTP-Referer": "http://localhost:3000",
              "X-OpenRouter-Title": "Shinro AI",
            }
          : {};
      const openai = new OpenAI({
        apiKey: cred.apiKey,
        ...(baseURL ? { baseURL } : {}),
        defaultHeaders: headers,
      });
      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.3,
        max_completion_tokens: 512,
      });
      responseText = response.choices[0]?.message?.content || "";
    } else if (provider === "anthropic") {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const anthropic = new Anthropic({ apiKey: cred.apiKey });
      const response = await anthropic.messages.create({
        model,
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });
      responseText =
        response.content[0]?.type === "text" ? response.content[0].text : "";
    }

    // Parse JSON — strip any accidental markdown fences
    const cleaned = responseText
      .replace(/^```[a-z]*\n?/i, "")
      .replace(/\n?```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned);

    if (!parsed.name || !Array.isArray(parsed.suggestions)) {
      throw new Error("Invalid response shape from LLM");
    }

    return res.json({
      name: parsed.name,
      suggestions: parsed.suggestions.slice(0, 5),
    });
  } catch (err: any) {
    console.error("[trace-meta] Error:", err.message);
    return res
      .status(500)
      .json({ error: err.message || "Failed to generate trace metadata" });
  }
});

// ─── Trace Persistence (SQLite) ──────────────────────────

/**
 * POST /trace — Upsert a query trace record.
 * Body: { query_id, parsed_trace?, title?, cluster_id?, suggestions? }
 */
router.post("/trace", (req: any, res: any) => {
  const { query_id, parsed_trace, title, cluster_id, suggestions, query_text } =
    req.body;
  if (!query_id) {
    return res.status(400).json({ error: "query_id is required" });
  }
  try {
    const traceJson = parsed_trace ? JSON.stringify(parsed_trace) : null;
    const suggestionsJson = suggestions ? JSON.stringify(suggestions) : null;
    saveQueryTrace(
      query_id,
      traceJson,
      title,
      cluster_id,
      suggestionsJson,
      query_text,
    );
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /traces — List saved query traces (summaries).
 * Query param: ?cluster_id=... to filter by cluster.
 */
router.get("/traces", (req: any, res: any) => {
  try {
    const cluster_id = req.query.cluster_id as string | undefined;
    const traces = listQueryTraces(cluster_id || null);
    return res.json({ traces });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /traces/:query_id/title — Update the title for a trace.
 * Body: { title }
 */
router.put("/traces/:query_id/title", (req: any, res: any) => {
  const { query_id } = req.params;
  const { title } = req.body;
  if (!title) {
    return res.status(400).json({ error: "title is required" });
  }
  try {
    updateTraceTitle(query_id, title);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /traces/:query_id/suggestions — Update the suggestions for a trace.
 * Body: { suggestions }
 */
router.put("/traces/:query_id/suggestions", (req: any, res: any) => {
  const { query_id } = req.params;
  const { suggestions } = req.body;
  if (!suggestions || !Array.isArray(suggestions)) {
    return res.status(400).json({ error: "suggestions array is required" });
  }
  try {
    updateTraceSuggestions(query_id, JSON.stringify(suggestions));
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /traces/:query_id/query-text — Update the SQL query text for a trace.
 * Body: { query_text }
 */
router.put("/traces/:query_id/query-text", (req: any, res: any) => {
  const { query_id } = req.params;
  const { query_text } = req.body;
  if (query_text === undefined) {
    return res.status(400).json({ error: "query_text is required" });
  }
  try {
    updateTraceQueryText(query_id, query_text);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /messages/:query_id — Fetch all messages for a query.
 */
router.get("/messages/:query_id", (req: any, res: any) => {
  const { query_id } = req.params;
  try {
    const rows = getMessages(query_id);
    const messages = rows.map((r) => ({
      id: String(r.id),
      role: r.role,
      content: r.content,
      toolCalls: r.tool_calls ? JSON.parse(r.tool_calls) : undefined,
      timestamp: r.created_at,
    }));
    return res.json({ messages });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /messages/:query_id — Append a single message.
 * Body: { role, content, toolCalls? }
 */
router.post("/messages/:query_id", (req: any, res: any) => {
  const { query_id } = req.params;
  const { role, content, toolCalls } = req.body;
  if (!role || content === undefined) {
    return res.status(400).json({ error: "role and content are required" });
  }
  try {
    // Ensure the parent trace exists (auto-create a minimal record if not)
    const existing = getQueryTrace(query_id);
    if (!existing) {
      const cluster_id = req.body.cluster_id || null;
      saveQueryTrace(query_id, null, null, cluster_id);
    }
    const toolCallsJson = toolCalls ? JSON.stringify(toolCalls) : null;
    appendMessage(query_id, role, content, toolCallsJson);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /messages/:query_id — Clear all messages for a query.
 */
router.delete("/messages/:query_id", (req: any, res: any) => {
  const { query_id } = req.params;
  try {
    clearMessages(query_id);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /traces/:query_id — Delete a trace and all its messages.
 */
router.delete("/traces/:query_id", (req: any, res: any) => {
  const { query_id } = req.params;
  try {
    deleteTrace(query_id);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /traces — Delete traces and messages.
 * Query param: ?cluster_id=... to scope to a single cluster.
 */
router.delete("/traces", (req: any, res: any) => {
  try {
    const cluster_id = req.query.cluster_id as string | undefined;
    deleteAllTraces(cluster_id || null);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export { router as aiRouter };
