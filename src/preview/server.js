/**
 * Static preview of what /setup builds — a Discord-styled mock of the server
 * tree, the roles and every embed. Useful for showing stakeholders the plan
 * before inviting the bot anywhere.
 *
 *   npm run preview   ->  http://0.0.0.0:3000
 */
import { createServer } from 'node:http';
import { renderPage } from './render.js';

const PORT = Number(process.env.PORT || 3000);

const server = createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(renderPage());
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`OPB Giveaways preview running on http://0.0.0.0:${PORT}`);
});
