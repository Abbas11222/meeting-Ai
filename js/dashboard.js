/**
 * Dashboard page: numbers, charts and recent meetings.
 * All values come from GET /api/dashboard.
 */
const Dashboard = {

  async load() {
    $('#stats').innerHTML = '<div class="empty">Loading…</div>';

    try {
      const data = await Api.getDashboard();
      this.renderStats(data.stats);
      this.renderWeeklyChart(data.weekly);
      this.renderDonut(data.actions);
      this.renderRecent(data.recent);
    } catch (error) {
      showBackendError('load the dashboard', () => this.load());
    }
  },

  renderStats(stats) {
    const cards = [
      [stats.meetings,          'Meetings held'],
      [stats.decisions,         'Decisions made'],
      [stats.action_items,      'Action items'],
      [stats.open_action_items, 'Still open'],
    ];
    $('#stats').innerHTML = cards.map(([value, label]) => `
      <div class="card stat">
        <strong>${escapeHtml(value)}</strong>
        <span>${label}</span>
      </div>`).join('');
  },

  renderWeeklyChart(weeks) {
    const highest = Math.max(1, ...weeks.map((week) => week.count));
    $('#weekly-chart').innerHTML = renderList(weeks, (week) => `
      <div class="bar">
        <span>${escapeHtml(week.count)}</span>
        <i style="height: ${(week.count / highest) * 100}%"></i>
        <span>${escapeHtml(week.label)}</span>
      </div>`, 'No data yet.');
  },

  renderDonut({ done, open }) {
    const total = done + open;
    if (total === 0) {
      $('#action-donut').innerHTML = '<div class="empty">No action items yet.</div>';
      return;
    }

    const circumference = 2 * Math.PI * 40;
    const doneLength = (done / total) * circumference;
    const percent = Math.round((done / total) * 100);

    $('#action-donut').innerHTML = `
      <svg width="120" height="120" viewBox="0 0 100 100" role="img" aria-label="${done} of ${total} done">
        <circle cx="50" cy="50" r="40" fill="none" stroke="var(--amber-soft)" stroke-width="16"/>
        <circle cx="50" cy="50" r="40" fill="none" stroke="var(--accent)" stroke-width="16"
                stroke-dasharray="${doneLength} ${circumference}" transform="rotate(-90 50 50)"/>
        <text x="50" y="56" text-anchor="middle" font-size="18" font-weight="700" fill="var(--ink)">${percent}%</text>
      </svg>
      <div class="legend">
        <div><i style="background: var(--accent)"></i>Done (${done})</div>
        <div><i style="background: var(--amber)"></i>Open (${open})</div>
      </div>`;
  },

  renderRecent(meetings) {
    const container = $('#recent-meetings');
    container.innerHTML = renderList(
      meetings,
      Meetings.rowHtml,
      'No meetings yet. Create your first one.'
    );
    Meetings.bindRows(container);
  },
};