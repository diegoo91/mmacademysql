// Pooled knex instance + backend flag.
// DB_BACKEND=json (default, current JSON file) | mysql (new MySQL layer).
// All new code should import db from '../db/index.js' (or '../../db/index.js'
// from routes) instead of '../database.js' so the flag works per-route.
import 'dotenv/config'
import knex from 'knex'
import knexConfig from './knexfile.js'

let _knex = null

export function isMysqlEnabled() {
  return (process.env.DB_BACKEND || 'json').toLowerCase() === 'mysql'
}

export function getKnex() {
  if (!_knex) _knex = knex(knexConfig)
  return _knex
}

export async function checkMysqlConnection() {
  const k = getKnex()
  await k.raw('SELECT 1')
  return true
}

export const DB_CONFIG = {
  host: knexConfig.connection.host,
  port: knexConfig.connection.port,
  database: knexConfig.connection.database,
  user: knexConfig.connection.user,
  // password intentionally never logged
}
