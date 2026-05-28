import { Router } from 'express';
import axios from 'axios';
import { prisma } from '../../shared/config/db.js';
import { handleError } from '../../shared/middleware/errorHandler.js';

const router = Router();

const TICKTICK_CLIENT_ID = process.env.TICKTICK_CLIENT_ID!;
const TICKTICK_CLIENT_SECRET = process.env.TICKTICK_CLIENT_SECRET!;
const TICKTICK_REDIRECT_URI = process.env.TICKTICK_REDIRECT_URI!;

router.get('/api/ticktick/status', async (_req, res) => {
  try {
    const auth = await prisma.tickTickAuth.findUnique({ where: { id: 'singleton' } });
    if (!auth) return res.json({ connected: false });
    res.json({ connected: true, expiresAt: auth.expiresAt });
  } catch (err: any) { handleError(res, err); }
});

router.get('/api/ticktick/auth', (_req, res) => {
  console.log("tick tick client id", TICKTICK_CLIENT_ID)
  const url = `https://ticktick.com/oauth/authorize?client_id=${TICKTICK_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(TICKTICK_REDIRECT_URI)}&scope=tasks:read`;
  res.json({ url });
});

router.get('/api/ticktick/callback', async (req, res) => {
  const code = req.query.code as string;
  if (!code) return res.status(400).send('No code provided');

  try {
    const encoded = Buffer.from(`${TICKTICK_CLIENT_ID}:${TICKTICK_CLIENT_SECRET}`).toString('base64');
    const response = await axios.post('https://ticktick.com/oauth/token', new URLSearchParams({
      client_id: TICKTICK_CLIENT_ID,
      client_secret: TICKTICK_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      scope: 'tasks:write tasks:read',
      redirect_uri: TICKTICK_REDIRECT_URI
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${encoded}`
      }
    });

    const data = response.data;
    const expiresAt = new Date(Date.now() + data.expires_in * 1000);

    await prisma.tickTickAuth.upsert({
      where: { id: 'singleton' },
      update: { accessToken: data.access_token, refreshToken: data.refresh_token || '', expiresAt },
      create: { id: 'singleton', accessToken: data.access_token, refreshToken: data.refresh_token || '', expiresAt }
    });

    res.redirect(process.env.FRONTEND_URL!);
  } catch (err: any) {
    let errDetails = 'Unknown Error';
    if (err.response) {
      errDetails = `Status ${err.response.status} - Data: ${typeof err.response.data === 'object' ? JSON.stringify(err.response.data) : err.response.data}`;
    } else {
      errDetails = err.message || String(err);
    }
    console.error('TickTick OAuth Error Details:', errDetails);
    res.status(500).send(`
      <h2>Error exchanging token</h2>
      <pre style="background:#f4f4f4;padding:10px;border-radius:5px;white-space:pre-wrap;">${errDetails}</pre>
    `);
  }
});

export default router;
