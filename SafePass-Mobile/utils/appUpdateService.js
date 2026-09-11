export const getInstalledAndroidBuild = () => 0;
export const checkForAndroidUpdate = async () => null;
export const downloadAndInstallAndroidUpdate = async () => {
  throw new Error("APK updates are available only in the Android app.");
};
