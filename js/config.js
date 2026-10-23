/**
 * Settings you may want to change.
 */
const CONFIG = {
  // Address of the backend, for example "http://localhost:8000".
  // Leave empty if the backend serves this page itself.
  API_BASE: '',

  // How long the page waits for the server when ending a meeting or making a summary (milliseconds).
  LONG_REQUEST_TIMEOUT_MS: 150000,

  // Length of each audio part sent for speech-to-text (milliseconds).
  AUDIO_CHUNK_MS: 5000,

  // Language for the Chrome fallback, for example "en-US" or "ur-PK". Empty = browser language.
  BROWSER_SPEECH_LANG: '',

  // How long to wait after typing in the search box before searching.
  SEARCH_DELAY_MS: 300,
};