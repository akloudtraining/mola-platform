declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    SUPABASE_URL?: string;
    SUPABASE_PUBLISHABLE_KEY?: string;
    SUPABASE_STORAGE_FUNCTION_URL?: string;
    MOLA_STORAGE_BACKEND?: string;
    MOLA_OWNER_EMAIL?: string;
    MOLA_RESET_ON_OWNER_BOOT?: string;
  }
}
