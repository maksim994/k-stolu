import { randomBytes, createHmac, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { getPool } from "./db";
import { HttpError } from "./http";
const scryptAsync = promisify(scrypt);
const tokenHash = (t: string) => {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
    throw new Error("SESSION_SECRET is required");
  return createHmac("sha256", process.env.SESSION_SECRET)
    .update(t)
    .digest("hex");
};
export async function isAdmin() {
  const token = (await cookies()).get("k-stolu-admin")?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return false;
  const result = await getPool().query(
    "SELECT 1 FROM admin_sessions WHERE token_hash=$1 AND expires_at>now()",
    [tokenHash(token)],
  );
  return result.rowCount === 1;
}
export async function requireAdmin() {
  if (!(await isAdmin())) throw new HttpError(401, "Войдите в админку");
}
export async function login(password: string) {
  const attempt = await getPool().query(
    `INSERT INTO auth_attempts(id,attempts,started_at) VALUES ('admin',1,now()) ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN auth_attempts.started_at<now()-interval '15 minutes' THEN 1 ELSE auth_attempts.attempts+1 END, started_at=CASE WHEN auth_attempts.started_at<now()-interval '15 minutes' THEN now() ELSE auth_attempts.started_at END RETURNING attempts`,
  );
  if (attempt.rows[0].attempts > 20)
    throw new HttpError(
      429,
      "Слишком много попыток. Попробуйте через 15 минут.",
    );
  const parts = process.env.ADMIN_PASSWORD_HASH?.split(":");
  if (
    !parts ||
    parts.length !== 3 ||
    parts[0] !== "scrypt" ||
    !/^[a-f0-9]{32}$/.test(parts[1]) ||
    !/^[a-f0-9]{128}$/.test(parts[2])
  )
    throw new HttpError(503, "Пароль администратора ещё не настроен");
  const actual = (await scryptAsync(password, parts[1], 64)) as Buffer;
  const expected = Buffer.from(parts[2], "hex");
  if (!timingSafeEqual(actual, expected))
    throw new HttpError(401, "Неверный пароль");
  const token = randomBytes(32).toString("hex");
  await getPool().query("DELETE FROM admin_sessions WHERE expires_at<now()");
  await getPool().query(
    "INSERT INTO admin_sessions(token_hash,expires_at) VALUES($1,now()+interval '8 hours')",
    [tokenHash(token)],
  );
  await getPool().query("DELETE FROM auth_attempts WHERE id='admin'");
  (await cookies()).set("k-stolu-admin", token, {
    httpOnly: true,
    secure: process.env.APP_ORIGIN?.startsWith("https://") ?? false,
    sameSite: "strict",
    maxAge: 8 * 3600,
    path: "/",
  });
}
export async function logout() {
  const jar = await cookies();
  const token = jar.get("k-stolu-admin")?.value;
  if (token)
    await getPool().query("DELETE FROM admin_sessions WHERE token_hash=$1", [
      tokenHash(token),
    ]);
  jar.delete("k-stolu-admin");
}
