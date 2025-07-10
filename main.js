const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const ini = require('ini');
const winston = require('winston');
const i18n = require('i18n');
const mongoose = require('mongoose');
const Redis = require('ioredis');
const ApiClient = require('./apiclient');
const express = require('express');

const config = {};
const services = {};
let logger;
let server;
let isShuttingDown = false;

async function initApp() {
  dotenv.config();
  const iniPath = path.resolve(process.cwd(), 'config.ini');
  if (fs.existsSync(iniPath)) {
    config.ini = ini.parse(fs.readFileSync(iniPath, 'utf-8'));
  }
  config.port = process.env.PORT || config.ini?.app?.port || 3000;
  config.dbUri = process.env.DB_URI || config.ini?.database?.uri;
  config.redis = {
    host: process.env.REDIS_HOST || config.ini?.redis?.host || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || config.ini?.redis?.port || 6379)
  };
  config.logFile = process.env.LOG_FILE || config.ini?.log?.file || 'app.log';
  config.apiKey = process.env.API_KEY || config.ini?.api?.key;

  if (!config.dbUri) {
    throw new Error('Configuration error: Database URI (DB_URI) is required.');
  }
  if (!config.apiKey) {
    throw new Error('Configuration error: API key (API_KEY) is required.');
  }

  logger = winston.createLogger({
    level: process.env.LOG_LEVEL || config.ini?.log?.level || 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [
      new winston.transports.Console(),
      new winston.transports.File({ filename: config.logFile })
    ]
  });

  i18n.configure({
    locales: ['en', 'es', 'fr'],
    defaultLocale: 'en',
    directory: path.resolve(process.cwd(), 'locales'),
    autoReload: true,
    updateFiles: false,
    objectNotation: true
  });

  logger.info('Application initialized');
}

async function connectServices() {
  await mongoose.connect(config.dbUri, { useNewUrlParser: true, useUnifiedTopology: true });
  services.db = mongoose.connection;
  services.db.on('error', err => logger.error('MongoDB connection error', err));
  services.db.once('open', () => logger.info('Connected to MongoDB'));

  services.redis = new Redis({ host: config.redis.host, port: config.redis.port });
  services.redis.on('connect', () => logger.info('Connected to Redis'));
  services.redis.on('error', err => logger.error('Redis connection error', err));

  services.apiClient = new ApiClient({ apiKey: config.apiKey, logger });
  await services.apiClient.connect();
  logger.info('External API client connected');
}

async function startApp() {
  const app = express();
  app.use(i18n.init);
  app.use(express.json());

  const apiRoutes = (await import('./routes/api.js')).default;
  app.use('/api', apiRoutes);

  app.get('/health', (req, res) => res.send('OK'));
  app.use((err, req, res, next) => {
    logger.error('Unhandled error', err);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  server = app.listen(config.port, () => logger.info(`Server listening on port ${config.port}`));

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function shutdown() {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  logger.info('Shutting down...');

  if (server) {
    server.close(err => {
      if (err) {
        logger.error('Error closing HTTP server', err);
      } else {
        logger.info('HTTP server closed');
      }
    });
  }

  try {
    if (services.redis) {
      await services.redis.quit();
      logger.info('Redis connection closed');
    }
    await mongoose.disconnect();
    logger.info('MongoDB connection closed');
  } catch (err) {
    logger.error('Error during shutdown', err);
  } finally {
    process.exit(0);
  }
}

(async () => {
  try {
    await initApp();
    await connectServices();
    await startApp();
  } catch (err) {
    if (logger) {
      logger.error('Failed to start application', err);
    } else {
      console.error('Failed to start application', err);
    }
    process.exit(1);
  }
})();