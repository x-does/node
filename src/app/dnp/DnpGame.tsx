'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createInitialDnpState,
  getResponsiveArenaSize,
  resizeDnpState,
  restartDnpGame,
  setPaused,
  stepDnpGame,
  type DnpGameState,
  type DnpInputState,
} from './game';
import type { DnpPublicRoom } from '@/lib/dnp/domain';
import { getDnpSlot, getDnpSlotGeometry } from '@/lib/dnp/domain';

const inputTemplate = (): DnpInputState => ({ up: false, down: false, left: false, right: false, pointerX: null, pointerY: null });

type MultiplayerSession = { room: DnpPublicRoom; token: string; playerId: string };

type DnpGameProps = { initialJoin?: { code?: string } };

async function postDnp(path: string, body: Record<string, unknown>) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'DNP request failed.');
  return payload as { room: DnpPublicRoom; token?: string; playerId?: string };
}

async function pollDnpRoom(code: string, token: string) {
  const response = await fetch(`/api/dnp/rooms/${code}`, { cache: 'no-store', headers: { Authorization: `Bearer ${token}` } });
  const payload = (await response.json()) as { room?: DnpPublicRoom; error?: string };
  if (!response.ok || !payload.room) throw new Error(payload.error ?? 'Polling failed.');
  return payload.room;
}

function drawMultiplayerGame(ctx: CanvasRenderingContext2D, room: DnpPublicRoom, width: number, height: number) {
  ctx.clearRect(0, 0, width, height);
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#090b17');
  gradient.addColorStop(0.5, '#121936');
  gradient.addColorStop(1, '#07110f');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  ctx.strokeRect(14, 14, width - 28, height - 28);
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = '#ffffff';
  ctx.setLineDash([12, 16]);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(width / 2, 20);
  ctx.lineTo(width / 2, height - 20);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = 'rgba(255,255,255,0.055)';
  ctx.font = `${Math.round(width * 0.16)}px ui-sans-serif, system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(room.scores.left), width * 0.34, height * 0.48);
  ctx.fillText(String(room.scores.right), width * 0.66, height * 0.48);

  for (const player of room.players) {
    const slot = getDnpSlot(player.slotIndex);
    const base = getDnpSlotGeometry(player.slotIndex, width, height);
    const color = slot.half === 'left' ? '#ff426f' : '#2ee88f';
    const geometry = { ...base };
    if (base.axis === 'y') {
      geometry.y = Math.round(Math.max(0, Math.min(1, player.input)) * (height - base.height));
    } else {
      const gap = Math.round(width * 0.022);
      const halfMin = slot.half === 'left' ? gap : width / 2 + gap;
      const halfMax = slot.half === 'left' ? width / 2 - gap : width - gap;
      geometry.x = Math.round(halfMin + Math.max(0, Math.min(1, player.input)) * (halfMax - halfMin - base.width));
    }
    ctx.shadowBlur = 18;
    ctx.shadowColor = color;
    ctx.fillStyle = color;
    ctx.fillRect(geometry.x, geometry.y, geometry.width, geometry.height);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#071014';
    ctx.font = `800 ${Math.max(10, Math.round(Math.min(geometry.width, geometry.height) * 0.45))}px ui-sans-serif, system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(player.name.slice(0, 16), geometry.x + geometry.width / 2, geometry.y + geometry.height / 2, Math.max(20, geometry.width - 8));
  }

  ctx.shadowBlur = 22;
  ctx.shadowColor = '#7c5cff';
  ctx.fillStyle = '#f7f7fb';
  ctx.beginPath();
  ctx.arc(room.ball.x * width, room.ball.y * height, Math.max(7, width * 0.011), 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  if (room.status !== 'playing') {
    ctx.fillStyle = 'rgba(7,8,13,0.58)';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.max(22, Math.round(width * 0.04))}px ui-sans-serif, system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText(room.players.length < 2 ? 'Waiting for players' : 'Admin can start', width / 2, height / 2);
  }
}

