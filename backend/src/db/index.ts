import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { config } from "../config";
import * as schema from "./schema";
import { logger } from "../utils/logger";

export const pool = mysql.createPool({
  host: config.DB.host,
  port: config.DB.port,
  user: config.DB.user,
  password: config.DB.password,
  database: config.DB.database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: "utf8mb4",
});

export const db = drizzle(pool, { schema, mode: "default" });

/**
 * Ensures the configured MySQL database exists before schema push or startup.
 */
export async function ensureDatabaseExists(): Promise<void> {
  const dbName = config.DB.database;
  if (!/^[a-zA-Z0-9_]+$/.test(dbName)) {
    throw new Error(`Invalid database name: ${dbName}`);
  }

  const connection = await mysql.createConnection({
    host: config.DB.host,
    port: config.DB.port,
    user: config.DB.user,
    password: config.DB.password,
  });

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await connection.end();
  }
}

export async function checkDbConnection(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch (err: any) {
    logger.warn(`MySQL connection check failed: ${err.message}`);
    return false;
  }
}

export async function closeDb(): Promise<void> {
  await pool.end();
}
