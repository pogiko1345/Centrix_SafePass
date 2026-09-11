const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeAndroidRelease } = require("../routes/appUpdateRoutes");

test("Android release metadata accepts a numeric build and HTTPS APK", () => {
  assert.deepEqual(normalizeAndroidRelease({
    latestVersion: "1.02", buildNumber: 102,
    downloadUrl: "https://example.com/CentrixMobile.apk",
    releaseNotes: ["Fixed login", "", "Improved performance"], forceUpdate: true,
  }), {
    latestVersion: "1.02", buildNumber: 102,
    downloadUrl: "https://example.com/CentrixMobile.apk",
    releaseNotes: ["Fixed login", "Improved performance"], forceUpdate: true, publishedAt: null,
  });
});

test("Android release metadata rejects insecure URLs and invalid builds", () => {
  assert.throws(() => normalizeAndroidRelease({ latestVersion: "1.02", buildNumber: 102, downloadUrl: "http://example.com/app.apk" }), /HTTPS/);
  assert.throws(() => normalizeAndroidRelease({ latestVersion: "1.02", buildNumber: "latest", downloadUrl: "https://example.com/app.apk" }), /positive integer/);
});
