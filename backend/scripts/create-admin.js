'use strict';

/**
 * Create or promote an admin from the command line.
 *
 *   npm run create-admin -- <username> [password]
 *   npm run create-admin -- <username> --promote
 *
 * Why this exists alongside the token-gated HTTP endpoint: the token is a
 * shared secret meant to live on the backend host, and needing it in a laptop's
 * shell history to bootstrap the first admin is a bad trade. This script talks
 * to the database directly, so it works on a fresh machine with no HTTP client
 * and no token — and it is useless to an attacker, because they would already
 * need database credentials to run it.
 *
 * Behaviour:
 *   - existing account + no --promote  -> refused, with instructions
 *   - existing account + --promote     -> role set to admin
 *   - new account                     -> created as admin (email or phone required)
 *
 * The password argument is optional for a new account; without one a random
 * password is generated and printed once, so it never has to be typed into a
 * shell command that ends up in history.
 */

const crypto = require('crypto');
const readline = require('readline');

const { sequelize, User } = require('../src/models');
const authService = require('../src/services/auth.service');
const logger = require('../src/config/logger');

const GENERATED_LENGTH = 20;

function parseArgs(argv) {
  const positional = [];
  let promote = false;
  let email = null;
  let phone = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--promote') promote = true;
    else if (arg === '--email') email = argv[++i] ?? null;
    else if (arg === '--phone') phone = argv[++i] ?? null;
    else if (arg === '--help' || arg === '-h') return { help: true };
    else positional.push(arg);
  }

  return {
    help: false,
    promote,
    email,
    phone,
    username: positional[0],
    password: positional[1] ?? null,
  };
}

const USAGE = `
Create or promote a RideWing admin.

  npm run create-admin -- <username> [password]
  npm run create-admin -- <username> --promote
  npm run create-admin -- <new-username> --email a@b.com

Options
  --promote        Grant admin to an account that already exists
  --email <addr>   Contact email, required when creating a new account
  --phone <num>    Contact phone, alternative to --email

Omit the password when creating an account and a random one is generated and
printed once. Pass it as an argument only if you accept it landing in shell
history.
`.trim();

/** Prompts only for what is missing, so the script stays non-interactive when
 * it can be and never hangs waiting on input nobody is there to type. */
function ask(question, { silent = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });

  if (!silent) {
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  return new Promise((resolve) => {
    // Suppress echo: a password typed at a prompt should not appear on screen.
    const onData = (char) => {
      if (['\n', '\r', ''].includes(String(char))) {
        process.stdin.removeListener('data', onData);
      } else {
        readline.clearLine(process.stdin, 0);
        readline.cursorTo(process.stdin, 0);
        process.stdout.write(question + '[0m');
      }
    };
    process.stdin.on('data', onData);

    rl.question(question, (answer) => {
      process.stdin.removeListener('data', onData);
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

function randomPassword() {
  // Guaranteed to contain a lowercase, an uppercase and a digit so it satisfies
  // the same policy as a password a human would choose.
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digit = '23456789';
  const all = lower + upper + digit;
  const pick = (set) => set[crypto.randomInt(set.length)];

  const chars = [pick(lower), pick(upper), pick(digit)];
  while (chars.length < GENERATED_LENGTH) chars.push(pick(all));
  return shuffle(chars).join('');
}

function shuffle(chars) {
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.username) {
    console.log(USAGE);
    process.exit(args.help ? 0 : 1);
  }

  const username = authService.normalizeUsername(args.username);

  // Promotions are resolved by username alone, so `--promote` never needs an
  // email and never blocks on a prompt. Contact details are only collected
  // below, on the branch that actually creates an account.
  const existing = await User.findOne({ where: { username } });

  if (existing) {
    if (existing.role === 'admin') {
      console.log(`@${existing.username} is already an admin. Nothing to do.`);
      return;
    }
    if (!args.promote) {
      console.error(
        `@${existing.username} already exists. Re-run with --promote to grant the admin role,\n` +
          'or pick a different username to create a new admin account.',
      );
      process.exit(1);
    }
    await existing.update({ role: 'admin' });
    console.log(`@${existing.username} is now an admin.`);
    return;
  }

  const email = authService.normalizeEmail(args.email || (await ask('Email: ')));
  const phone = args.phone ? authService.normalizePhone(args.phone) : null;

  if (!email && !phone) {
    console.error('A new admin account needs --email or --phone so it can be reached and verified.');
    process.exit(1);
  }

  const typed = args.password || (await ask('Password (blank to generate one): '));
  const password = typed || randomPassword();
  const generated = !typed;

  const user = await authService.register(
    {
      username,
      email: email || undefined,
      phone: phone || undefined,
      password,
      displayName: username,
    },
    { userAgent: 'create-admin-cli' },
    { role: 'admin' },
  );

  console.log(`\nAdmin account created: @${user.username}`);
  if (generated) {
    console.log(`Password: ${password}`);
    console.log('This is the only time it is shown — sign in and change it now.');
  }
}

main()
  .then(async () => {
    await sequelize.close();
  })
  .catch(async (error) => {
    logger.error({ err: error }, 'create-admin failed');
    console.error(`\nFailed: ${error.message}`);
    process.exitCode = 1;
    await sequelize.close();
  });
