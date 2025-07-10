const fs = require('fs').promises
const path = require('path')
const ini = require('ini')
const axios = require('axios')
const xml2js = require('xml2js')
const { parse: csvParse } = require('csv-parse/sync')
const { v4: uuidv4 } = require('uuid')
const EventEmitter = require('events')

class LeagueService extends EventEmitter {
  constructor(options = {}) {
    super()
    this.baseDir = options.dataDir || path.resolve(process.cwd(), 'data', 'leagues')
    this.configPath = options.configPath || path.resolve(process.cwd(), 'config.ini')
    this.config = {}
  }

  static async create(options = {}) {
    const service = new LeagueService(options)
    await service._ensureDir(service.baseDir)
    await service._loadConfig()
    return service
  }

  async _ensureDir(dir) {
    try {
      await fs.mkdir(dir, { recursive: true })
    } catch (err) {
      if (err.code !== 'EEXIST') {
        this.emit('warning', { message: `Failed to ensure directory ${dir}`, error: err })
      }
    }
  }

  async _loadConfig() {
    try {
      const raw = await fs.readFile(this.configPath, 'utf-8')
      this.config = ini.parse(raw)
    } catch (err) {
      this.emit('warning', { message: `Failed to load config from ${this.configPath}`, error: err })
      this.config = {}
    }
  }

  async listLeagues() {
    const files = await fs.readdir(this.baseDir)
    const leagues = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      const filePath = path.join(this.baseDir, file)
      try {
        const content = await fs.readFile(filePath, 'utf-8')
        leagues.push(JSON.parse(content))
      } catch (err) {
        this.emit('warning', { message: `Failed to parse league file ${file}`, error: err })
      }
    }
    return leagues
  }

  async getLeague(id) {
    const file = path.join(this.baseDir, `${id}.json`)
    try {
      const content = await fs.readFile(file, 'utf-8')
      return JSON.parse(content)
    } catch {
      return null
    }
  }

  async createLeague(data) {
    const id = data.id || uuidv4()
    const now = new Date().toISOString()
    const league = { ...data, id, createdAt: now, updatedAt: now }
    await this._writeLeague(league)
    return league
  }

  async updateLeague(id, updates) {
    const league = await this.getLeague(id)
    if (!league) return null
    const now = new Date().toISOString()
    const merged = { ...league, ...updates, updatedAt: now }
    await this._writeLeague(merged)
    return merged
  }

  async deleteLeague(id) {
    const file = path.join(this.baseDir, `${id}.json`)
    try {
      await fs.unlink(file)
      return true
    } catch {
      return false
    }
  }

  async ingestData(sourceName, leagueId) {
    const sourceConfig = this.config[sourceName] || {}
    const league = await this.getLeague(leagueId)
    if (!league) {
      const err = new Error(`League ${leagueId} not found`)
      this.emit('ingestError', { source: sourceName, leagueId, error: err })
      throw err
    }
    try {
      const raw = await this._fetchRemote(sourceConfig, sourceName)
      const parsed = await this._parseByType(raw, sourceConfig.type)
      const updated = { ...league, ...parsed, updatedAt: new Date().toISOString() }
      await this._writeLeague(updated)
      this.emit('ingestCompleted', { source: sourceName, leagueId, data: parsed })
      return updated
    } catch (error) {
      this.emit('ingestError', { source: sourceName, leagueId, error })
      throw error
    }
  }

  async _fetchRemote(cfg, sourceName) {
    const method = (cfg.method || 'get').toLowerCase()
    let headers, params, data
    if (cfg.headers) {
      try {
        headers = JSON.parse(cfg.headers)
      } catch (err) {
        throw new Error(`Invalid JSON in headers for source ${sourceName}: ${err.message}`)
      }
    }
    if (cfg.params) {
      try {
        params = JSON.parse(cfg.params)
      } catch (err) {
        throw new Error(`Invalid JSON in params for source ${sourceName}: ${err.message}`)
      }
    }
    if (cfg.body) {
      try {
        data = JSON.parse(cfg.body)
      } catch (err) {
        throw new Error(`Invalid JSON in body for source ${sourceName}: ${err.message}`)
      }
    }
    const options = {
      url: cfg.url,
      method,
      headers,
      params,
      data,
      responseType: 'text'
    }
    const res = await axios(options)
    return res.data
  }

  async _parseByType(data, type = 'json') {
    switch ((type || '').toLowerCase()) {
      case 'xml': {
        const parser = new xml2js.Parser({ explicitArray: false })
        return parser.parseStringPromise(data)
      }
      case 'csv': {
        return csvParse(data, { columns: true, skip_empty_lines: true })
      }
      default:
        try {
          return JSON.parse(data)
        } catch {
          return data
        }
    }
  }

  async _writeLeague(league) {
    const file = path.join(this.baseDir, `${league.id}.json`)
    const content = JSON.stringify(league, null, 2)
    await fs.writeFile(file, content, 'utf-8')
  }
}

module.exports = LeagueService