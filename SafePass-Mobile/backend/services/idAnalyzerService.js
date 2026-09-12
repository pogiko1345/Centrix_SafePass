// The backend is CommonJS, while idanalyzer2 is an ES module.
let sdkPromise;

const loadSdk = () => {
  if (!sdkPromise) sdkPromise = import("idanalyzer2");
  return sdkPromise;
};

const verifyID = async (frontImage, backImage = "") => {
  if (!frontImage) throw new Error("Front ID image is required.");

  const apiKey = process.env.IDANALYZER_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error("IDANALYZER_KEY is required for ID verification.");
  }

  const { Scanner, Profile } = (await loadSdk()).default;
  const scanner = new Scanner(apiKey);
  scanner.throwApiException(true);

  const profile = new Profile(Profile.SECURITY_MEDIUM);
  profile.saveResult(false, false);
  scanner.setProfile(profile);

  return scanner.scan(frontImage, backImage);
};

module.exports = { verifyID };
