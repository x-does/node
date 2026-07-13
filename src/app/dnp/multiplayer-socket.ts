import type { DnpPublicRoom } from '@/lib/dnp/domain';
import { DNP_INPUT_EPSILON } from './multiplayer-client';

export type DnpSocketConnectionState = 'connecting' | 'realtime' | 'reconnecting' | 'fallback';
export type DnpSocketTicketAvailable = { available: true; url: string; ticket: string; expiresInMs?: number };
export type DnpSocketUnavailableReason = 'not_configured' | 'unauthorized' | 'forbidden' | 'rate_limited' | 'gateway' | 'server_error' | 'network' | 'unavailable';
export type DnpSocketTicketUnavailable = { available: false; reason: DnpSocketUnavailableReason; retryable: boolean; retryAfterMs?: number };
export type DnpSocketTicketResponse = DnpSocketTicketAvailable | DnpSocketTicketUnavailable;
export type DnpSocketFailure = Error & { retryable: boolean; retryAfterMs?: number };

export function shouldSendSocketInput(previous: number | null, next: number) {
  return previous === null || Math.abs(previous - next) >= DNP_INPUT_EPSILON;
}

type SocketLike = Pick<WebSocket, 'readyState' | 'send' | 'close' | 'addEventListener'>;
type RetryTimer = ReturnType<typeof setTimeout>;
type Options = {
  code: string;
  token: string;
  playerId?: string;
  fetchTicket?: () => Promise<DnpSocketTicketResponse | { url: string; ticket: string }>;
  createSocket?: (url: string) => SocketLike;
  onSnapshot: (room: DnpPublicRoom, seq: number) => void;
  onState?: (state: DnpSocketConnectionState) => void;
  maxFailures?: number;
  circuitProbeMs?: number;
  watchdogMs?: number;
  reconnectDelaysMs?: number[];
  scheduleRetry?: (callback: () => void, delay: number) => RetryTimer;
  random?: () => number;
  getInputSequenceHighWater?: () => number;
  onInputSequenceIssued?: (seq: number) => void;
};

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isInteger = (value: unknown, min = 0, max = 2147483647): value is number => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

export function isDnpPublicRoom(value: unknown): value is DnpPublicRoom {
  if (!value || typeof value !== 'object') return false;
  const room = value as Record<string, unknown>;
  if (typeof room.code !== 'string' || !/^[A-Z2-9]{6}$/.test(room.code)) return false;
  if (room.mode !== 'private' && room.mode !== 'matchmaking') return false;
  if (room.status !== 'lobby' && room.status !== 'playing' && room.status !== 'ended') return false;
  if (!isInteger(room.version) || (room.adminPlayerId !== null && typeof room.adminPlayerId !== 'string')) return false;
  const scores = room.scores as Record<string, unknown> | null;
  const ball = room.ball as Record<string, unknown> | null;
  if (!scores || !isInteger(scores.left) || !isInteger(scores.right)) return false;
  if (!ball || !isFiniteNumber(ball.x) || !isFiniteNumber(ball.y) || !isFiniteNumber(ball.vx) || !isFiniteNumber(ball.vy)) return false;
  if (!Array.isArray(room.players) || room.players.length > 12) return false;
  const ids = new Set<string>(), slots = new Set<number>();
  for (const entry of room.players) {
    if (!entry || typeof entry !== 'object') return false;
    const player = entry as Record<string, unknown>;
    if (typeof player.id !== 'string' || !player.id || ids.has(player.id) || typeof player.name !== 'string' || player.name.length < 1 || player.name.length > 16) return false;
    if (!isInteger(player.joinOrder, 1) || !isInteger(player.slotIndex, 0, 11) || slots.has(player.slotIndex)) return false;
    if (typeof player.isAdmin !== 'boolean' || typeof player.online !== 'boolean' || !isFiniteNumber(player.input) || player.input < 0 || player.input > 1 || !isInteger(player.inputSeq)) return false;
    if (player.isAdmin !== (player.id === room.adminPlayerId)) return false;
    ids.add(player.id); slots.add(player.slotIndex);
  }
  return room.adminPlayerId === null || ids.has(room.adminPlayerId as string);
}

