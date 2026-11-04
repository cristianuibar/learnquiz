const { relative, resolve, sep } = require('node:path')

// Firebase client settings do not change JS/native compatibility. EAS supplies
// this file only on the builder; including it would give local builds/updates a
// different runtime. Exclude the exact configured path, including extensionless
// eas-environment-secrets/<hex> paths, while leaving prebuild's file copy intact.
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON || './google-services.json'
const googleServicesPath = relative(__dirname, resolve(__dirname, googleServicesFile))
  .split(sep).join('/')

module.exports = {
  // Escape glob syntax so this excludes only the selected file, even if its
  // path contains glob metacharacters. Expo already removes its config path.
  ignorePaths: [googleServicesPath.replace(/[\[\]{}()*?+!@\\]/g, '\\$&')],
}
