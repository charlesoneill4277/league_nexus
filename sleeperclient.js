const fs = require("fs");
const path = require("path");
const ini = require("ini");
const axios = require("axios");
const pLimit = require("p-limit");
const winston = require("winston");

const configPath = path.resolve(__dirname, "../config/config.ini");
const rawConfig = fs.existsSync(configPath)
  ? ini.parse(fs.readFileSync(configPath, "utf-8"))
  : {};
const sleeperConfig = rawConfig.sleeper || {};

const BASE_URL = sleeperConfig.baseURL || "https://api.sleeper.app/v1";
const TIMEOUT = parseInt(sleeperConfig.timeout, 10) || 10000;
const CONCURRENCY = parseInt(sleeperConfig.concurrency, 10) || 5;
const RETRY_LIMIT = parseInt(sleeperConfig.retryLimit, 10) || 3;

// Ensure logs directory exists
const logDir = path.resolve(__dirname, "../logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logger = winston.createLogger({
  level: sleeperConfig.logLevel || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(
      ({ timestamp, level, message, ...meta }) =>
        `${timestamp} [${level.toUpperCase()}] ${message} ${
          Object.keys(meta).length ? JSON.stringify(meta) : ""
        }`
    )
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.resolve(logDir, "sleeperclient.log"),
      maxsize: 5 * 1024 * 1024,
      maxFiles: 3,
    }),
  ],
});

class SleeperClient {
  constructor() {
    this.axios = axios.create({
      baseURL: BASE_URL,
      timeout: TIMEOUT,
      headers: { "Content-Type": "application/json" },
    });
    this.limit = pLimit(CONCURRENCY);
    this.queue = [];
    this.flushing = false;
  }

  get(endpoint, params = {}) {
    return this.enqueue({ method: "get", url: endpoint, params });
  }

  post(endpoint, data = {}) {
    return this.enqueue({ method: "post", url: endpoint, data });
  }

  put(endpoint, data = {}) {
    return this.enqueue({ method: "put", url: endpoint, data });
  }

  delete(endpoint, params = {}) {
    return this.enqueue({ method: "delete", url: endpoint, params });
  }

  enqueue(requestOptions) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        ...requestOptions,
        resolve,
        reject,
        retryCount: 0,
      });
      if (!this.flushing) {
        this.flushing = true;
        setImmediate(() => this.flush());
      }
    });
  }

  async flush() {
    const batch = this.queue.splice(0);
    this.flushing = false;
    await Promise.all(
      batch.map((item) => this.limit(() => this.processItem(item)))
    );
  }

  async processItem(item) {
    const { method, url, params, data, resolve, reject, retryCount } = item;
    try {
      const response = await this.axios.request({ method, url, params, data });
      logger.info(`Sleeper API ${method.toUpperCase()} ${url} succeeded`);
      resolve(response.data);
    } catch (error) {
      const status = error.response ? error.response.status : null;
      const msg = error.message || "Unknown error";
      const isRetryable =
        status === null || (status >= 500 && status < 600);
      if (retryCount < RETRY_LIMIT && isRetryable) {
        const nextRetry = retryCount + 1;
        const backoff = Math.pow(2, retryCount) * 1000;
        logger.warn(
          `Retry ${nextRetry}/${RETRY_LIMIT} for ${method.toUpperCase()} ${
            url
          } after ${backoff}ms - error: ${msg}${
            status ? " (status " + status + ")" : ""
          }`
        );
        this.queue.push({
          method,
          url,
          params,
          data,
          resolve,
          reject,
          retryCount: nextRetry,
        });
        if (!this.flushing) {
          this.flushing = true;
          setTimeout(() => this.flush(), backoff);
        }
      } else {
        if (!isRetryable && status && status < 500) {
          logger.error(
            `Sleeper API ${method.toUpperCase()} ${url} failed with client error ${status} - not retrying`
          );
        } else {
          logger.error(
            `Sleeper API ${method.toUpperCase()} ${url} failed after ${RETRY_LIMIT} retries - error: ${msg}${
              status ? " (status " + status + ")" : ""
            }`
          );
        }
        reject(error);
      }
    }
  }
}

module.exports = new SleeperClient();