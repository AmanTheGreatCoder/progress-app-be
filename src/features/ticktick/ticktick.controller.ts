import { Controller, Get, Post, Query, Res, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { TickTickService } from './ticktick.service';
import { PrismaService } from '../../prisma/prisma.service';
import axios from 'axios';
import * as https from 'https';

// Force IPv4 — WSL2 often has broken IPv6 routing which causes Node.js ETIMEDOUT
// even when curl (IPv4) works fine.
const ipv4Agent = new https.Agent({ family: 4 });

@Controller('api')
export class TickTickController {
  private readonly logger = new Logger(TickTickController.name);

  constructor(
    private tickTickService: TickTickService,
    private prisma: PrismaService,
  ) { }

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
    const url = `${process.env.TICKTICK_OAUTH_URL}/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri!)}&scope=tasks:read`;
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

      const response = await axios.post(`${process.env.TICKTICK_OAUTH_URL}/oauth/token`, new URLSearchParams({
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
        },
        timeout: 10000,
        httpsAgent: ipv4Agent,
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
      const isTimeout = err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED';
      const detail = isTimeout
        ? 'Connection to ticktick.com timed out (IPv4 forced — check WSL firewall or DNS).'
        : err.response?.data ? JSON.stringify(err.response.data) : err.message;
      this.logger.error(`TickTick OAuth error (${err.code ?? 'unknown'}): ${detail}`);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).send(`
        <h2>Error exchanging token</h2>
        <pre style="background:#f4f4f4;padding:10px;border-radius:5px;white-space:pre-wrap;">${detail}</pre>
      `);
    }
  }

  @Post('sync')
  async sync() {
    try {
      return await this.tickTickService.sync();
    } catch (err: any) {
      const errData = err.response?.data || err.message;
      this.logger.error(`[TickTick Sync] Error: ${typeof errData === 'object' ? JSON.stringify(errData) : errData}`);

      // If it's an auth error, delete the token so the user can reconnect
      if (err.response?.status === 401 || errData?.error === 'invalid_grant') {
        await this.prisma.tickTickAuth.deleteMany();
      }

      throw new HttpException({ error: errData }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
