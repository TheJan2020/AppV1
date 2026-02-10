import { Modal, View, Text, StyleSheet, TouchableOpacity, Dimensions, Image, ScrollView, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { X } from 'lucide-react-native';
import { useState, useEffect, useMemo, useRef } from 'react';
import { Video } from 'expo-av';
import FrigateTimeline from './FrigateTimeline';
import FrigateScrubber from './FrigateScrubber';
import { Play, Calendar, Video as VideoIcon, Radio } from 'lucide-react-native';

const { width, height } = Dimensions.get('window');

// Get backend URL from environment variable (remove trailing slash to prevent double slashes)
const BACKEND_URL = process.env.EXPO_PUBLIC_ADMIN_URL?.replace('/api/config', '').replace(/\/$/, '');

const LiveStream = ({ service, cameraName, isMuted, onToggleMute }) => {
    const webViewRef = useRef(null);

    if (!service || !cameraName) {
        return (
            <View style={[styles.cameraFeed, { justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ color: 'rgba(255,255,255,0.6)' }}>Loading camera...</Text>
            </View>
        );
    }

    const streamUrl = service.getStreamUrl(cameraName);
    const audioUrl = service.getAudioUrl?.(cameraName); // Get audio stream if available

    // Inject JavaScript to control audio
    const injectedJavaScript = `
        (function() {
            const audio = document.getElementById('audioStream');
            if (audio) {
                audio.volume = 1.0;
                audio.play().catch(e => console.log('Audio autoplay failed:', e));
            }
        })();
        true;
    `;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
          <style>
            body {
              margin: 0;
              padding: 0;
              background: black;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              overflow: hidden;
            }
            img {
              width: 100%;
              height: 100%;
              object-fit: contain;
            }
          </style>
        </head>
        <body>
          <img src="${streamUrl}" alt="Live Stream" />
          ${audioUrl ? `<audio id="audioStream" src="${audioUrl}" autoplay loop ${isMuted ? 'muted' : ''}></audio>` : ''}
        </body>
      </html>
    `;

    // Handle mute toggle by injecting JavaScript
    useEffect(() => {
        if (webViewRef.current && audioUrl) {
            const muteScript = `
                const audio = document.getElementById('audioStream');
                if (audio) {
                    audio.muted = ${isMuted};
                }
                true;
            `;
            webViewRef.current.injectJavaScript(muteScript);
        }
    }, [isMuted, audioUrl]);

    return (
        <View style={styles.cameraFeed}>
            <WebView
                ref={webViewRef}
                source={{ html: htmlContent }}
                style={{ flex: 1, backgroundColor: 'black' }}
                scrollEnabled={false}
                allowsInlineMediaPlayback={true}
                mediaPlaybackRequiresUserAction={false}
                originWhitelist={['*']}
                scalesPageToFit={true}
                injectedJavaScript={injectedJavaScript}
                javaScriptEnabled={true}
            />
            {audioUrl && (
                <TouchableOpacity
                    style={styles.muteButton}
                    onPress={onToggleMute}
                >
                    <Text style={styles.muteButtonText}>
                        {isMuted ? '🔇' : '🔊'}
                    </Text>
                </TouchableOpacity>
            )}
        </View>
    );
};



export default function FrigateCameraModal({ visible, camera, service, initialView = 'live', onClose }) {
    // ✅ hooks ALWAYS run
    const [events, setEvents] = useState([]);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [videoDuration, setVideoDuration] = useState(null);
    const [loadingEvents, setLoadingEvents] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [selectedLabel, setSelectedLabel] = useState(null);
    const [availableLabels, setAvailableLabels] = useState([]);
    const [hasMore, setHasMore] = useState(true);
    const [videoLoading, setVideoLoading] = useState(false);
    const [isMuted, setIsMuted] = useState(false);

    // Recordings Mode State
    const [viewMode, setViewMode] = useState(initialView); // 'live' | 'events' | 'recordings'
    const [recordingSummary, setRecordingSummary] = useState([]);
    const [playbackUrl, setPlaybackUrl] = useState(null);

    const videoRef = useRef(null);
    const scrollViewRef = useRef(null);

    const ready = !!camera && !!service;

    // Update viewMode if initialView changes
    useEffect(() => {
        if (visible) {
            setViewMode(initialView === 'history' ? 'events' : initialView);
        }
    }, [visible, initialView]);

    // Fetch available labels from Frigate config
    useEffect(() => {
        if (!ready) return;
        const fetchLabels = async () => {
            try {
                const config = await service.getConfig();
                if (config?.objects?.track) {
                    setAvailableLabels(config.objects.track);
                }
            } catch (e) {
                console.error('Failed to fetch labels:', e);
            }
        };
        fetchLabels();
    }, [ready, service]);

    // Fetch Recording Summary when switching to 'recordings'
    useEffect(() => {
        if (visible && viewMode === 'recordings' && ready) {
            const loadSummary = async () => {
                const summary = await service.getRecordingSummary(camera.name);
                setRecordingSummary(summary);
            };
            loadSummary();
        }
    }, [visible, viewMode, ready, camera?.name]);

    // Construct Playback URL when a time is selected
    const handleScrub = (timestamp) => {
        if (!ready) return;
        // Play 1 hour clip from selected time
        // API requires integer timestamps
        const start = Math.floor(timestamp);
        const end = start + 3600; // 1 hour
        const url = service.getVodUrl(camera.name, start, end);
        console.log('[Modal] Playing VOD:', url);
        setPlaybackUrl(url);
    };

    // Auto-scroll to history if initialView is history (mapped to events)
    useEffect(() => {
        if (visible && viewMode === 'events' && scrollViewRef.current && events.length > 0) {
            // Wait for render
            setTimeout(() => {
                try {
                    // SectionList scrollToEnd
                    scrollViewRef.current.scrollToLocation({ sectionIndex: 0, itemIndex: 0, animated: true });
                } catch (e) {
                    console.log('Scroll failed:', e);
                }
            }, 800);
        }
    }, [visible, viewMode, events.length]);

    const fetchEvents = async (loadMore = false) => {
        if (!ready) return;
        try {
            if (loadMore) {
                setLoadingMore(true);
            } else {
                setLoadingEvents(true);
            }

            const options = {
                camera: camera.name,
                limit: 20,
                has_snapshot: 1
            };

            if (selectedLabel) {
                options.label = selectedLabel;
            }

            if (loadMore && events.length > 0) {
                // Use the last event's start_time. Frigate API uses float timestamps.
                // Ensure strictly number.
                const lastEventStart = Number(events[events.length - 1].start_time);
                if (!isNaN(lastEventStart)) {
                    options.before = lastEventStart - 0.001; // Slightly before to avoid duplicate
                    console.log('[FrigateModal] Loading more before:', options.before);
                }
            }

            const data = await service.getEvents(options);
            const newEvents = Array.isArray(data) ? data : [];

            if (loadMore) {
                setEvents(prev => [...prev, ...newEvents]);
            } else {
                setEvents(newEvents);
            }

            // Check if there are more events to load
            setHasMore(newEvents.length === options.limit);
        } catch (e) {
            if (!loadMore) {
                setEvents([]);
            }
        } finally {
            setLoadingEvents(false);
            setLoadingMore(false);
        }
    };

    useEffect(() => {
        // Reset when closing or when camera/service changes
        if (!visible || !ready) {
            setEvents([]);
            setSelectedEvent(null);
            setLoadingEvents(false);
            setSelectedLabel(null);
            setHasMore(true);
            setPlaybackUrl(null);
            return;
        }
        if (viewMode === 'events') {
            fetchEvents();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, ready, camera?.name, service?.baseUrl, selectedLabel, viewMode]);



    return (
        <Modal animationType="slide" transparent={true} visible={visible} onRequestClose={onClose}>
            <View style={styles.container}>
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,1.0)' }]} />

                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.title}>{camera?.name ?? 'Camera'}</Text>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <X size={24} color="white" />
                    </TouchableOpacity>
                </View>

                {/* View Mode Toggle */}
                <View style={styles.viewToggleContainer}>
                    <TouchableOpacity
                        style={[styles.viewToggleBtn, viewMode === 'live' && styles.viewToggleBtnActive]}
                        onPress={() => setViewMode('live')}
                    >
                        <Radio size={16} color={viewMode === 'live' ? 'white' : 'rgba(255,255,255,0.5)'} />
                        <Text style={[styles.viewToggleText, viewMode === 'live' && styles.viewToggleTextActive]}>Live</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.viewToggleBtn, viewMode === 'events' && styles.viewToggleBtnActive]}
                        onPress={() => setViewMode('events')}
                    >
                        <Calendar size={16} color={viewMode === 'events' ? 'white' : 'rgba(255,255,255,0.5)'} />
                        <Text style={[styles.viewToggleText, viewMode === 'events' && styles.viewToggleTextActive]}>Events</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.viewToggleBtn, viewMode === 'recordings' && styles.viewToggleBtnActive]}
                        onPress={() => setViewMode('recordings')}
                    >
                        <VideoIcon size={16} color={viewMode === 'recordings' ? 'white' : 'rgba(255,255,255,0.5)'} />
                        <Text style={[styles.viewToggleText, viewMode === 'recordings' && styles.viewToggleTextActive]}>Recs</Text>
                    </TouchableOpacity>
                </View>

                {/* Main Content Area */}
                <View style={{ flex: 1 }}>
                    {viewMode === 'recordings' ? (
                        <View style={styles.recordingsContainer}>
                            {/* Video Player Area */}
                            <View style={styles.recordingPlayerContainer}>
                                {playbackUrl ? (
                                    <Video
                                        source={{ uri: playbackUrl }}
                                        style={styles.recordingVideo}
                                        useNativeControls
                                        resizeMode="contain"
                                        shouldPlay
                                        isLooping={false}
                                    />
                                ) : (
                                    <View style={styles.recordingPlaceholder}>
                                        <Text style={styles.recordingPlaceholderText}>Select a time from the scrubber</Text>
                                    </View>
                                )}
                            </View>

                            {/* Vertical Scrubber */}
                            <FrigateScrubber
                                summary={recordingSummary}
                                onTimeSelect={handleScrub}
                            />
                        </View>
                    ) : (
                        <>
                            {/* Camera View (Live or Event Clip) */}
                            <View style={styles.cameraContainer}>
                                {!ready ? (
                                    <View style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' }}>
                                        <Text style={{ color: 'rgba(255,255,255,0.6)' }}>Connecting…</Text>
                                    </View>
                                ) : selectedEvent && viewMode === 'events' ? (
                                    <View style={{ position: 'relative', flex: 1, width: '100%' }}>
                                        <Video
                                            ref={videoRef}
                                            key={selectedEvent.id} // Force remount on event change for clean state
                                            source={{
                                                uri: `${BACKEND_URL}/api/frigate/events/${selectedEvent.id}/clip`
                                            }}
                                            style={styles.cameraFeed}
                                            useNativeControls
                                            resizeMode="contain"
                                            shouldPlay
                                            isLooping={false}
                                            volume={1.0}
                                            progressUpdateIntervalMillis={500}
                                            onError={(error) => {
                                                console.error('[Video] Error loading event clip:', error);
                                                setVideoLoading(false);
                                            }}
                                            onLoadStart={() => {
                                                setVideoLoading(true);
                                                setVideoDuration(null); // Reset duration when loading starts
                                            }}
                                            onLoad={(status) => {
                                                setVideoLoading(false);
                                                if (status.durationMillis) {
                                                    setVideoDuration(status.durationMillis / 1000);
                                                }
                                            }}
                                            onPlaybackStatusUpdate={(status) => {
                                                if (status.durationMillis && !videoDuration) {
                                                    setVideoDuration(status.durationMillis / 1000);
                                                }
                                            }}
                                        />
                                        {videoLoading && (
                                            <View style={styles.videoLoadingOverlay}>
                                                <ActivityIndicator size="large" color="#ffffff" />
                                                <Text style={styles.videoLoadingText}>Loading video...</Text>
                                            </View>
                                        )}
                                    </View>
                                ) : (
                                    <LiveStream
                                        service={service}
                                        cameraName={camera.name}
                                        isMuted={isMuted}
                                        onToggleMute={() => setIsMuted(!isMuted)}
                                    />
                                )}
                            </View>

                            {/* Video Controls - Outside camera container so they push events down */}
                            {selectedEvent && viewMode === 'events' && (
                                <View style={styles.videoControlsContainer}>
                                    <View style={styles.videoBadges}>
                                        <View style={styles.badge}>
                                            <Text style={styles.badgeText}>
                                                {new Date(selectedEvent.start_time * 1000).toLocaleString('en-US')}
                                            </Text>
                                        </View>
                                        {videoDuration && (
                                            <View style={styles.badge}>
                                                <Text style={styles.badgeText}>
                                                    {Math.floor(videoDuration)}s
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                    <TouchableOpacity
                                        style={styles.returnToLiveBtn}
                                        onPress={() => {
                                            setSelectedEvent(null);
                                            setVideoDuration(null);
                                        }}
                                    >
                                        <Text style={styles.returnToLiveBtnText}>Return to Live</Text>
                                    </TouchableOpacity>
                                </View>
                            )}


                            {/* Recent Events List (Only in Events Mode) */}
                            {viewMode === 'events' && (
                                <View style={styles.eventsContainer}>
                                    <Text style={styles.eventsTitle}>Recent Events</Text>

                                    {/* Filter Chips */}
                                    {availableLabels.length > 0 && (
                                        <ScrollView
                                            horizontal
                                            showsHorizontalScrollIndicator={false}
                                            contentContainerStyle={styles.filterChipsContainer}
                                            style={styles.filterChipsScroll}
                                        >
                                            <TouchableOpacity
                                                style={[styles.filterChip, !selectedLabel && styles.filterChipActive]}
                                                onPress={() => setSelectedLabel(null)}
                                            >
                                                <Text style={[styles.filterChipText, !selectedLabel && styles.filterChipTextActive]}>
                                                    All
                                                </Text>
                                            </TouchableOpacity>
                                            {availableLabels.map((label) => (
                                                <TouchableOpacity
                                                    key={label}
                                                    style={[styles.filterChip, selectedLabel === label && styles.filterChipActive]}
                                                    onPress={() => setSelectedLabel(label)}
                                                >
                                                    <Text style={[styles.filterChipText, selectedLabel === label && styles.filterChipTextActive]}>
                                                        {label.charAt(0).toUpperCase() + label.slice(1)}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </ScrollView>
                                    )}

                                    {loadingEvents && events.length === 0 ? (
                                        <Text style={styles.loadingText}>Loading events...</Text>
                                    ) : events.length === 0 ? (
                                        <Text style={styles.noEventsText}>
                                            {selectedLabel ? `No ${selectedLabel} events found` : 'No recent events'}
                                        </Text>
                                    ) : (
                                        <FrigateTimeline
                                            events={events}
                                            onEventPress={(event) => {
                                                console.log('[Modal] Event selected:', event.id);
                                                setVideoDuration(null);
                                                setVideoLoading(true);
                                                setSelectedEvent(event);
                                            }}
                                            onLoadMore={() => fetchEvents(true)}
                                            hasMore={hasMore}
                                            loadingMore={loadingMore}
                                            selectedEventId={selectedEvent?.id}
                                            listRef={scrollViewRef}
                                        />
                                    )}
                                </View>
                            )}
                        </>
                    )}
                </View>
            </View>

        </Modal >
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: 50,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    title: {
        color: 'white',
        fontSize: 20,
        fontWeight: 'bold',
    },
    closeBtn: {
        padding: 8,
    },
    cameraContainer: {
        width: '100%',
        aspectRatio: 16 / 9,
        backgroundColor: 'black',
        marginBottom: 20,
    },
    cameraFeed: {
        flex: 1,
        width: '100%',
    },
    videoControlsContainer: {
        paddingHorizontal: 20,
        paddingVertical: 15,
        backgroundColor: 'rgba(0,0,0,0.8)',
        gap: 12,
    },
    videoBadges: {
        flexDirection: 'row',
        gap: 10,
    },
    badge: {
        backgroundColor: 'rgba(255,255,255,0.15)',
        paddingHorizontal: 14, // Increased padding
        paddingVertical: 12, // Increased height
        borderRadius: 12,
        minHeight: 40, // Increased height (~10%)
        justifyContent: 'center'
    },
    badgeText: {
        color: 'white',
        fontSize: 8, // Drastically smaller
        fontWeight: '600',
    },
    returnToLiveBtn: {
        backgroundColor: 'rgba(255,0,0,0.8)',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    returnToLiveBtnText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 14,
    },
    scrollContainer: {
        paddingHorizontal: 20,
        paddingBottom: 40,
    },
    videoLoadingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 999,
        gap: 15,
    },
    videoLoadingText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },
    muteButton: {
        position: 'absolute',
        bottom: 20,
        right: 20,
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    muteButtonText: {
        fontSize: 24,
    },

    eventsContainer: {
        flex: 1, // Take remaining space
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    eventsTitle: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 10,
        marginLeft: 20,
        marginTop: 10
    },
    filterChipsScroll: {
        marginBottom: 20, // Increased spacing
    },
    filterChipsContainer: {
        gap: 8,
        paddingHorizontal: 20,
        paddingVertical: 5 // Add padding to prevent clipping
    },
    filterChip: {
        paddingHorizontal: 16,
        paddingVertical: 10, // Increased vertical padding
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: 34 // Ensure minimum height
    },
    filterChipActive: {
        backgroundColor: 'rgba(59,130,246,0.8)',
        borderColor: 'rgba(59,130,246,1)',
    },
    filterChipText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 11, // Reduced by ~20%
        fontWeight: '600',
    },
    filterChipTextActive: {
        color: 'white',
    },
    loadingText: {
        color: 'rgba(255,255,255,0.6)',
        textAlign: 'center',
        paddingVertical: 20,
    },
    noEventsText: {
        color: 'rgba(255,255,255,0.4)',
        textAlign: 'center',
        paddingVertical: 20,
    },
    // View Toggle Styles
    viewToggleContainer: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        paddingBottom: 15,
        gap: 10
    },
    viewToggleBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.1)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        gap: 6
    },
    viewToggleBtnActive: {
        backgroundColor: '#3b82f6',
    },
    viewToggleText: {
        color: 'rgba(255,255,255,0.5)',
        fontWeight: '600',
        fontSize: 14
    },
    viewToggleTextActive: {
        color: 'white'
    },
    // Recordings View Styles
    recordingsContainer: {
        flex: 1,
        flexDirection: 'row',
        backgroundColor: 'black'
    },
    recordingPlayerContainer: {
        flex: 1,
        backgroundColor: 'black',
        justifyContent: 'center'
    },
    recordingVideo: {
        width: '100%',
        height: '100%',
    },
    recordingPlaceholder: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center'
    },
    recordingPlaceholderText: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 14
    }
});
