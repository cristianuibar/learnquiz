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
eas update --channel preview --environment preview --message "<what>"
```

The environment supplies `EAS_PROJECT_ID` and `EXPO_PUBLIC_API_URL`. Use the same
environment and native inputs as the build. For a production release, replace
both occurrences of `preview` with `production` after validating in preview.
Updates are checked on launch by default. A downloaded update normally runs on
the next cold launch; reopen the app after the download has completed. There is
no in-app update prompt.

### Firebase file when publishing

`GOOGLE_SERVICES_JSON` is an EAS **secret file** variable: on the build server it
is a path to the supplied file. `eas update --environment preview` cannot download
secret variables. Exporting JS without this file works, but publishing that way
would compute a different fingerprint from the Firebase-enabled APK.

Before publishing, securely obtain the **same file contents used by that build**
from the project's Firebase configuration source and place a local copy at
`apps/mobile/google-services.json` (gitignored). The dynamic config falls back to
that file when the builder variable is absent, so the update command above needs
no EAS secret download. Alternatively, set `GOOGLE_SERVICES_JSON` locally to an
absolute path to that copy. Expo hashes the file contents, not its machine-specific
path. Do not commit it or substitute a dummy file. Remove the local copy when done.
If you cannot obtain the matching file, do not publish an update with a different
runtime and expect the installed APK to receive it.

## When to rebuild

`runtimeVersion: { policy: 'fingerprint' }` derives compatibility from the native
dependencies and config, including the Firebase file. It works in this pnpm
monorepo and repeated runs on the same inputs produce the same hash. A native
dependency/SDK upgrade, config plugin or permission change, Firebase configuration
change, or any other fingerprint change requires another build and installation:

```sh
eas build --platform android --profile preview
```

Updates only reach builds with a matching platform, channel, and runtime. Do not
force an old runtime onto a native change. A changed fingerprint is the signal to
rebuild even if the change initially appeared to be JS-only.

To inspect the candidate Android fingerprint with the same environment and
Firebase file as the build:

```sh
eas env:exec preview 'npx expo-updates fingerprint:generate --platform android'
```

Compare its `hash` with the target build's runtime. Do not compare a fingerprint
generated with missing project/environment values or a missing Firebase file.

## Check an installed APK's channel and runtime

Find the corresponding build on the EAS dashboard, or run:

```sh
eas build:list --platform android --profile preview
eas build:view <build-id>
```

Confirm the channel and runtime version in the build details, and compare the
runtime with the update details printed by `eas update` / `eas update:view <group-id>`.
The build ID must be the APK actually installed on the device.

To check the installed artifact directly with Android SDK tools:

```sh
adb shell pm path com.learnquiz.app
# Copy the base.apk path printed above (omit the "package:" prefix):
adb pull <base.apk-path> ./learnquiz-installed.apk
apkanalyzer manifest print ./learnquiz-installed.apk
```

In the manifest metadata, `expo.modules.updates.UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY`
contains `expo-channel-name` (for example, `preview`), and
`expo.modules.updates.EXPO_RUNTIME_VERSION` is the runtime. If the latter refers
to `@string/expo_runtime_version`, resolve it with:

```sh
apkanalyzer resources value --config default --type string --name expo_runtime_version ./learnquiz-installed.apk
```

These embedded values identify the installed binary even after it has received
an OTA update. Existing APKs without this metadata need the first native build.
