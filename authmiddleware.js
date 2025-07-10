const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const logger = require('../utils/logger')

// Validate required environment variables at startup
if (!process.env.API_KEY) {
  logger.error('Missing required environment variable: API_KEY')
  throw new Error('Missing required environment variable: API_KEY')
}
if (!process.env.JWT_SECRET) {
  logger.error('Missing required environment variable: JWT_SECRET')
  throw new Error('Missing required environment variable: JWT_SECRET')
}

const authenticate = (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key']
    if (apiKey) {
      const providedKeyBuf = Buffer.from(apiKey)
      const expectedKeyBuf = Buffer.from(process.env.API_KEY)
      if (
        providedKeyBuf.length === expectedKeyBuf.length &&
        crypto.timingSafeEqual(providedKeyBuf, expectedKeyBuf)
      ) {
        req.user = { id: 'system', role: 'system' }
        return next()
      }
      logger.warn(`Invalid API Key attempt from IP ${req.ip}`)
      return res.status(401).json({ message: 'Invalid API Key' })
    }

    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization header missing or malformed' })
    }
    const token = authHeader.split(' ')[1]
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      req.user = decoded
      return next()
    } catch (err) {
      logger.warn(`JWT error for request ${req.method} ${req.originalUrl}: ${err.message}`)
      return res.status(401).json({ message: 'Invalid or expired token' })
    }
  } catch (err) {
    logger.error(`Authentication middleware error: ${err.message}`)
    return res.status(500).json({ message: 'Internal server error' })
  }
}

const authorize = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' })
  }
  if (!allowedRoles.length) {
    logger.warn(`No roles specified for authorization on ${req.originalUrl}`)
    return res.status(403).json({ message: 'Forbidden' })
  }
  if (!allowedRoles.includes(req.user.role)) {
    logger.warn(`User ${req.user.id} with role ${req.user.role} denied access to ${req.originalUrl}`)
    return res.status(403).json({ message: 'Forbidden' })
  }
  next()
}

module.exports = { authenticate, authorize }