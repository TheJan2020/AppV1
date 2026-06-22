/**
 * Full-screen Frigate event thumbnail viewer (image only — no clip playback).
 */

import { Modal, View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { X } from 'lucide-react-native';
import { CF } from '../../utils/typography';
import { getEventThumbnailUrl } from '../../utils/frigateEvents';

function formatEventTime(unixTs) {
    if (!Number.isFinite(Number(unixTs))) return '';
    const d = new Date(Number(unixTs) * 1000);
    return d.toLocaleString([], {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

export default function FrigateEventImageModal({
    visible,
    event,
    adminUrl,
    authHeaders = {},
    onClose,
}) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    if (!event) return null;

    const thumbUrl = adminUrl ? getEventThumbnailUrl(adminUrl, event.id) : null;

    return (
        <Modal
            visible={visible}
            animationType="fade"
            transparent
            onRequestClose={onClose}
        >
            <View style={styles.backdrop}>
                <View style={styles.header}>
                    <View style={styles.meta}>
                        <Text style={styles.camera} numberOfLines={1}>{event.camera}</Text>
                        <Text style={styles.subtitle}>
                            {(event.label || 'event').toString()} · {formatEventTime(event.start_time)}
                        </Text>
                    </View>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={12}>
                        <X size={22} color="#fff" />
                    </TouchableOpacity>
                </View>

                <View style={styles.imageWrap}>
                    {loading && !error ? (
                        <ActivityIndicator size="large" color="#8947ca" />
                    ) : null}
                    {error ? (
                        <Text style={styles.errorText}>Could not load snapshot</Text>
                    ) : thumbUrl ? (
                        <Image
                            source={{ uri: thumbUrl, headers: authHeaders }}
                            style={styles.image}
                            resizeMode="contain"
                            onLoadStart={() => { setLoading(true); setError(false); }}
                            onLoadEnd={() => setLoading(false)}
                            onError={() => { setLoading(false); setError(true); }}
                        />
                    ) : (
                        <Text style={styles.errorText}>No snapshot available</Text>
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.96)',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 56,
        paddingHorizontal: 16,
        paddingBottom: 12,
    },
    meta: {
        flex: 1,
        paddingRight: 12,
        gap: 2,
    },
    camera: {
        color: '#fff',
        fontSize: 17,
        fontFamily: CF.semibold,
        textTransform: 'capitalize',
    },
    subtitle: {
        color: 'rgba(255,255,255,0.55)',
        fontSize: 13,
        fontFamily: CF.regular,
        textTransform: 'capitalize',
    },
    closeBtn: {
        padding: 8,
    },
    imageWrap: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 12,
        paddingBottom: 32,
    },
    image: {
        width: '100%',
        height: '100%',
    },
    errorText: {
        color: 'rgba(255,255,255,0.45)',
        fontSize: 14,
        fontFamily: CF.regular,
    },
});
