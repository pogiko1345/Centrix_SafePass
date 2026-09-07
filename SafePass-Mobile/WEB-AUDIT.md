# SafePass web audit — 7 September 2026

Site: https://siaacentrixsafepass.com/

## Current fix status

All six requested items are implemented locally, along with the BackHandler dependency fix:

| Item | Change and verification |
| --- | --- |
| Desktop clipping | Login content can grow and scroll. Home, Create Account, Privacy Policy, and Terms are reachable at 1366 × 768, 1440 × 900, 1100 × 600, and 390 × 844. |
| Web dialogs | Project Alert calls use a platform adapter. Web gets a queued, keyboard-accessible dialog; native uses React Native Alert. Real admin rejection, staff bulk approval, and student logout handlers pass mocked API tests for cancellation and exactly-once confirmation. |
| Labels and autofill | Login/registration fields have explicit accessible labels and autocomplete values; validation messages are linked to their fields. Recovery and verification inputs also have labels and email/password/OTP autofill hints. |
| Phone registration | Removed repeated introductions and large progress/setup panels from the phone web layout. The name field is now visible on the initial 390 × 844 screen; progress remains as a compact count. |
| Motion | Sign-in stays stationary. Continuous decorative loops are disabled on the public web screens; web transition feedback lasts 350 ms and reduced-motion users skip it. |
| Version and previews | Public version labels use the configured app version from one utility. Fixed sample statuses explicitly say Preview; the homepage describes the illustration as a feature preview. |

Validation: 18 regression tests passed across mobile fixes, notifications, BackHandler, and web dialogs. The production-configured web build passed, with the existing entrypoint-size warning (813 KiB against the 800 KiB threshold). Chromium checks passed browser history/reload, all four layouts, dialog Cancel/Confirm/Escape/focus trapping, form attributes, stationary sign-in, and reduced-motion homepage rendering, with no console or page errors.

Evidence: [verification results](dist/web-audit/web-fixes-verification.json), [desktop login](dist/web-audit/fixed-desktop-login.png), [phone registration](dist/web-audit/fixed-phone-register.png), [dialog regression tests](scripts/tests/webDialogs.test.cjs).

These changes are not deployed to the live domain. Authenticated checks use fixtures; no live approval, rejection, signup, or message was sent. The findings below describe the original audit before these fixes.

## Follow-up fix: BackHandler console error

Updated `@react-navigation/native` from 6.1.7 to 6.1.18. The earlier package registered `hardwareBackPress` in the browser; the patch release supplies separate web and native hooks. This removes the unsupported API call rather than hiding console messages.

The production web build passes. Chromium verification of Home → Login, browser Back, Forward, and reload produced no console or page errors. Two regression tests verify that web skips native BackHandler and native navigation still handles and cleans up its listener. Evidence: [browser verification](dist/web-audit/backhandler-verification.json), [tests](scripts/tests/navigationBackHandler.test.cjs).

This dependency fix is included in the current local changes and requires a frontend redeployment before the live domain serves it.

Reviewed the live public homepage, login, password-recovery modal, and visitor registration at desktop (1440 × 900) and phone (390 × 844) sizes. Also checked login at 1366 × 768 and reviewed the shared application source. No accounts were created, messages sent, approvals changed, or live database records edited. Browser checks blocked non-read requests as a precaution; none were attempted during the completed checks.

## Fix first

### 1. Desktop login content is clipped — confirmed on the live site

At 1366 × 768, Home was above the viewport (top approximately −62 px), Create Account below it (approximately 793 px), and Privacy Policy and Terms of Service below it (approximately 832 px). The document height remained 768 px. The 1440 × 900 screenshot also shows clipped content.

Allow vertical scrolling whenever content exceeds available height; remove the assumption that desktop viewports at least 760 px tall can safely lock scrolling. Check browser zoom and shorter laptop windows as well.

