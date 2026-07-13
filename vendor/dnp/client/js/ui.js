export const SLOT_LABELS = {
  left_side: 'Left side (W/S)',
  left_top: 'Left top (A/D)',
  left_bottom: 'Left bottom (A/D)',
  right_side: 'Right side (↑/↓)',
  right_top: 'Right top (←/→)',
  right_bottom: 'Right bottom (←/→)',
};

export function $(selector, root = document) {
  return root.querySelector(selector);
}

export function setMessage(element, text = '', kind = '') {
  if (!element) return;
  element.textContent = text;
  element.className = `message${kind ? ` ${kind}` : ''}`;
}

export function normalizeName(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return { ok: false, message: 'Please enter a display name.' };
  if (trimmed.length > 16) return { ok: false, message: 'Names must be 16 characters or fewer.' };
  return { ok: true, value: trimmed };
}

export function normalizeRoomCode(code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(normalized)) {
    return { ok: false, message: 'Room codes are 6 letters or numbers.' };
  }
  return { ok: true, value: normalized };
}

export function getBasePath() {
  const configured = window.DNP_CONFIG?.basePath || '';
  if (configured && configured !== '/') return configured.replace(/\/+$/g, '');
  const marker = '/dnp';
  return window.location.pathname === marker || window.location.pathname.startsWith(`${marker}/`) ? marker : '';
}

export function buildAppUrl(path = '/') {
  const base = getBasePath();
  const suffix = String(path || '/').startsWith('/') ? String(path || '/') : `/${path}`;
  return `${base}${suffix}` || '/';
}

export function buildInviteUrl(code) {
  return `${window.location.origin}${buildAppUrl(`/join/${encodeURIComponent(code)}`)}`;
}

export function updateConnection(status) {
  const text = $('#connection-status');
  const dot = $('#connection-dot');
  if (text) text.textContent = status;
  if (dot) {
    dot.classList.toggle('open', status === 'Connected');
    dot.classList.toggle('closed', ['Disconnected', 'Connection error'].includes(status));
  }
}

export function updateRoomUi(roomState, myPlayerId) {
  const code = roomState?.code || roomState?.roomCode || roomState?.room?.code || '------';
  const roomCodeDisplay = $('#room-code-display');
  const share = $('#share-link');
  if (roomCodeDisplay) roomCodeDisplay.textContent = code;
  if (share && code !== '------') share.value = buildInviteUrl(code);

  const players = Array.isArray(roomState?.players) ? roomState.players : Array.from(roomState?.players?.values?.() || []);
  const list = $('#player-list');
  if (list) {
    list.innerHTML = '';
    const ordered = players.slice().sort((a, b) => String(a.slot || '').localeCompare(String(b.slot || '')) || String(a.name || '').localeCompare(String(b.name || '')));
    const slots = ['left_side', 'left_top', 'left_bottom', 'right_side', 'right_top', 'right_bottom'];
    const bySlot = new Map(ordered.filter((p) => p.slot).map((p) => [p.slot, p]));
    const rows = slots.map((slot) => bySlot.get(slot) || { slot, name: 'Open slot', empty: true });
    for (const player of rows) {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = `${player.name || 'Player'}${player.isAi ? ' 🤖' : ''}`;
      if (player.empty) name.className = 'muted';
      const meta = document.createElement('span');
      meta.className = 'slot';
      meta.textContent = SLOT_LABELS[player.slot] || player.slot || 'Spectator';
      li.append(name, meta);
      if ((player.id || player.playerId) === myPlayerId) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = 'You';
        li.append(badge);
      }
      list.append(li);
    }
    for (const player of ordered.filter((p) => !p.slot)) {
      const li = document.createElement('li');
      li.innerHTML = `<span>${escapeHtml(player.name || 'Player')}</span><span class="slot">Spectator</span>`;
      list.append(li);
    }
  }

  const humans = players.filter((p) => !p.isAi).length;
  const isAdmin = Boolean(roomState?.isAdmin || roomState?.admin || roomState?.adminPlayerId === myPlayerId || roomState?.adminId === myPlayerId);
  const adminPanel = $('#admin-panel');
  const start = $('#start-game');
  const help = $('#admin-help');
  if (adminPanel) adminPanel.hidden = !isAdmin;
  if (start) start.disabled = !roomState?.isSinglePlayer && humans < 2;
  if (help) help.textContent = roomState?.isSinglePlayer ? 'Start whenever you are ready.' : humans >= 2 ? 'Ready to start.' : 'Need at least 2 human players for multiplayer.';
}

export function updateGameUi(gameState = {}) {
  const left = $('#left-score');
  const right = $('#right-score');
  const status = $('#game-status');
  const scores = gameState.scores || gameState.score || {};
  if (left) left.textContent = scores.left ?? gameState.leftScore ?? 0;
  if (right) right.textContent = scores.right ?? gameState.rightScore ?? 0;
  if (status) status.textContent = humanStatus(gameState.status || gameState.phase || 'Playing');
}

function humanStatus(status) {
  return String(status).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}
