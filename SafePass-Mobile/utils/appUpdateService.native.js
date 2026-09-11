import * as Application from "expo-application";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import { Platform } from "react-native";
import ApiService from "./ApiService";
const { isNewerBuild } = require("./appUpdateRules");

const APK_MIME_TYPE = "application/vnd.android.package-archive";
const FLAG_GRANT_READ_URI_PERMISSION = 1;
const FLAG_ACTIVITY_NEW_TASK = 268435456;

const normalizeUpdate = (value = {}) => {
  const latestVersion = String(value.latestVersion || "").trim();
  const buildNumber = Number(value.buildNumber);
  const downloadUrl = String(value.downloadUrl || "").trim();
  const releaseNotes = Array.isArray(value.releaseNotes)
    ? value.releaseNotes.map((note) => String(note || "").trim()).filter(Boolean).slice(0, 20)
    : [];

  if (!/^\d+(?:\.\d+){1,2}$/.test(latestVersion)) throw new Error("Invalid update version.");
  if (!Number.isSafeInteger(buildNumber) || buildNumber < 1) throw new Error("Invalid update build number.");

  let parsedUrl;
  try {
    parsedUrl = new URL(downloadUrl);
  } catch {
    throw new Error("Invalid APK download URL.");
  }
  if (parsedUrl.protocol !== "https:") throw new Error("APK updates must use HTTPS.");
  if (!parsedUrl.pathname.toLowerCase().endsWith(".apk")) throw new Error("The update URL must point to an APK file.");

  return {
    latestVersion,
    buildNumber,
    downloadUrl: parsedUrl.toString(),
    releaseNotes,
    forceUpdate: value.forceUpdate === true,
    publishedAt: value.publishedAt || null,
  };
};

export const getInstalledAndroidBuild = () => {
  const value = Number(Application.nativeBuildVersion);
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
};

export const getInstalledVersion = () => String(Application.nativeApplicationVersion || "0");

export const checkForAndroidUpdate = async () => {
  if (Platform.OS !== "android") return null;
  const response = await ApiService.fetch("/app-updates/android", { method: "GET" });
  const update = normalizeUpdate(response?.update);
  const installedBuild = getInstalledAndroidBuild();
  if (!isNewerBuild(installedBuild, update.buildNumber)) return null;
  return { ...update, installedBuild, installedVersion: getInstalledVersion() };
};

export const downloadAndInstallAndroidUpdate = async (update, onProgress = () => {}) => {
  if (Platform.OS !== "android") throw new Error("APK updates require Android.");
  const validated = normalizeUpdate(update);
  const installedBuild = getInstalledAndroidBuild();
  if (!isNewerBuild(installedBuild, validated.buildNumber)) throw new Error("This update is not newer than the installed app.");

  const destination = `${FileSystem.cacheDirectory}CentrixMobile-${validated.buildNumber}.apk`;
  await FileSystem.deleteAsync(destination, { idempotent: true });
  const download = FileSystem.createDownloadResumable(
    validated.downloadUrl,
    destination,
    {},
    ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
      if (totalBytesExpectedToWrite > 0) {
        onProgress(Math.min(totalBytesWritten / totalBytesExpectedToWrite, 1));
      }
    },
  );
  const result = await download.downloadAsync();
  if (!result?.uri || (result.status && result.status !== 200)) throw new Error("The APK download did not complete.");
  const file = await FileSystem.getInfoAsync(result.uri, { size: true });
  if (!file.exists || Number(file.size || 0) < 1024 * 1024) {
    await FileSystem.deleteAsync(result.uri, { idempotent: true });
    throw new Error("The downloaded update is not a valid APK file.");
  }

  const contentUri = await FileSystem.getContentUriAsync(result.uri);
  try {
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
      data: contentUri,
      flags: FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK,
      type: APK_MIME_TYPE,
    });
  } catch (error) {
    try {
      await IntentLauncher.startActivityAsync("android.settings.MANAGE_UNKNOWN_APP_SOURCES", {
        data: `package:${Application.applicationId}`,
      });
    } catch {}
    const installError = new Error("Allow CentrixMobile to install updates, then return and tap Update Now again.");
    installError.cause = error;
    throw installError;
  }

  return result.uri;
};
