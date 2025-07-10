const Stripe = require('stripe')
const db = require('./db')
const logger = require('./logger')

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2020-08-27' })
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET

async function createSubscription(userId, priceId) {
  const client = await db.connect()
  const idempotencyKey = `createSubscription:${userId}:${priceId}`
  try {
    await client.query('BEGIN')
    const userRes = await client.query(
      'SELECT stripe_customer_id FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    )
    if (userRes.rowCount === 0) {
      throw new Error('User not found')
    }
    let customerId = userRes.rows[0].stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create(
        { metadata: { userId } },
        { idempotencyKey: `createCustomer:${userId}` }
      )
      customerId = customer.id
      await client.query(
        'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
        [customerId, userId]
      )
    }
    const subscription = await stripe.subscriptions.create(
      {
        customer: customerId,
        items: [{ price: priceId }],
        expand: ['latest_invoice.payment_intent']
      },
      { idempotencyKey }
    )
    const planId = subscription.items.data[0].price.id
    const status = subscription.status
    const currentPeriodEnd = new Date(subscription.current_period_end * 1000)
    await client.query(
      `INSERT INTO subscriptions
        (user_id, subscription_id, plan_id, status, current_period_end)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (subscription_id) DO UPDATE
      SET plan_id = EXCLUDED.plan_id,
          status = EXCLUDED.status,
          current_period_end = EXCLUDED.current_period_end`,
      [userId, subscription.id, planId, status, currentPeriodEnd]
    )
    await client.query('COMMIT')
    return { subscriptionId: subscription.id, status, currentPeriodEnd, planId }
  } catch (err) {
    await client.query('ROLLBACK')
    logger.error('createSubscription error', err)
    throw err
  } finally {
    client.release()
  }
}

async function cancelSubscription(userId, options = { atPeriodEnd: false }) {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const subRes = await client.query(
      'SELECT subscription_id FROM subscriptions WHERE user_id = $1 FOR UPDATE',
      [userId]
    )
    if (subRes.rowCount === 0) {
      throw new Error('Subscription not found')
    }
    const subscriptionId = subRes.rows[0].subscription_id
    const deleted = await stripe.subscriptions.del(
      subscriptionId,
      { at_period_end: !!options.atPeriodEnd }
    )
    const status = deleted.status
    const currentPeriodEnd = new Date(deleted.current_period_end * 1000)
    await client.query(
      `UPDATE subscriptions
        SET status = $1, current_period_end = $2
      WHERE subscription_id = $3`,
      [status, currentPeriodEnd, subscriptionId]
    )
    await client.query('COMMIT')
    return { subscriptionId, status, currentPeriodEnd }
  } catch (err) {
    await client.query('ROLLBACK')
    logger.error('cancelSubscription error', err)
    throw err
  } finally {
    client.release()
  }
}

async function getSubscriptionStatus(userId) {
  const res = await db.query(
    `SELECT subscription_id, plan_id, status, current_period_end
     FROM subscriptions WHERE user_id = $1`,
    [userId]
  )
  const row = res.rows[0]
  if (!row) return null
  return {
    subscriptionId: row.subscription_id,
    planId: row.plan_id,
    status: row.status,
    currentPeriodEnd: row.current_period_end
  }
}

async function handleStripeEvent(rawBody, sigHeader) {
  let event
  try {
    if (!WEBHOOK_SECRET) {
      throw new Error('Stripe webhook secret not configured')
    }
    event = stripe.webhooks.constructEvent(rawBody, sigHeader, WEBHOOK_SECRET)
  } catch (err) {
    logger.error('Webhook signature verification failed', err)
    throw new Error('Invalid Stripe webhook signature')
  }

  try {
    const type = event.type
    if (
      type.startsWith('customer.subscription.') &&
      ['created', 'updated', 'deleted'].includes(type.split('.').pop())
    ) {
      const obj = event.data.object
      const subscriptionId = obj.id
      const customerId = obj.customer
      const status = obj.status
      const planId = obj.items.data[0]?.price.id || null
      const currentPeriodEnd = obj.current_period_end
        ? new Date(obj.current_period_end * 1000)
        : null

      const userRes = await db.query(
        'SELECT id FROM users WHERE stripe_customer_id = $1',
        [customerId]
      )
      const userId = userRes.rows[0]?.id
      if (!userId) {
        logger.warn('Unknown customer for subscription event', { customerId })
        return
      }

      await db.query(
        `INSERT INTO subscriptions
          (user_id, subscription_id, plan_id, status, current_period_end)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (subscription_id) DO UPDATE
        SET plan_id = EXCLUDED.plan_id,
            status = EXCLUDED.status,
            current_period_end = EXCLUDED.current_period_end`,
        [userId, subscriptionId, planId, status, currentPeriodEnd]
      )
      logger.info('Subscription synced from Stripe', {
        userId,
        subscriptionId,
        status
      })
    }
  } catch (err) {
    logger.error('handleStripeEvent error', err)
    throw err
  }
}

module.exports = {
  createSubscription,
  cancelSubscription,
  getSubscriptionStatus,
  handleStripeEvent
}