function retryAfterMs(response: Response) {
  const value = response.headers.get('retry-after');
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

function failure(message: string, retryable: boolean, retryAfter?: number): DnpSocketFailure {
  return Object.assign(new Error(message), { retryable, retryAfterMs: retryAfter });
}

function isRetryable(error: unknown) {
  return !(error && typeof error === 'object' && 'retryable' in error) || Boolean((error as { retryable?: boolean }).retryable);
}

export class DnpSocketTransport {
  private socket: SocketLike | null = null;
  private stopped = false;
  private failures = 0;
  private snapshotSeq = -1;
  private inputSeq = 0;
  private lastInput: number | null = null;
  private lastInputAt = 0;
  private reconnectTimer: RetryTimer | null = null;
  private watchdog: RetryTimer | null = null;
  private attempt = 0;
  private attemptFailed = false;
  private gotSnapshot = false;
  private state: DnpSocketConnectionState | null = null;

  constructor(private options: Options) {}

  async start() {
    const prior = this.socket;
    this.attempt++;
    this.socket = null;
    prior?.close();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.clearAttempt();
    this.stopped = false;
    this.setState('connecting');
    await this.connect();
  }

  private setState(state: DnpSocketConnectionState) {
    if (this.state === state) return;
    this.state = state;
    this.options.onState?.(state);
  }

  private async connect() {
    if (this.stopped) return;
    this.clearAttempt();
    this.attemptFailed = false;
    const attempt = ++this.attempt;
    this.snapshotSeq = -1;
    this.gotSnapshot = false;
    this.lastInput = null;
    this.armWatchdog(attempt);
    try {
      const result = await (this.options.fetchTicket ?? (() => this.fetchTicket()))();
      if (this.stopped || attempt !== this.attempt || this.attemptFailed) return;
      const credentials: DnpSocketTicketResponse = 'available' in result ? result : { available: true, ...result };
      if (!credentials.available) {
        this.failAttempt(attempt, failure(credentials.reason, credentials.retryable, credentials.retryAfterMs));
        return;
      }
      const socket = (this.options.createSocket ?? (url => new WebSocket(url)))(credentials.url);
      this.socket = socket;
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const settle = (error?: Error) => {
          if (settled) return;
          settled = true;
          error ? reject(error) : resolve();
        };
        socket.addEventListener('open', () => {
          if (attempt !== this.attempt || this.stopped) return;
          socket.send(JSON.stringify({ type: 'auth', ticket: credentials.ticket }));
          settle();
        });
        socket.addEventListener('message', (event: MessageEvent) => this.onMessage(event.data, attempt));
        socket.addEventListener('error', () => {
          const error = failure('WebSocket failed.', true);
          settle(error);
          socket.close();
          this.failAttempt(attempt, error);
        });
        socket.addEventListener('close', () => {
          settle();
          this.failAttempt(attempt, failure('WebSocket closed.', true));
        });
      });
    } catch (error) {
      this.failAttempt(attempt, error);
    }
  }

  private armWatchdog(attempt: number) {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => {
      if (attempt !== this.attempt || this.stopped) return;
      this.socket?.close();
      this.failAttempt(attempt, failure('Realtime snapshot timed out.', true));
    }, this.options.watchdogMs ?? 8000);
  }

  private clearAttempt() {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = null;
  }

  private async fetchTicket(): Promise<DnpSocketTicketResponse> {
    let response: Response;
    try {
      response = await fetch(`/api/dnp/rooms/${this.options.code}/socket-ticket`, {
        method: 'POST', headers: { Authorization: `Bearer ${this.options.token}` },
      });
    } catch {
      throw failure('Realtime ticket request failed.', true);
    }
    let payload: { available?: boolean; url?: string; ticket?: string; reason?: string; retryable?: boolean; retryAfterMs?: number; error?: string } = {};
    try { payload = await response.json(); } catch { /* gateways commonly return HTML */ }
    if (response.ok && payload.available === false) {
      const reason = typeof payload.reason === 'string' ? payload.reason as DnpSocketUnavailableReason : 'unavailable';
      return { available: false, reason, retryable: payload.retryable === true, retryAfterMs: payload.retryAfterMs };
    }
    if (response.ok && payload.url && payload.ticket) return { available: true, url: payload.url, ticket: payload.ticket };
    const retryable = response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504 || response.status >= 500;
    throw failure(payload.error ?? `Realtime ticket request failed (${response.status}).`, retryable, response.status === 429 ? retryAfterMs(response) : undefined);
  }

  private onMessage(data: unknown, attempt: number) {
    if (attempt !== this.attempt || this.stopped) return;
    try {
      const message = JSON.parse(String(data)) as { type?: string; seq?: number; room?: DnpPublicRoom };
      if (message.type !== 'snapshot') return;
      if (!Number.isInteger(message.seq) || (message.seq as number) < 0 || !isDnpPublicRoom(message.room)) {
        const socket = this.socket;
        this.socket = null;
        socket?.close();
        this.failAttempt(attempt, failure('Malformed realtime snapshot.', true));
        return;
      }
      if ((message.seq as number) <= this.snapshotSeq) return;
      this.gotSnapshot = true;
      this.armWatchdog(attempt);
      this.failures = 0;
      this.setState('realtime');
      this.snapshotSeq = message.seq as number;
      const own = message.room.players.find(player => player.id === this.options.playerId);
      if (own) this.inputSeq = Math.max(this.inputSeq, own.inputSeq, this.options.getInputSequenceHighWater?.() ?? 0);
      this.options.onSnapshot(message.room, message.seq as number);
    } catch { /* malformed socket messages do not displace HTTP fallback */ }
  }

  private failAttempt(attempt: number, error: unknown) {
    if (this.stopped || attempt !== this.attempt || this.attemptFailed) return;
    this.attemptFailed = true;
    this.clearAttempt();
    this.gotSnapshot = false;
    this.socket = null;
    this.setState('fallback');
    if (!isRetryable(error)) return;
    this.failures++;
    const requested = error && typeof error === 'object' && 'retryAfterMs' in error ? (error as { retryAfterMs?: number }).retryAfterMs : undefined;
    this.scheduleRetry(requested);
  }

  private scheduleRetry(retryAfter?: number) {
    if (this.stopped) return;
    const configured = this.options.reconnectDelaysMs;
    const circuitOpen = this.failures >= (this.options.maxFailures ?? 6);
    const base = circuitOpen
      ? Math.max(1000, this.options.circuitProbeMs ?? 60_000)
      : configured?.[Math.min(this.failures - 1, configured.length - 1)] ?? Math.min(30_000, 500 * 2 ** Math.min(this.failures - 1, 6));
    const jitter = configured ? 0 : Math.round(base * 0.2 * ((this.options.random ?? Math.random)() * 2 - 1));
    const delay = retryAfter ?? Math.max(0, base + jitter);
    const schedule = this.options.scheduleRetry ?? ((callback, ms) => setTimeout(callback, ms));
    this.reconnectTimer = schedule(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  /** Test hook for deterministic inspection of classified retry delays. */
  async retryNowForTest() {
    if (this.stopped) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    await this.connect();
  }

  sendInput(position: number, at = Date.now()) {
    if (!this.gotSnapshot || !this.socket || this.socket.readyState !== 1 || at - this.lastInputAt < 1000 / 30 || !shouldSendSocketInput(this.lastInput, position)) return false;
    const highWater = Math.max(this.inputSeq, this.options.getInputSequenceHighWater?.() ?? 0);
    if (highWater >= 2147483647) return false;
    this.inputSeq = highWater + 1;
    this.options.onInputSequenceIssued?.(this.inputSeq);
    this.lastInput = position;
    this.lastInputAt = at;
    this.socket.send(JSON.stringify({ type: 'input', seq: this.inputSeq, position }));
    return true;
  }

  sendAdmin(action: string, payload: Record<string, unknown> = {}) {
    if (!this.gotSnapshot || !this.socket || this.socket.readyState !== 1) return false;
    this.socket.send(JSON.stringify({ type: 'admin', action, ...payload }));
    return true;
  }

  requestSync() {
    if (!this.gotSnapshot || !this.socket || this.socket.readyState !== 1) return false;
    this.socket.send(JSON.stringify({ type: 'sync' }));
    return true;
  }

  stop() {
    this.stopped = true;
    this.attempt++;
    this.clearAttempt();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }
}
