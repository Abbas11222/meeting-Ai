/**
 * Starts the app and switches between pages.
 */
const Router = {
  history: ['dashboard'],   // pages visited, used by the back arrow

  show(name, { isBack = false } = {}) {
    $$('.view').forEach((view) => {
      view.classList.toggle('active', view.id === `view-${name}`);
    });
    $$('.nav-link').forEach((link) => {
      const isCurrent = link.dataset.view === name || (name === 'detail' && link.dataset.view === 'list');
      link.classList.toggle('active', isCurrent);
    });

    if (!isBack && this.history[this.history.length - 1] !== name) {
      this.history.push(name);
    }

    window.scrollTo(0, 0);
    hideError();

    if (name === 'dashboard') Dashboard.load();
    if (name === 'list')      Meetings.loadList();
  },

  /** Back arrow: returns to the previous page (or the dashboard). */
  back() {
    if (Live.running && !confirm('A meeting is running. Leave this page?')) return;

    this.history.pop();
    const previous = this.history[this.history.length - 1] || 'dashboard';
    this.show(previous, { isBack: true });
  },

  bindLinks() {
    // Buttons with data-view="..." open that page.
    $$('[data-view]').forEach((button) => {
      button.onclick = () => {
        if (Live.running && !confirm('A meeting is running. Leave this page?')) return;
        this.history = [];
        this.show(button.dataset.view);
      };
    });

    // Back arrows that already exist in the page.
    $$('[data-back]').forEach((button) => {
      button.onclick = () => this.back();
    });
  },
};

/** Lists script files that did not load (not copied into the folder, or wrong name). */
function findMissingScripts() {
  const loaded = {
    'js/api.js':            typeof Api,
    'js/microphone.js':     typeof Microphone,
    'js/browser-speech.js': typeof BrowserSpeech,
    'js/dashboard.js':      typeof Dashboard,
    'js/meetings.js':       typeof Meetings,
    'js/new-meeting.js':    typeof NewMeetingDialog,
    'js/live.js':           typeof Live,
  };
  return Object.keys(loaded).filter((file) => loaded[file] === 'undefined');
}

document.addEventListener('DOMContentLoaded', () => {
  const missing = findMissingScripts();
  if (missing.length > 0) {
    showError(`These files did not load: ${missing.join(', ')}. Copy them into your project folder and press Ctrl+F5.`);
    return;
  }

  Router.bindLinks();
  NewMeetingDialog.init();
  Live.init();

  let searchTimer;
  $('#search').oninput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => Meetings.loadList(), CONFIG.SEARCH_DELAY_MS);
  };

  Dashboard.load();
});