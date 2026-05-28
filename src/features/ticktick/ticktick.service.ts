import axios from 'axios';
import { prisma } from '../../shared/config/db.js';

const TICKTICK_CLIENT_ID = process.env.TICKTICK_CLIENT_ID!;
const TICKTICK_CLIENT_SECRET = process.env.TICKTICK_CLIENT_SECRET!;

export async function getValidAccessToken(): Promise<string> {
  const auth = await prisma.tickTickAuth.findUnique({ where: { id: 'singleton' } });
  if (!auth) throw new Error('TickTick not connected');

  if (new Date() >= auth.expiresAt) {
    const encoded = Buffer.from(`${TICKTICK_CLIENT_ID}:${TICKTICK_CLIENT_SECRET}`).toString('base64');
    const res = await axios.post('https://ticktick.com/oauth/token', new URLSearchParams({
      client_id: TICKTICK_CLIENT_ID,
      client_secret: TICKTICK_CLIENT_SECRET,
      grant_type: 'refresh_token',
      scope: 'tasks:write tasks:read',
      refresh_token: auth.refreshToken
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${encoded}`
      }
    });

    const data = res.data;
    const newExpiresAt = new Date(Date.now() + data.expires_in * 1000);
    await prisma.tickTickAuth.update({
      where: { id: 'singleton' },
      data: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || auth.refreshToken,
        expiresAt: newExpiresAt
      }
    });
    return data.access_token;
  }
  return auth.accessToken;
}
