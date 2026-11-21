import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import type { Ctx } from './context.js';
import { SESSION_COOKIE, userFromSession } from './auth.js';
import { HttpError } from './util.js';
import { coreRoutes } from './routes/core.js';
import { contractorRoutes } from './routes/contractors.js';
import { correspondenceRoutes } from './routes/correspondence.js';
import { taskRoutes } from './routes/tasks.js';
import { businessRoutes } from './routes/business.js';
import { documentRoutes } from './routes/documents.js';
import { reportRoutes } from './routes/reports.js';
import { importRoutes } from './routes/imports.js';

const OPEN_PATHS = new Set(['/api/auth/login', '/api/auth/logout', '/api/auth/me', '/api/health']);
const PASSWORD_CHANGE_PATHS = new Set(['/api/auth/password', '/api/auth/me', '/api/auth/logout']);

export async function buildApp(ctx: Ctx, opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 20 * 1024 * 1024, trustProxy: true });
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 100 * 1024 * 1024, files: 20 } });

  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;
    const url = req.url.split('?')[0];
    req.user = userFromSession(ctx, req.cookies[SESSION_COOKIE]);
    if (OPEN_PATHS.has(url)) return;
    if (!req.user) return reply.code(401).send({ error: 'Sesja wygasła. Zaloguj się ponownie.' });
    if (req.user.must_change_password && !PASSWORD_CHANGE_PATHS.has(url))
      return reply.code(403).send({ error: 'Przed dalszą pracą zmień hasło startowe.', must_change_password: true });
  });

  app.setErrorHandler((err: any, req, reply) => {
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.message });
    if (err.validation) return reply.code(400).send({ error: 'Niepoprawne dane żądania.' });
    if (err.code === 'FST_REQ_FILE_TOO_LARGE') return reply.code(413).send({ error: 'Plik jest za duży (limit 100 MB).' });
    if (String(err.message).includes('FOREIGN KEY')) return reply.code(409).send({ error: 'Rekord jest powiązany z innymi danymi i nie może zostać usunięty.' });
    req.log.error(err);
    console.error(err);
    reply.code(500).send({ error: 'Wystąpił błąd serwera. Szczegóły zapisano w dzienniku.' });
  });

  app.get('/api/health', async () => ({ ok: true }));
  await coreRoutes(app, ctx);
  await contractorRoutes(app, ctx);
  await correspondenceRoutes(app, ctx);
  await taskRoutes(app, ctx);
  await businessRoutes(app, ctx);
  await documentRoutes(app, ctx);
  await reportRoutes(app, ctx);
  await importRoutes(app, ctx);

  const clientDir = ctx.config.clientDir;
  if (fs.existsSync(path.join(clientDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: clientDir, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Nie znaleziono zasobu.' });
      return reply.type('text/html').sendFile('index.html');
    });
  } else {
    app.setNotFoundHandler((req, reply) => reply.code(404).send({ error: 'Nie znaleziono zasobu.' }));
  }
  return app;
}
