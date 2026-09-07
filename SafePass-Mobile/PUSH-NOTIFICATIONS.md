# CentrixMobile notifications and staff selection

## Current status

The Android app has a shared unread notification inbox and foreground banners for every notification type returned by the authenticated notifications API. The visitor dashboard now uses `/visitor/profile`, including its appointments, and refreshes when notifications arrive, on resume, and every 15 seconds. Showing a banner does not mark a notice as read.

The appointment picker loads active staff accounts from the server, displays their names and offices, and submits the selected IDs. One staff member can be selected per office, across multiple offices. Availability and submission both check that exact account's role, active status, office, and capacity. Existing clients without explicit staff IDs retain automatic office routing.

**Firebase is not configured in this workspace. Background notification delivery is not yet active or verified.** The app still opens and its in-app inbox works without Firebase. The new staff directory and push registration endpoints require deploying this backend to Render. Until that deployment, the new picker cannot obtain staff accounts from the old options response.

## One-time Android setup

1. In Firebase Console, create or select the Firebase project for this app. Register the Android package **`com.anonymous.SafePassMobile`**.
2. Download that Android app's `google-services.json` and save it at **`android/app/google-services.json`**. The app configuration and Gradle build detect this file automatically. Do not use a service-account private key in its place.
3. Configure an FCM V1 service-account credential in the Expo project **`b7043c15-cb4c-4f94-a9bc-3af130c25647`**. Use the Expo dashboard's Android credentials or `eas credentials --platform android`, then the Google Service Account Key for Push Notifications (FCM V1) option. The Firebase Android configuration and FCM credential must belong to the same Firebase project. Keep the private service-account key out of the repository and APK.
4. Deploy the changed `backend` directory to the existing Render service. Keep its MongoDB configuration. The server starts a notification delivery worker every 10 seconds. `PUSH_NOTIFICATIONS_ENABLED=false` disables delivery; leave it unset to enable. If Expo push access-token security is enabled for the project, set the corresponding `EXPO_ACCESS_TOKEN` on Render.
5. Rebuild the full release APK using `scripts/buildProductionApk.ps1`, install it, sign in, and allow Android notifications. Changing Firebase configuration requires a new APK.

See [Expo's Android FCM credential instructions](https://docs.expo.dev/push-notifications/fcm-credentials/) and [push setup guide](https://docs.expo.dev/push-notifications/push-notifications-setup/).

## Delivery and verification

Every newly saved Notification record enters the shared delivery queue, including approvals, rejections, reschedules, redirects, completion, and security notices. Recipients are checked against both role and target account. The queue stores Expo tickets, checks receipts, retries temporary failures, and removes invalid device tokens. Older notification records are available in the inbox but are not backfilled as push messages.

After setup, use designated test accounts to request a visit with a named registrar, approve it from that registrar account, and check the visitor's updated status and notification. Repeat with the visitor app in the background and closed. Test rejection, rescheduling, and redirect notices too. Switch accounts on the same phone and confirm notices target the signed-in account. These live tests have not been performed against your users or MongoDB records.

Render must be running to process the queue. A sleeping or unavailable service delays delivery. Expo tickets indicate acceptance, and receipts indicate handoff to the push provider; neither guarantees that Android displayed a notification. See [Expo delivery and receipt documentation](https://docs.expo.dev/push-notifications/sending-notifications/).

Automated checks cover staff eligibility and exact selection, visitor profile/cache behavior, targeted push payloads, account changes, retry behavior, and invalid tokens. They use mocks and do not send real notifications.
