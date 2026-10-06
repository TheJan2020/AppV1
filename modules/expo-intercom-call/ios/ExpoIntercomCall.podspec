require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ExpoIntercomCall'
  s.version        = package['version']
  s.summary        = 'CallKit + PushKit incoming door calls'
  s.description    = 'Shows a native incoming-call UI on a locked iPhone and wakes the app to answer the door'
  s.license        = 'MIT'
  s.author         = 'Primewave'
  s.homepage       = 'https://primewave.ai'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CallKit', 'PushKit', 'AVFoundation'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,swift}'
end
