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
      container.innerHTML = renderList(meetings, (meeting) => this.rowHtml(meeting, true), 'No meetings found.');
      this.bindRows(container);
    } catch (error) {
      showBackendError('load the meetings', () => this.loadList());
    }
  },

  /** One row. `withActions` adds the PDF and Delete buttons (used on the Meetings page). */
  rowHtml(meeting, withActions = false) {
    const topics = meeting.topics && meeting.topics.length
      ? ' · ' + meeting.topics.map(escapeHtml).join(', ')
      : '';

    const actions = withActions ? `
      <div class="row-actions">
        <a class="btn btn-small" href="${Api.pdfUrl(meeting.id)}" target="_blank" rel="noopener">View PDF</a>
        <a class="btn btn-small" href="${Api.pdfUrl(meeting.id, true)}">Download PDF</a>
        <button class="btn btn-small btn-delete" data-delete-id="${escapeHtml(meeting.id)}"
                data-delete-title="${escapeHtml(meeting.title)}">Delete</button>
      </div>` : '';

    return `
      <div class="meeting-row">
        <button class="meeting-main" data-meeting-id="${escapeHtml(meeting.id)}">
          <div>
            <h3>${escapeHtml(meeting.title)}</h3>
            <div class="muted small">${formatDate(meeting.date)} · ${escapeHtml(meeting.duration_min)} min${topics}</div>
          </div>
          <div class="row">
            <span class="tag">${escapeHtml(meeting.decision_count)} decisions</span>
            <span class="tag tag-amber">${escapeHtml(meeting.action_count)} tasks</span>
          </div>
        </button>
        ${actions}
      </div>`;
  },

  bindRows(container) {
    $$('[data-meeting-id]', container).forEach((button) => {
      button.onclick = () => this.open(button.dataset.meetingId);
    });
    $$('[data-delete-id]', container).forEach((button) => {
      button.onclick = () => this.remove(button.dataset.deleteId, button.dataset.deleteTitle);
    });
  },

  // ---------- Delete (DELETE /api/meetings/{id}) ----------

  async remove(id, title) {
    const question = `Delete "${title}"?\nThe transcript, summary and tasks will be removed. This cannot be undone.`;
    if (!confirm(question)) return;

    try {
      await Api.deleteMeeting(id);
      showToast('Meeting deleted');
      await this.loadList();
    } catch (error) {
      showToast(error.fromServer ? error.message : 'Could not delete the meeting. Check the backend.', 5000);
    }
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
    const summary = meeting.summary
      ? `<p>${escapeHtml(meeting.summary)}</p>`
      : `<p class="muted">No summary yet.</p>
         <button class="btn btn-primary btn-small" id="regen-button">Generate summary</button>`;

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
        <div class="row">
          <a class="btn" href="${Api.pdfUrl(meeting.id)}" target="_blank" rel="noopener">View PDF</a>
          <a class="btn btn-primary" href="${Api.pdfUrl(meeting.id, true)}">Download PDF</a>
        </div>
      </header>

      <div class="grid-live">
        <div class="stack">
          <div class="card">
            <h2>Summary</h2>
            ${summary}
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
        answer.textContent = error.fromServer ? error.message : 'Could not get an answer. Try again.';
      }
    };

    const regenerate = $('#regen-button');
    if (regenerate) {
      regenerate.onclick = async () => {
        regenerate.disabled = true;
        regenerate.textContent = 'Generating…';
        try {
          await Api.regenerateSummary(meeting.id);
          await this.open(meeting.id);
          showToast('Summary generated');
        } catch (error) {
          regenerate.disabled = false;
          regenerate.textContent = 'Generate summary';
          showToast(error.fromServer ? error.message : 'Could not reach the server.', 7000);
        }
      };
    }

    $('#ask-button').onclick = ask;
    input.onkeydown = (event) => { if (event.key === 'Enter') ask(); };
    $('[data-back]', $('#view-detail')).onclick = () => Router.back();
  },
};