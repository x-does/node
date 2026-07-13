import { Prisma, type PrismaClient } from '@prisma/client';

import type { DnpStoredPlayer, DnpStoredRoom } from './domain';
import { DnpServiceError, type DnpDataAdapter } from './service';

type PrismaTx = PrismaClient | Prisma.TransactionClient;
type DnpRoomRecord = Awaited<ReturnType<PrismaClient['dnpRoom']['findUnique']>>;
type DnpPlayerRecord = Awaited<ReturnType<PrismaClient['dnpPlayer']['create']>>;

function roomFromRecord(record: NonNullable<DnpRoomRecord>): DnpStoredRoom {
  return {
    id: record.id,
    code: record.code,
    mode: record.mode as DnpStoredRoom['mode'],
    status: record.status as DnpStoredRoom['status'],
    adminPlayerId: record.adminPlayerId,
    scoreLeft: record.scoreLeft,
    scoreRight: record.scoreRight,
    ballX: record.ballX,
    ballY: record.ballY,
    ballVx: record.ballVx,
    ballVy: record.ballVy,
    version: record.version,
    lastTickAt: record.lastTickAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function playerFromRecord(record: DnpPlayerRecord): DnpStoredPlayer {
  return {
    id: record.id,
    roomId: record.roomId,
    name: record.name,
    joinOrder: record.joinOrder,
    slotIndex: record.slotIndex,
    tokenHash: record.tokenHash,
    inputPosition: record.inputPosition,
    inputSeq: record.inputSeq,
    lastSeenAt: record.lastSeenAt,
    leftAt: record.leftAt,
    createdAt: record.createdAt,
  };
}

function mapPrismaConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (['P2002', 'P2025', 'P2034'].includes(error.code)) throw new DnpServiceError(409, 'DNP write conflicted; retry request.');
    if (['P2021', 'P2022'].includes(error.code)) throw new DnpServiceError(503, 'DNP multiplayer is being prepared. Single player is still available.');
  }
  throw error;
}

export class PrismaDnpAdapter implements DnpDataAdapter {
  constructor(private prisma: PrismaTx, private inTransaction = false) {}

  async transaction<T>(fn: (tx: DnpDataAdapter) => Promise<T>): Promise<T> {
    if (!this.inTransaction && '$transaction' in this.prisma) {
      try {
        return await (this.prisma as PrismaClient).$transaction((tx): Promise<T> => fn(new PrismaDnpAdapter(tx, true)), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        mapPrismaConflict(error);
      }
    }
    return fn(this);
  }

  async findRoomByCode(code: string) {
    const record = await this.prisma.dnpRoom.findUnique({ include: { players: true }, where: { code } });
    if (!record) return null;
    return { ...roomFromRecord(record), players: record.players.map(playerFromRecord) };
  }

  async findMatchmakingCandidate() {
    const records = await this.prisma.dnpRoom.findMany({
      include: { players: true },
      orderBy: { createdAt: 'asc' },
      take: 10,
      where: { mode: 'matchmaking', status: 'lobby' },
    });
    const record = records.find((entry) => entry.players.filter((player) => !player.leftAt).length === 1);
    if (!record) return null;
    return { ...roomFromRecord(record), players: record.players.map(playerFromRecord) };
  }

  async createRoom(data: Omit<DnpStoredRoom, 'createdAt' | 'updatedAt'>) {
    try {
      const record = await this.prisma.dnpRoom.create({ data });
      return roomFromRecord(record);
    } catch (error) {
      mapPrismaConflict(error);
    }
  }

  async updateRoom(id: string, data: Partial<DnpStoredRoom>, expectedVersion?: number) {
    try {
      if (expectedVersion !== undefined) {
        const result = await this.prisma.dnpRoom.updateMany({ data, where: { id, version: expectedVersion } });
        if (result.count !== 1) throw new DnpServiceError(409, 'Room was updated concurrently.');
        const updated = await this.prisma.dnpRoom.findUnique({ where: { id } });
        if (!updated) throw new DnpServiceError(404, 'Room not found.');
        return roomFromRecord(updated);
      }
      const record = await this.prisma.dnpRoom.update({ data, where: { id } });
      return roomFromRecord(record);
    } catch (error) {
      mapPrismaConflict(error);
    }
  }

  async createPlayer(data: Omit<DnpStoredPlayer, 'createdAt'>) {
    try {
      const record = await this.prisma.dnpPlayer.create({ data });
      return playerFromRecord(record);
    } catch (error) {
      mapPrismaConflict(error);
    }
  }

  async updatePlayer(id: string, data: Partial<DnpStoredPlayer>) {
    try {
      const record = await this.prisma.dnpPlayer.update({ data, where: { id } });
      return playerFromRecord(record);
    } catch (error) {
      mapPrismaConflict(error);
    }
  }
}
