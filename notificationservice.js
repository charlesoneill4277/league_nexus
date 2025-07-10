const { Queue, Worker, QueueScheduler } = require('bullmq');
const I18Next = require('i18next');
const Backend = require('i18next-fs-backend');
const path = require('path');
const fs = require('fs');
const EmailService = require('./services/emailService');
const PushService = require('./services/pushService');
const SmsService = require('./services/smsService');
const logger = require('./utils/logger');
require('dotenv').config();

class NotificationService {
  constructor() {
    this.queueName = process.env.NOTIFICATION_QUEUE || 'notificationQueue';
    this.connection = this.buildRedisConnection();
    this.email = new EmailService();
    this.push = new PushService();
    this.sms = new SmsService();
    this.queueScheduler = null;
    this.queue = null;
    this.worker = null;
    this.ready = this.init();
  }

  buildRedisConnection() {
    const conn = {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379
    };
    if (process.env.REDIS_PASSWORD) {
      conn.password = process.env.REDIS_PASSWORD;
    }
    if (process.env.REDIS_DB) {
      conn.db = parseInt(process.env.REDIS_DB, 10);
    }
    if (process.env.REDIS_TLS === 'true') {
      conn.tls = {};
      if (process.env.REDIS_TLS_CA_FILE) {
        try {
          conn.tls.ca = [fs.readFileSync(process.env.REDIS_TLS_CA_FILE)];
        } catch (err) {
          logger.error(`Failed to read Redis TLS CA file: ${err.message}`);
        }
      }
    }
    return conn;
  }

  async init() {
    try {
      await this.initI18n();
      this.queueScheduler = new QueueScheduler(this.queueName, { connection: this.connection });
      this.queue = new Queue(this.queueName, { connection: this.connection });
      this.worker = new Worker(this.queueName, this.processJob.bind(this), { connection: this.connection });
      this.worker.on('failed', (job, err) => {
        logger.error(`Notification job ${job.id} failed: ${err.message}`);
      });
      logger.info('NotificationService initialized and worker started');
    } catch (err) {
      logger.error(`Failed to initialize NotificationService: ${err.message}`);
      throw err;
    }
  }

  async initI18n() {
    await I18Next.use(Backend).init({
      lng: 'en',
      fallbackLng: 'en',
      preload: ['en'],
      backend: {
        loadPath: path.join(__dirname, 'locales/{{lng}}/{{ns}}.json')
      }
    });
    logger.info('i18n initialized for NotificationService');
  }

  async enqueue(notification) {
    await this.ready;
    await this.queue.add(notification.type, notification, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 }
    });
  }

  async sendBatch(notifications) {
    await this.ready;
    const jobs = notifications.map(n => ({
      name: n.type,
      data: n,
      opts: { attempts: 3, backoff: { type: 'exponential', delay: 1000 } }
    }));
    await this.queue.addBulk(jobs);
  }

  async processJob(job) {
    const { userId, type, data, locale } = job.data;
    const msg = this.buildMessage(type, data, locale);
    const channels = data.channels || ['email'];
    for (const channel of channels) {
      try {
        switch (channel) {
          case 'email':
            await this.email.send(userId, msg.subject, msg.body);
            break;
          case 'push':
            await this.push.send(userId, msg);
            break;
          case 'sms':
            await this.sms.send(userId, msg.body);
            break;
          default:
            throw new Error(`Unsupported notification channel: ${channel}`);
        }
        logger.info(`Sent ${type} notification to user ${userId} via ${channel}`);
      } catch (err) {
        logger.error(`Error sending ${type} to user ${userId} via ${channel}: ${err.message}`);
        throw err;
      }
    }
  }

  buildMessage(type, data, locale = 'en') {
    const t = I18Next.getFixedT(locale);
    let subject = '';
    let body = '';
    switch (type) {
      case 'transaction':
        subject = t('notification.transaction.subject', { team: data.teamName });
        body = t('notification.transaction.body', {
          team: data.teamName,
          player: data.playerName,
          action: data.action
        });
        break;
      case 'matchup':
        subject = t('notification.matchup.subject', { week: data.week });
        body = t('notification.matchup.body', {
          home: data.homeTeam,
          away: data.awayTeam,
          score: data.score
        });
        break;
      case 'standings':
        subject = t('notification.standings.subject');
        body = t('notification.standings.body', {
          rank: data.rank,
          team: data.teamName,
          record: data.record
        });
        break;
      default:
        subject = t('notification.default.subject');
        body = t('notification.default.body', data);
    }
    return { subject, body };
  }
}

module.exports = new NotificationService();