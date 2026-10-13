/**
 * Existing meetings: the searchable list and the detail page.
 */
const Meetings = {

  // ---------- List (GET /api/meetings) ----------

  async loadList() {
    $('#meeting-list').innerHTML = '<div class="empty">Loading…</div>';

    try {
      const meetings = await Api.getMeetings($('#search').value.trim());
      const container = $('#meeting-list');
      container.innerHTML = renderList(meetings, this.rowHtml, 'No meetings found.');
      this.bindRows(container);
    } catch (error) {
      showBackendError('load the meetings', () => this.loadList());
    }
  },

  /** One clickable row. Used by the dashboard and by the list. */
  rowHtml(meeting) {
    const topics = meeting.topics && meeting.topics.length
      ? ' · ' + meeting.topics.map(escapeHtml).join(', ')
      : '';

    return `
      <button class="meeting-row" data-meeting-id="${escapeHtml(meeting.id)}">
        <div>
          <h3>${escapeHtml(meeting.title)}</h3>
          <div class="muted small">${formatDate(meeting.date)} · ${escapeHtml(meeting.duration_min)} min${topics}</div>
        </div>
        <div class="row">
          <span class="tag">${escapeHtml(meeting.decision_count)} decisions</span>
          <span class="tag tag-amber">${escapeHtml(meeting.action_count)} tasks</span>
        </div>
      </button>`;
  },

  bindRows(container) {
    $$('[data-meeting-id]', container).forEach((row) => {
      row.onclick = () => this.open(row.dataset.meetingId);
    });
  },

  // ---------- Detail (GET /api/meetings/{id}) ----------

  async open(id) {
    try {
      const meeting = await Api.getMeeting(id);
      $('#view-detail').innerHTML = this.detailHtml(meeting);
      this.bindDetail(meeting);
      Router.show('detail');
    } catch (error) {
      showBackendError('open this meeting', () => this.open(id));
    }
  },

  detailHtml(meeting) {
    const topics = (meeting.topics || [])
      .map((topic) => `<span class="tag">${escapeHtml(topic)}</span>`)
      .join('');

    const decisions = renderList(meeting.decisions, (text) =>
      `<div class="item">✓ ${escapeHtml(text)}</div>`);

    const actions = renderList(meeting.action_items, (action) => {
      const status = action.done === undefined ? '' : ` · ${action.done ? 'Done' : 'Open'}`;
      return `
        <div class="item">
          <strong>${escapeHtml(action.task)}</strong>
          <div class="muted small">${escapeHtml(action.owner || 'Unassigned')} · Deadline: ${escapeHtml(action.deadline || 'none')}${status}</div>
        </div>`;
    });

    const questions = renderList(meeting.questions, (text) =>
      `<div class="item">${escapeHtml(text)}</div>`);

    const transcript = renderList(meeting.transcript, (line) =>
      `<p><strong>${escapeHtml(line.speaker)}:</strong> ${escapeHtml(line.text)}</p>`);

    return `
      <header class="page-header">
        <div class="title-row">
          <button class="back-arrow" data-back aria-label="Go back">${BACK_ARROW_SVG}</button>
          <div>
            <h1>${escapeHtml(meeting.title)}</h1>
            <p class="muted">${formatDate(meeting.date)} · ${escapeHtml(meeting.duration_min)} min</p>
          </div>
        </div>
      </header>

      <div class="grid-live">
        <div class="stack">
          <div class="card">
            <h2>Summary</h2>
            <p>${escapeHtml(meeting.summary) || 'No summary available.'}</p>
            <div class="row">${topics}</div>
          </div>

          <div class="card">
            <h2>Ask about this meeting</h2>
            <div class="ask-row">
              <input class="input" id="ask-input" placeholder="Type your question" aria-label="Question">
              <button class="btn btn-primary" id="ask-button">Ask</button>
            </div>
            <div class="answer" id="ask-answer"></div>
          </div>

          <div class="card">
            <h2>Full transcript</h2>
            <div class="transcript">${transcript}</div>
          </div>
        </div>

        <div class="card">
          <div class="section" style="margin-top: 0"><h3>Decisions</h3>${decisions}</div>
          <div class="section"><h3>Action items</h3>${actions}</div>
          <div class="section"><h3>Questions</h3>${questions}</div>
        </div>
      </div>`;
  },

  bindDetail(meeting) {
    const input  = $('#ask-input');
    const answer = $('#ask-answer');

    const ask = async () => {
      const question = input.value.trim();
      if (!question) return;

      answer.style.display = 'block';
      answer.textContent = 'Thinking…';
      try {
        const result = await Api.askQuestion(meeting.id, question);
        answer.textContent = result.answer;
      } catch (error) {
        answer.textContent = 'Could not get an answer. Try again.';
      }
    };

    $('#ask-button').onclick = ask;
    input.onkeydown = (event) => { if (event.key === 'Enter') ask(); };
    $('[data-back]', $('#view-detail')).onclick = () => Router.back();
  },
};