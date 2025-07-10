const path = require('path')
const fs = require('fs')
const ini = require('ini')
const axios = require('axios')
const NodeCache = require('node-cache')
const Bottleneck = require('bottleneck')

const configPath = path.resolve(__dirname, '../config/config.ini')
let rawConfig
try {
  rawConfig = fs.readFileSync(configPath, 'utf-8')
} catch (err) {
  throw new Error(`Unable to read config file at ${configPath}: ${err.message}`)
}
let config
try {
  config = ini.parse(rawConfig)
} catch (err) {
  throw new Error(`Unable to parse config file: ${err.message}`)
}

const DEFAULT_CACHE_TTL = 60
const DEFAULT_CACHE_CHECK_PERIOD = 120
const cacheTtl = Number(config.cache?.ttl) || DEFAULT_CACHE_TTL
const cacheCheckPeriod = Number(config.cache?.checkperiod) || DEFAULT_CACHE_CHECK_PERIOD

const cache = new NodeCache({ stdTTL: cacheTtl, checkperiod: cacheCheckPeriod })

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']'
  }
  const keys = Object.keys(value).sort()
  return '{' + keys.map(key => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}'
}

class APIClient {
  constructor() {
    this.providers = {}
    this.limiters = {}
    const providersConfig = config.providers || {}
    Object.entries(providersConfig).forEach(([name, opts]) => {
      const baseURL = opts.baseURL
      const apiKey = opts.apiKey
      const timeout = Number(opts.timeout) || 10000
      this.providers[name] = axios.create({
        baseURL,
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout
      })
      const maxConcurrent = Number(opts.maxConcurrent) || 5
      const minTime = Number(opts.minTime) || 200
      this.limiters[name] = new Bottleneck({ maxConcurrent, minTime })
      this.providers[name].interceptors.response.use(
        response => response,
        error => Promise.reject(error)
      )
    })
  }

  async request(provider, method, endpoint, params = {}, data = {}) {
    if (!this.providers[provider]) {
      throw new Error(`Unknown provider: ${provider}`)
    }

    const methodUpper = method.toUpperCase()
    const key = `${provider}:${methodUpper}:${endpoint}:${stableStringify(params)}:${stableStringify(data)}`
    if (methodUpper === 'GET') {
      const cached = cache.get(key)
      if (cached !== undefined) {
        return cached
      }
    }

    const exec = () =>
      this.providers[provider].request({ url: endpoint, method: methodUpper, params, data })
    const limiter = this.limiters[provider]

    const maxRetries = Number(config.retries) || 3
    const backoffBase = Number(config.backoffBase) || 300

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await limiter.schedule(exec)
        if (methodUpper === 'GET') {
          cache.set(key, response.data)
        }
        return response.data
      } catch (err) {
        const shouldRetry = this._shouldRetry(err)
        if (attempt === maxRetries - 1 || !shouldRetry) {
          throw err
        }
        const delay = backoffBase * Math.pow(2, attempt)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  _shouldRetry(err) {
    if (err.response && err.response.status) {
      const status = err.response.status
      return status >= 500 || status === 429
    }
    return true
  }

  getStandings(provider, leagueId, season) {
    return this.request(provider, 'get', `/leagues/${leagueId}/standings`, { season })
  }

  getMatchups(provider, leagueId, week) {
    return this.request(provider, 'get', `/leagues/${leagueId}/matchups`, { week })
  }

  getTransactions(provider, leagueId, since) {
    return this.request(provider, 'get', `/leagues/${leagueId}/transactions`, { since })
  }

  getDrafts(provider, leagueId) {
    return this.request(provider, 'get', `/leagues/${leagueId}/drafts`)
  }

  getTeamAnalytics(provider, leagueId, teamId) {
    return this.request(provider, 'get', `/leagues/${leagueId}/teams/${teamId}/analytics`)
  }

  batchRequests(provider, requests) {
    return Promise.all(
      requests.map(r =>
        this.request(provider, r.method, r.endpoint, r.params, r.data)
      )
    )
  }
}

module.exports = new APIClient()