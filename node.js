const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const semver = require('semver')
const dotenv = require('dotenv')
const ini = require('ini')
const csvParse = require('csv-parse/lib/sync')
const xml2js = require('xml2js')
const i18next = require('i18next')
const Backend = require('i18next-fs-backend')
const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const rateLimit = require('express-rate-limit')
const winston = require('winston')

const ALLOWED_ENV_KEYS = ['PORT', 'LANG', 'LOG_LEVEL', 'NODE_ENV']

let CONFIG = {}
let CSV_DATA = []
let XML_CONFIG = {}
let LOGGER

function checkVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'))
  const engines = pkg.engines || {}
  if (engines.node) {
    if (!semver.satisfies(process.version, engines.node)) {
      console.error(`Node version ${process.version} does not satisfy required ${engines.node}`)
      process.exit(1)
    }
  }
  if (engines.npm) {
    let npmVersion = ''
    try { npmVersion = execSync('npm --version').toString().trim() } catch {}
    if (!semver.satisfies(npmVersion, engines.npm)) {
      console.error(`npm version ${npmVersion} does not satisfy required ${engines.npm}`)
      process.exit(1)
    }
  }
}

async function setupEnvironment() {
  const envResult = dotenv.config()
  if (envResult.error) {
    console.error('Failed to load .env file')
    process.exit(1)
  }
  const env = process.env

  const configIniPath = path.join(__dirname, 'config', 'config.ini')
  if (fs.existsSync(configIniPath)) {
    const iniContent = fs.readFileSync(configIniPath, 'utf8')
    CONFIG.ini = ini.parse(iniContent)
  }

  const configXmlPath = path.join(__dirname, 'config', 'config.xml')
  if (fs.existsSync(configXmlPath)) {
    const xmlContent = fs.readFileSync(configXmlPath, 'utf8')
    XML_CONFIG = await xml2js.parseStringPromise(xmlContent, { mergeAttrs: true })
  }

  const dataCsvPath = path.join(__dirname, 'data', 'data.csv')
  if (fs.existsSync(dataCsvPath)) {
    const csvContent = fs.readFileSync(dataCsvPath, 'utf8')
    CSV_DATA = csvParse(csvContent, { columns: true, skip_empty_lines: true })
  }

  const logsDir = path.join(__dirname, 'logs')
  fs.mkdirSync(logsDir, { recursive: true })

  LOGGER = winston.createLogger({
    level: env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.printf(({ timestamp, level, message }) =>
        `${timestamp} [${level.toUpperCase()}] ${message}`
      )
    ),
    transports: [
      new winston.transports.Console(),
      new winston.transports.File({ filename: path.join(logsDir, 'app.log') })
    ]
  })

  await i18next.use(Backend).init({
    lng: env.LANG || 'en',
    fallbackLng: 'en',
    backend: { loadPath: path.join(__dirname, 'locales/{{lng}}/{{ns}}.json') },
    initImmediate: false
  })

  process.on('unhandledRejection', (reason) => {
    LOGGER.error(`Unhandled Rejection: ${reason}`)
    process.exit(1)
  })
  process.on('uncaughtException', (err) => {
    LOGGER.error(`Uncaught Exception: ${err.stack || err}`)
    process.exit(1)
  })
}

function filterEnv() {
  const filtered = {}
  ALLOWED_ENV_KEYS.forEach((key) => {
    if (process.env[key] !== undefined) {
      filtered[key] = process.env[key]
    }
  })
  return filtered
}

function runApp() {
  const app = express()

  app.use(helmet())
  app.use(cors())
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false
  })
  app.use(limiter)

  app.use((req, res, next) => {
    LOGGER.info(`${req.method} ${req.url}`)
    next()
  })

  app.get('/health', (req, res) =>
    res.json({ status: 'ok', version: i18next.t('app.version') })
  )
  app.get('/config', (req, res) =>
    res.json({ env: filterEnv(), ini: CONFIG.ini || {}, xml: XML_CONFIG })
  )
  app.get('/data', (req, res) => res.json(CSV_DATA))

  const port = parseInt(process.env.PORT, 10) || 3000
  app.listen(port, () => LOGGER.info(`Server started on port ${port}`))
}

;(async () => {
  checkVersion()
  await setupEnvironment()
  runApp()
})()