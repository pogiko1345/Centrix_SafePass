const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const androidRoot = path.join(projectRoot, 'android');
const appRoot = path.join(androidRoot, 'app');
const keystorePath = path.join(appRoot, 'centrix-safepass-release.jks');
const propertiesPath = path.join(androidRoot, 'keystore.properties');
const backupRoot = path.join(os.homedir(), 'Documents', 'Centrix-SafePass-Signing');
const backupKeystorePath = path.join(backupRoot, 'centrix-safepass-release.jks');
const credentialsPath = path.join(backupRoot, 'SIGNING-CREDENTIALS.txt');

if (fs.existsSync(keystorePath) || fs.existsSync(propertiesPath)) {
  throw new Error('Release signing files already exist; refusing to replace the permanent signing identity.');
}

const password = crypto.randomBytes(24).toString('base64url');
const alias = 'centrix-safepass';
const keytool = process.env.JAVA_HOME
  ? path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool')
  : 'keytool';
const result = spawnSync(keytool, [
  '-genkeypair', '-v', '-storetype', 'PKCS12',
  '-keystore', keystorePath,
  '-alias', alias,
  '-keyalg', 'RSA', '-keysize', '4096', '-validity', '10000',
  '-storepass', password, '-keypass', password,
  '-dname', 'CN=Centrix Safepass, OU=Mobile, O=Centrix, L=Manila, ST=Metro Manila, C=PH',
], { encoding: 'utf8' });

if (result.status !== 0) {
  throw new Error(`keytool failed: ${result.stderr || result.stdout || 'unknown error'}`);
}

fs.writeFileSync(propertiesPath, [
  'storeFile=centrix-safepass-release.jks',
  `storePassword=${password}`,
  `keyAlias=${alias}`,
  `keyPassword=${password}`,
  '',
].join('\n'), { mode: 0o600 });

fs.mkdirSync(backupRoot, { recursive: true });
fs.copyFileSync(keystorePath, backupKeystorePath, fs.constants.COPYFILE_EXCL);
fs.writeFileSync(credentialsPath, [
  'CENTRIX SAFEPASS ANDROID RELEASE SIGNING CREDENTIALS',
  '',
  `Key alias: ${alias}`,
  `Keystore password: ${password}`,
  `Key password: ${password}`,
  '',
  'Keep this file and the accompanying JKS backup private and backed up securely.',
  'Losing this keystore or password prevents future APKs from updating the production app.',
  '',
].join('\n'), { mode: 0o600 });

console.log(`Created permanent signing key: ${keystorePath}`);
console.log(`Created private recovery backup: ${backupRoot}`);
