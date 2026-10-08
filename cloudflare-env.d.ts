declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    EMAIL?: { send(message:{from:string;to:string;subject:string;text?:string;html?:string}):Promise<void> };
    MOLA_AUTH_SECRET?: string;
    MOLA_APP_URL?: string;
    MOLA_EMAIL_FROM?: string;
    MOLA_OWNER_EMAIL?: string;
  }
}
