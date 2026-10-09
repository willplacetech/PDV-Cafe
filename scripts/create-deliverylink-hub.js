const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');

const TEMPLATE_DIRECTORY = path.join(__dirname, 'deliverylink-hub-template');
const HUB_REMOTE = 'https://github.com/willplacetech/DeliveryLinkHub.git';

const git = (cwd, args) => execFileSync('git', ['-C', cwd, ...args], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

function validateDestination(destination) {
  const target = path.resolve(destination);
  if (target === path.parse(target).root) throw new Error('Invalid destination: filesystem root is not allowed.');

  const parent = path.dirname(target);
  if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) {
    throw new Error('Invalid destination: parent directory must already exist.');
  }

  if (!fs.existsSync(target)) return { target, exists: false, gitDirectory: false };
  const stat = fs.lstatSync(target);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('Invalid destination: expected a directory.');
  }

  const entries = fs.readdirSync(target);
  if (entries.length === 0) return { target, exists: true, gitDirectory: false };
  if (entries.length !== 1 || entries[0] !== '.git' || !fs.statSync(path.join(target, '.git')).isDirectory()) {
    throw new Error('Invalid destination: directory must be empty or an empty DeliveryLinkHub checkout.');
  }

  let remote;
  try {
    remote = git(target, ['remote', 'get-url', 'origin']).trim();
  } catch {
    throw new Error('Invalid destination: existing Git checkout must have the expected origin remote.');
  }
  if (remote !== HUB_REMOTE) {
    throw new Error('Invalid destination: existing Git checkout origin does not match DeliveryLinkHub.');
  }
  return { target, exists: true, gitDirectory: true };
}

async function createDeliveryHub({ destination }) {
  if (typeof destination !== 'string' || !destination.trim()) throw new Error('A destination path is required.');
  const resolved = validateDestination(destination.trim());
  const parent = path.dirname(resolved.target);
  const staging = fs.mkdtempSync(path.join(parent, '.deliverylink-hub-'));
  const backup = `${resolved.target}.deliverylink-hub-backup-${process.pid}`;

  try {
    fs.cpSync(TEMPLATE_DIRECTORY, staging, { recursive: true, errorOnExist: true });
    if (resolved.gitDirectory) {
      fs.cpSync(path.join(resolved.target, '.git'), path.join(staging, '.git'), { recursive: true, errorOnExist: true });
      git(staging, ['remote', 'set-url', 'origin', HUB_REMOTE]);
    } else {
      git(staging, ['init']);
      git(staging, ['remote', 'add', 'origin', HUB_REMOTE]);
    }

    if (resolved.exists) fs.renameSync(resolved.target, backup);
    try {
      fs.renameSync(staging, resolved.target);
    } catch (error) {
      if (resolved.exists) fs.renameSync(backup, resolved.target);
      throw error;
    }
    if (resolved.exists) fs.rmSync(backup, { recursive: true });
    return resolved.target;
  } finally {
    if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true });
    if (fs.existsSync(backup) && !fs.existsSync(resolved.target)) fs.renameSync(backup, resolved.target);
  }
}

async function main() {
  let destination = process.argv[2] === '--destination' || process.argv[2] === '-d'
    ? process.argv[3]
    : undefined;
  if (!destination) {
    const prompt = readline.createInterface({ input: stdin, output: stdout });
    try {
      destination = await prompt.question('Local destination for DeliveryLinkHub: ');
    } finally {
      prompt.close();
    }
  }
  const generated = await createDeliveryHub({ destination });
  console.log(`DeliveryLinkHub project generated at ${generated}`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(`DeliveryLinkHub generation failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { createDeliveryHub };
