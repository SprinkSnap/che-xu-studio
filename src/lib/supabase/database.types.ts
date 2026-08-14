/**
 * Placeholder Database types for Studio OS.
 * After Phase 4 migrations, regenerate with:
 *   npm run supabase:types
 * Do not hand-maintain business table definitions here.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
