import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';

@WebSocketGateway({
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Mapa userId -> socketId para mensajes directos
  private userSockets = new Map<number, string>();

  constructor(private chatService: ChatService) {}

  handleConnection(client: Socket) {
    console.log(`Cliente conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    // Limpiar el mapa cuando se desconecta
    for (const [userId, socketId] of this.userSockets.entries()) {
      if (socketId === client.id) {
        this.userSockets.delete(userId);
        break;
      }
    }
    console.log(`Cliente desconectado: ${client.id}`);
  }

  // El cliente se registra con su userId al conectarse
  @SubscribeMessage('register')
  handleRegister(
    @MessageBody() data: { userId: number },
    @ConnectedSocket() client: Socket,
  ) {
    this.userSockets.set(data.userId, client.id);
    console.log(`Usuario ${data.userId} registrado con socket ${client.id}`);
  }

  // ── Mensajes de canal (existente) ─────────────────────────────────────────
  @SubscribeMessage('sendMessage')
  async handleMessage(
    @MessageBody() data: { content: string; channelId: number; authorId: number },
    @ConnectedSocket() client: Socket,
  ) {
    const message = await this.chatService.saveMessage(
      data.content,
      data.authorId,
      data.channelId,
    );

    this.server.emit('newMessage', {
      content: message.content,
      channelId: message.channelId,
      authorId: message.authorId,
      sentAt: message.sentAt,
    });
  }

  @SubscribeMessage('getMessages')
  async handleGetMessages(
    @MessageBody() data: { channelId: number },
    @ConnectedSocket() client: Socket,
  ) {
    const messages = await this.chatService.getMessages(data.channelId);
    client.emit('messageHistory', messages);
  }

  // ── Mensajes directos persistidos ───────────────────────────────────────
  @SubscribeMessage('directMessage')
  async handleDirectMessagePersisted(
    @MessageBody() data: { fromUserId: number; toUserId: number; content: string },
    @ConnectedSocket() client: Socket,
  ) {
    // Guardar en BD
    const saved = await this.chatService.saveDirectMessage(
      data.content,
      data.fromUserId,
      data.fromUserId,
      data.toUserId,
    );
    // Log para debug
    console.log(`DM de ${data.fromUserId} a ${data.toUserId}: ${data.content}`);
    console.log(`Socket destino: ${this.userSockets.get(data.toUserId) ?? 'NO CONECTADO'}`);

    const payload = {
      fromUserId: data.fromUserId,
      toUserId:   data.toUserId,
      content:    data.content,
      sentAt:     saved.sentAt.toISOString(),
    };

    const toSocketId = this.userSockets.get(data.toUserId);
    if (toSocketId) {
      this.server.to(toSocketId).emit('directMessage', payload);
    }
    client.emit('directMessage', payload);
  }

  @SubscribeMessage('getDirectHistory')
  async handleGetDirectHistory(
    @MessageBody() data: { userId1: number; userId2: number },
    @ConnectedSocket() client: Socket,
  ) {
    const history = await this.chatService.getDirectMessages(data.userId1, data.userId2);
    client.emit('directHistory', history);
  }
}