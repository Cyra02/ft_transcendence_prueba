import {
  Controller, Get, Post, Delete,
  UseGuards, Request, Param, ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserService } from './user.service';

@Controller('user')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private userService: UserService) {}

  @Get('me')
  getMe(@Request() req) {
    return this.userService.getMe(req.user.userId);
  }

  @Get()
  getAll() {
    return this.userService.getAll();
  }

  // GET /user/friends
  @Get('friends')
  getFriends(@Request() req) {
    return this.userService.getFriends(req.user.userId);
  }

  // GET /user/friends/requests
  @Get('friends/requests')
  getPendingRequests(@Request() req) {
    return this.userService.getPendingRequests(req.user.userId);
  }

  // POST /user/friends/request/:id  — enviar petición
  @Post('friends/request/:id')
  sendRequest(@Request() req, @Param('id', ParseIntPipe) toUserId: number) {
    return this.userService.sendFriendRequest(req.user.userId, toUserId);
  }

  // POST /user/friends/accept/:id  — aceptar petición
  @Post('friends/accept/:id')
  acceptRequest(@Request() req, @Param('id', ParseIntPipe) fromUserId: number) {
    return this.userService.acceptFriendRequest(req.user.userId, fromUserId);
  }

  // DELETE /user/friends/:id  — rechazar o eliminar
  @Delete('friends/:id')
  removeFriend(@Request() req, @Param('id', ParseIntPipe) otherUserId: number) {
    return this.userService.removeFriend(req.user.userId, otherUserId);
  }

    @Get('guest')
    getGuest() {
    return this.userService.getGuest();
  }

  	//para que se vea la info de usuario
  @Get(':id')
	getUser(@Param('id', ParseIntPipe) id: number) {
  	return this.userService.getUser(id);
  }

}