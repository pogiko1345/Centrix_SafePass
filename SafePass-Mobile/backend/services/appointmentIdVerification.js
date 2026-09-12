const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const PROOF_LIFETIME_SECONDS = 10 * 60;

const parseIdImage = (value, label = "Front") => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} ID image is required.`);
  }

  const match = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(value.trim());
  if (!match) {
    throw new Error(`${label} ID image must be a JPEG or PNG data image.`);
  }

  const base64 = match[2];
  if (base64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) {
    throw new Error(`${label} ID image is too large (4 MB maximum).`);
  }

  const bytes = Buffer.from(base64, "base64");
  if (bytes.length < 128 || bytes.length > MAX_IMAGE_BYTES || bytes.toString("base64") !== base64) {
    throw new Error(`${label} ID image is invalid or too large (4 MB maximum).`);
  }

  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (match[1].toLowerCase() === "jpeg" ? !isJpeg : !isPng) {
    throw new Error(`${label} ID image content does not match its JPEG or PNG format.`);
  }

  return base64;
};

const mapIdAnalyzerDecision = (rawResult) => {
  const decision = String(rawResult?.decision || "").trim().toLowerCase();
  if (decision === "accept") {
    return { decision, isValid: true, status: "ai_precheck_passed", verificationStatus: "precheck_passed", message: "ID pre-check passed. Staff or security will complete the final review." };
  }
  if (decision === "review") {
    return { decision, isValid: true, status: "ai_precheck_review_required", verificationStatus: "needs_review", message: "The ID needs a manual review by staff or security." };
  }
  if (decision === "reject") {
    return { decision, isValid: false, status: "ai_precheck_failed", verificationStatus: "rejected", message: "The ID could not pass the pre-check. Please use a clearer photo or a different valid ID." };
  }
  throw new Error("ID Analyzer returned an unrecognized decision.");
};

const firstDocumentField = (rawResult, name) => {
  const entry = rawResult?.data?.[name];
  return String(Array.isArray(entry) ? entry[0]?.value || "" : entry?.value || "").trim();
};

const detectAppointmentIdType = (rawResult) => {
  const category = firstDocumentField(rawResult, "documentType").toUpperCase();
  const documentName = firstDocumentField(rawResult, "documentName").toLowerCase();
  if (category === "P") return { category: "Passport", idType: "Passport" };
  if (category === "D") return { category: "Driver's License", idType: "Driver's License" };

  const namedTypes = [
    [/philippine identification|philid|philsys|national id/, "National ID"],
    [/\bumid\b|unified multi.?purpose/, "UMID"],
    [/philhealth/, "PhilHealth ID"],
    [/voter|comelec/, "Voter's ID"],
    [/professional regulation|\bprc\b/, "PRC ID"],
    [/postal|phlpost/, "Postal ID"],
    [/senior citizen|\bosca\b/, "Senior Citizen ID"],
    [/school|student|university|college/, "School ID"],
    [/company|employee/, "Company ID"],
  ];
  const namedMatch = namedTypes.find(([pattern]) => pattern.test(documentName));
  if (namedMatch) return { category: "Identity card", idType: namedMatch[1] };
  if (category === "I") return { category: "Identity card", idType: null };
  return { category: null, idType: null };
};

const issueIdVerificationProof = ({ userId, idType, decision, frontImage, backImage = "", secret }) => {
  if (!secret) throw new Error("JWT_SECRET is required for ID verification proofs.");
  const imageDigest = hashIdImages(frontImage, backImage);
  return jwt.sign(
    { purpose: "visitor_id_precheck", idType, decision, imageDigest },
    secret,
    { subject: String(userId), expiresIn: PROOF_LIFETIME_SECONDS, algorithm: "HS256" },
  );
};

const hashIdImages = (frontImage, backImage = "") =>
  crypto.createHash("sha256").update(frontImage).update("\0").update(backImage).digest("hex");

const issueIdTypeSelectionProof = ({ userId, frontImage, backImage = "", secret }) =>
  jwt.sign(
    { purpose: "visitor_id_type_selection", decision: "accept", category: "Identity card", imageDigest: hashIdImages(frontImage, backImage) },
    secret,
    { subject: String(userId), expiresIn: PROOF_LIFETIME_SECONDS, algorithm: "HS256" },
  );

const verifyIdTypeSelectionProof = ({ proof, userId, frontImage, backImage = "", secret }) => {
  if (typeof proof !== "string" || !proof || !secret) return false;
  try {
    const claims = jwt.verify(proof, secret, { algorithms: ["HS256"] });
    return claims.purpose === "visitor_id_type_selection" &&
      claims.decision === "accept" &&
      claims.category === "Identity card" &&
      claims.sub === String(userId) &&
      Number.isInteger(claims.iat) &&
      Number.isInteger(claims.exp) &&
      claims.exp - claims.iat === PROOF_LIFETIME_SECONDS &&
      claims.imageDigest === hashIdImages(frontImage, backImage);
  } catch (_) {
    return false;
  }
};

const verifyIdVerificationProof = ({ proof, authenticatedUserId, appointmentUserId, idType, secret }) => {
  if (typeof proof !== "string" || !proof || !secret) return null;
  try {
    const claims = jwt.verify(proof, secret, { algorithms: ["HS256"] });
    if (
      claims.purpose !== "visitor_id_precheck" ||
      claims.decision !== "accept" ||
      claims.sub !== String(authenticatedUserId) ||
      claims.sub !== String(appointmentUserId) ||
      claims.idType !== idType ||
      !Number.isInteger(claims.iat) ||
      !Number.isInteger(claims.exp) ||
      claims.exp - claims.iat !== PROOF_LIFETIME_SECONDS ||
      !/^[a-f0-9]{64}$/.test(claims.imageDigest || "")
    ) return null;
    return claims;
  } catch (_) {
    return null;
  }
};

const buildAppointmentIdReview = ({ idType, proof, authenticatedUserId, appointmentUserId, secret }) => {
  const claims = verifyIdVerificationProof({ proof, authenticatedUserId, appointmentUserId, idType, secret });
  if (claims) {
    return {
      status: "ai_precheck_passed",
      isValid: true,
      message: "ID pre-check passed. The ID will still be checked at campus entry.",
      confidence: null,
      checkedAt: new Date(claims.iat * 1000),
    };
  }
  return {
    status: "physical_id_required",
    isValid: true,
    message: `${idType} will be presented at campus entry for manual verification.`,
    confidence: null,
    checkedAt: null,
  };
};

module.exports = { parseIdImage, mapIdAnalyzerDecision, detectAppointmentIdType, issueIdVerificationProof, issueIdTypeSelectionProof, verifyIdTypeSelectionProof, verifyIdVerificationProof, buildAppointmentIdReview };
