import { Controller, Get, Query, Req, Res, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';

@Controller('api/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /** Redirect to Google consent screen */
  @Get('google')
  googleAuth(@Res() res: Response) {
    return res.redirect(this.authService.getGoogleAuthUrl());
  }

  /** Google redirects here with ?code= after the user approves */
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!code) {
      return res.status(HttpStatus.BAD_REQUEST).send('Missing OAuth code');
    }
    try {
      const user = await this.authService.handleCallback(code);
      (req.session as any).userId = user.id;
      return res.redirect(process.env.FRONTEND_URL!);
    } catch (err: any) {
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .send(`Authentication error: ${err.message}`);
    }
  }

  /** Return the signed-in user (called on app load) */
  @Get('me')
  async getMe(@Req() req: Request) {
    const userId = (req.session as any)?.userId;
    if (!userId) throw new HttpException('Not authenticated', HttpStatus.UNAUTHORIZED);
    const user = await this.authService.getUserById(userId);
    if (!user) throw new HttpException('User not found', HttpStatus.UNAUTHORIZED);
    return user;
  }

  /** Sign out */
  @Get('logout')
  logout(@Req() req: Request, @Res() res: Response) {
    req.session.destroy(() => {});
    res.clearCookie('connect.sid');
    return res.json({ success: true });
  }
}
