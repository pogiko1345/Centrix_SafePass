# CentrixMobile live Android APK

The full APK uses `https://safepass-052h.onrender.com/api`. The phone connects
to Render, and Render connects to MongoDB. Internet access is required; Expo Go,
Metro, and a backend running on your computer are not required.

## Build on this Windows workstation

The Android SDK, Java, Node dependencies, and RTK must be installed. Map the
repository to an unused drive letter to avoid Windows native compiler path
limits. Keep the app in a subdirectory of the mapped drive for Expo autolinking.

Run from the repository root (replace `S:` if it is already in use):

```powershell
rtk proxy subst S: "$PWD"
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File S:\SafePass-Mobile\scripts\buildProductionApk.ps1
rtk proxy subst S: /D
```

The output is `SafePass-Mobile/dist/CentrixMobile.apk`. Pass
`-Variant visitor` to build `SafePass-Visitor-Live.apk` instead.

The script explicitly selects production mode, disables local dotenv loading
and simulated data, and bundles the JavaScript in a release APK. The `full-apk`
and `visitor-apk` EAS profiles also contain the live API configuration.
When using a mapped drive, the script first generates native bindings from the
real project path to avoid cross-drive code-generation errors on Windows.

## Install

Transfer the APK to your Android phone, open it, and allow installation from
the browser or file manager when Android prompts. Open the app and sign in
with your existing live account. The minimum Android version is Android 7.0.

This build uses the existing project's debug signing certificate for direct
installation. A Play Store release needs a dedicated release signing setup.
MongoDB credentials stay on the backend and are not bundled in the APK.

Google sign-in uses the Android native account flow. Its package and signing
certificate must be registered in Google Cloud; see [Google sign-in setup](GOOGLE-SIGN-IN.md).
# Notification and staff-selection update

The version code 4 build includes the notification inbox and active staff picker. Deploy the changed backend to Render for the new staff directory. Closed-app push delivery also needs Firebase configuration and a subsequent rebuild; see [PUSH-NOTIFICATIONS.md](PUSH-NOTIFICATIONS.md).
