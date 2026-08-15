// ---------------------------------------------------------------------------
// Configuración de la conexión con la base de datos (Supabase)
//
// Estos dos valores NO son secretos: la clave "anon" está diseñada para ir
// dentro de la página. El control real de lo que se puede hacer se define
// con las políticas de acceso dentro de Supabase.
// ---------------------------------------------------------------------------

window.CONFIG = {
  SUPABASE_URL: "https://lurwsacrharocadxdahs.supabase.co",

  // Clave pública (publishable) del proyecto.
  // Supabase → Project Settings → API Keys → Publishable key
  SUPABASE_ANON_KEY: "sb_publishable_PXdvpdQ3QhopwmpaivIgkA_ObYZQ-yD",

  TABLA: "registros",
};
