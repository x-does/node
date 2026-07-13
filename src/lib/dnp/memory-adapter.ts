import { DnpServiceError } from './service';
import type { DnpDataAdapter } from './service';
import type { DnpStoredPlayer, DnpStoredRoom } from './domain';

export class InMemoryDnpAdapter implements DnpDataAdapter {
  rooms = new Map<string, DnpStoredRoom>();
  players = new Map<string, DnpStoredPlayer>();

  async transaction<T>(fn: (tx: DnpDataAdapter) => Promise<T>): Promise<T> {
    return fn(this);
  }

  async findRoomByCode(code: string) {
    const room = [...this.rooms.values()].find((entry) => entry.code === code) ?? null;
    if (!room) return null;
    return { ...room, players: [...this.players.values()].filter((player) => player.roomId === room.id).map((player) => ({ ...player })) };
  }

  async findMatchmakingCandidate() {
    const room = [...this.rooms.values()].find((entry) => entry.mode === 'matchmaking' && entry.status === 'lobby' && [...this.players.values()].filter((player) => player.roomId === entry.id && !player.leftAt).length === 1) ?? null;
    if (!room) return null;
    return { ...room, players: [...this.players.values()].filter((player) => player.roomId === room.id).map((player) => ({ ...player })) };
  }

  async createRoom(data: Omit<DnpStoredRoom, 'createdAt' | 'updatedAt'>) {
    if ([...this.rooms.values()].some((room) => room.code === data.code)) throw new DnpServiceError(409, 'duplicate room code');
    const room = { ...data, createdAt: new Date(), updatedAt: new Date() };
    this.rooms.set(room.id, room);
    return { ...room };
  }

  async updateRoom(id: string, data: Partial<DnpStoredRoom>, expectedVersion?: number) {
    const room = this.rooms.get(id);
    if (!room) throw new DnpServiceError(404, 'room missing');
    if (expectedVersion !== undefined && room.version !== expectedVersion) throw new DnpServiceError(409, 'Room was updated concurrently.');
    const updated = { ...room, ...data, updatedAt: new Date() };
    this.rooms.set(id, updated);
    return { ...updated };
  }

  async createPlayer(data: Omit<DnpStoredPlayer, 'createdAt'>) {
    if ([...this.players.values()].some((player) => player.roomId === data.roomId && !player.leftAt && player.slotIndex === data.slotIndex)) throw new DnpServiceError(409, 'slot occupied');
    if ([...this.players.values()].some((player) => player.roomId === data.roomId && player.joinOrder === data.joinOrder)) throw new DnpServiceError(409, 'join order occupied');
    if ([...this.players.values()].some((player) => player.roomId === data.roomId && player.tokenHash === data.tokenHash)) throw new DnpServiceError(409, 'token exists');
    const player = { ...data, createdAt: new Date() };
    this.players.set(player.id, player);
    return { ...player };
  }

  async updatePlayer(id: string, data: Partial<DnpStoredPlayer>) {
    const player = this.players.get(id);
    if (!player) throw new DnpServiceError(404, 'player missing');
    const updated = { ...player, ...data };
    this.players.set(id, updated);
    return { ...updated };
  }
}
