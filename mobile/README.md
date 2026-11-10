# Acadia Learning Mobile App

AI-powered homework help and tutoring for students, designed with parents in mind.

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app) and configured with EAS Build and EAS Update for production deployment to iOS App Store and Google Play Store.

## Quick Start

### Development Setup

1. **Install dependencies**

   ```bash
   yarn install
   ```

2. **Start the development server**

   ```bash
   yarn start
   ```

3. **Run on a platform**

   ```bash
   yarn ios       # Run on iOS simulator
   yarn android   # Run on Android emulator
   yarn web       # Run in web browser
   ```

### Project Structure

```
mobile/
├── app/                    # App screens (file-based routing)
│   ├── (tabs)/            # Tab navigation screens
│   ├── login.tsx          # Login screen
│   ├── onboarding.tsx     # Onboarding flow
│   └── _layout.tsx        # Root layout
├── components/            # Reusable components
│   └── ui/               # UI component library
├── stores/               # Zustand state management
├── assets/               # Images, fonts, etc.
├── store-listing/        # App store submission materials
└── types/                # TypeScript type definitions
```

## App Information

**App Name:** Acadia Learning  
**Bundle ID (iOS):** com.acadialearning.mobile  
**Package (Android):** com.acadialearning.mobile  
**Version:** 1.0.0  
**Deep Link Scheme:** `acadialearning://`

**Website:** https://acadialearning.org  
**Support Email:** info@acadialearning.org  
**Copyright:** © 2025 Orin Labs Inc.

## EAS Build & Deploy

This project is configured with EAS (Expo Application Services) for building and deploying:

### Build Commands

```bash
# Development builds (with debugging)
yarn build:development              # Build for both platforms
yarn build:development --platform ios
yarn build:development --platform android

# Preview builds (internal testing)
yarn build:preview                  # Build for both platforms
yarn build:preview --platform ios
yarn build:preview --platform android

# Production builds (app stores)
yarn build:production              # Build for both platforms
yarn build:production --platform ios
yarn build:production --platform android
```

### Submit to App Stores

```bash
# Submit production builds
yarn submit:production              # Submit to both stores
yarn submit:production --platform ios
yarn submit:production --platform android
```

### Build Profiles & Environments

The app uses different environment configurations for each build profile:

| Profile       | API URL                                | Environment | Use Case         |
| ------------- | -------------------------------------- | ----------- | ---------------- |
| `development` | http://localhost:8000                  | development | Local testing    |
| `preview`     | https://staging-api.acadialearning.org | staging     | Internal testing |
| `production`  | https://api.acadialearning.org         | production  | App stores       |

Configuration is managed in `eas.json`. Secrets and API keys should be set using:

```bash
eas secret:create --scope project --name SECRET_NAME --value SECRET_VALUE
```

### First Time Setup

Before you can build with EAS:

1. **Create an Expo account** at [expo.dev](https://expo.dev)

2. **Login to EAS CLI:**

   ```bash
   npx eas login
   ```

3. **Configure credentials:**

   ```bash
   npx eas credentials
   ```

4. **Set up environment variables** (see `env-template.txt`)

## App Store Submission

Ready to publish? See the comprehensive guides in the `store-listing/` directory:

- **[SUBMISSION_CHECKLIST.md](./store-listing/SUBMISSION_CHECKLIST.md)** - Complete checklist for submission
- **[ios-app-store.md](./store-listing/ios-app-store.md)** - iOS App Store listing content
- **[google-play-store.md](./store-listing/google-play-store.md)** - Google Play Store listing content
- **[ASSETS_GUIDE.md](./store-listing/ASSETS_GUIDE.md)** - Required assets and specifications

### Quick Submission Overview

1. ✅ Update `app.json` with production metadata (DONE)
2. ✅ Configure `eas.json` with environment settings (DONE)
3. ⚠️ Create required assets (icon, screenshots, etc.) - See ASSETS_GUIDE.md
4. ⚠️ Set up Apple Developer & Google Play accounts
5. ⚠️ Add privacy policy URL
6. Build for production
7. Submit to stores

See `SUBMISSION_CHECKLIST.md` for the complete checklist.

## Development

### File-Based Routing

This project uses [Expo Router](https://docs.expo.dev/router/introduction/) for file-based routing:

```
app/
  (tabs)/          → Tab navigator
    home.tsx       → / (home tab)
    settings.tsx   → /settings (settings tab)
  login.tsx        → /login
  onboarding.tsx   → /onboarding
```

### State Management

We use [Zustand](https://github.com/pmndrs/zustand) for state management:

- `stores/auth.store.ts` - Authentication state
- `stores/account.store.ts` - User account state

### API Integration

API calls use `openapi-fetch` with TypeScript types generated from the Django backend:

```typescript
import { client } from "@/types/api";

const { data, error } = await client.GET("/api/accounts/me/");
```

### UI Components

Custom UI components are in `components/ui/` and follow a consistent design system.

## Testing

### Local Testing

```bash
# Run on iOS simulator
yarn ios

# Run on Android emulator
yarn android

# Test specific build
npx expo start --dev-client
```

### Beta Testing

Use EAS Update to send over-the-air updates to testers:

```bash
# Publish update to preview channel
npx eas update --branch preview --message "Beta update"

# Publish to production channel
npx eas update --branch production --message "Production hotfix"
```

## Useful Commands

```bash
# Check build status
npx eas build:list

# View specific build
npx eas build:view [BUILD_ID]

# Cancel a build
npx eas build:cancel [BUILD_ID]

# Manage credentials
npx eas credentials

# View submission status
npx eas submit:list

# Check for issues
yarn lint
```

## Environment Variables

Environment variables are configured per build profile in `eas.json`. See `env-template.txt` for available variables.

For local development, you can create a `.env.local` file (gitignored):

```bash
API_URL=http://localhost:8000
ENVIRONMENT=development
```

## Assets

App assets are located in `assets/images/`:

- `icon.png` - App icon (1024x1024)
- `splash-icon.png` - Splash screen icon
- `android-icon-*.png` - Android adaptive icons
- `favicon.png` - Web favicon
- `logo-*.png` - Logo variants

See `ASSETS_GUIDE.md` for complete specifications.

## Troubleshooting

### Build Failures

```bash
# Clear EAS cache
npx eas build --clear-cache

# Check build logs
npx eas build:view [BUILD_ID]
```

### Development Issues

```bash
# Clear Metro bundler cache
npx expo start --clear

# Reset project
rm -rf node_modules && yarn install
```

### Platform-Specific Issues

**iOS:**

- Ensure Xcode is up to date
- Check provisioning profiles in EAS credentials

**Android:**

- Check Java version (JDK 17 required)
- Verify Android SDK installation

## Resources

### Expo Documentation

- [Expo Docs](https://docs.expo.dev/)
- [EAS Build](https://docs.expo.dev/build/introduction/)
- [EAS Submit](https://docs.expo.dev/submit/introduction/)
- [Expo Router](https://docs.expo.dev/router/introduction/)

### App Store Guidelines

- [iOS App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play Policy](https://play.google.com/about/developer-content-policy/)

### Design Resources

- [iOS Design Resources](https://developer.apple.com/design/resources/)
- [Material Design (Android)](https://material.io/design)

## Support

**Technical Support:** info@acadialearning.org  
**Website:** https://acadialearning.org

## License

Copyright © 2025 Orin Labs Inc. All rights reserved.
