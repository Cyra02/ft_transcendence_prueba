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
import { JwtService } from '@nestjs/jwt';
import { GameService } from './game.service';

@WebSocketGateway({ cors: { origin: '*' } })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    // mapa userId -> socketId
    private connectedUsers = new Map<number, string>();

    constructor(
        private jwtService: JwtService,
        private gameService: GameService,
    ) {}

    handleConnection(client: Socket) {
        try {
            const token = client.handshake.auth.token;
            const payload = this.jwtService.verify(token, {
                secret: process.env.JWT_SECRET,
            });
            client.data.userId = payload.sub;
            this.connectedUsers.set(payload.sub, client.id);
            console.log(`Usuario ${payload.sub} conectado`);

            // Notifica a todos que este usuario se conectó
            this.server.emit('user_connected', { userId: payload.sub });
        } catch {
            client.disconnect();
        }
    }

    handleDisconnect(client: Socket) {
        const userId = client.data.userId;
        if (userId) {
            this.connectedUsers.delete(userId);
            console.log(`Usuario ${userId} desconectado`);

            // Notifica a todos que este usuario se desconectó
            this.server.emit('user_disconnected', { userId });
        }
    }

    // Devuelve qué usuarios de una lista están conectados
    @SubscribeMessage('get_online_friends')
    handleGetOnlineFriends(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { friendIds: number[] },
    ) {
        const onlineIds = data.friendIds.filter(id =>
            this.connectedUsers.has(id)
        );
        client.emit('online_friends', { onlineIds });
    }

    // Jugador 1 envía invitación a un amigo
    @SubscribeMessage('send_invitation')
    handleSendInvitation(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { toUserId: number; fromUsername: string },
    ) {
        const fromUserId = client.data.userId;
        const toSocketId = this.connectedUsers.get(data.toUserId);

        if (!toSocketId) {
            client.emit('invitation_error', { message: 'El usuario no está conectado' });
            return;
        }

        this.server.to(toSocketId).emit('invitation_received', {
            fromUserId,
            fromUsername: data.fromUsername,
        });

        client.emit('invitation_sent', { toUserId: data.toUserId });
    }

    // Jugador 2 acepta la invitación
    @SubscribeMessage('accept_invitation')
    async handleAcceptInvitation(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { fromUserId: number; fromUsername: string },
    ) {
        const player2Id = client.data.userId;
        const fromSocketId = this.connectedUsers.get(data.fromUserId);

        if (!fromSocketId) {
            client.emit('invitation_error', { message: 'El usuario ya no está conectado' });
            return;
        }

        // Crear partida en base de datos
        const game = await this.gameService.createGame(data.fromUserId);
        await this.gameService.joinGame(game.id, player2Id);

        const roomId = `game_${game.id}`;
        client.join(roomId);
        this.server.sockets.sockets.get(fromSocketId)?.join(roomId);

        this.server.to(roomId).emit('game_start', {
            roomId,
            gameId: game.id,
            player1Id: data.fromUserId,
            player2Id,
        });
    }

    // Jugador 2 rechaza la invitación
    @SubscribeMessage('reject_invitation')
    handleRejectInvitation(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { fromUserId: number },
    ) {
        const fromSocketId = this.connectedUsers.get(data.fromUserId);
        if (fromSocketId) {
            this.server.to(fromSocketId).emit('invitation_rejected', {
                byUserId: client.data.userId,
            });
        }
    }

    // Movimiento online
    @SubscribeMessage('online_move')
    async handleOnlineMove(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { gameId: number; position: number; roomId: string },
    ) {
        const playerId = client.data.userId;
        try {
            const updatedGame = await this.gameService.makeMove(
                data.gameId,
                playerId,
                data.position,
            );
            // Enviar estado actualizado a ambos jugadores en la sala
            this.server.to(data.roomId).emit('game_updated', {
                board: updatedGame.board,
                status: updatedGame.status,
                winner: updatedGame.winner,
            });
        } catch (e: any) {
            client.emit('move_error', { message: e.message });
        }
    }
}