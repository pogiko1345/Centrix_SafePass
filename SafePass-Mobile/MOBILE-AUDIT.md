# CentrixMobile mobile audit

## Notification and staff-selection update — 7 September 2026

Version code 4 corrects the visitor dashboard's profile endpoint, adds a shared unread notification inbox, and selects actual active staff accounts with exact recipient routing and matching availability checks. Android Expo push registration and a durable backend delivery queue are implemented. Firebase credentials and deployment of the changed backend to Render are still required; closed-app delivery has not been verified. See [setup and deployment steps](PUSH-NOTIFICATIONS.md).

Validation: 12 new regression tests pass (7 backend notification/directory tests and 5 mobile notification/profile/selection tests), together with the existing 19 backend and 7 mobile regressions. Web production compilation passes with an entrypoint-size warning (810 KiB against the configured 800 KiB threshold). Tests use mocked accounts and delivery services; they do not change live MongoDB records or send real notifications.

The full release assembled successfully and installed over version 3. Version 4 opens on the Pixel 5 emulator with no Firebase file; the captured Android/React Native startup error log is clear. [Launch evidence](dist/mobile-audit/notifications-v4-launch.png). The new APK is `dist/CentrixMobile.apk` (108,484,969 bytes), SHA-256 `c328ba3d6c41fcf6576fdc4eeab286b325f2abe604c95dd7a99479daccd15b79`. It retains the previous signing certificate and live Render URL. Authenticated live approvals and closed-app delivery remain unverified.

Originally tested 6 September 2026 against release version code 2, package `com.anonymous.SafePassMobile`. The findings below describe that original build. Fixes were implemented and checked on 6–7 September; see the current status here.

## Fix status — version code 3

| Finding | Current status |
| --- | --- |
| Google browser authorization error | Replaced with native Android Google sign-in for login, registration and profile linking. Native Google account flow opens and cancellation returns to the app. Cloud registration and successful account sign-in still need verification; see [exact setup values](GOOGLE-SIGN-IN.md). |
| Password-reset keyboard overlap | Fixed with a compact phone header and a scrolling, keyboard-aware modal. At 360 × 640 dp, entered text stays visible above the keyboard. |
| Stale connection badge | Fixed with network events, screen focus/app resume checks, periodic health checks, and protection against stale request results. Emulator showed failure on network loss and connected status after restoration without reopening Login. |
| Status-bar contrast | Login and registration now use dark icons on the light inset. Login contrast verified visually. |
| Standalone attendance render error | Imported Modal; the loaded-screen render regression passes. |
| Standalone attendance export/print | Added native CSV file sharing and the existing PDF report flow, including CSV escaping and invalid-date handling. File-sharing and report-content tests pass with mocked device dependencies. |
| Admin duplicate academic ID error | Moved the academic role flag into the shared scope. Both student and teacher duplicate server-response regressions pass. |

The earlier version code 3 release assembled successfully, its signature verified, and installation over the previous app succeeded. It retained the live Render API URL. The downloadable [dist/CentrixMobile.apk](dist/CentrixMobile.apk) has since been replaced by version 4 described above.

Seven mobile regression tests pass via `rtk proxy node --test SafePass-Mobile/scripts/tests/mobileFixes.test.cjs` from the repository root. The web production compilation passed with an entrypoint-size warning (806 KiB versus its configured 800 KiB threshold). The final phone-header adjustment was compiled in the Android release. The reference scan found no undefined identifiers, and the final public Android checks produced no React Native or Android runtime errors in the captured error log.

Evidence: [visible input with keyboard](dist/mobile-audit/fixed-03-small-reset-keyboard.png), [network lost](dist/mobile-audit/fixed-04-network-offline.png), [network restored](dist/mobile-audit/fixed-05-network-restored.png), [native Google account flow](dist/mobile-audit/fixed-07-google-account-screen.png), [Google cancellation returns to login](dist/mobile-audit/fixed-08-google-cancelled.png).

Successful authenticated workflows, live record creation, OTP delivery, and physical NFC/ESP32 remain unverified without a test account/device. Google Cloud credentials were not modified. No live database records were changed during the checks.

## Confirmed in the Android emulator

### 1. Google sign-in is blocked — high priority

Open Login and tap Sign in with Google. Google displays **Error 400: invalid_request**, with the explanation that custom scheme URIs are not allowed for a WEB client. Sign-in cannot proceed.

