import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { GameController } from './game.controller';
import { GameService } from './game.service';
import { GameGateway } from './game.gateway';
import { PrismaService } from '../prisma/prisma.service';

@Module({
	imports: [
		JwtModule.registerAsync({
			useFactory: () => ({
				secret: process.env.JWT_SECRET,
				signOptions: { expiresIn: '7d' },
			}),
		}),
	],
	controllers: [GameController],
	providers: [GameService, GameGateway, PrismaService],
	exports: [GameService],
})
export class GameModule {}