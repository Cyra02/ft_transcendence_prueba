import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GameService {
  constructor(private readonly prisma: PrismaService) {}

  async createGame(player1Id: number) {
    return this.prisma.match.create({
      data: {
        player1: { connect: { id: player1Id } },
        status: 'waiting',
        board: '_________',
      },
    });
  }

    async joinGame(gameId: number, player2Id: number) {
    const game = await this.prisma.match.findUnique({ where: { id: gameId } });

    if (!game) throw new NotFoundException('Partida no encontrada');
    if (game.status !== 'waiting') throw new BadRequestException('La partida ya está en curso o terminada');
    if (game.player1Id === player2Id) throw new BadRequestException('No puedes unirte a tu propia partida');

    return this.prisma.match.update({
      where: { id: gameId },
      data: {
        player2: { connect: { id: player2Id } },
        status: 'playing',
      },
    });
  }

  async getGameState(gameId: number) {
    const game = await this.prisma.match.findUnique({
      where: { id: gameId },
      include: {
        player1: { select: { id: true, username: true, avatarUrl: true } },
        player2: { select: { id: true, username: true, avatarUrl: true } },
      },
    });

    if (!game) throw new NotFoundException('Partida no encontrada');
    return game;
  }

  async makeMove(gameId: number, playerId: number, position: number) {
    const game = await this.prisma.match.findUnique({ where: { id: gameId } });

    if (!game) throw new NotFoundException('Partida no encontrada');
    if (game.status !== 'playing') throw new BadRequestException('La partida no está en curso');
    if (position < 0 || position > 8) throw new BadRequestException('Posición inválida');

    const board = game.board.split('');
    const xCount = board.filter(c => c === 'X').length;
    const oCount = board.filter(c => c === 'O').length;
    const isPlayer1Turn = xCount === oCount;

    if (isPlayer1Turn && playerId !== game.player1Id)
      throw new BadRequestException('No es tu turno');
    if (!isPlayer1Turn && playerId !== game.player2Id)
      throw new BadRequestException('No es tu turno');

    if (board[position] !== '_')
      throw new BadRequestException('Posición ya ocupada');

    board[position] = isPlayer1Turn ? 'X' : 'O';
    const newBoard = board.join('');

    this.printBoard(newBoard);

    const winner = this.checkWinner(newBoard);
    const isDraw = !winner && !newBoard.includes('_');

    const updatedGame = await this.prisma.match.update({
      where: { id: gameId },
      data: {
        board: newBoard,
        winner: winner ? (isPlayer1Turn ? 'player1' : 'player2') : isDraw ? 'draw' : null,
        status: winner || isDraw ? 'finished' : 'playing',
        finishedAt: winner || isDraw ? new Date() : null,
        score1: winner && isPlayer1Turn ? { increment: 1 } : undefined,
        score2: winner && !isPlayer1Turn ? { increment: 1 } : undefined,
      },
    });

    if (winner) {
      const winnerId = isPlayer1Turn ? updatedGame.player1Id ?? undefined : updatedGame.player2Id ?? undefined;
      await this.prisma.user.update({
        where: { id: winnerId },
        data: { wins: { increment: 1 } },
      });
    }

    return updatedGame;
  }

  private checkWinner(board: string): boolean {
    const wins = [
      [0,1,2],[3,4,5],[6,7,8],
      [0,3,6],[1,4,7],[2,5,8],
      [0,4,8],[2,4,6],
    ];
    return wins.some(([a,b,c]) =>
      board[a] !== '_' && board[a] === board[b] && board[b] === board[c]
    );
  }

  private printBoard(board: string): void {
    const b = board.split('').map(c => c === '_' ? '·' : c);
    console.log('\n+---+---+---+');
    console.log(`| ${b[0]} | ${b[1]} | ${b[2]} |`);
    console.log('+---+---+---+');
    console.log(`| ${b[3]} | ${b[4]} | ${b[5]} |`);
    console.log('+---+---+---+');
    console.log(`| ${b[6]} | ${b[7]} | ${b[8]} |`);
    console.log('+---+---+---+\n');
  }
}