const jwt = require('jsonwebtoken')
const { promisify } = require('util')
const logger = require('../utils/logger')

const SECRET = process.env.JWT_SECRET
if (!SECRET) {
  logger.error('JWT_SECRET environment variable is not defined. Exiting.')
  process.exit(1)
}

const verifyJwt = promisify(jwt.verify)

function verifyToken(token) {
  return verifyJwt(token, SECRET, { algorithms: ['HS256'] })
}

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || req.headers['x-access-token'] || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader
  if (!token) {
    return res.status(401).json({ message: 'Authentication token required' })
  }
  verifyToken(token)
    .then(decoded => {
      req.user = decoded
      next()
    })
    .catch(err => {
      logger.error(`Token verification failed: ${err.message}`)
      res.status(401).json({ message: 'Invalid or expired token' })
    })
}

function authorize(roles) {
  if (!roles || (Array.isArray(roles) && roles.length === 0)) {
    throw new Error('Authorize middleware requires at least one role')
  }
  if (typeof roles === 'string') {
    roles = [roles]
  }
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' })
    }
    const userRole = req.user.role || ''
    if (!roles.includes(userRole)) {
      return res.status(403).json({ message: 'Access forbidden: insufficient rights' })
    }
    next()
  }
}

module.exports = {
  authenticate,
  authorize,
  verifyToken
}