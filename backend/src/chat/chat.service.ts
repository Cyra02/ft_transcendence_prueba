import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  async saveMessage(content: string, authorId: number, channelId: number) {
    return this.prisma.message.create({
      data: { content, authorId, channelId },
    });
  }

  async getMessages(channelId: number) {
    return this.prisma.message.findMany({
      where: { channelId },
      include: { author: { select: { id: true, username: true } } },
      orderBy: { sentAt: 'asc' },
    });
  }

  // Obtiene o crea un canal privado entre dos usuarios (nombre canónico: dm_X_Y con X < Y)
  async getOrCreateDMChannel(userId1: number, userId2: number) {
    const [a, b] = [userId1, userId2].sort((x, y) => x - y);
    const name = `dm_${a}_${b}`;

    const existing = await this.prisma.channel.findUnique({ where: { name } });
    if (existing) return existing;

    return this.prisma.channel.create({
      data: { name, isPrivate: true },
    });
  }

  async getDirectMessages(userId1: number, userId2: number) {
    const channel = await this.getOrCreateDMChannel(userId1, userId2);
    return this.getMessages(channel.id);
  }

  async saveDirectMessage(content: string, authorId: number, userId1: number, userId2: number) {
    const channel = await this.getOrCreateDMChannel(userId1, userId2);
    return this.saveMessage(content, authorId, channel.id);
  }
}