/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Set to "true" to expose the /dev/* routes in a production build (never in deploys). */
  readonly VITE_DEV_ROUTES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
