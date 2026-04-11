import { Hono } from 'hono';
import { OPTIONS, handleIVXOwnerAIRequest } from './api/ivx-owner-ai';

const app = new Hono();

app.get('/health', (context) => {
  return context.json({ ok: true, service: 'ivx-owner-ai-backend' });
});

app.options('/ivx/owner-ai', () => {
  return OPTIONS();
});

app.post('/ivx/owner-ai', async (context) => {
  return handleIVXOwnerAIRequest(context.req.raw);
});

export default app;
