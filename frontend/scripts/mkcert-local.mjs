/**
 * Local HTTPS certificates for development.
 *
 * Why this exists: service workers, Web Push and getUserMedia are all gated on
 * a *secure context*. Opening the dev server on `http://192.168.x.x:3000` from a
 * phone is not one, so on an iPhone you get three separate symptoms that look
 * like three bugs — push never arrives, the push toggle in App preferences is
 * dead, and voice reports "not supported in this browser". None of them are
 * code problems; they are all the one problem.
 *
 * Run with: node scripts/mkcert-local.mjs
 * Then:      npm run dev:https
 *
 * `mkcert` is used when installed, because it issues a certificate from a local
 * CA that browsers and phones can be taught to trust. When it is missing we fall
 * back to a self-signed `openssl` certificate, which browsers will warn about
 * but which is enough to get a secure context on the machine itself.
 */

import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { networkInterfaces } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CERT_DIR = join(ROOT, ".cert");
const KEY_PATH = join(CERT_DIR, "localhost-key.pem");
const CERT_PATH = join(CERT_DIR, "localhost.pem");

function has(command) {
  try {
    execSync(`command -v ${command}`, { stdio: "ignore" });
    return true;
  } catch {
    try {
      execFileSync(command, ["--version"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }
}

/** LAN addresses, so a phone on the same Wi-Fi can reach the cert. */
function lanAddresses() {
  const found = new Set();
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      found.add(entry.address);
    }
  }
  return [...found];
}

function isFresh() {
  if (!existsSync(KEY_PATH) || !existsSync(CERT_PATH)) return false;
  // Regenerate after 30 days; iOS trust profiles expire on their own anyway.
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  return Date.now() - statSync(CERT_PATH).mtimeMs < thirtyDays;
}

function ensureDir() {
  mkdirSync(CERT_DIR, { recursive: true });
  if (!existsSync(join(CERT_DIR, ".gitignore"))) {
    writeFileSync(join(CERT_DIR, ".gitignore"), "*\n!.gitignore\n", "utf8");
  }
}

function generateWithMkcert(hosts) {
  execFileSync("mkcert", ["-install"], { stdio: "inherit" });
  execFileSync("mkcert", ["-cert-file", CERT_PATH, "-key-file", KEY_PATH, ...hosts], { stdio: "inherit" });
  const caPath = execFileSync("mkcert", ["-CAROOT"], { encoding: "utf8" }).trim();
  const caPem = join(caPath, "rootCA.pem");
  if (existsSync(caPem)) {
    writeFileSync(join(CERT_DIR, "rootCA.pem"), readFileSync(caPem));
    console.log(`\nLocal CA copied to ${join(CERT_DIR, "rootCA.pem")}`);
    console.log("Install it on your phone, then enable full trust for it:");
    console.log("  iOS:  Settings > General > About > Certificate Trust Settings");
    console.log("  Android: Settings > Security > Install from storage (then trust it)");
  }
}

function generateWithOpenssl(hosts) {
  // A single self-signed cert carrying every host as a SAN.
  const conf = join(CERT_DIR, "openssl.cnf");
  // IPv6 literals are left out: `IP:::1` is rejected by OpenSSL 3 config
  // parsing, and localhost already resolves over IPv4.
  const altNames = ["localhost", ...hosts]
    .filter((host, index, all) => all.indexOf(host) === index)
    .map((host) => (/^\d+\.\d+\.\d+\.\d+$/.test(host) ? `IP:${host}` : `DNS:${host}`))
    .join(", ");
  // 127.0.0.1 is covered by the loopback address that Safari treats as secure.
  const withLoopback = altNames.includes("IP:127.0.0.1") ? altNames : `IP:127.0.0.1, ${altNames}`;

  writeFileSync(
    conf,
    [
      "[req]",
      "distinguished_name = dn",
      "x509_extensions = v3_req",
      "prompt = no",
      "",
      "[dn]",
      "CN = localhost",
      "",
      "[v3_req]",
      "basicConstraints = CA:FALSE",
      "keyUsage = digitalSignature, keyEncipherment",
      "extendedKeyUsage = serverAuth",
      `subjectAltName = ${withLoopback}`,
      "",
    ].join("\n"),
    "utf8",
  );


  execFileSync(
    "openssl",
    [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes",
      "-keyout", KEY_PATH,
      "-out", CERT_PATH,
      "-days", "825",
      "-config", conf,
    ],
    { stdio: "inherit" },
  );

  // Next.js needs the cert to be the one it trusts; a self-signed leaf cannot
  // act as its own extra CA, so it is appended to NODE_EXTRA_CA_CERTS.
  writeFileSync(join(CERT_DIR, "ca.pem"), readFileSync(CERT_PATH));
  console.log("\nSelf-signed certificate generated.");
  console.log("Browsers will warn once per device. On iOS, install the profile from");
  console.log(`${CERT_PATH} and enable full trust for it in`);
  console.log("  Settings > General > About > Certificate Trust Settings");
}

function main() {
  if (isFresh()) {
    console.log(`Certificates already present and recent:\n  ${CERT_PATH}`);
    console.log(`Run: npm run dev:https`);
    return;
  }

  ensureDir();
  const hosts = ["localhost", ...lanAddresses()];

  if (has("mkcert")) {
    console.log("Generating development certificates with mkcert…");
    generateWithMkcert(hosts);
  } else if (has("openssl")) {
    console.log("mkcert not found — falling back to a self-signed openssl certificate.");
    console.log("Install mkcert (https://github.com/FiloSottile/mkcert) for a");
    console.log("certificate that phones will trust without extra fuss.\n");
    generateWithOpenssl(hosts);
  } else {
    console.error("Neither mkcert nor openssl is available. Install one of them and retry.");
    process.exit(1);
  }

  console.log(`\nAddresses this certificate covers:\n  ${hosts.join("\n  ")}`);
  console.log(`\nStart the dev server with:\n  npm run dev:https`);
}

main();
