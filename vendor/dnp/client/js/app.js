import { createRenderer } from './render.js';
import { createInputController } from './input.js';
import { $, setMessage, normalizeName, normalizeRoomCode, buildInviteUrl, buildAppUrl, updateConnection, updateRoomUi, updateGameUi } from './ui.js';

const STORAGE_NAME = 'dnp.displayName';
const SESSION_ACTION = 'dnp.pendingAction';

const page = document.body?.dataset?.page;

if (page === 'home') initHome();
if (page === 'join') initJoin();
if (page === 'room') initRoom();

function initHome() {
  const nameInput = $('#display-name');
  const codeInput = $('#room-code');
  const message = $('#home-message');
  nameInput.value = localStorage.getItem(STORAGE_NAME) || '';
  codeInput.addEventListener('input', () => { codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); });

  document.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const name = normalizeName(nameInput.value);
      if (!name.ok) return setMessage(message, name.message, 'error');
      localStorage.setItem(STORAGE_NAME, name.value);

      const action = button.dataset.action;
      if (action === 'join') {
        const code = normalizeRoomCode(codeInput.value);
        if (!code.ok) return setMessage(message, code.message, 'error');
        queueAndGo({ action: 'join_room', name: name.value, code: code.value });
        return;
      }
      if (action === 'single') queueAndGo({ action: 'single_player', name: name.value });
      if (action === 'random') queueAndGo({ action: 'join_random', name: name.value });
      if (action === 'create') queueAndGo({ action: 'create_room', name: name.value });
    });
  });
}

function initJoin() {
  const code = extractJoinCode();
  const heading = $('#join-code-heading');
  const nameInput = $('#join-name');
  const message = $('#join-message');
  if (heading) heading.textContent = code ? `Room ${code}` : 'Invalid room link';
  nameInput.value = localStorage.getItem(STORAGE_NAME) || '';

  $('#join-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (!code) return setMessage(message, 'This invite link does not include a valid 6-character room code.', 'error');
    const name = normalizeName(nameInput.value);
    if (!name.ok) return setMessage(message, name.message, 'error');
    localStorage.setItem(STORAGE_NAME, name.value);
    queueAndGo({ action: 'join_room', name: name.value, code });
  });

  if (code && nameInput.value.trim()) $('#join-form').requestSubmit();
}

function initRoom() {
  const canvas = $('#game-canvas');
  const renderer = createRenderer(canvas);
  const pending = readPendingAction();
  const url = new URL(window.location.href);
  let myPlayerId = sessionStorage.getItem('dnp.playerId') || '';
  let mySlot = '';
  let lastRoomState = null;
  let joined = false;
  let reconnectTimer = 0;
  let ws = null;

  const send = (payload) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  };
  createInputController((direction) => send({ type: 'input', direction }), () => mySlot);

  $('#start-game')?.addEventListener('click', () => send({ type: 'admin_start' }));
  $('#copy-link')?.addEventListener('click', copyInvite);
  $('#return-home')?.addEventListener('click', () => sessionStorage.removeItem(SESSION_ACTION));

  connect();

  function connect() {
    updateConnection('Connecting…');
    ws = new WebSocket(wsUrl());

    ws.addEventListener('open', () => {
      updateConnection('Connected');
      const action = pending || actionFromUrl(url);
      if (action && !joined) {
        sendAction(action);
        joined = true;
      } else if (lastRoomState?.code) {
        const name = localStorage.getItem(STORAGE_NAME) || 'Player';
        sendAction({ action: 'join_room', type: 'join_room', name, code: lastRoomState.code });
      }
    });

    ws.addEventListener('message', (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      handleMessage(data);
    });

    ws.addEventListener('close', () => {
      updateConnection('Disconnected');
      setMessage($('#room-message'), 'Disconnected. Reconnecting… or return home.', 'error');
      clearTimeout(reconnectTimer);
      reconnectTimer = window.setTimeout(connect, 1500);
    });

    ws.addEventListener('error', () => {
      updateConnection('Connection error');
      setMessage($('#room-message'), 'Could not reach the game server.', 'error');
    });
  }

  function handleMessage(data) {
    if (data.type === 'error') {
      setMessage($('#room-message'), data.message || 'Something went wrong.', 'error');
      return;
    }

    const roomState = data.type === 'room_state' ? data : data.room || data.roomState;
    const gameState = data.type === 'game_state' ? data : data.game || data.gameState;
    const playerId = data.playerId || data.id || data.me?.id;
    if (playerId) {
      myPlayerId = playerId;
      sessionStorage.setItem('dnp.playerId', playerId);
    }

    if (roomState) {
      lastRoomState = roomState;
      const me = (roomState.players || []).find((p) => (p.id || p.playerId) === myPlayerId) || roomState.me;
      if (me?.slot) mySlot = me.slot;
      renderer.setRoomState(roomState);
      updateRoomUi(roomState, myPlayerId);
      setMessage($('#room-message'), '', '');
    }

    if (gameState) {
      renderer.setGameState(gameState);
      updateGameUi(gameState);
    }
  }

  function sendAction(action) {
    const payload = { ...action, type: action.type || action.action };
    send(payload);
  }

  async function copyInvite() {
    const code = lastRoomState?.code || $('#room-code-display')?.textContent;
    const link = code && code !== '------' ? buildInviteUrl(code) : window.location.href;
    try {
      await navigator.clipboard.writeText(link);
      $('#copy-message').textContent = 'Copied!';
    } catch {
      $('#share-link')?.select();
      $('#copy-message').textContent = 'Select and copy the link.';
    }
  }
}

function queueAndGo(action) {
  sessionStorage.setItem(SESSION_ACTION, JSON.stringify({ ...action, type: action.type || action.action }));
  window.location.assign(buildAppUrl('/room.html'));
}

function readPendingAction() {
  const raw = sessionStorage.getItem(SESSION_ACTION);
  if (!raw) return null;
  sessionStorage.removeItem(SESSION_ACTION);
  try { return JSON.parse(raw); } catch { return null; }
}

function actionFromUrl(url) {
  const code = url.searchParams.get('code') || url.searchParams.get('room');
  if (!code) return null;
  const normalized = normalizeRoomCode(code);
  if (!normalized.ok) return null;
  return { action: 'join_room', type: 'join_room', code: normalized.value, name: localStorage.getItem(STORAGE_NAME) || 'Player' };
}

function extractJoinCode() {
  const path = window.location.pathname;
  const match = path.match(/\/join\/([A-Za-z0-9]{6})\/?$/) || path.match(/join\.html\/?$/) && new URL(window.location.href).searchParams.get('code')?.match(/^([A-Za-z0-9]{6})$/);
  const code = Array.isArray(match) ? match[1] : null;
  return code ? code.toUpperCase() : null;
}

function wsUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const configured = window.DNP_CONFIG?.wsPath || buildAppUrl('/ws');
  return `${protocol}//${window.location.host}${configured}`;
}
