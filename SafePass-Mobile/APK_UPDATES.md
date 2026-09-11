# CentrixMobile APK updates

The Android app checks `GET /api/app-updates/android` at startup and when returning to the foreground. It compares Android's numeric `versionCode` with `buildNumber`; display strings do not decide whether an update exists.

Update APKs live in GitHub Releases. Render serves metadata from `backend/config/androidRelease.json`. Network failures leave the app usable. A release with `forceUpdate: true` removes the Later action.

## Prepare and build a release

Run from `SafePass-Mobile`:

```powershell
npm run release:android -- --version 1.02 --note="Improved dashboard UI" --note="Fixed login issue"
```

The command converts `1.02` to build `102`, updates `app.json` and the backend metadata, builds Android, and writes `dist/CentrixMobile.apk`. Add `--force` only for a mandatory update or `--prepare-only` to skip building.

## Publish

1. Create the matching GitHub release tag, such as `v1.02`.
2. Upload `dist/CentrixMobile.apk` with that exact filename.
3. Commit and push the version and metadata changes.
4. Allow Render to deploy the backend commit.
5. Confirm the HTTPS asset URL in `backend/config/androidRelease.json` downloads successfully.

The application ID must remain `com.anonymous.SafePassMobile`, and every update must use the same signing certificate. Current installed builds use tracked `android/app/debug.keystore`, certificate SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`. Changing it requires users to uninstall the old app.

Before broad distribution, plan a one-time move to a securely backed-up production key. After users install a production-key build, never change that key.
