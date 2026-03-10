/** Konfigurace – při spuštění přes node serve.js se načte dynamický config.js ze serveru z .env.
 *  Jinak lze nastavit window.API_BASE, window.SUPABASE_URL, window.SUPABASE_ANON_KEY před načtením této stránky. */
window.API_BASE = window.API_BASE || 'http://localhost:3001';
window.SUPABASE_URL = window.SUPABASE_URL || '';
window.SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || '';
