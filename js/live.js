/**
 * Live meeting page: timer, microphone, chat and the live analysis panel.
 */
const Live = {
  meeting: null,     // { id, title, context } returned by the backend
  running: false,
  startedAt: 0,
  timer: null,
  micOn: false,

  // ---------- Preparing the page ----------

  setup(meeting) {
    this.meeting = meeting;
    this.running = false;

    $('#live-title').textContent   = meeting.title;
    $('#live-context').textContent = meeting.context || 'No context provided.';
    $('#live-status').textContent  = 'Ready to start';
    $('#live-timer').textContent   = formatTimer(0);
    $('#live-dot').className       = 'rec-dot';
    $('#chat').innerHTML           = '<div class="empty">Spoken words and typed messages appear here.</div>';

    $('#btn-start').hidden = false;
    $('#btn-end').hidden   = true;
    this.setInputsEnabled(false);
    this.showMic(false);
    this.renderAnalysis({});

    Router.show('live');
  },

  setInputsEnabled(enabled) {
    ['#message', '#btn-send', '#btn-mic'].forEach((selector) => {
      $(selector).disabled = !enabled;
    });
  },

  // ---------- Start and end (POST .../start, POST .../end) ----------

  async start() {
    try {
      await Api.startMeeting(this.meeting.id);
    } catch (error) {
      showToast('Could not start the meeting. Check the backend.');
      return;
    }

    this.running   = true;
    this.startedAt = Date.now();
    this.timer = setInterval(() => {
      $('#live-timer').textContent = formatTimer(Math.floor((Date.now() - this.startedAt) / 1000));
    }, 500);

    $('#btn-start').hidden = true;
    $('#btn-end').hidden   = false;
    $('#live-status').textContent = 'Meeting in progress';
    $('#live-dot').className      = 'rec-dot on';
    $('#mic-hint').textContent    = 'Press the microphone to start speaking.';
    this.setInputsEnabled(true);
    $('#message').focus();
  },

  async end() {
    if (confirm('End this meeting and generate the summary?')) {
      await this.finish();
    }
  },

  async finish() {
    this.stopMic();
    clearInterval(this.timer);
    $('#btn-end').disabled = true;
    $('#live-status').textContent = 'Generating summary…';

    try {
      const meeting = await Api.endMeeting(this.meeting.id);
      this.running = false;
      showToast('Meeting saved');
      Router.history = ['dashboard'];
      Meetings.open(meeting.id);
    } catch (error) {
      showError('Could not end the meeting. Your discussion is safe on the server.', () => this.finish());
    }
    $('#btn-end').disabled = false;
  },

  // ---------- Chat (POST .../messages) ----------

  addMessage(speaker, text, { fromVoice = false } = {}) {
    const chat = $('#chat');
    const empty = $('.empty', chat);
    if (empty) empty.remove();

    const message = document.createElement('div');
    message.className = 'message' + (fromVoice ? ' voice' : ' mine');
    message.innerHTML = `<small>${escapeHtml(speaker)}${fromVoice ? ' (voice)' : ''}</small>${escapeHtml(text)}`;
    chat.appendChild(message);
    chat.scrollTop = chat.scrollHeight;
  },

  async sendTyped() {
    const text    = $('#message').value.trim();
    const speaker = $('#speaker').value.trim();
    if (!text) return;
    if (!speaker) {
      showToast('Enter your name first.');
      $('#speaker').focus();
      return;
    }

    this.addMessage(speaker, text);
    $('#message').value = '';

    try {
      this.renderAnalysis(await Api.sendMessage(this.meeting.id, speaker, text));
    } catch (error) {
      showToast('Message not analyzed. Check the backend.');
    }
  },

  // ---------- Live analysis panel ----------

  /**
   * @param {Object} analysis  { current_topic, decisions[], action_items[], questions[] }
   */
  renderAnalysis(analysis) {
    $('#panel-topic').innerHTML = analysis.current_topic
      ? `<span class="tag">${escapeHtml(analysis.current_topic)}</span>`
      : '<div class="empty">Waiting for discussion</div>';

    $('#panel-decisions').innerHTML = renderList(
      analysis.decisions,
      (text) => `<div class="item">✓ ${escapeHtml(text)}</div>`,
      'No decisions yet'
    );

    $('#panel-actions').innerHTML = renderList(
      analysis.action_items,
      (action) => `
        <div class="item">
          <strong>${escapeHtml(action.task)}</strong>
          <div class="muted small">${escapeHtml(action.owner || 'Unassigned')} · Deadline: ${escapeHtml(action.deadline || 'not set')}</div>
        </div>`,
      'No tasks assigned yet'
    );

    $('#panel-questions').innerHTML = renderList(
      analysis.questions,
      (text) => `<div class="item">${escapeHtml(text)}</div>`,
      'No questions yet'
    );
  },

  // ---------- Microphone (POST .../audio) ----------

  async toggleMic() {
    if (this.micOn) {
      this.stopMic();
    } else {
      await this.startMic();
    }
  },

  async startMic() {
    try {
      await Microphone.start({
        onChunk:  (blob)   => this.sendAudio(blob),
        onLevels: (levels) => this.drawLevels(levels),
      });
    } catch (error) {
      showToast('Microphone unavailable. Allow access in your browser, or type in the chat.');
      return;
    }
    this.micOn = true;
    this.showMic(true);
    $('#mic-hint').textContent = 'Your speech is sent to the server in short parts.';
  },

  stopMic() {
    if (!this.micOn) return;
    Microphone.stop();
    this.micOn = false;
    this.showMic(false);
    $('#mic-hint').textContent = 'Press the microphone to start speaking.';
  },

  async sendAudio(blob) {
    const speaker = $('#speaker').value.trim();
    try {
      const result = await Api.sendAudio(this.meeting.id, speaker, blob);
      if (result.text && result.text.trim()) {
        this.addMessage(result.speaker || speaker || 'Speaker', result.text.trim(), { fromVoice: true });
      }
      if (result.analysis) this.renderAnalysis(result.analysis);
    } catch (error) {
      showToast('Speech not processed. Check the backend.');
    }
  },

  showMic(on) {
    $('#btn-mic').classList.toggle('on', on);
    $('#waveform').classList.toggle('on', on);
    $('#mic-label').textContent = on ? 'Listening' : 'Microphone off';

    if (!on) {
      $$('#waveform i').forEach((bar) => { bar.style.height = '6px'; });
      $('#btn-mic').style.setProperty('--level', 0);
    }
  },

  /** Moves the bars and the red ring with the sound level. */
  drawLevels(levels) {
    const bars = $$('#waveform i');
    let total = 0;

    bars.forEach((bar, index) => {
      const value = levels[index] || 0;
      total += value;
      bar.style.height = Math.max(6, (value / 255) * 44) + 'px';
    });

    const average = total / bars.length;
    $('#btn-mic').style.setProperty('--level', Math.min(1, average / 120));
  },

  // ---------- Wiring ----------

  init() {
    $('#waveform').innerHTML = '<i></i>'.repeat(32);

    $('#btn-start').onclick = () => this.start();
    $('#btn-end').onclick   = () => this.end();
    $('#btn-mic').onclick   = () => this.toggleMic();
    $('#btn-send').onclick  = () => this.sendTyped();
    $('#message').onkeydown = (event) => { if (event.key === 'Enter') this.sendTyped(); };
  },
};