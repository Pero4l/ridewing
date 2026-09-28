/**
 * Runs `next dev` over local HTTPS.
 *
 * Push, service workers and getUserMedia only work in a secure context, so a
 * phone testing against `http://<lan-ip>:3000` silently loses all three. This
 * generates the certificate if it is missing and then starts Next with it.
 */

import { spawnSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CERT = join(ROOT, ".cert", "localhost.pem");
const KEY = join(ROOT, ".cert", "localhost-key.pem");
const CA = join(ROOT, ".cert", "ca.pem");

if (!existsSync(CERT) || !existsSync(KEY)) {
  const generated = spawnSync(process.execPath, [join(ROOT, "scripts", "mkcert-local.mjs")], {
    stdio: "inherit",
  });
  if (generated.status !== 0) process.exit(generated.status ?? 1);
}

const env = {
  ...process.env,
  HTTPS: "true",
  SSL_CRT_FILE: CERT,
  SSL_KEY_FILE: KEY,
  // A self-signed leaf is not a CA, so trust the cert itself.
  NODE_EXTRA_CA_CERTS: existsSync(CA) ? CA : undefined,
};

console.log("\nRideWing is starting on https://localhost:3000");
console.log("Open the LAN address printed below on your phone for real device testing.\n");

const next = spawn("node_modules/.bin/next", ["dev"], {
  cwd: ROOT,
  env: Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined)),
  stdio: "inherit",
});

next.on("exit", (code) => process.exit(code ?? 0));
