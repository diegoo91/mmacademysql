import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Request-scoped actor context.
 *
 * Routes never have to thread `req.user.id` into every db call: the request
 * middleware opens one store per request, `authenticate` fills in the user id,
 * and the data layer reads it when stamping created_by/updated_by.
 */
const storage = new AsyncLocalStorage()

export function runWithActor(store, fn) {
  return storage.run(store, fn)
}

export function currentActorId() {
  const store = storage.getStore()
  return store && store.userId != null ? store.userId : null
}

export function setActor(userId) {
  const store = storage.getStore()
  if (store) store.userId = userId ?? null
}
