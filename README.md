# Sapphire Centrix SafePass

Sapphire Centrix SafePass is a cross-platform campus access, attendance, and visitor management system developed for **Sapphire International Aviation Academy**. It connects visitors, students, staff, security personnel, and administrators through a shared web and Android platform.

The system combines appointment workflows, identity verification, NFC-enabled access, attendance records, campus monitoring, and notifications in one application.

## Key features

- Role-based dashboards for administrators, staff, security/guards, students, teachers, and visitors
- Visitor registration, appointment requests, approval, rescheduling, check-in, and checkout
- Visitor passes and unique SafePass account IDs
- Physical NFC cards, phone NFC, and virtual NFC credentials
- ESP32/MFRC522 checkpoint integration
- Student, teacher, staff, and visitor attendance tracking
- Access and security logs with entry, exit, granted, and denied events
- Campus maps and active visitor location monitoring
- Email verification, phone OTP, password recovery, Google sign-in, biometrics, and passkeys
- In-app notifications and optional Android push notifications
- Reports, CSV export, printing, account management, and system settings
- Full institutional application and visitor-only build variants

## Technology stack

| Layer | Technologies |
| --- | --- |
| Client | React 19, React Native, Expo 55, React Navigation |
| Web | React Native Web, Webpack, static Expo export |
| Android | Native Expo/Gradle build, NFC, camera, location, biometrics |
| API | Node.js, Express |
| Database | MongoDB, Mongoose |
| Authentication | JWT, bcrypt, OTP, Google Sign-In, WebAuthn |
| Notifications | In-app inbox, Expo Push Notifications, FCM |
| Hardware | ESP32 with MFRC522 RFID/NFC reader |

## Repository structure

```text
SafePass/
├── SafePass-Mobile/
│   ├── App.js                 # Application entry point and navigation
│   ├── screens/               # Role-based screens and workflows
│   ├── components/            # Shared UI components
│   ├── contexts/              # Application contexts
│   ├── styles/                # Shared and screen-specific styles
│   ├── utils/                 # API, authentication, NFC, and other utilities
│   ├── backend/               # Express API and MongoDB models
│   ├── android/               # Native Android project
│   ├── arduino/               # ESP32/MFRC522 checkpoint firmware
│   ├── scripts/               # Build and regression-test scripts
│   └── dist/                  # Generated distributable APKs
└── README.md
```

## Prerequisites

Install the following before running the project locally:

- Node.js and npm
- MongoDB, either locally or through MongoDB Atlas
- Android Studio, Android SDK, and Java for native Android builds
- Expo-compatible Android device or emulator for mobile development

## Installation

Clone the repository, then install the client and backend dependencies:

```powershell
cd SafePass-Mobile
npm install

cd backend
npm install
```

Create the backend environment file from the included example:

```powershell
Copy-Item .env.example .env
```

At minimum, configure these values in `SafePass-Mobile/backend/.env`:

```dotenv
MONGODB_URI=mongodb://localhost:27017/sapphire_aviation
JWT_SECRET=replace-with-a-long-random-secret
FRONTEND_URL=http://localhost:19006
```

Never commit real database credentials, JWT secrets, mail passwords, API keys, Firebase service-account keys, or other private credentials.

## Running locally

Start the backend API:

```powershell
cd SafePass-Mobile/backend
npm run dev
```

By default, the API is available at `http://localhost:5000/api`.

In another terminal, start the Expo client with the local API URL:

```powershell
cd SafePass-Mobile
$env:EXPO_PUBLIC_API_BASE_URL = "http://localhost:5000/api"
npm start
```

You can also launch a specific target:

```powershell
npm run android
npm run web
npm run web:visitor
```

When testing on a physical phone, replace `localhost` with the development computer's LAN IP address and ensure both devices are on the same network.

## Application variants

SafePass supports two build variants:

- `full` — the complete role-based institutional application
- `visitor` — a dedicated visitor portal with a separate Android package

Set `EXPO_PUBLIC_APP_VARIANT` to select a variant during development. If omitted, the application uses the full variant.

## Testing

Run the backend test suite:

```powershell
cd SafePass-Mobile/backend
npm test
```

Run the client regression tests from `SafePass-Mobile`:

```powershell
node --test scripts/tests/*.test.cjs
```

The automated tests use mocks and fixtures. They do not validate live credentials, real notification delivery, or physical NFC hardware.

## Building the Android APK

The production build script creates a release APK connected to the configured live API. On Windows, run it from the repository root using a short mapped path to avoid native compiler path-length issues:

```powershell
subst S: "$PWD"
powershell -NoProfile -ExecutionPolicy Bypass -File S:\SafePass-Mobile\scripts\buildProductionApk.ps1
subst S: /D
```

The generated full application is written to:

```text
SafePass-Mobile/dist/CentrixMobile.apk
```

Build the visitor-only application with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File S:\SafePass-Mobile\scripts\buildProductionApk.ps1 -Variant visitor
```

The current Android configuration uses version name `1.0.0`, version code `4`, a minimum SDK level of 24 (Android 7.0), and target SDK level 36.

The direct-install APK currently uses the existing project signing certificate. Configure dedicated release signing before publishing through Google Play.

## External service configuration

Some integrations require credentials that are intentionally excluded from the repository:

- **MongoDB:** Set `MONGODB_URI` on the backend.
- **Email:** Configure the `MAIL_*` environment variables for verification and password recovery.
- **SMS OTP:** Configure iProgTech, Twilio, or Semaphore using the variables in `.env.example`.
- **Google Sign-In:** Register the Android package and signing certificate in Google Cloud and keep the backend client ID aligned.
- **Push notifications:** Add `android/app/google-services.json`, configure FCM credentials in Expo/EAS, and deploy the notification worker-enabled backend.
- **ID OCR:** Set `OCR_SPACE_API_KEY`; enable strict validation with `REQUIRE_OCR_ID_VALIDATION=true` if required.
- **NFC checkpoint hardware:** Set `ARDUINO_DEVICE_KEY` on the backend and configure the matching ESP32 firmware.

See the project guides for detailed setup:

- [Android APK guide](SafePass-Mobile/ANDROID-APK.md)
- [Google Sign-In setup](SafePass-Mobile/GOOGLE-SIGN-IN.md)
- [Push notification setup](SafePass-Mobile/PUSH-NOTIFICATIONS.md)
- [ESP32/MFRC522 setup](SafePass-Mobile/arduino/README.md)

## Security notes

- API access is protected with JWT authentication and role-based middleware.
- Passwords are hashed before storage.
- Sensitive production configuration belongs in environment variables, not client code.
- Use a separate local test database for development and automated seeding.
- The seed script intentionally refuses to run against production, remote, or unapproved databases.
- Review CORS origins, rate limits, signing credentials, and secrets before production deployment.

## Current status

The full Android version 4 build includes the shared notification inbox and active staff selection. The application can operate without Firebase for foreground and in-app notifications, but closed-app Android push delivery requires Firebase/FCM configuration and a new build.

Deployment and end-to-end checks should include successful authentication, live appointment approval, OTP delivery, Google Sign-In, background notifications, and physical NFC checkpoint tests.

