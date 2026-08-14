#!/usr/bin/env node
/**
 * Generate src/lib/supabase/database.types.ts from a local Postgres database
 * that already has Phase 4 migrations applied (see npm run supabase:db:test).
 *
 * When Docker/Supabase CLI is available, prefer:
 *   npm run supabase:types
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const DB = process.env.STUDIO_TYPES_DB || 'studio_os_phase4_test';
const URL = `postgres:///${DB}?host=/var/run/postgresql`;
const OUT = path.join(process.cwd(), 'src/lib/supabase/database.types.ts');

function q(sql) {
  const result = spawnSync(
    'sudo',
    ['-u', 'postgres', 'psql', URL, '-v', 'ON_ERROR_STOP=1', '-q', '-At', '-F', '\t', '-c', sql],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'psql failed');
  }
  return result.stdout.trim();
}

function pgToTs(dataType, udtName) {
  if (udtName?.endsWith('[]')) return 'string[]';
  switch (dataType) {
    case 'uuid':
    case 'text':
    case 'character varying':
    case 'inet':
    case 'date':
    case 'timestamp with time zone':
    case 'timestamp without time zone':
      return 'string';
    case 'bigint':
    case 'integer':
    case 'smallint':
    case 'numeric':
    case 'double precision':
    case 'real':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'json':
    case 'jsonb':
      return 'Json';
    case 'USER-DEFINED': {
      const labels = enums[udtName];
      if (labels?.length) {
        return labels.map((label) => `'${label}'`).join(' | ');
      }
      return 'string';
    }
    default:
      return 'string';
  }
}

const enumsRaw = q(`
SELECT t.typname, e.enumlabel
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
ORDER BY t.typname, e.enumsortorder;
`);

const enums = {};
for (const line of enumsRaw.split('\n').filter(Boolean)) {
  const [name, label] = line.split('\t');
  enums[name] ||= [];
  enums[name].push(label);
}

const tablesRaw = q(`
SELECT c.table_name, c.column_name, c.data_type, c.udt_name, c.is_nullable, c.column_default
FROM information_schema.columns c
WHERE c.table_schema = 'public'
ORDER BY c.table_name, c.ordinal_position;
`);

const tables = {};
for (const line of tablesRaw.split('\n').filter(Boolean)) {
  const [table, column, dataType, udtName, isNullable, columnDefault] = line.split('\t');
  tables[table] ||= [];
  tables[table].push({ column, dataType, udtName, isNullable, columnDefault });
}

const viewsRaw = q(`
SELECT table_name FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY 1;
`);
const views = viewsRaw ? viewsRaw.split('\n').filter(Boolean) : [];

let out = `/**
 * Generated Studio OS Database types (Phase 4).
 * Source: local Postgres introspection after migrations.
 * Prefer regenerating via \`npm run supabase:types\` when Supabase CLI/Docker is available,
 * or \`npm run supabase:types:from-pg\` after \`npm run supabase:db:test\`.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
`;

for (const [table, cols] of Object.entries(tables)) {
  out += `      ${table}: {\n        Row: {\n`;
  for (const col of cols) {
    const ts = pgToTs(col.dataType, col.udtName);
    const optionalNull = col.isNullable === 'YES' ? ' | null' : '';
    out += `          ${col.column}: ${ts}${optionalNull}\n`;
  }
  out += `        }\n        Insert: {\n`;
  for (const col of cols) {
    const ts = pgToTs(col.dataType, col.udtName);
    const hasDefault = Boolean(col.columnDefault);
    const optional = col.isNullable === 'YES' || hasDefault;
    const nullPart = col.isNullable === 'YES' ? ' | null' : '';
    out += `          ${col.column}${optional ? '?' : ''}: ${ts}${nullPart}\n`;
  }
  out += `        }\n        Update: {\n`;
  for (const col of cols) {
    const ts = pgToTs(col.dataType, col.udtName);
    const nullPart = col.isNullable === 'YES' ? ' | null' : '';
    out += `          ${col.column}?: ${ts}${nullPart}\n`;
  }
  out += `        }\n        Relationships: []\n      }\n`;
}

out += `    }\n    Views: {\n`;
for (const view of views) {
  out += `      ${view}: {\n        Row: Record<string, unknown>\n        Relationships: []\n      }\n`;
}
if (views.length === 0) out += `      [_ in never]: never\n`;

out += `    }\n    Functions: {
      is_studio_user: { Args: Record<string, never>; Returns: boolean }
      is_studio_admin: { Args: Record<string, never>; Returns: boolean }
      next_document_number: {
        Args: {
          p_counter_type: Database['public']['Enums']['number_counter_type']
          p_prefix: string
          p_year?: number
        }
        Returns: string
      }
    }
    Enums: {
`;

for (const [name, labels] of Object.entries(enums)) {
  out += `      ${name}: ${labels.map((l) => `'${l}'`).join(' | ')}\n`;
}

out += `    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T];
`;

writeFileSync(OUT, out);
console.log(`[supabase:types:from-pg] Wrote ${OUT}`);
