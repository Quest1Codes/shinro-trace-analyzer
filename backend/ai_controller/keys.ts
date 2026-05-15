/**
 * Type definitions for LLM providers.
 * Keys are now stored client-side in encrypted localStorage.
 * This file only exports shared types used by llm.ts and router.ts.
 */

export type LLMProvider = "openai" | "anthropic" | "openrouter";
