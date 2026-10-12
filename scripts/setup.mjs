import { randomBytes, scryptSync } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
if (existsSync(".env")) {
  console.log(".env уже существует, настройки сохранены.");
  process.exit(0);
}
const dbPassword = randomBytes(24).toString("hex");
const password = randomBytes(12).toString("base64url");
const salt = randomBytes(16).toString("hex");
const hash = `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
mkdirSync(".local", { recursive: true });
writeFileSync(".local/admin-password.txt", password + "\n", { mode: 0o600 });
writeFileSync(
  ".env",
  `POSTGRES_USER=cooking\nPOSTGRES_DB=cooking\nPOSTGRES_PASSWORD=${dbPassword}\nDATABASE_URL=postgresql://cooking:${dbPassword}@localhost:55438/cooking\nADMIN_PASSWORD_HASH=${hash}\nSESSION_SECRET=${randomBytes(48).toString("hex")}\nAPP_ORIGIN=http://localhost:3037\n`,
  { mode: 0o600 },
);
console.log(
  "Созданы .env и локальный пароль администратора: .local/admin-password.txt",
);
