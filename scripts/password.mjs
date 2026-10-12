import { randomBytes, scryptSync } from "node:crypto";
import { createInterface } from "node:readline/promises";
const rl = createInterface({ input: process.stdin, output: process.stdout });
const password = await rl.question(
  "Новый пароль администратора (минимум 12 символов): ",
);
rl.close();
if (password.length < 12) {
  console.error("Пароль слишком короткий.");
  process.exit(1);
}
const salt = randomBytes(16).toString("hex");
console.log(
  `ADMIN_PASSWORD_HASH=scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`,
);
