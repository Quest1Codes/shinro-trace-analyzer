const API_BASE = '/api/query';

export interface ConnectionSummary {
  cluster_id: string;
  user_name: string;
  endpoint: string;
  is_removed: boolean;
  last_login: string;
}

/**
 * Fetch active (non-removed) connections.
 */
export async function fetchConnections(): Promise<ConnectionSummary[]> {
  try {
    const res = await fetch(`${API_BASE}/connections`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.connections ?? [];
  } catch {
    return [];
  }
}

/**
 * Fetch ALL connections including soft-deleted (removed) ones.
 * Used by the Query Editor to resolve historical cluster context.
 */
export async function fetchAllConnections(): Promise<ConnectionSummary[]> {
  try {
    const res = await fetch(`${API_BASE}/connections/all`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.connections ?? [];
  } catch {
    return [];
  }
}

/**
 * Add a new connection (tests connectivity before saving).
 */
export async function addConnection(
  endpoint: string,
  user_name: string,
  password: string,
  skipTest?: boolean,
  nativePort?: string,
  nativeSecure?: boolean,
): Promise<{ success: boolean; cluster_id?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/connections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_name,
      endpoint,
      password,
      skipTest,
      nativePort,
      nativeSecure,
    }),
  });
  const data = await res.json();
  if (!res.ok) return { success: false, error: data.error || 'Failed to add connection' };
  return { success: true, cluster_id: data.cluster_id };
}

/**
 * Soft-delete a connection (marks as removed, preserves history).
 */
export async function removeConnection(cluster_id: string): Promise<void> {
  await fetch(`${API_BASE}/connections/${encodeURIComponent(cluster_id)}`, {
    method: 'DELETE',
  });
}

/**
 * Activate a connection — decrypts credentials and sets them as the active CH client.
 */
export async function activateConnection(
  cluster_id: string,
): Promise<{ success: boolean; user_name?: string; endpoint?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/connections/${encodeURIComponent(cluster_id)}/activate`, {
    method: 'POST',
  });
  const data = await res.json();
  if (!res.ok) return { success: false, error: data.error || 'Failed to activate' };
  return { success: true, user_name: data.user_name, endpoint: data.endpoint };
}
