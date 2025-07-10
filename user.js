const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { Schema } = mongoose

const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS, 10) || 12
const { JWT_SECRET, JWT_EXPIRES_IN = '7d' } = process.env
if (!JWT_SECRET || JWT_SECRET === 'change_this_secret') {
  throw new Error('Environment variable JWT_SECRET must be set to a secure value.')
}

class DuplicateEmailError extends Error {
  constructor(message) {
    super(message)
    this.name = 'DuplicateEmailError'
    this.code = 'EMAIL_IN_USE'
  }
}

const LeagueAccountSchema = new Schema({
  provider: { type: String, required: true, enum: ['espn', 'yahoo', 'sleeper', 'nfl'] },
  leagueId: { type: String, required: true },
  accessToken: { type: String, required: true },
  refreshToken: { type: String },
  tokenExpiresAt: { type: Date },
  lastSyncAt: { type: Date, default: null },
  active: { type: Boolean, default: true }
}, { _id: false })

const PreferencesSchema = new Schema({
  theme: { type: String, enum: ['light', 'dark'], default: 'light' },
  notifications: {
    email: { type: Boolean, default: true },
    push: { type: Boolean, default: true }
  },
  adFree: { type: Boolean, default: false }
}, { _id: false })

const UserSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, trim: true, default: '' },
  passwordHash: { type: String, required: true },
  roles: { type: [String], default: ['user'] },
  preferences: { type: PreferencesSchema, default: () => ({}) },
  leagueAccounts: { type: [LeagueAccountSchema], default: [] }
}, { timestamps: true })

UserSchema.methods.setPassword = async function(password) {
  this.passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
}

UserSchema.methods.validatePassword = function(password) {
  return bcrypt.compare(password, this.passwordHash)
}

UserSchema.methods.generateAuthToken = function() {
  const payload = { sub: this._id, roles: this.roles }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

UserSchema.methods.linkLeagueAccount = async function(account) {
  const { provider, leagueId } = account
  const idx = this.leagueAccounts.findIndex(a => a.provider === provider && a.leagueId === leagueId)
  const allowedFields = ['accessToken', 'refreshToken', 'tokenExpiresAt', 'lastSyncAt', 'active']
  if (idx >= 0) {
    const sub = this.leagueAccounts[idx]
    allowedFields.forEach(key => {
      if (account[key] !== undefined) {
        sub[key] = account[key]
      }
    })
  } else {
    const newAccount = { provider, leagueId }
    allowedFields.forEach(key => {
      if (account[key] !== undefined) {
        newAccount[key] = account[key]
      }
    })
    this.leagueAccounts.push(newAccount)
  }
  return this.save()
}

UserSchema.methods.unlinkLeagueAccount = async function(provider, leagueId) {
  this.leagueAccounts = this.leagueAccounts.filter(a => !(a.provider === provider && a.leagueId === leagueId))
  return this.save()
}

UserSchema.methods.updatePreferences = function(updates) {
  if (updates.theme && ['light', 'dark'].includes(updates.theme)) {
    this.preferences.theme = updates.theme
  }
  if (typeof updates.adFree === 'boolean') {
    this.preferences.adFree = updates.adFree
  }
  if (updates.notifications && typeof updates.notifications === 'object') {
    if (typeof updates.notifications.email === 'boolean') {
      this.preferences.notifications.email = updates.notifications.email
    }
    if (typeof updates.notifications.push === 'boolean') {
      this.preferences.notifications.push = updates.notifications.push
    }
  }
  return this.save()
}

UserSchema.statics.register = async function({ email, name, password }) {
  const existing = await this.findOne({ email })
  if (existing) {
    throw new DuplicateEmailError('Email already in use')
  }
  const user = new this({ email, name })
  await user.setPassword(password)
  return user.save()
}

UserSchema.statics.authenticate = async function(email, password) {
  const user = await this.findOne({ email })
  if (!user) return null
  const valid = await user.validatePassword(password)
  return valid ? user : null
}

UserSchema.statics.findByToken = function(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    return this.findById(decoded.sub)
  } catch {
    return null
  }
}

UserSchema.methods.toJSON = function() {
  const obj = this.toObject({ virtuals: false })
  delete obj.passwordHash
  delete obj.__v
  return obj
}

const User = mongoose.model('User', UserSchema)
User.DuplicateEmailError = DuplicateEmailError

module.exports = User