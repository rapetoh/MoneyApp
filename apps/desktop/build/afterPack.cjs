/**
 * electron-builder afterPack hook.
 *
 * v1 ships unsigned (no Developer ID), but macOS will refuse to launch a
 * .app whose bundle has a partial signature. We deep ad-hoc-sign the
 * staged bundle before electron-builder wraps it into a DMG so the
 * launch path stays intact.
 *
 * Once a Developer ID Application certificate is wired up, set the
 * standard electron-builder env vars (CSC_LINK / CSC_KEY_PASSWORD or a
 * keychain identity) and remove this hook — real code signing replaces
 * the ad-hoc one.
 */
const { execFileSync } = require('node:child_process')

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appPath = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`
  console.log(`  • [afterPack] ad-hoc signing ${appPath}`)
  try {
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
      stdio: ['ignore', 'inherit', 'inherit'],
    })
    execFileSync('codesign', ['--verify', '--deep', appPath], {
      stdio: ['ignore', 'inherit', 'inherit'],
    })
    console.log('  • [afterPack] ad-hoc signature valid')
  } catch (err) {
    console.error('  • [afterPack] ad-hoc sign FAILED', err)
    throw err
  }
}
