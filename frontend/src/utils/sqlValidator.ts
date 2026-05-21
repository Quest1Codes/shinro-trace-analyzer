export interface DestructiveCheckResult {
  isDestructive: boolean;
  type: string;
  message: string;
}

const DESTRUCTIVE_PATTERNS: { pattern: RegExp; type: string; message: string }[] = [
  { pattern: /\bDROP\s+(TABLE|DATABASE|VIEW|DICTIONARY)\b/i, type: 'DROP', message: 'This query will permanently drop a database object.' },
  { pattern: /\bTRUNCATE\s+(TABLE\s+)?/i, type: 'TRUNCATE', message: 'This query will remove all data from a table.' },
  { pattern: /\bDELETE\s+FROM\b/i, type: 'DELETE', message: 'This query will delete rows from a table.' },
  { pattern: /\bALTER\s+TABLE\s+\S+\s+DELETE\b/i, type: 'ALTER DELETE', message: 'This query will delete rows via ALTER TABLE mutation.' },
  { pattern: /\bALTER\s+TABLE\s+\S+\s+DROP\s+(COLUMN|PARTITION|INDEX)\b/i, type: 'ALTER DROP', message: 'This query will drop a column, partition, or index.' },
];

export function detectDestructiveSQL(query: string): DestructiveCheckResult {
  const normalized = query.replace(/\s+/g, ' ').trim();
  for (const { pattern, type, message } of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(normalized)) {
      return { isDestructive: true, type, message };
    }
  }
  return { isDestructive: false, type: '', message: '' };
}
