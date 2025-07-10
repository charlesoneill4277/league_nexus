const { League, sequelize } = require('../models');
const logger = require('../utils/logger');

function validateId(id, name) {
  const num = Number(id);
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error(`Validation error: ${name} must be a positive integer`);
  }
  return num;
}

function validateDate(value, name) {
  if (value === undefined || value === null) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    throw new Error(`Validation error: ${name} must be a valid date`);
  }
  return d;
}

async function fetchLeagueOrThrow(leagueId, transaction) {
  const options = transaction ? { transaction } : {};
  const league = await League.findByPk(leagueId, options);
  if (!league) {
    const msg = `League not found with id=${leagueId}`;
    logger.warn(msg);
    throw new Error(msg);
  }
  return league;
}

async function createLeague(leagueData) {
  if (!leagueData.name) {
    throw new Error('Validation error: name is required');
  }
  if (leagueData.ownerId === undefined) {
    throw new Error('Validation error: ownerId is required');
  }
  const name = leagueData.name;
  const ownerId = validateId(leagueData.ownerId, 'ownerId');
  const description = leagueData.description || null;
  const startDate = validateDate(leagueData.startDate, 'startDate');
  const endDate = validateDate(leagueData.endDate, 'endDate');

  const transaction = await sequelize.transaction();
  try {
    const league = await League.create(
      { name, description, startDate, endDate, ownerId },
      { transaction }
    );
    await transaction.commit();
    logger.info(`League created with id=${league.id}`);
    return league;
  } catch (err) {
    await transaction.rollback();
    logger.error('Error creating league', err);
    throw err;
  }
}

async function getLeagueById(leagueId) {
  const id = validateId(leagueId, 'leagueId');
  let league;
  try {
    league = await League.findByPk(id);
  } catch (err) {
    logger.error(`Error fetching league id=${id}`, err);
    throw err;
  }
  if (!league) {
    const msg = `League not found with id=${id}`;
    logger.warn(msg);
    throw new Error(msg);
  }
  return league;
}

async function updateLeague(leagueId, updateData) {
  const id = validateId(leagueId, 'leagueId');
  const allowed = ['name', 'description', 'startDate', 'endDate'];
  const payload = {};
  if (updateData.name !== undefined) payload.name = updateData.name;
  if (updateData.description !== undefined) payload.description = updateData.description;
  if (updateData.startDate !== undefined) payload.startDate = validateDate(updateData.startDate, 'startDate');
  if (updateData.endDate !== undefined) payload.endDate = validateDate(updateData.endDate, 'endDate');
  if (Object.keys(payload).length === 0) {
    throw new Error('No valid fields to update');
  }

  const transaction = await sequelize.transaction();
  try {
    const league = await fetchLeagueOrThrow(id, transaction);
    await league.update(payload, { transaction });
    await transaction.commit();
    logger.info(`League updated id=${id}`);
    return league;
  } catch (err) {
    await transaction.rollback();
    logger.error(`Error updating league id=${id}`, err);
    throw err;
  }
}

async function listLeagues(userId) {
  const ownerId = validateId(userId, 'userId');
  try {
    const leagues = await League.findAll({
      where: { ownerId },
      order: [['createdAt', 'DESC']]
    });
    return leagues;
  } catch (err) {
    logger.error(`Error listing leagues for userId=${ownerId}`, err);
    throw err;
  }
}

async function deleteLeague(leagueId) {
  const id = validateId(leagueId, 'leagueId');
  const transaction = await sequelize.transaction();
  try {
    await fetchLeagueOrThrow(id, transaction);
    await League.destroy({ where: { id }, transaction });
    await transaction.commit();
    logger.info(`League deleted id=${id}`);
    return true;
  } catch (err) {
    await transaction.rollback();
    logger.error(`Error deleting league id=${id}`, err);
    throw err;
  }
}

module.exports = {
  createLeague,
  getLeagueById,
  updateLeague,
  listLeagues,
  deleteLeague
};