import { Pool, PoolClient } from 'pg'

let pool: Pool | null = null

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL

    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set')
    }

    pool = new Pool({
      connectionString,
      max: 10,
    })
  }
  return pool
}

export async function query<T>(sql: string, params?: unknown[]): Promise<T[]> {
  const pool = getPool()
  const result = await pool.query(sql, params)
  return result.rows as T[]
}

export async function queryOne<T>(sql: string, params?: unknown[]): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] || null
}

// Transaction helper (without actor tracking)
export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = getPool()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

/**
 * Transaction helper with actor address tracking for audit log.
 * 
 * Sets the PostgreSQL session variable `app.actor_address` so the audit
 * trigger can record which admin wallet made the change.
 * 
 * Usage:
 *   await withActorTransaction(walletAddress, async (client) => {
 *     await client.query('INSERT INTO clubs ...', [name])
 *   })
 * 
 * @param actorAddress - The wallet address of the admin making the change
 * @param callback - Function containing the database operations
 */
export async function withActorTransaction<T>(
  actorAddress: string,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = getPool()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    
    // Set the actor address for audit logging
    // set_config with 'true' scopes to this transaction only - resets after COMMIT/ROLLBACK
    await client.query('SELECT set_config($1, $2, true)', ['app.actor_address', actorAddress])
    
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

