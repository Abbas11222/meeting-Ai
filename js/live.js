/**
 * Live meeting page: timer, microphone and chat.
 * Nothing is analyzed during the meeting. Everything is saved, and the AI summary and
 * structured output are created once, when the meeting ends.
 */
const Live = {
  meeting: null,     // { id, title, context } returned by the backend
  running: false,
  startedAt: 0,
  timer: null,
  micOn: false,
  engine: 'server',  // speech-to-text in use: 'server' (Groq) or 'browser' (Chrome fallback)
  messageCount: 0,
  speakers: new Set(),

  // ---------- Preparing the page ----------

  setup(meeting) {
    this.meeting = meeting;
    this.running = false;
    this.messageCount = 0;
    this.speakers = new Set();

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
    this.renderProgress();

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
    $('#btn-end').disabled = true;
    $('#live-status').textContent = 'Generating summary…';
    showBusy('Ending the meeting', 'Creating the summary and structured output. This can take up to a minute.');

    try {
      this.stopMic();
      clearInterval(this.timer);

      const meeting = await Api.endMeeting(this.meeting.id);
      this.running = false;
      hideBusy();

      Router.history = ['dashboard'];
      await Meetings.open(meeting.id);
      showToast(meeting.notice || 'Meeting saved', meeting.notice ? 9000 : 2600);
    } catch (error) {
      hideBusy();
      window.scrollTo(0, 0);
      console.error('Ending the meeting failed:', error);
      const reason = error.message.replace(/\.$/, '');     // shows the real cause, for example "Failed to fetch"
      showError(`Could not end the meeting: ${reason}. Your discussion is saved on the server.`, () => this.finish());
    } finally {
      $('#btn-end').disabled = false;
    }
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

    this.messageCount += 1;
    this.speakers.add(speaker);
    this.renderProgress();
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
      await Api.sendMessage(this.meeting.id, speaker, text);
    } catch (error) {
      showToast('Message not saved. Check the backend.');
    }
  },

  /** Small counters that replace the old live analysis panel. */
  renderProgress() {
    $('#stat-messages').textContent = this.messageCount;
    $('#stat-speakers').innerHTML = this.speakers.size
      ? [...this.speakers].map((name) => `<span class="tag">${escapeHtml(name)}</span>`).join(' ')
      : '<span class="muted">Nobody yet</span>';
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
    const serverReady = await this.isServerSpeechReady();

    try {
      await Microphone.start({
        onChunk:  (blob)   => this.sendAudio(blob),
        onLevels: (levels) => this.drawLevels(levels),
        record:   serverReady,
      });
    } catch (error) {
      showToast('Microphone unavailable. Allow access in your browser, or type in the chat.');
      return;
    }

    this.micOn = true;
    this.engine = 'server';
    this.showMic(true);

    if (serverReady) {
      $('#mic-hint').textContent = 'Your speech is sent to the server in short parts.';
    } else {
      this.useBrowserSpeech('Server speech-to-text is not set up.');
    }
  },

  /** Asks the backend if Groq (or local Whisper) is ready. */
  async isServerSpeechReady() {
    try {
      return (await Api.getSpeechStatus()).ready;
    } catch (error) {
      return true;     // backend unreachable: normal error messages will explain it
    }
  },

  /** Fallback: Chrome's built-in speech recognition. */
  useBrowserSpeech(reason) {
    Microphone.stopRecording();

    if (!BrowserSpeech.isSupported()) {
      showToast(`${reason} Chrome speech recognition is not available in this browser. Type in the chat instead.`, 8000);
      this.stopMic();
      return;
    }

    this.engine = 'browser';
    BrowserSpeech.start({
      onText:  (text)    => this.handleBrowserText(text),
      onError: (message) => { showToast(message, 6000); this.stopMic(); },
    });
    $('#mic-hint').textContent = 'Using Chrome speech recognition (fallback).';
    showToast(`${reason} Switched to Chrome speech recognition.`, 6000);
  },

  async handleBrowserText(text) {
    const speaker = $('#speaker').value.trim() || 'Speaker';
    this.addMessage(speaker, text, { fromVoice: true });
    try {
      await Api.sendMessage(this.meeting.id, speaker, text, 'voice');
    } catch (error) {
      showToast('Speech not saved. Check the backend.');
    }
  },

  stopMic() {
    if (!this.micOn) return;
    this.micOn = false;
    this.engine = 'server';

    // Each step is protected, so a problem in one of them never blocks the others
    // (or ending the meeting).
    try { BrowserSpeech.stop(); } catch (error) { console.error('Chrome speech did not stop:', error); }
    try { Microphone.stop(); }    catch (error) { console.error('Microphone did not stop:', error); }

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
    } catch (error) {
      // Groq failed (for example a wrong key or no internet): continue with Chrome instead.
      if (this.micOn && this.engine === 'server') {
        this.useBrowserSpeech('Server speech-to-text failed.');
      }
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