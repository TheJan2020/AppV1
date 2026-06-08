import { memo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import { CF } from '../../utils/typography';
import CameraSensorOverlay, { resolveSensorIds } from './CameraSensorOverlay';

// Injected JS: detects video/stream errors inside the WebView page and posts messages back
const INJECTED_JS = `
  (function() {
    function postMsg(msg) {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(msg);
    }
    function attachVideoListeners(v) {
      if (v._rn_attached) return;
      v._rn_attached = true;
      // Delay stream_ok slightly so error text check runs first
      v.addEventListener('playing', function() {
        setTimeout(function() {
          var text = document.body ? document.body.innerText : '';
          var hasErrText = text.indexOf('check error') !== -1 || text.indexOf('frames have been received') !== -1;
          if (!hasErrText) postMsg('stream_ok');
        }, 800);
      });
      v.addEventListener('error', function() { postMsg('stream_error'); });
      v.addEventListener('stalled', function() {
        setTimeout(function() { if (v.readyState < 3) postMsg('stream_error'); }, 3000);
      });
    }
    function checkErrorText() {
      var text = document.body ? document.body.innerText : '';
      if (text.indexOf('check error') !== -1 || text.indexOf('frames have been received') !== -1) {
        postMsg('stream_error');
      }
    }
    var observer = new MutationObserver(function() {
      document.querySelectorAll('video').forEach(attachVideoListeners);
      checkErrorText();
    });
    function init() {
      document.querySelectorAll('video').forEach(attachVideoListeners);
      if (document.body) observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      checkErrorText();
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
    setInterval(checkErrorText, 2500);
  })();
  true;
`;

const LiveCamera = ({ cam, service, sensorIds = [], entityMap = {} }) => {
    const [hasError, setHasError] = useState(false);
    // Track whether injected JS has ever confirmed a real error on this load.
    // Once an in-page error is detected, onLoad must NOT clear it — only a
    // genuine 'stream_ok' (video playing) message can clear it.
    const errorConfirmedRef = useState(false);

    const markError = () => {
        errorConfirmedRef[1](true);
        setHasError(true);
    };
    const clearError = () => {
        errorConfirmedRef[1](false);
        setHasError(false);
    };

    if (!service || !cam) {
        return (
            <View style={styles.cameraWrapper}>
                <View style={[styles.imageContainer, { justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Loading...</Text>
                </View>
                <Text style={styles.cameraName}>Camera</Text>
            </View>
        );
    }

    const streamUrl = service.getStreamUrl(cam.name);

    return (
        <View style={styles.cameraWrapper}>
            <View style={styles.imageContainer}>
                <WebView
                    source={{ uri: streamUrl, headers: service?.headers || {} }}
                    style={[StyleSheet.absoluteFill, { backgroundColor: 'black' }]}
                    backgroundColor="black"
                    scrollEnabled={false}
                    allowsInlineMediaPlayback={true}
                    mediaPlaybackRequiresUserAction={false}
                    originWhitelist={['*']}
                    scalesPageToFit={true}
                    injectedJavaScript={INJECTED_JS}
                    onMessage={(e) => {
                        const msg = e.nativeEvent.data;
                        if (msg === 'stream_error') markError();
                        else if (msg === 'stream_ok') clearError();
                    }}
                    onError={() => markError()}
                    onHttpError={() => markError()}
                    onLoadStart={() => clearError()}
                />
                {hasError && (
                    <View style={[StyleSheet.absoluteFill, styles.errorOverlay]}>
                        <Text style={styles.errorIcon}>📵</Text>
                        <Text style={styles.errorText}>Stream unavailable</Text>
                    </View>
                )}
                <CameraSensorOverlay sensorIds={sensorIds} entityMap={entityMap} position="bl" />
            </View>
        </View>
    );
};

function CamerasList({ frigateCameras, service, onCameraPress, columns = 2, cameraSensors = {}, entityMap = {} }) {
    if (!frigateCameras || frigateCameras.length === 0) return null;

    // On tablets (columns > 2), show all cameras in equal-width grid
    // On phones (columns <= 2), keep original layout: first 2 full-width, rest half-width
    const isTabletGrid = columns > 2;
    const tabletWidth = `${Math.floor(100 / columns) - 2}%`;

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Live Feeds</Text>
            <View style={styles.gridContainer}>
                {frigateCameras.map((cam, index) => (
                    <TouchableOpacity
                        key={cam.id}
                        onPress={() => onCameraPress && onCameraPress(cam)}
                        style={[
                            styles.gridItem,
                            isTabletGrid
                                ? { width: tabletWidth }
                                : [
                                    index < 2 && styles.fullWidth,
                                    index >= 2 && styles.halfWidth
                                ]
                        ]}
                    >
                        <LiveCamera
                            cam={cam}
                            service={service}
                            sensorIds={resolveSensorIds(cam, cameraSensors)}
                            entityMap={entityMap}
                        />
                        <View style={styles.cameraNameContainer}>
                            <Text style={styles.cameraName} numberOfLines={1}>
                                {cam.name || 'Camera'}
                            </Text>
                        </View>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 20,
    },
    title: {
        color: 'white',
        fontSize: 16,
        fontFamily: CF.light,
        marginBottom: 10,
        marginLeft: 4,
        letterSpacing: 0.5,
    },
    gridContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    gridItem: {
        marginBottom: 8,
    },
    fullWidth: {
        width: '100%',
    },
    halfWidth: {
        width: '48%', // Approximately 50% minus gap
    },
    cameraWrapper: {
        width: '100%',
    },
    imageContainer: {
        width: '100%',
        aspectRatio: 16 / 9, // Maintain 16:9 aspect ratio
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        marginBottom: 8,
    },
    cameraNameContainer: {
        paddingHorizontal: 4,
    },
    cameraName: {
        color: 'rgba(255, 255, 255, 0.8)',
        fontSize: 13,
        fontWeight: '400',
    },
    liveBadge: {
        position: 'absolute',
        bottom: 8,
        left: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.55)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    liveBadgeError: {
        borderColor: 'rgba(239,83,80,0.4)',
        backgroundColor: 'rgba(239,83,80,0.15)',
    },
    liveDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#4CAF50',
    },
    liveDotError: {
        backgroundColor: '#EF5350',
    },
    liveText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 0.4,
    },
    liveTextError: {
        color: '#EF5350',
    },
    errorOverlay: {
        backgroundColor: '#0d0d1a',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
    },
    errorIcon: {
        fontSize: 28,
        opacity: 0.5,
    },
    errorText: {
        color: 'rgba(255,255,255,0.35)',
        fontSize: 12,
        fontWeight: '400',
    },
});

export default memo(CamerasList);
