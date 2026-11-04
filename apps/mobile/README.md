# LearnQuiz Android releases

Run these commands from `apps/mobile` after `pnpm install --frozen-lockfile` at
the repository root, using Node 24.21.0 and pnpm 12.14.0. EAS project:
`@cristianuibar/learnquiz` (`580a4fa9-148e-4503-a37e-1e630a9e249a`).

## First build with OTA support

After this change merges, create and install a new preview APK once:

```sh
eas build --platform android --profile preview
```

Older APKs do not contain `expo-updates` and cannot receive these updates.
The preview profile uses the `preview` channel and EAS environment. Production
uses `production`; the development client uses `development`. Test OTA delivery
on an installed preview release APK, not Expo Go or a development session.

## Publish a JavaScript change

For JS/TS, styles, and bundled asset changes that leave the native fingerprint
unchanged, publish to the installed preview APK's channel:

```sh
eas update --platform android --channel preview --environment preview --message "<what>"
```

The config defaults to this project's public EAS ID before the CLI downloads any
environment variables; `EAS_PROJECT_ID` can override it for another project.
The environment supplies `EXPO_PUBLIC_API_URL`. Use the same environment and native
inputs as the build. For a production release, replace
both occurrences of `preview` with `production` after validating in preview.
Updates are checked on launch by default. A downloaded update normally runs on
the next cold launch; reopen the app after the download has completed. There is
no in-app update prompt.

## Facebook sign-in

The sign-in and invitation screens show **Continue with Facebook** only when
`GET /api/v1/auth/capabilities` reports it enabled. Both `FACEBOOK_APP_ID` and
`FACEBOOK_APP_SECRET` must be configured on the web Worker.

The existing React Native Linking API opens the system browser. Better Auth uses
its registered `https://app.learnquiz.com/api/auth/callback/facebook` callback,
then redirects to `learnquiz://sign-in` with a one-time code. The app exchanges
that code plus a per-attempt secret from SecureStore for a bearer, persisted with
the same session rules as email login. No session token is placed in a URL.
Browser attempts expire after five minutes; exchange codes expire after one
minute and are consumed atomically. The server uses the existing verification
table, so no database migration is needed. Invitation acceptance and disclosure
follow the email flow, including after the browser restarts the app.

Deploy the web endpoints before publishing the mobile update. This implementation
adds no native module or native configuration; the Android fingerprint remains
`b9c7db54112d4207fce7a344f1732cb72c6e009f`, so the matching preview APK can use OTA.
Check the fingerprint again for any later bundled changes.

Automated tests mock Facebook, including the real Better Auth callback. Meta's
Development mode permits only accounts with a role on the Meta app. A device
smoke test with such an account remains an owner release check; never put real
Facebook credentials into tests.

## Firebase is required only for native builds

`GOOGLE_SERVICES_JSON` is an EAS **secret file** variable: on the build server it
is a path to the supplied file. `eas update --environment preview` cannot download
secret variables. Neither local build metadata nor OTA publishing needs this file:
`fingerprint.config.js` excludes exactly the configured Firebase client file from
compatibility hashing, resolving its path dynamically even when EAS uses an
extensionless `eas-environment-secrets/<hex>` filename. Its presence, path, and bytes
therefore do not split the local and builder runtimes. Other native inputs remain
fingerprinted.

Native prebuild still reads `GOOGLE_SERVICES_JSON` and copies the file to
`android/app/google-services.json`, with the Google Services Gradle plugin enabled
for FCM. A gitignored local `apps/mobile/google-services.json` remains a fallback
for local native builds. Do not commit the file. Firebase client settings do not
change JS/native compatibility, but changing the baked-in Firebase settings still
requires rebuilding to apply those settings to the app.

## When to rebuild

`runtimeVersion: { policy: 'fingerprint' }` derives compatibility from the native
dependencies and config, excluding the Firebase client file. It works in this pnpm
monorepo and repeated runs on the same inputs produce the same hash. A native
dependency/SDK upgrade, config plugin or permission change, Firebase configuration
change, or any other fingerprint change requires another build and installation.
`apps/mobile/eas.json` and other native config are fingerprint sources: editing
build profiles, channels, or native configuration means rebuilding too:

```sh
eas build --platform android --profile preview
```

Updates only reach builds with a matching platform, channel, and runtime. Do not
force an old runtime onto a native change. A changed fingerprint is the signal to
rebuild even if the change initially appeared to be JS-only.

To inspect the candidate Android fingerprint with the same environment as the build:

```sh
eas env:exec preview 'npx expo-updates fingerprint:generate --platform android'
```

`env:exec` does not download secret file variables, and no Firebase file is needed
for this calculation. Compare the `hash` with the runtime embedded in the target
APK. Keep other environment-dependent native inputs consistent with that build.

## Check an installed APK's channel and runtime

The runtime embedded in the **installed APK is the ground truth**. EAS build
details help locate the artifact, but do not substitute a locally calculated
runtime or an unrelated build's metadata for the installed binary's value.
Find the corresponding build on the EAS dashboard, or run:

```sh
eas build:list --platform android --profile preview
eas build:view <build-id>
```

The build ID must be the APK actually installed on the device. Compare the
embedded runtime below with the update details printed by `eas update` /
`eas update:view <group-id>`.

To check the installed artifact directly with Android SDK tools:

```sh
adb shell pm path com.learnquiz.app
# Copy the base.apk path printed above (omit the "package:" prefix):
adb pull <base.apk-path> ./learnquiz-installed.apk
apkanalyzer manifest print ./learnquiz-installed.apk
```

In the manifest metadata, `expo.modules.updates.UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY`
contains `expo-channel-name` (for example, `preview`), and
`expo.modules.updates.EXPO_RUNTIME_VERSION` names the runtime. With the fingerprint
policy it refers to `@string/expo_runtime_version`, whose value is the placeholder
`file:fingerprint`. expo-updates then reads the real runtime from the APK asset
`assets/fingerprint`, which the build writes. Print that hash with:

```sh
unzip -p ./learnquiz-installed.apk assets/fingerprint; echo
```

It must equal the runtime version that `eas update` prints. If the string resource
is anything other than `file:fingerprint`, that string is the runtime:

```sh
apkanalyzer resources value --config default --type string --name expo_runtime_version ./learnquiz-installed.apk
```

These embedded values identify the installed binary even after it has received
an OTA update. Existing APKs without this metadata need the first native build.
