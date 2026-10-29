import type { Pool, PoolClient } from "pg";

/**
 * Lo único que el modo local y la demo pública necesitan de una base: consultas, scripts y transacciones. Tiene dos
 * implementaciones con la misma forma: PGlite (en disco o en memoria, una por proceso) y Postgres por red (una base
 * compartida, p. ej. Neon, para servidores sin estado como Vercel). Módulo sin dependencias de Next.
 */
export interface Motor {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** Un script con varias sentencias y sin parámetros (migraciones). */
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: Motor) => Promise<T>): Promise<T>;
}

type Ejecutor = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  exec: (sql: string) => Promise<unknown>;
};

const SIN_ANIDAR = (): never => {
  throw new Error("Las transacciones anidadas no están soportadas.");
};

function sobre(x: Ejecutor): Omit<Motor, "transaction"> {
  return {
    query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await x.query(sql, params)).rows as T[] }),
    exec: async (sql: string) => {
      await x.exec(sql);
    },
  };
}

/** PGlite: la base embebida del modo local (disco) y de la demo pública de un solo proceso (memoria). */
export function motorDePglite(db: {
  query: Ejecutor["query"];
  exec: Ejecutor["exec"];
  transaction: <T>(fn: (tx: Ejecutor) => Promise<T>) => Promise<T>;
}): Motor {
  return {
    ...sobre(db),
    transaction: (fn) => db.transaction((tx) => fn({ ...sobre(tx), transaction: SIN_ANIDAR })),
  };
}

/**
 * Postgres por red. Cada transacción usa UNA conexión del grupo de principio a fin, así que `set local role` y
 * `set_config(..., true)` funcionan también detrás de un pooler en modo transacción (como el de Neon).
 */
export function motorDePostgres(pool: Pool): Motor {
  const sobreCliente = (c: Pool | PoolClient): Omit<Motor, "transaction"> =>
    sobre({
      query: (sql, params) => c.query(sql, params as unknown[] | undefined),
      exec: (sql) => c.query(sql),
    });
  return {
    ...sobreCliente(pool),
    async transaction(fn) {
      const cliente = await pool.connect();
      let roto = false;
      try {
        await cliente.query("begin");
        const salida = await fn({ ...sobreCliente(cliente), transaction: SIN_ANIDAR });
        await cliente.query("commit");
        return salida;
      } catch (e) {
        try {
          await cliente.query("rollback");
        } catch {
          roto = true; // la conexión murió: que el grupo la descarte en vez de reutilizarla
        }
        throw e;
      } finally {
        cliente.release(roto || undefined);
      }
    },
  };
}
