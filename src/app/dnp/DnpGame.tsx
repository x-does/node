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

const inputTemplate = (): DnpInputState => ({ up: false, down: false, pointerY: null });

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

export default function DnpGame() {
  const initialSize = useMemo(() => getResponsiveArenaSize(900, 700), []);
  const [state, setState] = useState(() => createInitialDnpState(initialSize.width, initialSize.height));
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const inputRef = useRef<DnpInputState>(inputTemplate());
  const activePointerRef = useRef<number | null>(null);

  const render = useCallback((gameState: DnpGameState) => {
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
    drawGame(ctx, gameState);
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
    render(state);
  }, [render, state]);

  useEffect(() => {
    const tick = (time: number) => {
      const last = lastTimeRef.current ?? time;
      lastTimeRef.current = time;
      const dt = Math.min((time - last) / 1000, 0.033);
      setState((current) => stepDnpGame(current, inputRef.current, dt));
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') inputRef.current.up = true;
      if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') inputRef.current.down = true;
      if (event.key === ' ' || event.key.toLowerCase() === 'p') {
        event.preventDefault();
        setState((current) => setPaused(current, !current.paused));
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') inputRef.current.up = false;
      if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') inputRef.current.down = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const updatePointer = (clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    inputRef.current.pointerY = ((clientY - rect.top) / rect.height) * state.height;
  };

  return (
    <section className="min-h-[calc(100vh-10rem)] bg-[radial-gradient(circle_at_top,#18203a_0,#07080d_56%)] px-4 py-8 text-white sm:py-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-black/30 backdrop-blur md:flex md:items-end md:justify-between md:p-7">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-300">Browser-only arcade</p>
            <h1 className="mt-2 text-4xl font-black tracking-[-0.06em] md:text-6xl">DefinitelyNotPong</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 md:text-base">
              A Hostinger-safe single-player paddle duel: no WebSockets, no custom runtime, just a responsive canvas and a slightly smug AI.
            </p>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 text-center md:mt-0">
            <div className="rounded-2xl border border-rose-300/20 bg-rose-400/10 px-5 py-3">
              <span className="block text-xs font-bold uppercase tracking-widest text-rose-200">You</span>
              <strong className="text-4xl">{state.playerScore}</strong>
            </div>
            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-5 py-3">
              <span className="block text-xs font-bold uppercase tracking-widest text-emerald-200">AI</span>
              <strong className="text-4xl">{state.aiScore}</strong>
            </div>
          </div>
        </header>

        <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.05] p-2 shadow-2xl shadow-black/30">
          <canvas
            ref={canvasRef}
            aria-label="DefinitelyNotPong play field"
            className="mx-auto block max-w-full touch-none rounded-[1.15rem] border border-white/10 bg-black"
            onPointerDown={(event) => {
              activePointerRef.current = event.pointerId;
              event.currentTarget.setPointerCapture(event.pointerId);
              updatePointer(event.clientY);
            }}
            onPointerMove={(event) => {
              if (activePointerRef.current === event.pointerId) updatePointer(event.clientY);
            }}
            onPointerUp={(event) => {
              if (activePointerRef.current !== event.pointerId) return;
              activePointerRef.current = null;
              inputRef.current.pointerY = null;
            }}
            onPointerCancel={(event) => {
              if (activePointerRef.current !== event.pointerId) return;
              activePointerRef.current = null;
              inputRef.current.pointerY = null;
            }}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <p className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-slate-300">
            <strong className="text-white">Controls:</strong> W/S or arrow keys. Space/P pauses. On touch screens, drag on the arena or use the buttons below.
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

        <div className="grid grid-cols-2 gap-3 md:hidden">
          <button
            className="rounded-2xl border border-white/10 bg-rose-400/15 py-5 text-lg font-black text-white"
            onPointerDown={() => {
              inputRef.current.up = true;
            }}
            onPointerLeave={() => {
              inputRef.current.up = false;
            }}
            onLostPointerCapture={() => {
              inputRef.current.up = false;
            }}
            onPointerUp={() => {
              inputRef.current.up = false;
            }}
            onPointerCancel={() => {
              inputRef.current.up = false;
            }}
            type="button"
          >
            ▲ Up
          </button>
          <button
            className="rounded-2xl border border-white/10 bg-emerald-400/15 py-5 text-lg font-black text-white"
            onPointerDown={() => {
              inputRef.current.down = true;
            }}
            onPointerLeave={() => {
              inputRef.current.down = false;
            }}
            onLostPointerCapture={() => {
              inputRef.current.down = false;
            }}
            onPointerUp={() => {
              inputRef.current.down = false;
            }}
            onPointerCancel={() => {
              inputRef.current.down = false;
            }}
            type="button"
          >
            ▼ Down
          </button>
        </div>
      </div>
    </section>
  );
}
