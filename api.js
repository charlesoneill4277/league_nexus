const API_BASE_URL = process.env.API_BASE_URL || 'https://api.leaguenexus.com'
const API_TOKEN = process.env.API_TOKEN || ''

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Authorization': `Bearer ${API_TOKEN}`,
    'Content-Type': 'application/json'
  },
  timeout: 10000
})

async function requestWithRetry(config, retries = 3, backoff = 300) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await axiosInstance.request(config)
      return response.data
    } catch (error) {
      const status = error.response ? error.response.status : null
      if (attempt === retries || (status && status < 500)) {
        throw error
      }
      await new Promise(res => setTimeout(res, backoff * Math.pow(2, attempt)))
    }
  }
}

function validateLeagueId(leagueId) {
  if (leagueId == null || (typeof leagueId !== 'string' && typeof leagueId !== 'number')) {
    throw new Error('Invalid leagueId')
  }
}

function validatePositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
}

function validateDateString(value, name) {
  if (typeof value !== 'string' || isNaN(Date.parse(value))) {
    throw new Error(`${name} must be a valid ISO date string`)
  }
}

export async function fetchStandings(leagueId) {
  validateLeagueId(leagueId)
  const path = `/leagues/${encodeURIComponent(leagueId)}/standings`
  return await requestWithRetry({ method: 'GET', url: path })
}

export async function fetchMatchups(leagueId) {
  validateLeagueId(leagueId)
  const path = `/leagues/${encodeURIComponent(leagueId)}/matchups`
  return await requestWithRetry({ method: 'GET', url: path })
}

export async function fetchTransactions(leagueId, { since, limit = 100 } = {}) {
  validateLeagueId(leagueId)
  const params = {}
  if (since !== undefined) {
    if (typeof since === 'string') {
      validateDateString(since, 'since')
    } else if (typeof since === 'number') {
      validatePositiveInteger(since, 'since')
    } else {
      throw new Error('since must be a timestamp number or ISO date string')
    }
    params.since = since
  }
  if (limit !== undefined) {
    validatePositiveInteger(limit, 'limit')
    params.limit = limit
  }
  const path = `/leagues/${encodeURIComponent(leagueId)}/transactions`
  return await requestWithRetry({ method: 'GET', url: path, params })
}

export async function fetchDrafts(leagueId) {
  validateLeagueId(leagueId)
  const path = `/leagues/${encodeURIComponent(leagueId)}/drafts`
  return await requestWithRetry({ method: 'GET', url: path })
}

export async function fetchAnalytics({ leagueIds = [], metrics = [], startDate, endDate, groupBy } = {}) {
  if (!Array.isArray(leagueIds) || leagueIds.length === 0) {
    throw new Error('leagueIds must be a non-empty array')
  }
  leagueIds.forEach(id => {
    if (id == null || (typeof id !== 'string' && typeof id !== 'number')) {
      throw new Error('Each leagueId must be a string or number')
    }
  })

  if (!Array.isArray(metrics) || metrics.length === 0) {
    throw new Error('metrics must be a non-empty array')
  }
  metrics.forEach(m => {
    if (typeof m !== 'string' || !m.trim()) {
      throw new Error('Each metric must be a non-empty string')
    }
  })

  const params = {
    leagueIds: leagueIds.join(','),
    metrics: metrics.join(',')
  }

  if (startDate !== undefined) {
    validateDateString(startDate, 'startDate')
    params.startDate = startDate
  }
  if (endDate !== undefined) {
    validateDateString(endDate, 'endDate')
    params.endDate = endDate
  }

  if (groupBy !== undefined) {
    const allowed = ['league', 'team', 'player', 'owner']
    if (typeof groupBy !== 'string' || !allowed.includes(groupBy)) {
      throw new Error(`groupBy must be one of: ${allowed.join(', ')}`)
    }
    params.groupBy = groupBy
  }

  return await requestWithRetry({ method: 'GET', url: '/analytics', params })
}