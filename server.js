const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const i18next = require('i18next')
const Backend = require('i18next-fs-backend')
const i18nextMiddleware = require('i18next-http-middleware')
const mongoose = require('mongoose')
const winston = require('winston')
const expressWinston = require('express-winston')
const routes = require('./routes')

const isProd = process.env.NODE_ENV === 'production'

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({ handleExceptions: true })
  ],
  exitOnError: false
})

async function connectDatabase() {
  const uri = process.env.MONGO_URI
  if (!uri) throw new Error('MONGO_URI not set')
  await mongoose.connect(uri)
  mongoose.connection.once('open', () => {
    logger.info('Connected to MongoDB')
  })
  mongoose.connection.on('error', err => {
    logger.error('MongoDB connection error:', err)
  })
  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected')
  })
  mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB reconnected')
  })
}

function setupMiddleware(app) {
  app.use(helmet())
  const corsOriginEnv = process.env.CORS_ORIGIN
  const corsOptions = {}
  if (corsOriginEnv) {
    const allowedOrigins = corsOriginEnv.split(',').map(o => o.trim())
    corsOptions.origin = (origin, callback) => {
      if (!origin) return callback(null, true)
      if (allowedOrigins.includes(origin)) return callback(null, true)
      callback(new Error('Not allowed by CORS'))
    }
  } else if (!isProd) {
    corsOptions.origin = '*'
  } else {
    corsOptions.origin = false
  }
  app.use(cors(corsOptions))
  app.use(express.json({ limit: '10mb' }))
  app.use(express.urlencoded({ extended: false }))
  app.use(i18nextMiddleware.handle(i18next))
  app.use(expressWinston.logger({
    winstonInstance: logger,
    meta: true,
    msg: 'HTTP {{req.method}} {{req.url}}',
    colorize: false
  }))
}

function setupRoutes(app) {
  app.use('/api', routes)
  app.get('/', (req, res) => {
    res.send({ message: 'Welcome to League Nexus API' })
  })
  app.use((req, res, next) => {
    const err = new Error('Not Found')
    err.status = 404
    next(err)
  })
  app.use((err, req, res, next) => {
    logger.error(err)
    const status = err.status || 500
    const response = {}
    if (!isProd) {
      response.error = err.message || 'Internal Server Error'
    } else {
      response.error = status === 404 ? 'Not Found' : 'Internal Server Error'
    }
    res.status(status).json(response)
  })
}

function handleShutdown(server) {
  let shuttingDown = false
  const shutdown = async () => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info('Graceful shutdown initiated')
    server.close(() => {
      logger.info('HTTP server closed')
      mongoose.connection.close(false, () => {
        logger.info('MongoDB connection closed')
        process.exit(0)
      })
    })
    setTimeout(() => {
      logger.error('Forcing shutdown')
      process.exit(1)
    }, 10000)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
  process.on('uncaughtException', err => {
    logger.error('Uncaught Exception:', err)
    shutdown()
  })
  process.on('unhandledRejection', reason => {
    logger.error('Unhandled Rejection:', reason)
    shutdown()
  })
}

async function startServer(port) {
  await i18next
    .use(Backend)
    .use(i18nextMiddleware.LanguageDetector)
    .init({
      fallbackLng: 'en',
      preload: ['en'],
      backend: { loadPath: 'locales/{{lng}}/{{ns}}.json' }
    })
  const app = express()
  setupMiddleware(app)
  setupRoutes(app)
  await connectDatabase()
  const server = app.listen(port, () => {
    logger.info(`Server listening on port ${port}`)
  })
  handleShutdown(server)
}

const PORT = parseInt(process.env.PORT, 10) || 3000
startServer(PORT).catch(err => {
  logger.error('Failed to start server:', err)
  process.exit(1)
})