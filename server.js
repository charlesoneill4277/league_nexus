const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const dotenv = require('dotenv')
const ini = require('ini')
const fs = require('fs')
const path = require('path')
const i18n = require('i18n')
const winston = require('winston')
const { v4: uuidv4 } = require('uuid')

dotenv.config()

const configPath = path.join(__dirname, 'config.ini')
const config = fs.existsSync(configPath)
  ? ini.parse(fs.readFileSync(configPath, 'utf-8'))
  : {}

// Ensure logs directory exists
const logsDir = path.join(__dirname, 'logs')
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true })
}

const logger = winston.createLogger({
  level: config.logging?.level || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: path.join(logsDir, 'server.log') }),
    new winston.transports.Console()
  ]
})

i18n.configure({
  locales: config.i18n?.locales || ['en'],
  directory: path.join(__dirname, 'locales'),
  defaultLocale: config.i18n?.defaultLocale || 'en',
  objectNotation: true
})

const app = express()

app.use(helmet())
app.use(cors())
app.use(express.json())
app.use(i18n.init)
app.use((req, res, next) => {
  req.log = logger.child({ requestId: uuidv4(), path: req.path, method: req.method })
  req.log.info('Incoming request')
  next()
})

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Routes
app.get('/standings', async (req, res, next) => {
  try {
    const data = []
    res.json({ data })
  } catch (err) {
    next(err)
  }
})

app.get('/matchups', async (req, res, next) => {
  try {
    const data = []
    res.json({ data })
  } catch (err) {
    next(err)
  }
})

app.get('/transactions', async (req, res, next) => {
  try {
    const data = []
    res.json({ data })
  } catch (err) {
    next(err)
  }
})

app.get('/drafts', async (req, res, next) => {
  try {
    const data = []
    res.json({ data })
  } catch (err) {
    next(err)
  }
})

app.get('/analytics', async (req, res, next) => {
  try {
    const data = {}
    res.json({ data })
  } catch (err) {
    next(err)
  }
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: req.__('error.not_found') || 'Not Found' })
})

// Error handler
app.use((err, req, res, next) => {
  req.log.error({ message: err.message, stack: err.stack })
  res.status(500).json({ error: req.__('error.internal') || 'Internal Server Error' })
})

const PORT = process.env.PORT || config.server?.port || 3000
let server = app.listen(PORT, () => {
  logger.info(`Server listening on port ${PORT}`)
})

const gracefulShutdown = () => {
  logger.info('Shutting down gracefully...')
  server.close(() => {
    logger.info('Closed out remaining connections')
    process.exit(0)
  })
  setTimeout(() => {
    logger.error('Forcing shutdown')
    process.exit(1)
  }, 10000)
}

process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', { reason })
  gracefulShutdown()
})

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { message: err.message, stack: err.stack })
  gracefulShutdown()
})