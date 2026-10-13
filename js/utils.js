/**
 * Small helpers used by every other file.
 */

const $  = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/** Makes text safe to place inside HTML. */
function escapeHtml(value) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').replace(/[&<>"']/g, (char) => map[char]);
}

/** "2026-10-08" -> "8 Oct 2026" */
function formatDate(isoDate) {
  return new Date(isoDate).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** 75 -> "01:15" */
function formatTimer(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

/** Turns a list into HTML, or shows a message when the list is empty. */
function renderList(items, renderItem, emptyText = 'None recorded.') {
  if (!items || items.length === 0) {
    return `<div class="empty">${escapeHtml(emptyText)}</div>`;
  }
  return items.map(renderItem).join('');
}

/** Short message at the bottom of the screen. */
let toastTimer;
function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 2600);
}

/** Red banner at the top of the page, with an optional "Try again" button. */
function showError(message, onRetry) {
  const banner = $('#error-banner');
  banner.innerHTML = `<span>${escapeHtml(message)}</span>`;

  if (onRetry) {
    const retry = document.createElement('button');
    retry.className = 'btn btn-small';
    retry.textContent = 'Try again';
    retry.onclick = () => { hideError(); onRetry(); };
    banner.appendChild(retry);
  }
  banner.classList.add('visible');
}

function hideError() {
  $('#error-banner').classList.remove('visible');
}

/** Standard "backend problem" message used by the screens. */
function showBackendError(action, onRetry) {
  const where = CONFIG.API_BASE || 'this address';
  showError(`Could not ${action}. Check that the backend is running at ${where}.`, onRetry);
}

/** Back arrow icon (used on pages created by JavaScript). */
const BACK_ARROW_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>';