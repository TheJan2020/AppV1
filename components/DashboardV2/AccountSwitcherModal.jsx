import { useEffect, useState } from 'react';
import {
    Modal,
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    ScrollView,
} from 'react-native';
import { Check, Plus, UserRound, ChevronRight, Pencil } from 'lucide-react-native';
import ModalBackdrop from '../ModalBackdrop';
import { Colors } from '../../constants/Colors';
import { CF } from '../../utils/typography';
import {
    listAccounts,
    getActiveAccountId,
    activateAccount,
    ensureAccountsMigrated,
} from '../../services/accounts';

function capitalizeWords(str) {
    if (!str) return '';
    return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AccountSwitcherModal({
    visible,
    onClose,
    onSwitched,
    onAddAccount,
    onEditHome,
}) {
    const [accounts, setAccounts] = useState([]);
    const [activeId, setActiveId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [switchingId, setSwitchingId] = useState(null);

    useEffect(() => {
        if (!visible) return;
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                await ensureAccountsMigrated();
                const [list, id] = await Promise.all([listAccounts(), getActiveAccountId()]);
                if (!cancelled) {
                    setAccounts(list);
                    setActiveId(id);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [visible]);

    const handleSelect = async (account) => {
        if (!account || account.id === activeId) {
            onClose?.();
            return;
        }
        setSwitchingId(account.id);
        try {
            const activated = await activateAccount(account.id);
            onSwitched?.(activated);
            onClose?.();
        } catch (e) {
            Alert.alert('Switch failed', e?.message || 'Could not switch account.');
        } finally {
            setSwitchingId(null);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <ModalBackdrop onPress={onClose} />
                <View style={styles.sheet}>
                    <Text style={styles.title}>Switch account</Text>
                    <Text style={styles.subtitle}>
                        Stay signed in to multiple users and switch anytime.
                    </Text>

                    {loading ? (
                        <ActivityIndicator color={Colors.primary} style={{ marginVertical: 24 }} />
                    ) : (
                        <ScrollView
                            style={styles.list}
                            contentContainerStyle={styles.listContent}
                            bounces={false}
                        >
                            {accounts.length === 0 ? (
                                <Text style={styles.empty}>No saved accounts yet.</Text>
                            ) : (
                                [...accounts]
                                    .sort((a, b) => {
                                        if (a.id === activeId) return -1;
                                        if (b.id === activeId) return 1;
                                        return (b.updatedAt || 0) - (a.updatedAt || 0);
                                    })
                                    .map((account) => {
                                    const selected = account.id === activeId;
                                    const busy = switchingId === account.id;
                                    return (
                                        <TouchableOpacity
                                            key={account.id}
                                            style={[styles.row, selected && styles.rowActive]}
                                            onPress={() => handleSelect(account)}
                                            disabled={!!switchingId}
                                            activeOpacity={0.75}
                                        >
                                            <View style={styles.avatar}>
                                                <UserRound size={18} color="#fff" />
                                            </View>
                                            <View style={styles.meta}>
                                                <Text style={styles.name} numberOfLines={1}>
                                                    {capitalizeWords(account.name)}
                                                </Text>
                                                <Text style={styles.detail} numberOfLines={1}>
                                                    {account.username}
                                                    {account.profileName ? ` · ${account.profileName}` : ''}
                                                </Text>
                                                {!!account.haUrl && (
                                                    <Text style={styles.host} numberOfLines={1}>
                                                        {String(account.haUrl).replace(/^https?:\/\//i, '')}
                                                    </Text>
                                                )}
                                            </View>
                                            {busy ? (
                                                <ActivityIndicator size="small" color={Colors.primary} />
                                            ) : selected ? (
                                                <Check size={18} color={Colors.primary} />
                                            ) : (
                                                <ChevronRight size={18} color="rgba(255,255,255,0.35)" />
                                            )}
                                        </TouchableOpacity>
                                    );
                                })
                            )}
                        </ScrollView>
                    )}

                    <TouchableOpacity
                        style={styles.addBtn}
                        onPress={() => {
                            onClose?.();
                            onAddAccount?.();
                        }}
                        activeOpacity={0.8}
                    >
                        <Plus size={18} color="#fff" />
                        <Text style={styles.addText}>Add another account</Text>
                    </TouchableOpacity>
                    {onEditHome ? (
                        <TouchableOpacity
                            style={styles.editHomeBtn}
                            onPress={() => {
                                onClose?.();
                                onEditHome?.();
                            }}
                            activeOpacity={0.8}
                        >
                            <Pencil size={16} color={Colors.primary} />
                            <Text style={styles.editHomeText}>Edit home URLs</Text>
                        </TouchableOpacity>
                    ) : null}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    sheet: {
        backgroundColor: '#121225',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 22,
        paddingBottom: 36,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    title: {
        color: '#fff',
        fontFamily: CF.bold,
        fontSize: 20,
        marginBottom: 4,
    },
    subtitle: {
        color: 'rgba(237,237,245,0.5)',
        fontFamily: CF.regular,
        fontSize: 13,
        marginBottom: 18,
    },
    list: {
        marginBottom: 16,
        maxHeight: 320,
    },
    listContent: {
        gap: 8,
    },
    empty: {
        color: 'rgba(237,237,245,0.45)',
        fontFamily: CF.regular,
        paddingVertical: 16,
        textAlign: 'center',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.04)',
    },
    rowActive: {
        backgroundColor: 'rgba(137, 71, 202, 0.18)',
        borderWidth: 1,
        borderColor: 'rgba(137, 71, 202, 0.35)',
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(137, 71, 202, 0.55)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    meta: {
        flex: 1,
        gap: 2,
    },
    name: {
        color: '#fff',
        fontFamily: CF.semibold,
        fontSize: 16,
    },
    detail: {
        color: 'rgba(237,237,245,0.45)',
        fontFamily: CF.regular,
        fontSize: 12,
    },
    host: {
        color: 'rgba(237,237,245,0.32)',
        fontFamily: CF.regular,
        fontSize: 11,
    },
    addBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    addText: {
        color: '#fff',
        fontFamily: CF.semibold,
        fontSize: 15,
    },
    editHomeBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        marginTop: 8,
    },
    editHomeText: {
        color: Colors.primary,
        fontFamily: CF.semibold,
        fontSize: 14,
    },
});
