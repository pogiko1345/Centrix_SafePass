const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const appConfigPath = path.join(root, "app.json");
const releasePath = path.join(root, "backend", "config", "androidRelease.json");
const isWindows = process.platform === "win32";
const args = process.argv.slice(2);
const valueAfter = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : "";
};
const version = String(valueAfter("--version") || "").replace(/^v/i, "").trim();
const notes = args.filter((arg) => arg.startsWith("--note=")).map((arg) => arg.slice(7).trim()).filter(Boolean);
const forceUpdate = args.includes("--force");
const prepareOnly = args.includes("--prepare-only");

if (!/^\d+\.\d{2}$/.test(version)) {
  console.error("Use --version 1.02 (major number, dot, and exactly two release digits).");
  process.exit(1);
}
if (!notes.length) {
  console.error('Add at least one release note with --note="What changed".');
  process.exit(1);
}

const [major, release] = version.split(".").map(Number);
const buildNumber = major * 100 + release;
const appConfig = JSON.parse(fs.readFileSync(appConfigPath, "utf8"));
const currentBuild = Number(appConfig.expo?.android?.versionCode || 0);
if (buildNumber <= currentBuild) {
  console.error(`Build ${buildNumber} must be greater than the current build ${currentBuild}.`);
  process.exit(1);
}

const tag = `v${version}`;
const downloadUrl = `https://github.com/pogiko1345/Centrix_SafePass/releases/download/${tag}/CentrixMobile.apk`;
appConfig.expo.version = version;
appConfig.expo.android.versionCode = buildNumber;
fs.writeFileSync(appConfigPath, `${JSON.stringify(appConfig, null, 2)}\n`);
fs.writeFileSync(releasePath, `${JSON.stringify({ latestVersion: version, buildNumber, downloadUrl, releaseNotes: notes, forceUpdate, publishedAt: new Date().toISOString() }, null, 2)}\n`);
console.log(`Prepared CentrixMobile v${version} (build ${buildNumber}).`);
if (prepareOnly) process.exit(0);

let buildRoot = root;
let temporaryDrive = "";
if (isWindows && root.length > 60) {
  temporaryDrive = "S:";
  const mapped = spawnSync("subst", [temporaryDrive, root], { stdio: "inherit", shell: true });
  if (mapped.status !== 0) process.exit(mapped.status || 1);
  buildRoot = `${temporaryDrive}\\`;
}

try {
  const buildArgs = ["assembleFullRelease", "--no-daemon", "--max-workers=1"];
  const build = temporaryDrive
    ? spawnSync(
        "cmd.exe",
        ["/d", "/c", `${temporaryDrive} && cd \\android && gradlew.bat ${buildArgs.join(" ")}`],
        { cwd: "C:\\", stdio: "inherit", env: { ...process.env, NODE_ENV: "production" } },
      )
    : spawnSync(isWindows ? "gradlew.bat" : "./gradlew", buildArgs, {
        cwd: path.join(buildRoot, "android"), stdio: "inherit", shell: isWindows,
        env: { ...process.env, NODE_ENV: "production" },
      });
  if (build.status !== 0) throw new Error(`Android build failed with exit code ${build.status || 1}.`);
  const builtApk = path.join(root, "android", "app", "build", "outputs", "apk", "full", "release", "CentrixMobile.apk");
  const outputDir = path.join(root, "dist");
  const finalApk = path.join(outputDir, "CentrixMobile.apk");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.copyFileSync(builtApk, finalApk);
  console.log(`APK ready: ${finalApk}`);
  console.log(`Publish it to GitHub release ${tag}, then deploy the backend metadata commit to Render.`);
} finally {
  if (temporaryDrive) spawnSync("subst", [temporaryDrive, "/d"], { stdio: "ignore", shell: true });
}