`screens/LoginScreen.jsx:199–201` supplies the same configured client ID as both the web and Android client. Registration repeats this configuration at `screens/VisitorRegisterScreen.jsx:561–563`. Configure the Android Google authorization flow and its callback correctly, then retest login and registration in the signed APK.

Evidence: [Google authorization error](dist/mobile-audit/08-google-sign-in.png).

### 2. Password-reset email field disappears behind the keyboard — medium priority

At 360 × 640 dp, open Login → Forgot Password and tap the email field. The keyboard covers the field while the large recovery header stays visible, preventing the user from seeing what they type. Dragging dismisses the keyboard rather than establishing a usable typing layout.

The modal in `screens/LoginScreen.jsx:2372` puts its large header outside the scrolling body. Make the modal respond to keyboard height and allow the header and form to scroll together, or reduce the header while typing.

Evidence: [Before keyboard](dist/mobile-audit/22-small-reset.png), [keyboard covering input](dist/mobile-audit/23-small-reset-keyboard.png).

### 3. Login connection badge becomes misleading — medium priority

Open Login while online, then disable networking: SERVER CONNECTED remains visible. Reopen Login while offline, restore networking, and wait: SERVER CHECK FAILED remains visible. The check runs on mount at `screens/LoginScreen.jsx:482–484` and is not refreshed as connectivity changes.

Refresh the health check on reconnection/app focus or provide a retry action. This finding concerns the indicator; it does not establish that credential login fails after reconnection.

Evidence: [Offline but connected badge](dist/mobile-audit/10-offline-stale-connected.png), [online but failed badge](dist/mobile-audit/12-online-stale-offline.png).

### 4. Status-bar icons have poor contrast — low priority

The login and registration screens display light status-bar text over a pale top inset. The time and system icons are difficult to read. Their StatusBar declarations use `light-content` (`screens/LoginScreen.jsx:1744`, `screens/VisitorRegisterScreen.jsx:1457`). Match icon brightness to the actual inset background.

Evidence: [Login screen](dist/mobile-audit/02-login-top.png).

## Confirmed through isolated code execution

These findings were reproduced with mocked dependencies, without signing in or changing live records.

### 5. Standalone Attendance Records screen throws after loading — medium priority

`screens/AttendanceRecordsScreen.jsx:443` renders `<Modal>` without importing Modal. Rendering the component after loading produces **Modal is not defined**. Import Modal from React Native.

The route is registered at `App.js:928`, but no mobile navigation button to this standalone route was found. Admin and security dashboard attendance views use separate implementations; this finding does not establish that those tabs crash.

Related source-only finding: the standalone screen's CSV and print buttons use browser-only APIs (`AttendanceRecordsScreen.jsx:180–205` and `:245–255`) with no native fallback. After the render fix, they still need native export/print support or platform-specific visibility.

### 6. Admin duplicate academic-ID handling throws — medium priority

If account creation receives a duplicate student/teacher ID error from the server, `screens/AdminDashboardScreen.jsx:4704` references `isAcademicStaffAccount` inside the catch block. That variable is declared inside the try block at line 4557 and is out of scope. Executing the exact error handler produces **isAcademicStaffAccount is not defined**, replacing the intended field validation error.

Derive the role flag in a scope shared by the try and catch blocks. This can occur when a duplicate reaches the server despite the local precheck, such as with a stale account list.

Evidence for both exceptions: [Reproduction output](dist/mobile-audit/code-error-reproductions.json), [isolated reproduction script](dist/mobile-audit/reproduce-code-errors.cjs).

## Verification and limits

- Tested the installed release in a Pixel 5 emulator reporting Android 17, at its normal size and a 360 × 640 dp override.
- Exercised home/login navigation, help screen opening and scrolling, empty login/reset/registration validation, registration keyboard behavior, Google authorization launch, and loss/restoration of connectivity.
- All **19 existing backend tests passed**, covering security utilities, settings utilities, and mocked route integrations. Database dependencies were mocked and dotenv loading disabled for this run.
- No AndroidRuntime crash was logged during the exercised public flows. React Native logged the expected failed health request during the deliberate offline test.
- No test account was supplied. Successful credential login, authenticated dashboards, OTP delivery, account creation, and visitor/attendance changes remain unverified end to end. Physical NFC/ESP32, camera, and GPS behavior were not tested.
- No live records were created or edited. Temporary screen and network overrides were restored. Screenshots and reproduction tools are local artifacts under the ignored `dist/mobile-audit/` directory.
