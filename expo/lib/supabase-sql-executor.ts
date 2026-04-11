import type { SupabaseClient } from '@supabase/supabase-js';

export type SupabaseSqlProgress = {
  current: number;
  total: number;
  statement: string;
};

function readDollarQuoteTag(sql: string, index: number): string | null {
  const rest = sql.slice(index);
  const match = rest.match(/^\$[A-Za-z0-9_]*\$/);
  return match?.[0] ?? null;
}

export function splitSupabaseSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let index = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarQuoteTag: string | null = null;

  while (index < sql.length) {
    const char = sql[index] ?? '';
    const nextChar = sql[index + 1] ?? '';

    if (inLineComment) {
      current += char;
      index += 1;
      if (char === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        current += '*/';
        index += 2;
        inBlockComment = false;
        continue;
      }

      current += char;
      index += 1;
      continue;
    }

    if (dollarQuoteTag) {
      if (sql.startsWith(dollarQuoteTag, index)) {
        current += dollarQuoteTag;
        index += dollarQuoteTag.length;
        dollarQuoteTag = null;
        continue;
      }

      current += char;
      index += 1;
      continue;
    }

    if (inSingleQuote) {
      current += char;
      index += 1;

      if (char === "'" && nextChar === "'") {
        current += nextChar;
        index += 1;
        continue;
      }

      if (char === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (inDoubleQuote) {
      current += char;
      index += 1;
      if (char === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (char === '-' && nextChar === '-') {
      current += '--';
      index += 2;
      inLineComment = true;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      current += '/*';
      index += 2;
      inBlockComment = true;
      continue;
    }

    if (char === "'") {
      current += char;
      index += 1;
      inSingleQuote = true;
      continue;
    }

    if (char === '"') {
      current += char;
      index += 1;
      inDoubleQuote = true;
      continue;
    }

    if (char === '$') {
      const nextDollarQuoteTag = readDollarQuoteTag(sql, index);
      if (nextDollarQuoteTag) {
        current += nextDollarQuoteTag;
        index += nextDollarQuoteTag.length;
        dollarQuoteTag = nextDollarQuoteTag;
        continue;
      }
    }

    if (char === ';') {
      const trimmedStatement = current.trim();
      if (trimmedStatement.length > 0) {
        statements.push(trimmedStatement);
      }
      current = '';
      index += 1;
      continue;
    }

    current += char;
    index += 1;
  }

  const finalStatement = current.trim();
  if (finalStatement.length > 0) {
    statements.push(finalStatement);
  }

  return statements;
}

export function isSupabaseSqlExecMissing(message: string | null | undefined): boolean {
  const normalizedMessage = (message ?? '').toLowerCase();
  return normalizedMessage.includes('ivx_exec_sql')
    && (
      normalizedMessage.includes('does not exist')
      || normalizedMessage.includes('could not find the function')
      || normalizedMessage.includes('not found')
    );
}

export async function executeSupabaseSqlScript(
  client: SupabaseClient,
  sql: string,
  onProgress?: (progress: SupabaseSqlProgress) => void,
): Promise<{ totalStatements: number }> {
  const statements = splitSupabaseSqlStatements(sql);

  for (let index = 0; index < statements.length; index += 1) {
    const statement = statements[index] ?? '';
    const current = index + 1;
    onProgress?.({ current, total: statements.length, statement });

    const { error } = await client.rpc('ivx_exec_sql', { sql_text: statement });
    if (error) {
      throw new Error(`SQL step ${current}/${statements.length} failed: ${error.message}`);
    }
  }

  return {
    totalStatements: statements.length,
  };
}
