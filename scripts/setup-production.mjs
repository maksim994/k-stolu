import { randomBytes, scryptSync } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

let origin;
try {
  const url = new URL(process.argv[2]);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error();
  origin = url.origin;
} catch {
  console.error(
    "Укажите HTTPS-адрес сайта без пути: npm run setup:production -- https://recipes.example.ru",
  );
  process.exit(1);
}
const envPath = ".local/coolify.env";
const passwordPath = ".local/coolify-admin-password.txt";
if (existsSync(envPath) || existsSync(passwordPath)) {
  console.error("Серверные настройки уже существуют. Они не были изменены.");
  process.exit(1);
}
const dbPassword = randomBytes(24).toString("hex");
const password = randomBytes(18).toString("base64url");
const salt = randomBytes(16).toString("hex");
const hash = `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
mkdirSync(".local", { recursive: true, mode: 0o700 });
writeFileSync(passwordPath, password + "\n", { mode: 0o600, flag: "wx" });
writeFileSync(
  envPath,
  `POSTGRES_USER=cooking\nPOSTGRES_DB=cooking\nPOSTGRES_PASSWORD=${dbPassword}\nADMIN_PASSWORD_HASH=${hash}\nSESSION_SECRET=${randomBytes(48).toString("hex")}\nAPP_ORIGIN=${origin}\n`,
  { mode: 0o600, flag: "wx" },
);
console.log(
  `Настройки: ${envPath}\nПароль администратора: ${passwordPath}\nЛокальная .env не изменена. Не загружайте эти файлы в Git.`,
);
