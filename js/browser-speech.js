/**
 * Fallback speech-to-text: the speech recognition built into Chrome and Edge.
 * It is used only when the server's speech-to-text (Groq) is not available.
 * Chrome sends the audio to Google for this, so it needs an internet connection.
 */
const BrowserSpeech = {
  recognition: null,
  active: false,

  isSupported() {
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  },

  /**
   * @param {Function} onText   called with each finished sentence
   * @param {Function} onError  called with a message when recognition cannot continue
   */
  start({ onText, onError }) {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new Recognition();

    recognition.continuous = true;
    recognition.interimResults = false;
    if (CONFIG.BROWSER_SPEECH_LANG) recognition.lang = CONFIG.BROWSER_SPEECH_LANG;

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const text = event.results[i][0].transcript.trim();
          if (text) onText(text);
        }
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;   // harmless
      this.active = false;
      onError(event.error === 'network'
        ? 'Chrome speech recognition needs an internet connection.'
        : `Chrome speech recognition stopped (${event.error}).`);
    };

    // Chrome ends the session after a long silence. Start it again while the microphone is on.
    recognition.onend = () => {
      if (!this.active) return;
      try { recognition.start(); } catch (error) { /* already running */ }
    };

    this.recognition = recognition;
    this.active = true;
    recognition.start();
  },

  stop() {
    this.active = false;
    if (this.recognition) {
      try { this.recognition.stop(); } catch (error) { /* not running */ }
      this.recognition = null;
    }
  },
};