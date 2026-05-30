import { Controller, Get, Query, Req, Res, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { UseGuards } from '@nestjs/common';
import { generateToken, verifyToken } from './auth.utils';

@Controller('api/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /** Redirect to Google consent screen */
  @Get('google')
  googleAuth(@Res() res: Response) {
    return res.redirect(this.authService.getGoogleAuthUrl());
  }

  /** Google redirects here; we generate a JWT and pass it to the frontend via URL param */
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Res() res: Response,
  ) {
    if (!code) {
      return res.status(HttpStatus.BAD_REQUEST).send('Missing OAuth code');
    }
    try {
      const user = await this.authService.handleCallback(code);
      const token = generateToken(user.id);
      return res.redirect(`${process.env.FRONTEND_URL}?token=${token}`);
    } catch (err: any) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).send(`Authentication error: ${err.message}`);
    }
  }

  /** Verify token and return the user (called on app load) */
  @Get('me')
  @UseGuards(AuthGuard)
  async getMe(@Req() req: Request) {
    const userId = (req as any).userId as string;
    const user = await this.authService.getUserById(userId);
    if (!user) throw new HttpException('User not found', HttpStatus.UNAUTHORIZED);
    return user;
  }

  /** Logout is handled client-side (delete the token from localStorage) */
  @Get('logout')
  logout() {
    return { success: true };
  }
}
