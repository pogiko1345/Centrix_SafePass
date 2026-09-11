const toBuildNumber = (value) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
};

const isNewerBuild = (installedBuild, latestBuild) => {
  const installed = toBuildNumber(installedBuild);
  const latest = toBuildNumber(latestBuild);
  return installed > 0 && latest > installed;
};

module.exports = { isNewerBuild, toBuildNumber };
