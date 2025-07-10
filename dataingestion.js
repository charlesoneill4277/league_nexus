const fs = require('fs');
const path = require('path');
const ini = require('ini');
const axios = require('axios');
const logger = require('../utils/logger');
const { normalizeData } = require('../utils/normalizer');
const { storeData } = require('../services/dataStore');

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
const CONFIG_PATH = path.resolve(__dirname, '../config/settings.ini');

let config = {};
try {
  const fileContent = fs.readFileSync(CONFIG_PATH, 'utf-8');
  config = ini.parse(fileContent);
} catch (err) {
  logger.error('Failed to read or parse configuration file', { error: err.message });
  config = {};
}

const ingestionInterval =
  parseInt(config.ingestion?.intervalMs, 10) ||
  DEFAULT_INTERVAL_MS;

async function fetchDataFromAPI() {
  const apisConfig = config.apis || {};
  const endpointsRaw = apisConfig.endpoints || '';
  const endpointsList = endpointsRaw
    .split(',')
    .map(key => key.trim())
    .filter(Boolean);

  const fetchPromises = endpointsList.map(key => {
    const ep = apisConfig[key];
    if (!ep || !ep.url) {
      logger.warn(`Skipping API endpoint "${key}" due to missing configuration`);
      return Promise.resolve({ source: key, data: null });
    }
    const headers = ep.token ? { Authorization: `Bearer ${ep.token}` } : {};
    return axios
      .get(ep.url, { headers, timeout: 10000 })
      .then(res => ({ source: key, data: res.data }))
      .catch(error => {
        logger.error(`Error fetching API "${key}"`, {
          message: error.message,
          stack: error.stack
        });
        return { source: key, data: null };
      });
  });

  const results = await Promise.all(fetchPromises);
  return results.filter(r => r.data != null);
}

async function startIngestionCycle() {
  logger.info('Starting data ingestion cycle');
  try {
    const rawData = await fetchDataFromAPI();
    if (rawData.length === 0) {
      logger.warn('No data fetched in this cycle');
    }
    const normalized = normalizeData(rawData);
    await storeData(normalized);
    logger.info('Data ingestion cycle completed successfully');
  } catch (error) {
    logger.error('Data ingestion cycle failed', {
      message: error.message,
      stack: error.stack
    });
  }
}

async function runIngestion() {
  await startIngestionCycle();
  setTimeout(runIngestion, ingestionInterval);
}

function startIngestion() {
  runIngestion();
}

module.exports = { startIngestion };