const API_BASE = '/api/ai';

export interface TraceMeta {
  name: string;
  suggestions: string[];
}

export async function fetchTraceMeta(
  queryText: string,
  provider: string,
  model: string,
): Promise<TraceMeta | null> {
  try {
    const res = await fetch(`${API_BASE}/trace-meta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query_text: queryText, provider, model }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.name || !Array.isArray(data.suggestions)) return null;
    return { name: data.name, suggestions: data.suggestions };
  } catch {
    return null;
  }
}
