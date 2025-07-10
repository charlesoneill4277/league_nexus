const EventEmitter = require('events');
const { createLogger, format, transports } = require('winston');

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: [
    new transports.Console()
  ]
});

class NotificationService extends EventEmitter {
  constructor() {
    super();
    this.subscriptions = new Map();   // eventType -> Set of userIds
    this.eventQueue = [];             // queued events to process
    this.processing = false;
  }

  subscribe(userId, eventType) {
    if (!userId || !eventType) return;
    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, new Set());
    }
    this.subscriptions.get(eventType).add(userId);
    logger.info('User subscribed', { userId, eventType });
  }

  unsubscribe(userId, eventType) {
    if (!userId || !eventType) return;
    const subs = this.subscriptions.get(eventType);
    if (subs) {
      subs.delete(userId);
      if (subs.size === 0) {
        this.subscriptions.delete(eventType);
      }
      logger.info('User unsubscribed', { userId, eventType });
    }
  }

  sendNotification(userId, message) {
    if (!userId || !message) return Promise.resolve();
    return new Promise((resolve) => {
      const payload = { userId, message, timestamp: new Date().toISOString() };
      this.emit('notificationSent', payload);
      logger.info('Notification sent', payload);
      resolve(payload);
    });
  }

  queueEvent(event) {
    if (!event || !event.type) return;
    this.eventQueue.push(event);
    if (!this.processing) {
      this.processing = true;
      setImmediate(() => this.evaluateEvents());
    }
  }

  async evaluateEvents() {
    while (this.eventQueue.length > 0) {
      const event = this.eventQueue.shift();
      const { type, payload } = event;
      const subscribers = this.subscriptions.get(type);
      if (subscribers && subscribers.size > 0) {
        const message = this._formatMessage(type, payload);
        const tasks = Array.from(subscribers).map(async (userId) => {
          try {
            await this.sendNotification(userId, message);
          } catch (err) {
            this.emit('error', err, { userId, type, payload });
            logger.error('Error sending notification', { error: err.message || err, userId, type, payload });
          }
        });
        await Promise.allSettled(tasks);
      }
      this.emit('eventProcessed', event);
      logger.info('Event processed', { event });
    }
    this.processing = false;
  }

  _formatMessage(eventType, payload) {
    switch (eventType) {
      case 'matchupStart':
        return `Matchup started: ${payload.matchupId}`;
      case 'transaction':
        return `Transaction alert: ${payload.details}`;
      case 'standingsUpdate':
        return `Standings updated for week ${payload.week}`;
      default:
        return `Event ${eventType}: ${JSON.stringify(payload)}`;
    }
  }
}

module.exports = new NotificationService();