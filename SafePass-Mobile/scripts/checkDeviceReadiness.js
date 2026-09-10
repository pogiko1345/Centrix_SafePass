const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const app = JSON.parse(read("app.json")).expo;
const pkg = JSON.parse(read("package.json"));
const manifest = read("android/app/src/main/AndroidManifest.xml");
const gradle = read("android/app/build.gradle");
const strings = read("android/app/src/main/res/values/strings.xml");

const results = [];
const check = (label, passed, detail = "") => results.push({ label, passed, detail });
const hasPermission = (permission) => manifest.includes(`android.permission.${permission}`);

check("Expo-compatible network package", pkg.dependencies["@react-native-community/netinfo"] === "11.5.2");
check("Android app name", strings.includes(`<string name="app_name">${app.name}</string>`) && gradle.includes(`resValue "string", "app_name", "${app.name}"`));
check("Android version", gradle.includes(`versionCode ${app.android.versionCode}`) && gradle.includes(`versionName "${app.version}"`));
check("Camera permission", hasPermission("CAMERA"));
check("NFC permission", hasPermission("NFC"));
check("Biometric permission", hasPermission("USE_BIOMETRIC"));
check("Android notification permission", hasPermission("POST_NOTIFICATIONS"));
check("Internet permission", hasPermission("INTERNET"));
check("Expo push project ID", Boolean(app.extra?.eas?.projectId));

const googleServicesPath = path.join(root, "android", "app", "google-services.json");
const pushConfigured = fs.existsSync(googleServicesPath);

for (const result of results) {
  console.log(`${result.passed ? "PASS" : "FAIL"}  ${result.label}${result.detail ? ` - ${result.detail}` : ""}`);
}
console.log(`${pushConfigured ? "PASS" : "WAIT"}  Closed-app Android push${pushConfigured ? " is configured" : " needs android/app/google-services.json"}`);

if (results.some((result) => !result.passed)) process.exitCode = 1;
