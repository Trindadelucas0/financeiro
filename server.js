const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { loadEnv } = require('./src/config/env');
const { runMigrations } = require('./src/db/migrate');
const routes = require('./src/routes');

async function bootstrap() {
  const env = loadEnv();

  console.log('[server] Executando migrations...');
  await runMigrations();

  const app = express();

  app.use(helmet({
    contentSecurityPolicy: false,
  }));
  app.use(cors());

  app.use(express.json({ limit: '3mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  app.use(express.static(path.join(__dirname, 'public')));

  app.use(routes);

  app.use((err, req, res, _next) => {
    const status = err.status || 500;
    if (status >= 500) {
      console.error('[server] Erro:', err);
    }
    res.status(status).json({
      error: err.message || 'Erro interno do servidor',
    });
  });

  const server = app.listen(env.port, () => {
    console.log(`[server] Rodando em http://localhost:${env.port}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[server] Porta ${env.port} em uso. Altere PORT no .env ou encerre o processo.`);
      console.error(`[server] Windows: netstat -ano | findstr :${env.port}`);
    } else {
      console.error('[server] Erro ao iniciar:', err.message);
    }
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  console.error('[server] Falha ao iniciar:', err.message);
  process.exit(1);
});
