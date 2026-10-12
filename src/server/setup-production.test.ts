import { afterEach, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { scryptSync } from "node:crypto";

const script = resolve("scripts/setup-production.mjs");
const directories: string[] = [];
function workspace() {
  const directory = mkdtempSync(join(tmpdir(), "k-stolu-setup-"));
  directories.push(directory);
  return directory;
}
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("production settings", () => {
  it("generates private, working credentials without touching local configuration", () => {
    const cwd = workspace();
    const output = execFileSync(
      process.execPath,
      [script, "https://recipes.example.ru/"],
      { cwd, encoding: "utf8" },
    );
    const envPath = join(cwd, ".local/coolify.env");
    const values = Object.fromEntries(
      readFileSync(envPath, "utf8")
        .trim()
        .split("\n")
        .map((line) => {
          const at = line.indexOf("=");
          return [line.slice(0, at), line.slice(at + 1)];
        }),
    );
    const password = readFileSync(
      join(cwd, ".local/coolify-admin-password.txt"),
      "utf8",
    ).trim();
    const [, salt, hash] = values.ADMIN_PASSWORD_HASH.split(":");
    expect(scryptSync(password, salt, 64).toString("hex")).toBe(hash);
    expect(values.APP_ORIGIN).toBe("https://recipes.example.ru");
    expect(values.POSTGRES_PASSWORD).toMatch(/^[a-f0-9]{48}$/);
    expect(values.SESSION_SECRET).toHaveLength(96);
    expect(values.DATABASE_URL).toBeUndefined();
    expect(existsSync(join(cwd, ".env"))).toBe(false);
    expect(output).not.toContain(password);
    if (process.platform !== "win32")
      expect(statSync(envPath).mode & 0o777).toBe(0o600);
    const retry = spawnSync(
      process.execPath,
      [script, "https://other.example.ru"],
      { cwd },
    );
    expect(retry.status).toBe(1);
    expect(readFileSync(envPath, "utf8")).toContain(
      "APP_ORIGIN=https://recipes.example.ru",
    );
  });
  it.each([
    undefined,
    "http://recipes.example.ru",
    "https://recipes.example.ru/path",
    "https://user:pass@example.ru",
    "https://recipes.example.ru?x=1",
    "https://recipes.example.ru#hash",
  ])("rejects invalid origin %s before writing secrets", (origin) => {
    const cwd = workspace();
    const result = spawnSync(
      process.execPath,
      [script, ...(origin ? [origin] : [])],
      { cwd },
    );
    expect(result.status).toBe(1);
    expect(existsSync(join(cwd, ".local"))).toBe(false);
  });
});
