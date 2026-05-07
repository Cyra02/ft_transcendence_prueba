import { Controller, Post, Get, Param, Body, ParseIntPipe } from '@nestjs/common';
import { GameService } from './game.service';

@Controller('game')
export class GameController {
  constructor(private readonly gameService: GameService) {}

  @Post()
  createGame(@Body('player1Id') player1Id: number) {
    return this.gameService.createGame(player1Id);
  }

  @Post('join')
  joinGame(
    @Body('gameId') gameId: number,
    @Body('player2Id') player2Id: number,
  ) {
    return this.gameService.joinGame(gameId, player2Id);
  }

  @Get(':id')
  getGameState(@Param('id', ParseIntPipe) id: number) {
    return this.gameService.getGameState(id);
  }

  @Post(':id/move')
  makeMove(
    @Param('id', ParseIntPipe) id: number,
    @Body('playerId') playerId: number,
    @Body('position') position: number,
  ) {
    return this.gameService.makeMove(id, playerId, position);
  }
}