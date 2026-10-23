/**
 * Every call to the backend lives here.
 * The expected request and response shapes are described in API.md.
 */
const Api = {

  /** Sends one request and returns the JSON answer. Throws on any error. */
  async request(path, { method = 'GET', json, form, timeoutMs = 0 } = {}) {
    const options = { method, headers: { Accept: 'application/json' } };

    if (json) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(json);
    }
    if (form) {
      options.body = form;
    }

    // Stop waiting after `timeoutMs`, so the page can never hang forever.
    const controller = new AbortController();
    const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;
    options.signal = controller.signal;

    let response;
    try {
      response = await fetch(CONFIG.API_BASE + path, options);
    } catch (error) {
      if (error.name === 'AbortError') {
        const timeout = new Error('The server took too long to answer.');
        timeout.fromServer = true;
        throw timeout;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      // The backend explains problems in a "detail" field. Show that when it exists.
      let detail = '';
      try { detail = (await response.json()).detail; } catch (error) { /* no JSON body */ }

      const failure = new Error(typeof detail === 'string' && detail ? detail : `Server answered ${response.status}`);
      failure.fromServer = typeof detail === 'string' && detail !== '';
      throw failure;
    }
    return response.status === 204 ? null : response.json();
  },

  meetingPath(id, suffix = '') {
    return `/api/meetings/${encodeURIComponent(id)}${suffix}`;
  },

  /** Address of the PDF report. With download = true the browser saves it instead of showing it. */
  pdfUrl(id, download = false) {
    return CONFIG.API_BASE + this.meetingPath(id, '/pdf') + (download ? '?download=1' : '');
  },

  // ----- Reading -----
  getDashboard()      { return this.request('/api/dashboard'); },
  getMeetings(search) { return this.request(`/api/meetings?q=${encodeURIComponent(search)}`); },
  getMeeting(id)      { return this.request(this.meetingPath(id)); },

  // ----- Meeting life cycle -----
  createMeeting(title, context) {
    return this.request('/api/meetings', { method: 'POST', json: { title, context } });
  },
  startMeeting(id) { return this.request(this.meetingPath(id, '/start'), { method: 'POST' }); },
  endMeeting(id) {
    return this.request(this.meetingPath(id, '/end'), { method: 'POST', timeoutMs: CONFIG.LONG_REQUEST_TIMEOUT_MS });
  },

  // ----- During the meeting -----
  sendMessage(id, speaker, text, source = 'text') {
    return this.request(this.meetingPath(id, '/messages'), {
      method: 'POST',
      json: { speaker, text, source },
    });
  },
  getSpeechStatus() { return this.request('/api/stt-status'); },
  sendAudio(id, speaker, audioBlob) {
    const form = new FormData();
    form.append('audio', audioBlob, 'chunk.webm');
    form.append('speaker', speaker);
    return this.request(this.meetingPath(id, '/audio'), { method: 'POST', form });
  },

  // ----- After the meeting -----
  deleteMeeting(id) {
    return this.request(this.meetingPath(id), { method: 'DELETE' });
  },
  regenerateSummary(id) {
    return this.request(this.meetingPath(id, '/analyze'), { method: 'POST', timeoutMs: CONFIG.LONG_REQUEST_TIMEOUT_MS });
  },
  askQuestion(id, question) {
    return this.request(this.meetingPath(id, '/ask'), { method: 'POST', json: { question } });
  },
};