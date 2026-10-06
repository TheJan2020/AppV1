import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { ChevronLeft, Users } from 'lucide-react-native';
import { getAdminUrl } from '../utils/storage';
import { authFetch } from '../utils/authFetch';
import ActiveUsersHistoryList from '../components/DashboardV2/ActiveUsersHistoryList';
import { CF } from '../utils/typography';

const C_PURPLE = '#8947ca';
const PAGE_SIZE = 20;

export default function ActiveUsersHistoryPage() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [pageLoading, setPageLoading] = useState(false);
    const [error, setError] = useState(null);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [total, setTotal] = useState(0);

    const load = useCallback(async ({ pull, page: nextPage } = {}) => {
        const targetPage = nextPage ?? 1;
        if (pull) setRefreshing(true);
        else if (nextPage) setPageLoading(true);
        else setLoading(true);
        try {
            const adminUrl = await getAdminUrl();
            if (!adminUrl) throw new Error('No home connection');
            const base = adminUrl.endsWith('/') ? adminUrl : `${adminUrl}/`;
            const res = await authFetch(
                `${base}api/sessions?page=${targetPage}&limit=${PAGE_SIZE}&t=${Date.now()}`,
                { timeoutMs: 8000 },
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const resolvedPage = data.page || targetPage;
            const online = resolvedPage === 1 && Array.isArray(data.online) ? data.online : [];
            const recent = Array.isArray(data.recent) ? data.recent : [];
            setSessions([...online, ...recent]);
            setPage(resolvedPage);
            setPages(Math.max(1, data.pages || 1));
            setTotal(typeof data.total === 'number' ? data.total : recent.length);
            setError(null);
        } catch (e) {
            if (e?.name !== 'AbortError') setError('Unable to load session history');
        } finally {
            setLoading(false);
            setRefreshing(false);
            setPageLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, []);

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <LinearGradient colors={['#12122A', '#09091A', '#09091A']} style={StyleSheet.absoluteFill} />
            <StatusBar style="light" />
            <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
                        <ChevronLeft size={22} color="#fff" />
                    </TouchableOpacity>
                    <View style={styles.headerText}>
                        <View style={styles.titleRow}>
                            <Users size={16} color={C_PURPLE} />
                            <Text style={styles.title}>Active Users History</Text>
                        </View>
                        <Text style={styles.subtitle}>
                            {total > 0
                                ? `${total} recent session${total === 1 ? '' : 's'} on this home`
                                : 'Recent app sessions on this home'}
                        </Text>
                    </View>
                    <View style={{ width: 36 }} />
                </View>

                <ActiveUsersHistoryList
                    sessions={sessions}
                    loading={loading}
                    error={error}
                    emptyText="No recent app sessions yet"
                    refreshing={refreshing}
                    onRefresh={() => load({ pull: true })}
                    page={page}
                    pages={pages}
                    pageLoading={pageLoading}
                    onPrevPage={page > 1 ? () => load({ page: page - 1 }) : null}
                    onNextPage={page < pages ? () => load({ page: page + 1 }) : null}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#09091A' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 10,
    },
    backBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerText: { flex: 1 },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    title: {
        color: '#fff',
        fontSize: 18,
        fontFamily: CF.bold,
    },
    subtitle: {
        color: 'rgba(255,255,255,0.38)',
        fontSize: 12,
        fontFamily: CF.regular,
        marginTop: 3,
        marginLeft: 24,
    },
});
