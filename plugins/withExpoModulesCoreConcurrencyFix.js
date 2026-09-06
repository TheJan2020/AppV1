const { withPodfile } = require('@expo/config-plugins');

const MARKER = 'ExpoModulesCore Xcode 26 concurrency workaround';

const SNIPPET = `
    # ${MARKER}
    # Expo SDK 57 compiles ExpoModulesCore as Swift 6. Xcode 26.1–26.3 then fails with
    # "Sending 'emitter' risks causing data races" in EventEmitter.swift.
    installer.pods_project.targets.each do |target|
      next unless ['ExpoModulesCore', 'ExpoModulesJSI'].include?(target.name)
      target.build_configurations.each do |config|
        config.build_settings['SWIFT_STRICT_CONCURRENCY'] = 'minimal'
        config.build_settings['OTHER_SWIFT_FLAGS'] = "$(inherited) -strict-concurrency=minimal"
      end
    end
`;

module.exports = function withExpoModulesCoreConcurrencyFix(config) {
  return withPodfile(config, (mod) => {
    if (mod.modResults.contents.includes(MARKER)) {
      return mod;
    }
    if (!mod.modResults.contents.includes('post_install do |installer|')) {
      throw new Error('Primewave Podfile is missing post_install; cannot apply ExpoModulesCore concurrency fix');
    }
    mod.modResults.contents = mod.modResults.contents.replace(
      /post_install do \|installer\|/,
      `post_install do |installer|${SNIPPET}`,
    );
    return mod;
  });
};
