(() => {
  const SUPABASE_URL="https://txblwoqdoeycyuzbzgac.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY="sb_publishable_iY-NjlZXcVvzCekB6lD1FA_1IDkWh9V";

  if (!window.supabase?.createClient) {
    throw new Error("Supabase JS n'a pas pu être chargé.");
  }

  window.CodeNostSupabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );
})();