const WIDTH = 900;
const HEIGHT = 540;
const COLORS = {
  bg: '#000000',
  white: '#f8f8ff',
  muted: 'rgba(255,255,255,.62)',
  leftSide: '#ffffff',
  rightSide: '#ffffff',
  leftTop: '#ff3f6e',
  leftBottom: '#9b5cff',
  rightTop: '#2ee88f',
  rightBottom: '#ffd84f',
};

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let state = null;
  let room = null;
  let raf = 0;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * ratio));
    const h = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function loop() {
    resize();
    draw(ctx, canvas, state, room);
    raf = requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resize);
  raf = requestAnimationFrame(loop);

  return {
    setGameState(next) { state = next; },
    setRoomState(next) { room = next; },
    destroy() { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); },
  };
}

function draw(ctx, canvas, state, room) {
  const sx = canvas.width / WIDTH;
  const sy = canvas.height / HEIGHT;
  ctx.setTransform(sx, 0, 0, sy, 0, 0);
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  drawCenterLine(ctx);
  drawScores(ctx, state);
  drawPaddles(ctx, state, room);
  drawBall(ctx, state);
  drawOverlay(ctx, state, room);
}

function drawCenterLine(ctx) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.lineWidth = 4;
  ctx.setLineDash([12, 16]);
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2, 18);
  ctx.lineTo(WIDTH / 2, HEIGHT - 18);
  ctx.stroke();
  ctx.restore();
}

function drawScores(ctx, state) {
  const scores = state?.scores || state?.score || {};
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,.18)';
  ctx.font = '900 92px ui-sans-serif, system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(scores.left ?? state?.leftScore ?? 0, WIDTH * 0.38, 26);
  ctx.fillText(scores.right ?? state?.rightScore ?? 0, WIDTH * 0.62, 26);
  ctx.restore();
}

function drawPaddles(ctx, state, room) {
  const paddles = normalizePaddles(state);
  if (!paddles.length) drawPlaceholderPaddles(ctx);
  for (const paddle of paddles) {
    const slot = paddle.slot || paddle.id || '';
    const color = colorForSlot(slot);
    ctx.fillStyle = color;
    roundRect(ctx, paddle.x, paddle.y, paddle.width || paddle.w, paddle.height || paddle.h, 5);
    ctx.fill();
    drawLabel(ctx, labelForSlot(slot, room), paddle, color);
  }
}

function normalizePaddles(state) {
  const raw = state?.paddles || state?.players || [];
  if (Array.isArray(raw)) return raw.map(normalizePaddle).filter(Boolean);
  return Object.entries(raw).map(([slot, paddle]) => normalizePaddle({ slot, ...paddle })).filter(Boolean);
}

function normalizePaddle(p) {
  if (!p) return null;
  const width = p.width ?? p.w ?? (String(p.slot || '').includes('side') ? 14 : 120);
  const height = p.height ?? p.h ?? (String(p.slot || '').includes('side') ? 96 : 14);
  const x = p.x ?? (String(p.slot || '').startsWith('right') ? WIDTH - 35 : String(p.slot || '').includes('side') ? 28 : WIDTH / 2 - width / 2);
  const y = p.y ?? (String(p.slot || '').includes('bottom') ? HEIGHT - 35 : String(p.slot || '').includes('top') ? 21 : HEIGHT / 2 - height / 2);
  return { ...p, x, y, width, height };
}

function drawPlaceholderPaddles(ctx) {
  const placeholders = [
    { slot: 'left_side', x: 28, y: HEIGHT / 2 - 48, width: 14, height: 96 },
    { slot: 'right_side', x: WIDTH - 42, y: HEIGHT / 2 - 48, width: 14, height: 96 },
    { slot: 'left_top', x: WIDTH * .22, y: 21, width: 120, height: 14 },
    { slot: 'left_bottom', x: WIDTH * .22, y: HEIGHT - 35, width: 120, height: 14 },
    { slot: 'right_top', x: WIDTH * .64, y: 21, width: 120, height: 14 },
    { slot: 'right_bottom', x: WIDTH * .64, y: HEIGHT - 35, width: 120, height: 14 },
  ];
  for (const p of placeholders) {
    ctx.globalAlpha = .7;
    ctx.fillStyle = colorForSlot(p.slot);
    roundRect(ctx, p.x, p.y, p.width, p.height, 5);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawBall(ctx, state) {
  const ball = state?.ball;
  if (!ball) return;
  ctx.save();
  ctx.fillStyle = COLORS.white;
  ctx.beginPath();
  ctx.arc(ball.x ?? WIDTH / 2, ball.y ?? HEIGHT / 2, ball.radius ?? ball.r ?? 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawOverlay(ctx, state, room) {
  const status = state?.status || room?.status || 'waiting';
  if (['playing', 'running'].includes(status)) return;
  const text = status === 'paused' ? 'Paused' : status === 'lobby' || status === 'waiting' ? 'Waiting for players' : String(status).replace(/_/g, ' ');
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.52)';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = COLORS.white;
  ctx.font = '900 42px ui-sans-serif, system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(capitalize(text), WIDTH / 2, HEIGHT / 2 - 12);
  ctx.fillStyle = COLORS.muted;
  ctx.font = '600 18px ui-sans-serif, system-ui';
  ctx.fillText('Invite friends or press Start when ready', WIDTH / 2, HEIGHT / 2 + 34);
  ctx.restore();
}

function drawLabel(ctx, text, paddle, color) {
  if (!text) return;
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = '700 13px ui-sans-serif, system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const x = paddle.x + (paddle.width || paddle.w) / 2;
  const y = String(paddle.slot || '').includes('top') ? paddle.y + 30 : String(paddle.slot || '').includes('bottom') ? paddle.y - 16 : paddle.y - 14;
  ctx.fillText(text, x, Math.max(14, Math.min(HEIGHT - 14, y)));
  ctx.restore();
}

function labelForSlot(slot, room) {
  const player = (room?.players || []).find?.((p) => p.slot === slot);
  return player?.name || '';
}

function colorForSlot(slot) {
  if (slot === 'left_top') return COLORS.leftTop;
  if (slot === 'left_bottom') return COLORS.leftBottom;
  if (slot === 'right_top') return COLORS.rightTop;
  if (slot === 'right_bottom') return COLORS.rightBottom;
  if (slot === 'left_side') return COLORS.leftSide;
  if (slot === 'right_side') return COLORS.rightSide;
  return COLORS.white;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function capitalize(value) {
  const s = String(value);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