Source: `screens/LoginScreen.jsx:91`, `styles/LoginStyles.js:33`. Evidence: [1366 px login](dist/web-audit/1366-login.png), [1440 px login](dist/web-audit/1440-login.png), [measured positions](dist/web-audit/actions.json).

### 2. Browser confirmation dialogs do not execute actions — confirmed in the current source

The installed `react-native-web` Alert implementation contains an empty `alert()` method. Several handlers place their actual operation inside an Alert button callback, so the browser never reaches that operation. Isolated execution of the real handlers with the installed Alert implementation confirmed zero action callbacks for:

- Admin visit rejection: `screens/AdminDashboardScreen.jsx:4120`.
- Staff bulk appointment approval: `screens/StaffDashboardScreen.jsx:1391`.
- Student/teacher sign-out: `screens/StudentDashboardScreen.jsx:437`.

Other Alert-only success/error messages are also invisible in the browser, including some OTP failures and notification details. Replace these with a shared web-compatible confirmation modal and visible error/success feedback. Preserve explicit confirmation for operations that currently require it.

Evidence: [handler reproduction results](dist/web-audit/alert-results.json). These are source-level reproductions, not authenticated tests on live accounts; the deployed private dashboards have not been verified.

## Improve next

### 3. Give form fields persistent accessible labels

The live login and registration inputs have no associated HTML labels, IDs, or explicit accessible labels. Placeholders currently carry much of the identification. Add programmatically associated labels, appropriate username/current-password/new-password autocomplete values, and links between validation messages and their fields. Verify keyboard focus and error announcements.

Evidence: [public-page field inspection](dist/web-audit/results.json), [login label/autocomplete inspection](dist/web-audit/actions.json).

### 4. Simplify phone registration

At 390 × 844, the first screen contains a large introduction, registration progress card, repeated title/description, and another Account Setup card before any input. Keep one short introduction, compact progress, and the form closer to the top. Keep the detailed explanation available below or behind an expandable help section.

Evidence: [phone registration initial viewport](dist/web-audit/390-register.png). This is a usability recommendation; the form exists below the initial view.

### 5. Reduce motion around core actions

Login continuously animates its sign-in button, logo, and status badge. The button's motion prevented Playwright's normal stability check from completing; a coordinate click succeeded. This does not establish that human clicks fail, but keeping primary controls stationary would improve usability and test reliability. Honor reduced-motion preferences and shorten decorative page transitions.

Source: `screens/LoginScreen.jsx:284–325`. No reduced-motion handling was found in the reviewed screen/component/style directories.

### 6. Standardize public version labels and preview wording

The homepage displays SafePass Smart Campus v2.1.0 while login displays Secure Campus Access System v2.0. Use one version source. Homepage preview tiles use fixed Ready/Online/Live values (`screens/RoleSelectScreen.jsx:61–63`); make their illustrative nature clear or connect operational status indicators to actual health data. Keep the academy/web branding decision separate from the Android app name.

## What worked in this review

- All eight public-page captures loaded without recorded JavaScript exceptions or HTTP error responses.
- No horizontal document overflow at the tested desktop and phone widths.
- Empty login shows username/email and password validation errors.
- Password recovery modal opens at desktop and phone sizes.
- Google opens Google's sign-in page for this domain without an initial OAuth configuration error. Completing authentication was not tested.
- Direct visitor-registration navigation loads.

## Remaining authenticated checks

Use designated test accounts to verify admin rejection, staff single/bulk approval, all-role logout, visitor status/notification updates, exact staff routing, attendance export, account edits, and recovery/OTP delivery after fixes. Check the web and Android clients together against the same deployed Render API, including the earlier notification/staff-directory changes. No successful private workflow or closed-app notification delivery is claimed by this public-page audit.

The original audit recommended desktop scrolling and web dialogs first, followed by forms, phone registration, motion, and presentation cleanup. Those local changes are now summarized in the current fix status above; deployment and authenticated live verification remain outstanding.
