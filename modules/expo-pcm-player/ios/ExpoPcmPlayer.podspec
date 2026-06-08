require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ExpoPcmPlayer'
  s.version        = package['version']
  s.summary        = 'PCM audio playback for Butler voice'
  s.description    = 'Streams 16-bit PCM to AVAudioEngine for Gemini Live replies'
  s.license        = 'MIT'
  s.author         = 'Primewave'
  s.homepage       = 'https://primewave.ai'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,swift}'
end
