import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(
    email: string,
    password: string,
    username: string,
    birthDate?: string,
    country?: string,
    gender?: string,
  ) {
    const emailExists = await this.prisma.user.findUnique({ where: { email } });
    if (emailExists) throw new ConflictException('Email ya registrado');

    const usernameExists = await this.prisma.user.findUnique({ where: { username } });
    if (usernameExists) throw new ConflictException('Username ya en uso');

    if (birthDate) {
    const date = new Date(birthDate);
    if (isNaN(date.getTime())) throw new BadRequestException('Fecha de nacimiento inválida');
    const minAge = new Date();
      minAge.setFullYear(minAge.getFullYear() - 120);
    if(minAge > date)
      throw new BadRequestException('mu viejo');
    const today = new Date();
    if (date > today)
      throw new BadRequestException('futurama');
}

    const hash = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: {
        email,
        password: hash,
        username,
        birthDate: birthDate ? new Date(birthDate) : null,
        country: country ?? null,
        gender: gender ?? null,
      },
    });

    return this.signToken(user.id, user.email);
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Credenciales incorrectas');

    if (!user.password) throw new UnauthorizedException('Credenciales incorrectas');

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new UnauthorizedException('Credenciales incorrectas');

    return this.signToken(user.id, user.email);
  }

  private signToken(userId: number, email: string | null) {
    const payload = { sub: userId, email: email ?? '' };
    return { access_token: this.jwtService.sign(payload) };
  }
}