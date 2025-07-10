const cron = require('node-cron')
const db = require('../db')
const logger = require('../logger')

async function computeMetrics(userId) {
  try {
    const teams = await db('teams').where({ user_id: userId }).select('id')
    if (!teams.length) {
      logger.warn(`No teams found for user ${userId}`)
      return null
    }
    const teamIds = teams.map(t => t.id)
    const stats = await db('games')
      .whereIn('team_id', teamIds)
      .select('points_scored', 'result')

    let totalGames = 0, totalPoints = 0, wins = 0, losses = 0
    stats.forEach(g => {
      totalGames++
      totalPoints += g.points_scored
      if (g.result === 'win') wins++
      else if (g.result === 'loss') losses++
    })

    const avgPoints = totalGames ? totalPoints / totalGames : 0
    const winRate = totalGames ? wins / totalGames : 0
    const now = new Date()
    const metrics = {
      user_id: userId,
      total_games: totalGames,
      total_points: totalPoints,
      average_points: avgPoints,
      wins,
      losses,
      win_rate: winRate,
      updated_at: now
    }

    await db('metrics')
      .insert(metrics)
      .onConflict('user_id')
      .merge()

    return metrics
  } catch (error) {
    logger.error(`computeMetrics(${userId}) failed: ${error.message}`)
    throw error
  }
}

async function computePremiumMetrics(userId, baseMetrics = null) {
  try {
    const base = baseMetrics || await computeMetrics(userId)
    if (!base) return null

    const consistencyScore = base.average_points
      ? Math.max(0, 100 - (Math.abs(base.wins - base.losses) / base.average_points) * 10)
      : 0
    const tradeValueScore = Math.min(100, base.total_points / (base.total_games || 1) * 2)
    const now = new Date()
    const premium = {
      user_id: userId,
      consistency_score: parseFloat(consistencyScore.toFixed(2)),
      trade_value_score: parseFloat(tradeValueScore.toFixed(2)),
      generated_at: now
    }

    await db('premium_metrics')
      .insert(premium)
      .onConflict('user_id')
      .merge()

    return premium
  } catch (error) {
    logger.error(`computePremiumMetrics(${userId}) failed: ${error.message}`)
    throw error
  }
}

function scheduleAnalyticsJob(cronExpr) {
  if (!cron.validate(cronExpr)) {
    const msg = `Invalid cron expression: ${cronExpr}`
    logger.error(msg)
    throw new Error(msg)
  }

  const task = cron.schedule(cronExpr, async () => {
    logger.info(`Running scheduled analytics job (${cronExpr})`)
    try {
      const users = await db('users').where({ active: true }).select('id')
      for (const u of users) {
        try {
          const metrics = await computeMetrics(u.id)
          await computePremiumMetrics(u.id, metrics)
        } catch (errUser) {
          logger.error(`Analytics for user ${u.id} failed: ${errUser.message}`)
          // continue with next user
        }
      }
      logger.info('Scheduled analytics job completed')
    } catch (err) {
      logger.error(`Scheduled analytics job error: ${err.message}`)
    }
  })

  logger.info(`Analytics job scheduled with cron expression: ${cronExpr}`)
  return task
}

async function getAnalyticsReport(userId) {
  try {
    const [base] = await db('metrics').where({ user_id: userId })
    const [premium] = await db('premium_metrics').where({ user_id: userId })

    let metrics = base
    let premiumMetrics = premium

    if (!metrics) {
      metrics = await computeMetrics(userId)
    }
    if (!premiumMetrics) {
      premiumMetrics = await computePremiumMetrics(userId, metrics)
    }

    return {
      userId,
      metrics: metrics || null,
      premiumMetrics: premiumMetrics || null
    }
  } catch (error) {
    logger.error(`getAnalyticsReport(${userId}) failed: ${error.message}`)
    throw error
  }
}

module.exports = {
  computeMetrics,
  computePremiumMetrics,
  scheduleAnalyticsJob,
  getAnalyticsReport
}