import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async getMe(userId: number) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        country: true,
        gender: true,
        birthDate: true,
        wins: true,
        createdAt: true,
      },
    });
  }

  async getAll() {
    return this.prisma.user.findMany({
      where: {
        username: { not: 'Guest' },
      },
      select: { id: true, username: true },
    });
  }

  // Enviar petición de amistad
  async sendFriendRequest(fromUserId: number, toUserId: number) {
    if (fromUserId === toUserId)
      throw new BadRequestException('No puedes añadirte a ti mismo');

    const existing = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { fromUserId, toUserId },
          { fromUserId: toUserId, toUserId: fromUserId },
        ],
      },
    });
    if (existing)
      throw new BadRequestException('Ya existe una relación entre estos usuarios');

    return this.prisma.friendship.create({
      data: { fromUserId, toUserId, accepted: false },
    });
  }

  // Aceptar petición de amistad
  async acceptFriendRequest(userId: number, fromUserId: number) {
    const friendship = await this.prisma.friendship.findFirst({
      where: { fromUserId, toUserId: userId, accepted: false },
    });
    if (!friendship)
      throw new BadRequestException('Petición no encontrada');

    return this.prisma.friendship.update({
      where: { id: friendship.id },
      data: { accepted: true },
    });
  }

  // Rechazar / cancelar petición
  async removeFriend(userId: number, otherUserId: number) {
    const friendship = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { fromUserId: userId, toUserId: otherUserId },
          { fromUserId: otherUserId, toUserId: userId },
        ],
      },
    });
    if (!friendship)
      throw new BadRequestException('Relación no encontrada');

    return this.prisma.friendship.delete({ where: { id: friendship.id } });
  }

  // Peticiones pendientes recibidas
  async getPendingRequests(userId: number) {
    return this.prisma.friendship.findMany({
      where: { toUserId: userId, accepted: false },
      include: { fromUser: { select: { id: true, username: true } } },
    });
  }

  //para ver la info de usuario selecionado
  async getUser(id: number) {
  return this.prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, displayName: true, country: true, gender: true, birthDate: true, wins: true, createdAt: true },
  });
}

  // Lista de amigos aceptados
  async getFriends(userId: number) {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        OR: [
          { fromUserId: userId, accepted: true },
          { toUserId: userId, accepted: true },
        ],
      },
      include: {
        fromUser: { select: { id: true, username: true } },
        toUser:   { select: { id: true, username: true } },
      },
    });

    return friendships.map(f =>
      f.fromUserId === userId ? f.toUser : f.fromUser
    );
  }
  async getGuest() {
    return this.prisma.user.findUnique({
      where: { username: 'Guest' },
      select: { id: true, username: true },
    });
  }

}