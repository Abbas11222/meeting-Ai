/**
 * Every call to the backend lives here.
 * The expected request and response shapes are described in API.md.
 */
const Api = {

  /** Sends one request and returns the JSON answer. Throws on any error. */
  async request(path, { method = 'GET', json, form } = {}) {
    const options = { method, headers: { Accept: 'application/json' } };

    if (json) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(json);
    }
    if (form) {
      options.body = form;
    }

    const response = await fetch(CONFIG.API_BASE + path, options);
    if (!response.ok) {
      throw new Error(`Server answered ${response.status}`);
    }
    return response.status === 204 ? null : response.json();
  },

  meetingPath(id, suffix = '') {
    return `/api/meetings/${encodeURIComponent(id)}${suffix}`;
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
  endMeeting(id)   { return this.request(this.meetingPath(id, '/end'),   { method: 'POST' }); },

  // ----- During the meeting -----
  sendMessage(id, speaker, text) {
    return this.request(this.meetingPath(id, '/messages'), {
      method: 'POST',
      json: { speaker, text, source: 'text' },
    });
  },
  sendAudio(id, speaker, audioBlob) {
    const form = new FormData();
    form.append('audio', audioBlob, 'chunk.webm');
    form.append('speaker', speaker);
    return this.request(this.meetingPath(id, '/audio'), { method: 'POST', form });
  },

  // ----- After the meeting -----
  askQuestion(id, question) {
    return this.request(this.meetingPath(id, '/ask'), { method: 'POST', json: { question } });
  },
};