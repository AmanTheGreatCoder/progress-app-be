import { Controller, Get, Post, Query, Res, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { TickTickService } from './ticktick.service';
import { PrismaService } from '../../prisma/prisma.service';
import axios from 'axios';

@Controller('api')
export class TickTickController {
  private readonly logger = new Logger(TickTickController.name);

  constructor(
    private tickTickService: TickTickService,
    private prisma: PrismaService,
  ) {}

  @Get('ticktick/status')
  async getStatus() {
    const auth = await this.prisma.tickTickAuth.findUnique({ where: { id: 'singleton' } });
    if (!auth) return { connected: false };
    return { connected: true, expiresAt: auth.expiresAt };
  }

  @Get('ticktick/auth')
  getAuthUrl() {
    const clientId = process.env.TICKTICK_CLIENT_ID;
    const redirectUri = process.env.TICKTICK_REDIRECT_URI;
    const url = `https://ticktick.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri!)}&scope=tasks:read`;
    return { url };
  }

  @Get('ticktick/callback')
  async callback(@Query('code') code: string, @Res() res: Response) {
    if (!code) {
      return res.status(HttpStatus.BAD_REQUEST).send('No code provided');
    }

    try {
      const clientId = process.env.TICKTICK_CLIENT_ID!;
      const clientSecret = process.env.TICKTICK_CLIENT_SECRET!;
      const redirectUri = process.env.TICKTICK_REDIRECT_URI!;
      const encoded = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      
      const response = await axios.post('https://ticktick.com/oauth/token', new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        scope: 'tasks:write tasks:read',
        redirect_uri: redirectUri
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${encoded}`
        }
      });

      const data = response.data;
      const expiresAt = new Date(Date.now() + data.expires_in * 1000);

      await this.prisma.tickTickAuth.upsert({
        where: { id: 'singleton' },
        update: { accessToken: data.access_token, refreshToken: data.refresh_token || '', expiresAt },
        create: { id: 'singleton', accessToken: data.access_token, refreshToken: data.refresh_token || '', expiresAt }
      });

      return res.redirect(process.env.FRONTEND_URL!);
    } catch (err: any) {
      let errDetails = 'Unknown Error';
      if (err.response) {
        errDetails = `Status ${err.response.status} - Data: ${typeof err.response.data === 'object' ? JSON.stringify(err.response.data) : err.response.data}`;
      } else {
        errDetails = err.message || String(err);
      }
      this.logger.error('TickTick OAuth Error Details:', errDetails);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).send(`
        <h2>Error exchanging token</h2>
        <pre style="background:#f4f4f4;padding:10px;border-radius:5px;white-space:pre-wrap;">${errDetails}</pre>
      `);
    }
  }

  @Post('sync')
  async sync() {
    try {
      return await this.tickTickService.sync();
    } catch (err: any) {
      this.logger.error('[TickTick Sync] Error:', err.response?.data || err.message);
      throw new HttpException({ error: err.response?.data || err.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
