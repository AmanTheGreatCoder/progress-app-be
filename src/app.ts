import express from 'express';
import cors from 'cors';
import https from 'https';
import axios from 'axios';
import ticktickRouter from './features/ticktick/ticktick.router.js';
import dashboardRouter from './features/dashboard/dashboard.router.js';
import goalsRouter from './features/goals/goals.router.js';
import tasksRouter from './features/tasks/tasks.router.js';
import syncRouter from './features/sync/sync.router.js';

// Fix for Node 18+ IPv6 AggregateError
axios.defaults.httpsAgent = new https.Agent({ family: 4 });

const app = express();

app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://progress-app-fe.vercel.app',
  ],
  credentials: true
}));
app.use(express.json());

app.use(ticktickRouter);
app.use(dashboardRouter);
app.use(goalsRouter);
app.use(tasksRouter);
app.use(syncRouter);

export default app;
