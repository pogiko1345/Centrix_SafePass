const baseConfig = require("./app.json");
const fs = require('fs');
const path = require('path');

const normalizeVariant = (value) =>
  String(value || "").toLowerCase().trim() === "visitor" ? "visitor" : "full";

module.exports = ({ config }) => {
  const variant = normalizeVariant(process.env.EXPO_PUBLIC_APP_VARIANT);
  const expoConfig = baseConfig.expo || {};
  const isVisitorBuild = variant === "visitor";
  const googleServicesFile = path.join(__dirname, 'android', 'app', 'google-services.json');
  const pushNotificationsConfigured = !isVisitorBuild && fs.existsSync(googleServicesFile);
  const appName = isVisitorBuild
    ? "SafePass Visitor"
    : expoConfig.name || "CentrixMobile";
  const usesLocalHttpApi = String(
    process.env.EXPO_PUBLIC_API_BASE_URL ||
      process.env.EXPO_PUBLIC_API_LAN_BASE_URL ||
      "",
  ).startsWith("http://");

  return {
    ...config,
    ...expoConfig,
    name: appName,
    slug: isVisitorBuild ? "safepass-visitor" : expoConfig.slug,
    extra: {
      ...(expoConfig.extra || {}),
      pushNotificationsConfigured,
      apiBaseUrl: String(process.env.EXPO_PUBLIC_API_BASE_URL || "").trim(),
      appVariant: variant,
      appDisplayName: appName,
      appOrganization: "Sapphire International Aviation Academy",
    },
    android: {
      ...(expoConfig.android || {}),
      ...(pushNotificationsConfigured ? { googleServicesFile } : {}),
      ...(usesLocalHttpApi ? { usesCleartextTraffic: true } : {}),
      package: isVisitorBuild
        ? "com.anonymous.SafePassMobile.visitor"
        : "com.anonymous.SafePassMobile",
    },
  };
};