function drawGame(ctx: CanvasRenderingContext2D, state: DnpGameState) {
  const { width, height, player, ai, ball } = state;
  ctx.clearRect(0, 0, width, height);

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#090b17');
  gradient.addColorStop(0.48, '#121936');
  gradient.addColorStop(1, '#07110f');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = '#ffffff';
  ctx.setLineDash([12, 16]);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(width / 2, 20);
  ctx.lineTo(width / 2, height - 20);
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  ctx.strokeRect(14, 14, width - 28, height - 28);

  ctx.shadowBlur = 22;
  ctx.shadowColor = '#ff426f';
  ctx.fillStyle = '#ff426f';
  ctx.fillRect(player.x, player.y, player.width, player.height);

  ctx.shadowColor = '#2ee88f';
  ctx.fillStyle = '#2ee88f';
  ctx.fillRect(ai.x, ai.y, ai.width, ai.height);

  ctx.shadowColor = '#7c5cff';
  ctx.fillStyle = '#f7f7fb';
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = 'rgba(255,255,255,0.055)';
  ctx.font = `${Math.round(width * 0.16)}px ui-sans-serif, system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(state.playerScore), width * 0.34, height * 0.48);
  ctx.fillText(String(state.aiScore), width * 0.66, height * 0.48);

  if (state.paused) {
    ctx.fillStyle = 'rgba(7,8,13,0.58)';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.max(22, Math.round(width * 0.04))}px ui-sans-serif, system-ui`;
    ctx.fillText(state.message, width / 2, height / 2);
  }
}

