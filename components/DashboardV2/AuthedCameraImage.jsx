import { Image } from 'expo-image';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { downloadAuthedImageToCache, downloadLiveFrame } from '../../utils/loadAuthedImage';
import * as FileSystem from 'expo-file-system/legacy';

function stableUrl(uri) {
    if (!uri) return '';
    return String(uri).replace(/([?&])t=\d+(&|$)/, (_, sep, end) => (end === '&' ? sep : ''));
}

function StaticAuthedImage({ uri, headers, onError, onLoad, style, contentFit }) {
    const auth = headers?.Authorization || '';
    const [source, setSource] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setSource(null);

        const load = async () => {
            try {
                if (Platform.OS === 'android') {
                    const local = await downloadAuthedImageToCache(uri, headers);
                    if (!cancelled) setSource({ uri: local });
                    return;
                }
                if (!cancelled) setSource({ uri, headers });
            } catch {
                if (!cancelled) onError?.();
            }
        };

        load();
        return () => { cancelled = true; };
    }, [uri, auth]);

    if (!source) {
        return <View style={style || StyleSheet.absoluteFill} />;
    }

    return (
        <Image
            source={source}
            style={style || StyleSheet.absoluteFill}
            contentFit={contentFit}
            cachePolicy="disk"
            transition={0}
            onError={onError}
            onLoad={onLoad}
        />
    );
}

function LiveAuthedImage({
    uri,
    headers,
    onError,
    onLoad,
    style,
    contentFit,
    refreshMs,
}) {
    const [slots, setSlots] = useState(['', '']);
    const [visible, setVisible] = useState(0);
    const visibleRef = useRef(0);
    const loadedRef = useRef(false);
    const filesRef = useRef([]);
    const instanceId = useRef(`c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`).current;
    const auth = headers?.Authorization || '';

    useEffect(() => {
        loadedRef.current = false;
        visibleRef.current = 0;
        setVisible(0);
        setSlots(['', '']);
    }, [uri, auth]);

    useEffect(() => {
        if (!uri) return undefined;
        let cancelled = false;
        let timer = null;

        const forgetFile = (fileUri) => {
            if (!fileUri || !fileUri.startsWith('file')) return;
            FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
        };

        const rememberFile = (fileUri) => {
            if (!fileUri || !fileUri.startsWith('file')) return;
            filesRef.current.push(fileUri);
            while (filesRef.current.length > 2) {
                forgetFile(filesRef.current.shift());
            }
        };

        const pull = async () => {
            if (cancelled) return;
            if (AppState.currentState !== 'active') {
                timer = setTimeout(pull, refreshMs);
                return;
            }

            const started = Date.now();
            try {
                const next = Platform.OS === 'android'
                    ? await downloadLiveFrame(uri, headers, instanceId)
                    : `${uri}${uri.includes('?') ? '&' : '?'}t=${Date.now()}`;
                if (cancelled || !next) return;
                rememberFile(next);
                const slot = loadedRef.current ? 1 - visibleRef.current : visibleRef.current;
                setSlots((prev) => {
                    const copy = [...prev];
                    copy[slot] = next;
                    return copy;
                });
            } catch {
                if (!cancelled && !loadedRef.current) onError?.();
            }

            if (!cancelled) {
                const wait = Math.max(50, refreshMs - (Date.now() - started));
                timer = setTimeout(pull, wait);
            }
        };

        pull();
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
            const leftover = filesRef.current;
            filesRef.current = [];
            leftover.forEach(forgetFile);
        };
    }, [uri, auth, refreshMs]);

    const onSlotLoad = (slot) => {
        visibleRef.current = slot;
        setVisible(slot);
        if (!loadedRef.current) {
            loadedRef.current = true;
            onLoad?.();
        }
    };

    return (
        <View style={style || StyleSheet.absoluteFill} collapsable={false}>
            {slots.map((src, i) => (
                src ? (
                    <Image
                        key={i}
                        source={Platform.OS === 'android' ? { uri: src } : { uri: src, headers }}
                        style={[
                            StyleSheet.absoluteFill,
                            { zIndex: i === visible ? 2 : 1, opacity: 1 },
                        ]}
                        contentFit={contentFit}
                        cachePolicy="none"
                        recyclingKey={src}
                        transition={0}
                        pointerEvents="none"
                        onLoad={() => onSlotLoad(i)}
                    />
                ) : null
            ))}
        </View>
    );
}

/**
 * Authenticated camera JPEG.
 * Live: native file download on Android, cache-busted URL on iOS.
 * Frames swap only after the next one has loaded (no black flash).
 * Static (events): disk cache — never live polling.
 */
export default function AuthedCameraImage({
    uri,
    headers,
    onError,
    onLoad,
    style,
    contentFit = 'cover',
    refreshMs = 0,
}) {
    const baseUri = stableUrl(uri);
    if (!baseUri) return null;

    if (!(refreshMs > 0)) {
        return (
            <StaticAuthedImage
                uri={baseUri}
                headers={headers}
                onError={onError}
                onLoad={onLoad}
                style={style}
                contentFit={contentFit}
            />
        );
    }

    return (
        <LiveAuthedImage
            uri={baseUri}
            headers={headers}
            onError={onError}
            onLoad={onLoad}
            style={style}
            contentFit={contentFit}
            refreshMs={refreshMs}
        />
    );
}
