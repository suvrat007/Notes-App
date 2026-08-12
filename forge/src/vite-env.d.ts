
interface ImportMetaEnv {
  /**
   * Groq API key for AI intent parsing. OPTIONAL — without it the rules
   * parser handles voice on its own.
   *
   * Vite inlines this into the client bundle. It is therefore public to
   * anyone who can open the app; only ship it on a personal install.
   */
  readonly VITE_GROQ_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
