// Xcode 27 refuses IPHONEOS_DEPLOYMENT_TARGET below 15.0, and several
// pods (AppAuth, SDWebImage, GoogleSignIn, GTM*, RevenueCat, RNSVG
// resource bundles) still declare 9.0-13.0. This plugin injects a
// post_install clamp into the PREBUILD-GENERATED Podfile (the workflow
// is managed, so editing a local ios/Podfile does nothing: EAS
// regenerates it every build). Added Sep 3 2026 for the App Store
// submission fix (ITMS-90111 forced the Xcode 27 toolchain).
const { withDangerousMod } = require('expo/config-plugins')
const fs = require('fs')
const path = require('path')

const CLAMP = `
    # withPodTargetFloor: Xcode 27 minimum deployment target clamp
    installer.pods_project.targets.each do |t|
      t.build_configurations.each do |c|
        if c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f < 15.1
          c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'
        end
      end
    end
`

module.exports = function withPodTargetFloor(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile')
      let s = fs.readFileSync(podfile, 'utf8')
      if (!s.includes('withPodTargetFloor')) {
        const anchor = s.match(/react_native_post_install\([\s\S]*?\)\n/)
        if (!anchor) throw new Error('withPodTargetFloor: react_native_post_install not found in Podfile')
        s = s.replace(anchor[0], anchor[0] + CLAMP)
        fs.writeFileSync(podfile, s)
      }
      return cfg
    },
  ])
}
