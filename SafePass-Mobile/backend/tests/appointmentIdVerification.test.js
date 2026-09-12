const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const {
  parseIdImage,
  mapIdAnalyzerDecision,
  issueIdVerificationProof,
  verifyIdVerificationProof,
  buildAppointmentIdReview,
} = require("../services/appointmentIdVerification");

const image = Buffer.alloc(128);
image[0] = 0xff;
image[1] = 0xd8;
image[2] = 0xff;
const base64 = image.toString("base64");

assert.equal(parseIdImage(`data:image/jpeg;base64,${base64}`), base64);
assert.throws(() => parseIdImage(""), /Front ID image is required/);
assert.throws(() => parseIdImage(`data:image/png;base64,${base64}`), /does not match/);
assert.throws(() => parseIdImage("data:image/gif;base64,AAAA"), /JPEG or PNG/);
assert.throws(() => parseIdImage(`data:image/jpeg;base64,${Buffer.alloc(4 * 1024 * 1024 + 1).toString("base64")}`), /too large/);

assert.equal(mapIdAnalyzerDecision({ decision: "accept" }).verificationStatus, "precheck_passed");
assert.equal(mapIdAnalyzerDecision({ decision: "review" }).verificationStatus, "needs_review");
assert.equal(mapIdAnalyzerDecision({ decision: "reject" }).verificationStatus, "rejected");
assert.throws(() => mapIdAnalyzerDecision({ decision: "unknown" }), /unrecognized decision/);

const proof = issueIdVerificationProof({
  userId: "test-user",
  idType: "Passport",
  decision: "accept",
  frontImage: base64,
  secret: "test-only-secret",
});
const claims = jwt.verify(proof, "test-only-secret");
assert.equal(claims.sub, "test-user");
assert.equal(claims.purpose, "visitor_id_precheck");
assert.equal(claims.idType, "Passport");
assert.equal(claims.decision, "accept");
assert.equal(claims.exp - claims.iat, 600);
assert.equal(claims.imageDigest.length, 64);
assert.equal(JSON.stringify(claims).includes(base64), false);

const review = (proofValue, overrides = {}) => buildAppointmentIdReview({
  proof: proofValue,
  authenticatedUserId: "test-user",
  appointmentUserId: "test-user",
  idType: "Passport",
  secret: "test-only-secret",
  ...overrides,
});
assert.equal(review(proof).status, "ai_precheck_passed");
assert.equal(review(null).status, "physical_id_required");
assert.equal(review(proof, { authenticatedUserId: "someone-else" }).status, "physical_id_required");
assert.equal(review(proof, { appointmentUserId: "someone-else" }).status, "physical_id_required");
assert.equal(review(proof, { idType: "Driver's License" }).status, "physical_id_required");
assert.equal(review(proof, { idVerification: { status: "ai_precheck_passed", isValid: true } }).status, "ai_precheck_passed");
assert.equal(review(null, { idVerification: { status: "ai_precheck_passed", isValid: true } }).status, "physical_id_required");

const expiredProof = jwt.sign({
  purpose: "visitor_id_precheck", idType: "Passport", decision: "accept", imageDigest: claims.imageDigest,
}, "test-only-secret", { subject: "test-user", expiresIn: -1, algorithm: "HS256" });
assert.equal(verifyIdVerificationProof({
  proof: expiredProof, authenticatedUserId: "test-user", appointmentUserId: "test-user",
  idType: "Passport", secret: "test-only-secret",
}), null);
assert.equal(review(expiredProof).status, "physical_id_required");
const tamperedProof = `${proof.slice(0, 5)}x${proof.slice(6)}`;
assert.equal(review(tamperedProof).status, "physical_id_required");

console.log("Appointment ID verification helper tests passed");