export default function DnpGame({ initialJoin }: DnpGameProps = {}) {
  const initialSize = useMemo(() => getResponsiveArenaSize(900, 700), []);
  const [state, setState] = useState(() => createInitialDnpState(initialSize.width, initialSize.height));
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState(initialJoin?.code ?? '');
  const [mode, setMode] = useState<'single' | 'multi'>('single');
  const [session, setSession] = useState<MultiplayerSession | null>(null);
  const [notice, setNotice] = useState('Enter a display name (1-16 chars) to play.');
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const inputRef = useRef<DnpInputState>(inputTemplate());
  const activePointerRef = useRef<number | null>(null);
  const inputSeqRef = useRef(0);
  const lastSentInputRef = useRef(-1);
  const sessionRef = useRef<MultiplayerSession | null>(null);
  const stateSizeRef = useRef({ width: initialSize.width, height: initialSize.height });

  const render = useCallback((gameState: DnpGameState, room?: DnpPublicRoom | null) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const ratio = window.devicePixelRatio || 1;
    const backingWidth = Math.round(gameState.width * ratio);
    const backingHeight = Math.round(gameState.height * ratio);
    if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
      canvas.width = backingWidth;
      canvas.height = backingHeight;
      canvas.style.width = `${gameState.width}px`;
      canvas.style.height = `${gameState.height}px`;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (room) drawMultiplayerGame(ctx, room, gameState.width, gameState.height);
    else drawGame(ctx, gameState);
  }, []);

  useEffect(() => {
    const updateSize = () => {
      const size = getResponsiveArenaSize(window.innerWidth, window.innerHeight);
      setState((current) => resizeDnpState(current, size.width, size.height));
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    stateSizeRef.current = { width: state.width, height: state.height };
    render(state, mode === 'multi' ? session?.room : null);
  }, [mode, render, session?.room, state]);

  useEffect(() => {
    const tick = (time: number) => {
      const last = lastTimeRef.current ?? time;
      lastTimeRef.current = time;
      const dt = Math.min((time - last) / 1000, 0.033);
      setState((current) => (mode === 'multi' ? current : stepDnpGame(current, inputRef.current, dt)));
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [mode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') inputRef.current.up = true;
      if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') inputRef.current.down = true;
      if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') inputRef.current.left = true;
      if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') inputRef.current.right = true;
      if (event.key === ' ' || event.key.toLowerCase() === 'p') {
        event.preventDefault();
        setState((current) => setPaused(current, !current.paused));
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') inputRef.current.up = false;
      if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') inputRef.current.down = false;
      if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') inputRef.current.left = false;
      if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') inputRef.current.right = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const sessionCode = session?.room.code;
  const sessionToken = session?.token;

  useEffect(() => {
    if (!sessionCode || !sessionToken) return undefined;
    const sendInput = async () => {
      const currentSession = sessionRef.current;
      if (!currentSession) return;
      const player = currentSession.room.players.find((entry) => entry.id === currentSession.playerId);
      if (!player) return;
      const slot = getDnpSlot(player.slotIndex);
      const controls = inputRef.current;
      const delta = slot.kind === 'side' ? (controls.down ? 0.035 : 0) - (controls.up ? 0.035 : 0) : (controls.right ? 0.035 : 0) - (controls.left ? 0.035 : 0);
      let position = Math.max(0, Math.min(1, player.input + delta));
      const canvas = canvasRef.current;
      const size = stateSizeRef.current;
      if (canvas) {
        if (slot.kind === 'side' && controls.pointerY !== null) position = Math.max(0, Math.min(1, controls.pointerY / size.height));
        if (slot.kind !== 'side' && controls.pointerX !== null) position = Math.max(0, Math.min(1, controls.pointerX / size.width));
      }
      const pointerActive = slot.kind === 'side' ? controls.pointerY !== null : controls.pointerX !== null;
      if (Math.abs(position - lastSentInputRef.current) < 0.004 && delta === 0 && !pointerActive) return;
      lastSentInputRef.current = position;
      inputSeqRef.current += 1;
      const payload = await postDnp(`/api/dnp/rooms/${sessionCode}/input`, { token: sessionToken, position, seq: inputSeqRef.current });
      if (payload.room) setSession((current) => (current ? { ...current, room: payload.room } : current));
    };
    const inputId = window.setInterval(() => void sendInput().catch(() => undefined), 100);
    const poll = async () => {
      try {
        const room = await pollDnpRoom(sessionCode, sessionToken);
        setSession((current) => (current ? { ...current, room } : current));
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Polling failed.');
      }
    };
    const id = window.setInterval(poll, 500);
    void poll();
    return () => {
      window.clearInterval(id);
      window.clearInterval(inputId);
    };
  }, [sessionCode, sessionToken]);

  const validName = name.trim().length >= 1 && name.trim().length <= 16;
  const runAction = async (action: () => Promise<void>, options: { requireName?: boolean } = { requireName: true }) => {
    if (options.requireName !== false && !validName) {
      setNotice('Name must be 1-16 characters.');
      return;
    }
    setBusy(true);
    try {
      await action();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'DNP request failed.');
    } finally {
      setBusy(false);
    }
  };
  const enterSinglePlayer = () => void runAction(async () => {
    setMode('single');
    setSession(null);
    setNotice(`Playing locally as ${name.trim()}.`);
  });
  const createRoom = () => void runAction(async () => {
    const payload = await postDnp('/api/dnp/rooms', { name });
    if (!payload.token || !payload.playerId) throw new Error('Missing room credentials.');
    window.sessionStorage.setItem(`dnp:${payload.room.code}`, JSON.stringify({ token: payload.token, playerId: payload.playerId, name }));
    setMode('multi');
    setSession({ room: payload.room, token: payload.token, playerId: payload.playerId });
    setNotice(`Room ${payload.room.code} created.`);
  });
  const joinRoomAction = () => void runAction(async () => {
    const code = joinCode.trim().toUpperCase();
    const cached = window.sessionStorage.getItem(`dnp:${code}`);
    const token = cached ? (JSON.parse(cached) as { token?: string }).token : undefined;
    const payload = await postDnp(`/api/dnp/rooms/${code}/join`, { name, token });
    if (!payload.token || !payload.playerId) throw new Error('Missing room credentials.');
    window.sessionStorage.setItem(`dnp:${payload.room.code}`, JSON.stringify({ token: payload.token, playerId: payload.playerId, name }));
    setMode('multi');
    setSession({ room: payload.room, token: payload.token, playerId: payload.playerId });
    setNotice(`Joined ${payload.room.code}.`);
  });
  const randomMatch = () => void runAction(async () => {
    const payload = await postDnp('/api/dnp/matchmaking', { name });
    if (!payload.token || !payload.playerId) throw new Error('Missing matchmaking credentials.');
    window.sessionStorage.setItem(`dnp:${payload.room.code}`, JSON.stringify({ token: payload.token, playerId: payload.playerId, name, matchmaking: true }));
    setMode('multi');
    setSession({ room: payload.room, token: payload.token, playerId: payload.playerId });
    setNotice(payload.room.status === 'playing' ? 'Random 1v1 matched.' : 'Waiting for a random opponent.');
  });
  const admin = (action: string, extra: Record<string, unknown> = {}) => void runAction(async () => {
    const current = sessionRef.current;
    if (!current) return;
    const payload = await postDnp(`/api/dnp/rooms/${current.room.code}/admin`, { token: current.token, action, ...extra });
    setSession((existing) => (existing ? { ...existing, room: payload.room } : existing));
  }, { requireName: false });
  const leaveRoom = () => void runAction(async () => {
    const current = sessionRef.current;
    if (!current) return;
    await postDnp(`/api/dnp/rooms/${current.room.code}/leave`, { token: current.token });
    window.sessionStorage.removeItem(`dnp:${current.room.code}`);
    setSession(null);
    setMode('single');
    setNotice('Left multiplayer room.');
  }, { requireName: false });
  const reassignSlot = (playerId: string, slotIndex: number) => {
    if (!session) return;
    const assignments = Object.fromEntries(session.room.players.map((player) => [player.id, player.id === playerId ? slotIndex : player.slotIndex]));
    admin('reassign', { assignments });
  };

  const updatePointer = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const size = stateSizeRef.current;
    inputRef.current.pointerX = ((clientX - rect.left) / rect.width) * size.width;
    inputRef.current.pointerY = ((clientY - rect.top) / rect.height) * size.height;
  };

  return (
    <section className="min-h-[calc(100vh-10rem)] bg-[radial-gradient(circle_at_top,#18203a_0,#07080d_56%)] px-4 py-8 text-white sm:py-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-black/30 backdrop-blur md:flex md:items-end md:justify-between md:p-7">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-300">Browser-only arcade</p>
            <h1 className="mt-2 text-4xl font-black tracking-[-0.06em] md:text-6xl">DefinitelyNotPong</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 md:text-base">
              A Hostinger-safe paddle duel: local single-player plus short-polled multiplayer rooms, no WebSockets and no custom runtime.
            </p>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 text-center md:mt-0">
            <div className="rounded-2xl border border-rose-300/20 bg-rose-400/10 px-5 py-3">
              <span className="block text-xs font-bold uppercase tracking-widest text-rose-200">Left</span>
              <strong className="text-4xl">{session ? session.room.scores.left : state.playerScore}</strong>
            </div>
            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-5 py-3">
              <span className="block text-xs font-bold uppercase tracking-widest text-emerald-200">Right</span>
              <strong className="text-4xl">{session ? session.room.scores.right : state.aiScore}</strong>
            </div>
          </div>
        </header>

        <div className="grid gap-3 rounded-[1.6rem] border border-white/10 bg-white/[0.06] p-4 shadow-2xl shadow-black/30 md:grid-cols-[1fr_auto]">
          <label className="text-sm font-bold text-slate-200">
            Display name
            <input className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none" maxLength={16} onChange={(event) => setName(event.target.value)} placeholder="1-16 characters" value={name} />
          </label>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:items-end">
            <button className="rounded-2xl bg-white/10 px-4 py-3 font-black disabled:opacity-40" disabled={busy || !validName} onClick={enterSinglePlayer} type="button">Single player</button>
            <button className="rounded-2xl bg-white/10 px-4 py-3 font-black disabled:opacity-40" disabled={busy || !validName} onClick={randomMatch} type="button">Random 1v1</button>
            <button className="rounded-2xl bg-gradient-to-br from-violet-500 to-sky-500 px-4 py-3 font-black disabled:opacity-40" disabled={busy || !validName} onClick={createRoom} type="button">Create room</button>
            <div className="flex gap-2">
              <input className="min-w-0 rounded-2xl border border-white/10 bg-black/30 px-3 py-3 text-white uppercase outline-none" maxLength={6} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="CODE" value={joinCode} />
              <button className="rounded-2xl bg-emerald-500 px-4 py-3 font-black disabled:opacity-40" disabled={busy || !validName || joinCode.trim().length !== 6} onClick={joinRoomAction} type="button">Join</button>
            </div>
          </div>
          <p className="text-sm text-emerald-200 md:col-span-2" role="status">{notice}</p>
        </div>

        {session ? (
          <div className="rounded-[1.6rem] border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm text-emerald-50">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <strong className="text-lg">Room {session.room.code}</strong>
              <a className="underline" href={`/dnp/join/${session.room.code}`}>Share /dnp/join/{session.room.code}</a>
              <button className="rounded-xl bg-white/15 px-3 py-2 font-black" onClick={() => void navigator.clipboard?.writeText(`${window.location.origin}/dnp/join/${session.room.code}`).then(() => setNotice('Share link copied.'))} type="button">Copy link</button>
              <button className="rounded-xl bg-rose-500/80 px-3 py-2 font-black" onClick={leaveRoom} type="button">Leave</button>
              {session.room.adminPlayerId === session.playerId ? <button className="rounded-xl bg-white/15 px-3 py-2 font-black" onClick={() => admin(session.room.status === 'playing' ? 'restart' : 'start')} type="button">{session.room.status === 'playing' ? 'Restart' : 'Start'}</button> : null}
            </div>
            <ol className="mt-3 grid gap-2 md:grid-cols-3">
              {session.room.players.map((player) => (
                <li className="rounded-xl bg-black/20 px-3 py-2" key={player.id}>
                  {player.name} · {getDnpSlot(player.slotIndex).label}{player.isAdmin ? ' · admin' : ''}{player.online ? '' : ' · offline'}
                  {session.room.adminPlayerId === session.playerId ? (
                    <select className="ml-2 rounded bg-black/40 px-1 py-0.5 text-xs" onChange={(event) => reassignSlot(player.id, Number(event.target.value))} value={player.slotIndex}>
                      {Array.from({ length: 12 }, (_, index) => <option key={index} value={index}>{getDnpSlot(index).label}</option>)}
                    </select>
                  ) : null}
                  {session.room.adminPlayerId === session.playerId && !player.isAdmin ? <button className="ml-2 text-rose-200 underline" onClick={() => admin('kick', { playerId: player.id })} type="button">kick</button> : null}
                  {session.room.adminPlayerId === session.playerId && !player.isAdmin ? <button className="ml-2 text-sky-200 underline" onClick={() => admin('transfer', { playerId: player.id })} type="button">make admin</button> : null}
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.05] p-2 shadow-2xl shadow-black/30">
          <canvas
            ref={canvasRef}
            aria-label="DefinitelyNotPong play field"
            className="mx-auto block max-w-full touch-none rounded-[1.15rem] border border-white/10 bg-black"
            onPointerDown={(event) => {
              activePointerRef.current = event.pointerId;
              event.currentTarget.setPointerCapture(event.pointerId);
              updatePointer(event.clientX, event.clientY);
            }}
            onPointerMove={(event) => {
              if (activePointerRef.current === event.pointerId) updatePointer(event.clientX, event.clientY);
            }}
            onPointerUp={(event) => {
              if (activePointerRef.current !== event.pointerId) return;
              activePointerRef.current = null;
              inputRef.current.pointerX = null;
              inputRef.current.pointerY = null;
            }}
            onPointerCancel={(event) => {
              if (activePointerRef.current !== event.pointerId) return;
              activePointerRef.current = null;
              inputRef.current.pointerX = null;
              inputRef.current.pointerY = null;
            }}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <p className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-slate-300">
            <strong className="text-white">Controls:</strong> W/S or ↑/↓ move side paddles; A/D or ←/→ move top/bottom paddles. Space/P pauses. On touch screens, drag on the arena or use the buttons below.
            <span aria-live="polite" className="ml-2 text-emerald-300">{state.message}</span>
          </p>
          <div className="grid grid-cols-3 gap-2 sm:flex">
            <button className="rounded-2xl bg-white/10 px-4 py-3 font-black text-white transition hover:bg-white/20" onClick={() => setState((current) => setPaused(current, false))} type="button">
              Start
            </button>
            <button className="rounded-2xl bg-white/10 px-4 py-3 font-black text-white transition hover:bg-white/20" onClick={() => setState((current) => setPaused(current, !current.paused))} type="button">
              Pause
            </button>
            <button className="rounded-2xl bg-gradient-to-br from-violet-500 to-sky-500 px-4 py-3 font-black text-white transition hover:scale-[1.02]" onClick={() => setState(restartDnpGame(state.width, state.height))} type="button">
              Restart
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 md:hidden">
          {[
            ['◀ Left', 'left'],
            ['▲ Up', 'up'],
            ['▼ Down', 'down'],
            ['Right ▶', 'right'],
          ].map(([label, key]) => (
            <button
              className="rounded-2xl border border-white/10 bg-white/10 py-5 text-base font-black text-white"
              key={key}
              onPointerDown={() => {
                inputRef.current[key as 'left' | 'right' | 'up' | 'down'] = true;
              }}
              onPointerLeave={() => {
                inputRef.current[key as 'left' | 'right' | 'up' | 'down'] = false;
              }}
              onLostPointerCapture={() => {
                inputRef.current[key as 'left' | 'right' | 'up' | 'down'] = false;
              }}
              onPointerUp={() => {
                inputRef.current[key as 'left' | 'right' | 'up' | 'down'] = false;
              }}
              onPointerCancel={() => {
                inputRef.current[key as 'left' | 'right' | 'up' | 'down'] = false;
              }}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
