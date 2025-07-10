const { createLogger, format, transports } = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const Redis = require('ioredis');
const Bottleneck = require('bottleneck');
const axios = require('axios');
const Joi = require('joi');
const { Counter, Histogram, register } = require('prom-client');
require('dotenv').config();

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.printf(({ timestamp, level, message, ...meta }) => {
      return `${timestamp} [${level.toUpperCase()}] ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
    })
  ),
  transports: [
    new transports.Console(),
    new DailyRotateFile({
      filename: process.env.LOG_FILE || 'dataingestion-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: process.env.LOG_MAX_SIZE || '20m',
      maxFiles: process.env.LOG_MAX_FILES || '14d'
    })
  ]
});

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  password: process.env.REDIS_PASSWORD || null
});

const ingestionRequests = new Counter({
  name: 'ingestion_requests_total',
  help: 'Total number of data ingestion requests'
});
const ingestionSuccess = new Counter({
  name: 'ingestion_success_total',
  help: 'Total number of successful ingestions'
});
const ingestionFailure = new Counter({
  name: 'ingestion_failure_total',
  help: 'Total number of failed ingestions'
});
const ingestionDuration = new Histogram({
  name: 'ingestion_duration_seconds',
  help: 'Histogram of ingestion durations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

const leagueConfigSchema = Joi.object({
  id: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
  provider: Joi.string().valid('yahoo', 'espn', 'sleeper', 'nfl', 'mfl').required(),
  credentials: Joi.when('provider', {
    switch: [
      { is: 'yahoo', then: Joi.object({ token: Joi.string().required() }).required() },
      { is: 'nfl', then: Joi.object({ key: Joi.string().required() }).required() },
      { is: 'mfl', then: Joi.object({ key: Joi.string().required() }).required() }
    ],
    otherwise: Joi.object().required()
  }),
  settings: Joi.object().default({})
}).required();

const dataSchemas = {
  standings: Joi.array().items(Joi.object()).required(),
  matchups: Joi.array().items(Joi.object()).required(),
  transactions: Joi.array().items(Joi.object()).required(),
  draft: Joi.object().required(),
  analytics: Joi.object().required()
};

const limiters = {
  yahoo: new Bottleneck({ maxConcurrent: 2, minTime: 500 }),
  espn: new Bottleneck({ maxConcurrent: 2, minTime: 500 }),
  sleeper: new Bottleneck({ maxConcurrent: 5, minTime: 200 }),
  nfl: new Bottleneck({ maxConcurrent: 1, minTime: 1000 }),
  mfl: new Bottleneck({ maxConcurrent: 1, minTime: 1000 })
};

const axiosInstances = {
  yahoo: axios.create({ baseURL: 'https://fantasysports.yahooapis.com' }),
  espn: axios.create({ baseURL: 'https://fantasy.espn.com/apis' }),
  sleeper: axios.create({ baseURL: 'https://api.sleeper.app' }),
  nfl: axios.create({ baseURL: 'https://api.fantasy.nfl.com' }),
  mfl: axios.create({ baseURL: 'https://api.myfantasyleague.com' })
};

async function fetchWithLimiter(provider, fn) {
  return limiters[provider].schedule(fn);
}

async function fetchProviderData(league, type) {
  const { provider, credentials, id, settings } = league;
  let url, params = {}, headers = {};
  switch (provider) {
    case 'yahoo':
      url = `/fantasy/v2/league/${id}/${type}`;
      headers = { Authorization: `Bearer ${credentials.token}` };
      params = settings;
      break;
    case 'espn':
      url = `/fantasy/v2/leagueSettings?leagueId=${id}`;
      params = settings;
      headers = { 'x-fantasy-filter': JSON.stringify({ view: [type] }) };
      break;
    case 'sleeper':
      url = `/v1/league/${id}/${type}`;
      params = settings;
      break;
    case 'nfl':
      url = `/v1/league/${id}/${type}`;
      params = { apiKey: credentials.key, ...settings };
      break;
    case 'mfl':
      url = `/export?TYPE=${type.toUpperCase()}&L=${id}&JSON=1`;
      params = { APIKEY: credentials.key, ...settings };
      break;
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
  const response = await fetchWithLimiter(provider, () =>
    axiosInstances[provider].get(url, { params, headers, timeout: 10000 })
  );
  return response.data;
}

async function ingestLeagueData(rawConfig) {
  ingestionRequests.inc();
  const endTimer = ingestionDuration.startTimer();
  const { error: cfgError, value: league } = leagueConfigSchema.validate(rawConfig, { stripUnknown: true });
  if (cfgError) {
    ingestionFailure.inc();
    logger.error('Invalid league config', { error: cfgError.message, config: rawConfig });
    endTimer();
    throw cfgError;
  }
  try {
    const results = {};
    await Promise.all(Object.keys(dataSchemas).map(async type => {
      const data = await fetchProviderData(league, type);
      const { error: err, value: sanitizedData } = dataSchemas[type].validate(data, { stripUnknown: true });
      if (err) throw err;
      const cacheKey = `league:${league.id}:${type}`;
      await redis.set(cacheKey, JSON.stringify(sanitizedData), 'EX', league.settings.cacheTTL || 300);
      results[type] = sanitizedData;
      logger.info('Fetched and cached data', { league: league.id, provider: league.provider, type });
    }));
    ingestionSuccess.inc();
    endTimer();
    return results;
  } catch (err) {
    ingestionFailure.inc();
    endTimer();
    logger.error('Data ingestion failed', { league: rawConfig.id, provider: rawConfig.provider, error: err.message });
    throw err;
  }
}

async function ingestAllLeagues(configs) {
  const tasks = configs.map(async cfg => {
    try {
      const data = await ingestLeagueData(cfg);
      return { league: cfg.id, data, error: null };
    } catch (err) {
      return { league: cfg.id, data: null, error: err.message };
    }
  });
  return Promise.all(tasks);
}

module.exports = {
  ingestLeagueData,
  ingestAllLeagues,
  metrics: register
};