const express = require("express");
const fs = require("node:fs");
const path = require("node:path");

const releaseFile = path.join(__dirname, "..", "config", "androidRelease.json");

const normalizeAndroidRelease = (value = {}) => {
  const latestVersion = String(value.latestVersion || "").trim();
  const buildNumber = Number(value.buildNumber);
  const downloadUrl = String(value.downloadUrl || "").trim();
  const releaseNotes = Array.isArray(value.releaseNotes)
    ? value.releaseNotes.map((note) => String(note || "").trim()).filter(Boolean).slice(0, 20)
    : [];

  if (!/^\d+(?:\.\d+){1,2}$/.test(latestVersion)) {
    throw new Error("Android release latestVersion is invalid.");
  }
  if (!Number.isSafeInteger(buildNumber) || buildNumber < 1) {
    throw new Error("Android release buildNumber must be a positive integer.");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(downloadUrl);
  } catch {
    throw new Error("Android release downloadUrl is invalid.");
  }
  if (parsedUrl.protocol !== "https:") {
    throw new Error("Android release downloadUrl must use HTTPS.");
  }
  if (!parsedUrl.pathname.toLowerCase().endsWith(".apk")) {
    throw new Error("Android release downloadUrl must point to an APK file.");
  }

  return {
    latestVersion,
    buildNumber,
    downloadUrl: parsedUrl.toString(),
    releaseNotes,
    forceUpdate: value.forceUpdate === true,
    publishedAt: value.publishedAt ? new Date(value.publishedAt).toISOString() : null,
  };
};

const readAndroidRelease = () =>
  normalizeAndroidRelease(JSON.parse(fs.readFileSync(releaseFile, "utf8")));

const createAppUpdateRoutes = () => {
  const router = express.Router();
  router.get("/app-updates/android", (_req, res) => {
    try {
      res.set("Cache-Control", "public, max-age=60, stale-if-error=300");
      res.json({ success: true, update: readAndroidRelease() });
    } catch (error) {
      console.error("Android update metadata error:", error.message);
      res.status(503).json({ success: false, message: "Update information is temporarily unavailable." });
    }
  });
  return router;
};

module.exports = { createAppUpdateRoutes, normalizeAndroidRelease, readAndroidRelease };
