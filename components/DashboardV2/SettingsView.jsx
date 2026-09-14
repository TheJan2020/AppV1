import { useState, useEffect, memo } from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet, ScrollView, FlatList, TextInput, Alert, ActivityIndicator, Switch } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Map, Layers, ChevronRight, User, LogOut, Brain, Check, Save, Bell, Settings, Play, Wifi, Clock, BarChart2, ScrollText, Database, Activity, Smartphone, Heart, Sparkles, Monitor, LayoutGrid, Timer, Home, Users, ShieldCheck, UserRound } from 'lucide-react-native';
import { router } from 'expo-router';
import { AIService } from '../../services/ai';
import * as SecureStore from 'expo-secure-store';
import { authFetch } from '../../utils/authFetch';
import { unregisterPushTokenAsync } from '../../services/notifications';
import {
    logoutActiveAccount,
    listAccounts,
    removeAccount,
    getActiveAccountId,
    ensureAccountsMigrated,
} from '../../services/accounts';
import { HAService } from '../../services/ha';
import { beginHomeSession } from '../../utils/dashboardCache';
import { loadHaProfiles } from '../../utils/storage';
import MonitoredEntitiesModal from './MonitoredEntitiesModal';
import AlertEntitiesModal from './AlertEntitiesModal';
import MyPreferencesModal from './MyPreferencesModal';
import PreferencedEntitiesModal from './PreferencedEntitiesModal';
import { Heading, CF } from '../../utils/typography';
import useDeviceType from '../../hooks/useDeviceType';

function capitalizeWords(str) {
    if (!str) return '';
    return str.replace(/\b\w/g, c => c.toUpperCase());
}

function SettingsView({
    areas = [],
    /** Full HA area registry for labels (preferred over `areas` when present). */
    registryAreas = [],
    entities = [],
    registryDevices = [],
    registryEntities = [],
    onSettingChange,
    onNetwork,
    onEditHome,
    showFamily, // Prop from parent
    autoRoomVisit, // Prop from parent
    autoRoomResume, // Prop from parent
    showVoiceAssistant, // Prop from parent
    showPreferenceButton, // Prop from parent
    adminUrl, // From SecureStore profile
    userName = '',
    roleName = '',
    settingsAllowed = true,
    onEntitiesChanged, // Called after monitored-entity changes so dashboard refreshes refs
}) {
    const { isTablet } = useDeviceType();
    const [activeTab, setActiveTab] = useState('general');
    const [selectedArea, setSelectedArea] = useState(null);
    const [faceIdEnabled, setFaceIdEnabled] = useState(false);
    const [storedUserName, setStoredUserName] = useState('');
    const [loggingOut, setLoggingOut] = useState(false);
    const [isHaOwner, setIsHaOwner] = useState(false);
    const [settingsReady, setSettingsReady] = useState(false);

    // Saved accounts (multi-account switcher list) — shown on the Account tab
    // so any signed-in user can be logged out individually from this device.
    const [savedAccounts, setSavedAccounts] = useState([]);
    const [activeAccountId, setActiveAccountId] = useState(null);
    const [loadingAccounts, setLoadingAccounts] = useState(false);
    const [removingAccountId, setRemovingAccountId] = useState(null);

    const loadSavedAccounts = async ({ silent } = {}) => {
        if (!silent) setLoadingAccounts(true);
        try {
            await ensureAccountsMigrated();
            const [list, id] = await Promise.all([listAccounts(), getActiveAccountId()]);
            setSavedAccounts(list);
            setActiveAccountId(id);
        } catch (e) {
            console.log('[Settings] Failed to load saved accounts:', e?.message || e);
        } finally {
            if (!silent) setLoadingAccounts(false);
        }
    };

    useEffect(() => {
        let cancelled = false;
        setSettingsReady(false);

        (async () => {
            try {
                const faceIdPromise = SecureStore.getItemAsync('face_id_enabled')
                    .then((val) => { if (!cancelled) setFaceIdEnabled(val === 'true'); })
                    .catch(() => {});

                const userPromise = (async () => {
                    if (userName) return userName;
                    try {
                        const json = await SecureStore.getItemAsync('logged_in_user');
                        if (!json) return '';
                        const user = JSON.parse(json);
                        const name = user?.name || '';
                        if (!cancelled && name) setStoredUserName(name);
                        return name;
                    } catch {
                        return '';
                    }
                })();

                const accountsPromise = loadSavedAccounts({ silent: true });

                const effectiveUser = (await userPromise) || userName;
                if (effectiveUser && adminUrl) {
                    try {
                        const base = adminUrl.endsWith('/') ? adminUrl : `${adminUrl}/`;
                        const res = await authFetch(`${base}api/auth/owner-status?username=${encodeURIComponent(effectiveUser)}`);
                        const data = await res.json().catch(() => ({}));
                        if (!cancelled) setIsHaOwner(!!data.isOwner);
                    } catch {
                        if (!cancelled) setIsHaOwner(false);
                    }
                } else if (!cancelled) {
                    setIsHaOwner(false);
                }

                await Promise.all([faceIdPromise, accountsPromise]);
            } finally {
                if (!cancelled) setSettingsReady(true);
            }
        })();

        return () => { cancelled = true; };
    }, [userName, adminUrl]);

    const displayName = capitalizeWords(userName || storedUserName) || 'User';

    const handleLogout = async () => {
        if (loggingOut) return;
        setLoggingOut(true);
        try {
            unregisterPushTokenAsync().catch(() => {});
            HAService.disconnectAll();
            try {
                await SecureStore.deleteItemAsync('room_reorder_config');
            } catch {
                // ignore
            }
            const { nextAccount } = await logoutActiveAccount();
            if (nextAccount) {
                let profiles = [];
                try {
                    profiles = await loadHaProfiles();
                } catch {
                    profiles = [];
                }
                const profile = profiles.find((p) => p.id === nextAccount.profileId);
                await beginHomeSession({
                    profileId: nextAccount.profileId,
                    haUrl: nextAccount.haUrl || profile?.haUrl,
                    token: profile?.haToken,
                    adminUrl: profile?.adminUrl,
                    haUrlLive: profile?.haUrlLive,
                    haUrlLocal: profile?.haUrlLocal,
                    adminUrlLive: profile?.adminUrlLive || profile?.dashboardUrl,
                    adminUrlLocal: profile?.adminUrlLocal || profile?.dashboardUrlLocal,
                    clearCache: false,
                });
                router.replace({
                    pathname: '/dashboard-v2',
                    params: {
                        userName: nextAccount.name || '',
                        userId: nextAccount.userId || '',
                        switchKey: String(Date.now()),
                    },
                });
            } else {
                router.replace('/login');
            }
        } catch (e) {
            console.log('[Settings] Logout failed:', e?.message || e);
            router.replace('/login');
        } finally {
            setLoggingOut(false);
        }
    };

    const logoutButton = (
        <TouchableOpacity
            style={[styles.listItem, loggingOut && { opacity: 0.6 }]}
            disabled={loggingOut}
            onPress={handleLogout}
            activeOpacity={0.7}
        >
            <View style={styles.itemInfo}>
                <View style={[styles.iconContainer, styles.logoutIconWrap]}>
                    <LogOut size={18} color={Colors.error} />
                </View>
                <View>
                    <Text style={styles.logoutItemName}>{loggingOut ? 'Signing out…' : 'Log Out'}</Text>
                    <Text style={styles.itemSub}>Sign out of this account on this device</Text>
                </View>
            </View>
        </TouchableOpacity>
    );

    const handleRemoveAccount = (account) => {
        if (!account || removingAccountId) return;
        const isActive = account.id === activeAccountId;
        Alert.alert(
            'Log out this account?',
            `${capitalizeWords(account.name || account.username)} will be removed from this device.${isActive ? ' You are currently signed in as this user.' : ''}`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Log Out',
                    style: 'destructive',
                    onPress: async () => {
                        setRemovingAccountId(account.id);
                        try {
                            if (isActive) {
                                unregisterPushTokenAsync().catch(() => {});
                                HAService.disconnectAll();
                                try {
                                    await SecureStore.deleteItemAsync('room_reorder_config');
                                } catch {
                                    // ignore
                                }
                            }
                            const { nextAccount } = await removeAccount(account.id);
                            if (isActive) {
                                if (nextAccount) {
                                    let profiles = [];
                                    try {
                                        profiles = await loadHaProfiles();
                                    } catch {
                                        profiles = [];
                                    }
                                    const profile = profiles.find((p) => p.id === nextAccount.profileId);
                                    await beginHomeSession({
                                        profileId: nextAccount.profileId,
                                        haUrl: nextAccount.haUrl || profile?.haUrl,
                                        token: profile?.haToken,
                                        adminUrl: profile?.adminUrl,
                                        haUrlLive: profile?.haUrlLive,
                                        haUrlLocal: profile?.haUrlLocal,
                                        adminUrlLive: profile?.adminUrlLive || profile?.dashboardUrl,
                                        adminUrlLocal: profile?.adminUrlLocal || profile?.dashboardUrlLocal,
                                        clearCache: false,
                                    });
                                    router.replace({
                                        pathname: '/dashboard-v2',
                                        params: {
                                            userName: nextAccount.name || '',
                                            userId: nextAccount.userId || '',
                                            switchKey: String(Date.now()),
                                        },
                                    });
                                } else {
                                    router.replace('/login');
                                }
                            } else {
                                await loadSavedAccounts();
                            }
                        } catch (e) {
                            console.log('[Settings] Remove account failed:', e?.message || e);
                            Alert.alert('Error', 'Could not log out that account. Please try again.');
                        } finally {
                            setRemovingAccountId(null);
                        }
                    },
                },
            ],
        );
    };

    // Modals
    const [monitoredModalVisible, setMonitoredModalVisible] = useState(false);
    const [alertModalVisible, setAlertModalVisible] = useState(false);
    const [preferencesModalVisible, setPreferencesModalVisible] = useState(false);
    const [preferencedEntitiesModalVisible, setPreferencedEntitiesModalVisible] = useState(false);

    // Still-open reminder (locks/sensors when armed, garage, shutters >50%)
    const REMINDER_OPTIONS = [10, 15, 20, 25, 30, 45, 60];
    const [stillOpenMinutes, setStillOpenMinutes] = useState(25);
    const [savingReminder, setSavingReminder] = useState(false);

    useEffect(() => {
        if (!adminUrl) return;
        const base = adminUrl.endsWith('/') ? adminUrl : `${adminUrl}/`;
        authFetch(`${base}api/config`)
            .then(r => r.json())
            .then(cfg => {
                const ms = Number(cfg?.still_open_reminder_ms);
                if (ms > 0) setStillOpenMinutes(Math.round(ms / 60000));
            })
            .catch(() => {});
    }, [adminUrl]);

    const saveStillOpenMinutes = async (minutes) => {
        if (!adminUrl) {
            Alert.alert('Error', 'Admin URL is not configured.');
            return;
        }
        setStillOpenMinutes(minutes);
        setSavingReminder(true);
        try {
            const base = adminUrl.endsWith('/') ? adminUrl : `${adminUrl}/`;
            const res = await authFetch(`${base}api/config`);
            const cfg = await res.json();
            const next = { ...cfg, still_open_reminder_ms: minutes * 60 * 1000 };
            const saveRes = await authFetch(`${base}api/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(next),
            });
            const data = await saveRes.json();
            if (!saveRes.ok) throw new Error(data?.error || 'Failed to save');
        } catch (e) {
            Alert.alert('Error', e.message || 'Failed to save reminder time');
        } finally {
            setSavingReminder(false);
        }
    };

    // Generic Toggle Handler (Persist + Notify Parent)
    const handleToggleSetting = async (key, val) => {
        // Map prop keys to SecureStore keys
        let storeKey = '';
        if (key === 'showFamily') storeKey = 'settings_show_family';
        if (key === 'autoRoomVisit') storeKey = 'settings_auto_room_visit';
        if (key === 'autoRoomResume') storeKey = 'settings_auto_room_resume';
        if (key === 'showVoiceAssistant') storeKey = 'settings_show_voice_assistant';
        if (key === 'showPreferenceButton') storeKey = 'settings_show_preference_button';

        if (storeKey) {
            await SecureStore.setItemAsync(storeKey, val.toString());
        }

        if (onSettingChange) onSettingChange(key, val);
    };

    // AI Config State
    const [openAIKey, setOpenAIKey] = useState('');
    const [anthropicKey, setAnthropicKey] = useState('');
    const [geminiKey, setGeminiKey] = useState('');
    const [activeModel, setActiveModel] = useState('openai');
    const [loadingKeys, setLoadingKeys] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (activeTab === 'ai') {
            loadAIConfig();
        }
    }, [activeTab]);

    const loadAIConfig = async () => {
        setLoadingKeys(true);
        const gh = await AIService.getKey('openai');
        const ah = await AIService.getKey('anthropic');
        const gm = await AIService.getKey('gemini');
        const am = await AIService.getActiveModel();

        if (gh) setOpenAIKey(gh);
        if (ah) setAnthropicKey(ah);
        if (gm) setGeminiKey(gm);
        setActiveModel(am);
        setLoadingKeys(false);
    };

    const handleSaveAIConfig = async () => {
        setSaving(true);
        try {
            if (openAIKey) await AIService.saveKey('openai', openAIKey);
            if (anthropicKey) await AIService.saveKey('anthropic', anthropicKey);
            if (geminiKey) await AIService.saveKey('gemini', geminiKey);
            await AIService.setActiveModel(activeModel);
            Alert.alert('Success', 'AI Configuration Saved');
        } catch (error) {
            Alert.alert('Error', 'Failed to save configuration');
        } finally {
            setSaving(false);
        }
    };

    const handleTestKey = async (provider, key) => {
        if (!key) {
            Alert.alert('Validation Error', 'Please enter a key first');
            return;
        }

        const loadingAlert = Alert.alert('Testing...', 'Validating API Key...', [], { cancelable: false });

        try {
            await AIService.testKey(provider, key);
            Alert.alert('Success', `Valid ${provider} API Key!`);
        } catch (error) {
            Alert.alert('Failed', `Invalid Key: ${error.message}`);
        }
    };

    // Combine Area Registry -> Device Registry -> Entity Registry
    const getAreaStats = () => {
        return areas.map(area => {
            const areaDevices = registryDevices.filter(d => d.area_id === area.area_id);
            const areaDeviceIds = areaDevices.map(d => d.id);
            const areaRegEntries = registryEntities.filter(re => {
                const directMatch = re.area_id === area.area_id;
                const deviceMatch = re.device_id && areaDeviceIds.includes(re.device_id);
                return directMatch || deviceMatch;
            });

            return {
                ...area,
                totalDevices: areaRegEntries.length,
                devices: areaRegEntries
            };
        }).sort((a, b) => a.name.localeCompare(b.name));
    };

    const areaStats = getAreaStats();

    const renderAreaList = () => (
        <ScrollView contentContainerStyle={styles.listContent}>
            {areaStats.map((area) => (
                <TouchableOpacity
                    key={area.area_id}
                    style={styles.listItem}
                    onPress={() => setSelectedArea(area)}
                >
                    <View style={styles.itemInfo}>
                        <View style={styles.iconContainer}>
                            <Map size={20} color={Colors.text} />
                        </View>
                        <View>
                            <Text style={styles.itemName}>{area.name}</Text>
                            <Text style={styles.itemSub}>{area.totalDevices} devices</Text>
                        </View>
                    </View>
                    <ChevronRight size={20} color={Colors.textDim} />
                </TouchableOpacity>
            ))}
        </ScrollView>
    );

    const renderAreaDetails = () => {
        if (!selectedArea) return null;

        const areaDevices = selectedArea.devices.map(reg => {
            const stateObj = entities.find(e => e.entity_id === reg.entity_id);
            return {
                ...reg,
                stateObj: stateObj || { state: 'unknown' },
                displayName: reg.name || reg.original_name || reg.entity_id
            };
        });

        return (
            <View style={{ flex: 1 }}>
                <TouchableOpacity onPress={() => setSelectedArea(null)} style={styles.backBtn}>
                    <Text style={styles.backText}>← Back to Areas</Text>
                </TouchableOpacity>
                <Text style={styles.detailTitle}>{selectedArea.name} Devices</Text>
                <ScrollView contentContainerStyle={styles.listContent}>
                    {areaDevices.length === 0 ? (
                        <Text style={styles.emptyText}>No active devices found.</Text>
                    ) : (
                        areaDevices.map((device) => (
                            <View key={device.entity_id} style={styles.deviceItem}>
                                <View style={styles.deviceInfo}>
                                    <Text style={styles.deviceName}>{device.name || device.original_name || device.entity_id}</Text>
                                    <Text style={styles.deviceEntity}>{device.entity_id}</Text>
                                </View>
                                <Text style={styles.deviceState}>{device.stateObj?.state}</Text>
                            </View>
                        ))
                    )}
                </ScrollView>
            </View>
        );
    };

    const renderEntitiesList = () => (
        <FlatList
            data={entities}
            keyExtractor={item => item.entity_id}
            renderItem={({ item }) => (
                <View style={styles.listItem}>
                    <View style={styles.itemInfo}>
                        <View style={styles.iconContainer}>
                            <Layers size={20} color={Colors.textDim} />
                        </View>
                        <View>
                            <Text style={styles.itemName} numberOfLines={1}>{item.attributes.friendly_name || item.entity_id}</Text>
                            <Text style={styles.itemSub}>{item.entity_id}</Text>
                        </View>
                    </View>
                    <Text style={styles.stateText}>{item.state}</Text>
                </View>
            )}
            contentContainerStyle={styles.listContent}
        />
    );

    const renderAIConfig = () => {
        if (loadingKeys) {
            return (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                </View>
            );
        }

        return (
            <ScrollView contentContainerStyle={styles.listContent}>
                <View style={styles.section}>
                    <Text style={styles.sectionHeader}>Active Model</Text>
                    <View style={styles.modelSelector}>
                        {['openai', 'anthropic', 'gemini'].map(model => (
                            <TouchableOpacity
                                key={model}
                                style={[styles.modelOption, activeModel === model && styles.activeModelOption]}
                                onPress={() => setActiveModel(model)}
                            >
                                <Text style={[styles.modelText, activeModel === model && styles.activeModelText]}>
                                    {model.charAt(0).toUpperCase() + model.slice(1)}
                                </Text>
                                {activeModel === model && <Check size={16} color="#fff" />}
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionHeader}>API Keys</Text>

                    <View style={styles.inputContainer}>
                        <Text style={styles.inputLabel}>OpenAI API Key</Text>
                        <View style={styles.inputRow}>
                            <TextInput
                                style={[styles.input, { flex: 1 }]}
                                placeholder="sk-..."
                                placeholderTextColor="rgba(255,255,255,0.3)"
                                value={openAIKey}
                                onChangeText={setOpenAIKey}
                                secureTextEntry
                            />
                            <TouchableOpacity
                                style={styles.testBtn}
                                onPress={() => handleTestKey('openai', openAIKey)}
                            >
                                <Text style={styles.testBtnText}>Test</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.inputContainer}>
                        <Text style={styles.inputLabel}>Anthropic API Key</Text>
                        <View style={styles.inputRow}>
                            <TextInput
                                style={[styles.input, { flex: 1 }]}
                                placeholder="sk-ant-..."
                                placeholderTextColor="rgba(255,255,255,0.3)"
                                value={anthropicKey}
                                onChangeText={setAnthropicKey}
                                secureTextEntry
                            />
                            <TouchableOpacity
                                style={styles.testBtn}
                                onPress={() => handleTestKey('anthropic', anthropicKey)}
                            >
                                <Text style={styles.testBtnText}>Test</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.inputContainer}>
                        <Text style={styles.inputLabel}>Google Gemini API Key</Text>
                        <View style={styles.inputRow}>
                            <TextInput
                                style={[styles.input, { flex: 1 }]}
                                placeholder="AIza..."
                                placeholderTextColor="rgba(255,255,255,0.3)"
                                value={geminiKey}
                                onChangeText={setGeminiKey}
                                secureTextEntry
                            />
                            <TouchableOpacity
                                style={styles.testBtn}
                                onPress={() => handleTestKey('gemini', geminiKey)}
                            >
                                <Text style={styles.testBtnText}>Test</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>

                <TouchableOpacity
                    style={styles.saveBtn}
                    onPress={handleSaveAIConfig}
                    disabled={saving}
                >
                    {saving ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <>
                            <Save size={20} color="#fff" />
                            <Text style={styles.saveBtnText}>Save Configuration</Text>
                        </>
                    )}
                </TouchableOpacity>
            </ScrollView>
        );
    };



    const renderGeneralSettings = () => (
        <ScrollView contentContainerStyle={styles.listContent}>
            <View style={styles.section}>
                <Text style={styles.sectionHeader}>Display</Text>

                {/* Show Family Toggle */}
                <View style={styles.listItem}>
                    <View style={styles.itemInfo}>
                        <View style={styles.iconContainer}>
                            <User size={20} color={Colors.text} />
                        </View>
                        <View>
                            <Text style={styles.itemName}>Show Family</Text>
                            <Text style={styles.itemSub}>Show active users icon & count on Home</Text>
                        </View>
                    </View>
                    <Switch
                        value={showFamily}
                        onValueChange={(val) => handleToggleSetting('showFamily', val)}
                        trackColor={{ false: '#767577', true: Colors.primary }}
                        thumbColor={showFamily ? '#fff' : '#f4f3f4'}
                    />
                </View>

                {/* Auto-Room (Visit), Automations, Auto-Room (Resume), Voice Assistant and
                    Show Preference Button are not used right now — re-enable by
                    uncommenting this block.
                <View style={styles.listItem}>
                    <View style={styles.itemInfo}>
                        <View style={styles.iconContainer}>
                            <Map size={20} color={Colors.text} />
                        </View>
                        <View>
                            <Text style={styles.itemName}>Auto-Room (On Visit)</Text>
                            <Text style={styles.itemSub}>Open room sheet when location changes</Text>
                        </View>
                    </View>
                    <Switch
                        value={autoRoomVisit}
                        onValueChange={(val) => handleToggleSetting('autoRoomVisit', val)}
                        trackColor={{ false: '#767577', true: Colors.primary }}
                        thumbColor={autoRoomVisit ? '#fff' : '#f4f3f4'}
                    />
                </View>

                <TouchableOpacity style={styles.listItem} onPress={() => router.push('/automations')}>
                    <View style={styles.itemInfo}>
                        <View style={styles.iconContainer}>
                            <Play size={20} color={Colors.text} />
                        </View>
                        <View>
                            <Text style={styles.itemName}>Automations</Text>
                            <Text style={styles.itemSub}>Manage home automations</Text>
                        </View>
                    </View>
                    <ChevronRight size={20} color={Colors.textDim} />
                </TouchableOpacity>

                <View style={styles.listItem}>
                    <View style={styles.itemInfo}>
                        <View style={styles.iconContainer}>
                            <Smartphone size={20} color={Colors.text} />
                        </View>
                        <View>
                            <Text style={styles.itemName}>Auto-Room (Resume)</Text>
                            <Text style={styles.itemSub}>Check location when opening app</Text>
                        </View>
                    </View>
                    <Switch
                        value={autoRoomResume}
                        onValueChange={(val) => handleToggleSetting('autoRoomResume', val)}
                        trackColor={{ false: '#767577', true: Colors.primary }}
                        thumbColor={autoRoomResume ? '#fff' : '#f4f3f4'}
                    />
                </View>

                {isTablet && (
                <View style={styles.listItem}>
                    <View style={styles.itemInfo}>
                        <View style={styles.iconContainer}>
                            <Sparkles size={20} color={Colors.text} />
                        </View>
                        <View>
                            <Text style={styles.itemName}>Voice Assistant</Text>
                            <Text style={styles.itemSub}>Center voice widget on tablet. Phone uses the Butler tab.</Text>
                        </View>
                    </View>
                    <Switch
                        value={showVoiceAssistant}
                        onValueChange={(val) => handleToggleSetting('showVoiceAssistant', val)}
                        trackColor={{ false: '#767577', true: Colors.primary }}
                        thumbColor={showVoiceAssistant ? '#fff' : '#f4f3f4'}
                    />
                </View>
                )}

                <View style={styles.listItem}>
                    <View style={styles.itemInfo}>
                        <View style={styles.iconContainer}>
                            <Heart size={20} color={Colors.text} />
                        </View>
                        <View>
                            <Text style={styles.itemName}>Show Preference Button</Text>
                            <Text style={styles.itemSub}>Show activate preferences in room view</Text>
                        </View>
                    </View>
                    <Switch
                        value={showPreferenceButton}
                        onValueChange={(val) => handleToggleSetting('showPreferenceButton', val)}
                        trackColor={{ false: '#767577', true: Colors.primary }}
                        thumbColor={showPreferenceButton ? '#fff' : '#f4f3f4'}
                    />
                </View>
                */}
            </View>

            {/* Notifications section is not used right now — re-enable by
                uncommenting this whole block.
            <View style={styles.section}>
                <Text style={styles.sectionHeader}>Notifications</Text>

                <View style={styles.listItem}>
                    <View style={[styles.itemInfo, { flex: 1 }]}>
                        <View style={styles.iconContainer}>
                            <Timer size={20} color={Colors.text} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.itemName}>Still-Open Reminder</Text>
                            <Text style={styles.itemSub}>
                                Remind again if lock/sensor (when armed), garage, or shutter (&gt;50%) stays open
                            </Text>
                            <View style={styles.reminderChips}>
                                {REMINDER_OPTIONS.map((m) => {
                                    const active = stillOpenMinutes === m;
                                    return (
                                        <TouchableOpacity
                                            key={m}
                                            style={[styles.reminderChip, active && styles.reminderChipActive]}
                                            onPress={() => saveStillOpenMinutes(m)}
                                            disabled={savingReminder}
                                        >
                                            <Text style={[styles.reminderChipText, active && styles.reminderChipTextActive]}>
                                                {m}m
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                            {savingReminder ? (
                                <ActivityIndicator size="small" color={Colors.primary} style={{ marginTop: 8 }} />
                            ) : (
                                <Text style={[styles.itemSub, { marginTop: 6 }]}>
                                    Current: every {stillOpenMinutes} minutes
                                </Text>
                            )}
                        </View>
                    </View>
                </View>

                <TouchableOpacity style={styles.listItem} onPress={() => setMonitoredModalVisible(true)}>
                    <View style={styles.itemInfo}>
                        <View style={styles.iconContainer}>
                            <Database size={20} color={Colors.text} />
                        </View>
                        <View>
                            <Text style={styles.itemName}>Monitored Entities</Text>
                            <Text style={styles.itemSub}>Manage ignored entities</Text>
                        </View>
                    </View>
                    <ChevronRight size={20} color={Colors.textDim} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.listItem} onPress={() => setAlertModalVisible(true)}>
                    <View style={styles.itemInfo}>
                        <View style={styles.iconContainer}>
                            <Bell size={20} color={Colors.text} />
                        </View>
                        <View>
                            <Text style={styles.itemName}>Alert Entities</Text>
                            <Text style={styles.itemSub}>Configure state alerts</Text>
                        </View>
                    </View>
                    <ChevronRight size={20} color={Colors.textDim} />
                </TouchableOpacity>
            </View>
            */}

            {/* Data & System section is not used right now — re-enable by
                uncommenting this whole block.
            <View style={styles.section}>
                <Text style={styles.sectionHeader}>Data & System</Text>

                <TouchableOpacity style={styles.listItem} onPress={() => setPreferencedEntitiesModalVisible(true)}>
                    <View style={styles.itemInfo}>
                        <View style={styles.iconContainer}>
                            <Heart size={20} color={Colors.text} />
                        </View>
                        <View>
                            <Text style={styles.itemName}>Preferenced Entities</Text>
                            <Text style={styles.itemSub}>Manage AI preferences inclusion</Text>
                        </View>
                    </View>
                    <ChevronRight size={20} color={Colors.textDim} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.listItem} onPress={() => router.push('/ai-preferences')}>
                    <View style={styles.itemInfo}>
                        <View style={styles.iconContainer}>
                            <Sparkles size={20} color={Colors.text} />
                        </View>
                        <View>
                            <Text style={styles.itemName}>AI Learned Preferences</Text>
                            <Text style={styles.itemSub}>View smart automation patterns</Text>
                        </View>
                    </View>
                    <ChevronRight size={20} color={Colors.textDim} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.listItem} onPress={() => router.push('/analysis-monitor')}>
                    <View style={styles.itemInfo}>
                        <View style={styles.iconContainer}>
                            <Play size={20} color={Colors.text} />
                        </View>
                        <View>
                            <Text style={styles.itemName}>Run AI Analysis Now</Text>
                            <Text style={styles.itemSub}>Monitor learning process live</Text>
                        </View>
                    </View>
                    <ChevronRight size={20} color={Colors.textDim} />
                </TouchableOpacity>
                <View style={styles.listItem}>
                    <View style={styles.itemInfo}>
                        <View style={styles.iconContainer}>
                            <Brain size={20} color={Colors.text} />
                        </View>
                        <View>
                            <Text style={styles.itemName}>FaceID / Biometrics</Text>
                            <Text style={styles.itemSub}>Enable biometric login</Text>
                        </View>
                    </View>
                    <Switch
                        value={faceIdEnabled}
                        onValueChange={async (val) => {
                            setFaceIdEnabled(val);
                            await SecureStore.setItemAsync('face_id_enabled', val ? 'true' : 'false');
                            if (!val) {
                                await SecureStore.deleteItemAsync('saved_password');
                                await SecureStore.deleteItemAsync('saved_username');
                            } else {
                                Alert.alert(
                                    'Face ID enabled',
                                    'Log out and log in once with your password so Face ID can store your credentials. After that you can use Face ID on the login screen.',
                                );
                            }
                        }}
                        trackColor={{ false: '#767577', true: Colors.primary }}
                        thumbColor={faceIdEnabled ? '#fff' : '#f4f3f4'}
                    />
                </View>

                <TouchableOpacity style={styles.listItem} onPress={() => setPreferencesModalVisible(true)}>
                    <View style={styles.itemInfo}>
                        <View style={styles.iconContainer}>
                            <Brain size={20} color={Colors.text} />
                        </View>
                        <View>
                            <Text style={styles.itemName}>My Preferences</Text>
                            <Text style={styles.itemSub}>AI-powered room analysis</Text>
                        </View>
                    </View>
                    <ChevronRight size={20} color={Colors.textDim} />
                </TouchableOpacity>
                */}

            <View style={styles.section}>
                <Text style={styles.sectionHeader}>App Access</Text>

                {isHaOwner && (
                    <TouchableOpacity
                        style={styles.listItem}
                        onPress={() => router.push({
                            pathname: '/manage-users',
                            params: { userName: userName || storedUserName, adminUrl },
                        })}
                    >
                        <View style={styles.itemInfo}>
                            <View style={styles.iconContainer}>
                                <Users size={20} color={Colors.text} />
                            </View>
                            <View>
                                <Text style={styles.itemName}>Manage Users</Text>
                                <Text style={styles.itemSub}>Reset, create, or delete users (Owner)</Text>
                            </View>
                        </View>
                        <ChevronRight size={20} color={Colors.textDim} />
                    </TouchableOpacity>
                )}

                {isHaOwner && (
                    <TouchableOpacity
                        style={styles.listItem}
                        onPress={() => router.push({
                            pathname: '/app-roles',
                            params: { userName: userName || storedUserName, adminUrl },
                        })}
                    >
                        <View style={styles.itemInfo}>
                            <View style={styles.iconContainer}>
                                <ShieldCheck size={20} color={Colors.text} />
                            </View>
                            <View>
                                <Text style={styles.itemName}>App Roles & Access</Text>
                                <Text style={styles.itemSub}>Create roles and control screens, cameras & rooms (Owner)</Text>
                            </View>
                        </View>
                        <ChevronRight size={20} color={Colors.textDim} />
                    </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.listItem} onPress={() => router.push('/about')}>
                    <View style={styles.itemInfo}>
                        <View style={styles.iconContainer}>
                            <ScrollText size={20} color={Colors.text} />
                        </View>
                        <View>
                            <Text style={styles.itemName}>About</Text>
                            <Text style={styles.itemSub}>Version & Developer Info</Text>
                        </View>
                    </View>
                    <ChevronRight size={20} color={Colors.textDim} />
                </TouchableOpacity>
            </View>

            {/* Quick Actions section is not used right now — re-enable by
                uncommenting this whole block.
            <View style={styles.section}>
                <Text style={styles.sectionHeader}>Quick Actions</Text>

                <TouchableOpacity
                    style={styles.listItem}
                    onPress={() => {
                        if (onEditHome) onEditHome();
                        else router.push({ pathname: '/login', params: { mode: 'editHome' } });
                    }}
                >
                    <View style={styles.itemInfo}>
                        <View style={styles.iconContainer}>
                            <Home size={20} color={Colors.text} />
                        </View>
                        <View>
                            <Text style={styles.itemName}>Home connection</Text>
                            <Text style={styles.itemSub}>Dashboard URL and local backup IP</Text>
                        </View>
                    </View>
                    <ChevronRight size={20} color={Colors.textDim} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.listItem} onPress={onNetwork}>
                    <View style={styles.itemInfo}>
                        <View style={styles.iconContainer}>
                            <Wifi size={20} color={Colors.text} />
                        </View>
                        <Text style={styles.itemName}>Network</Text>
                    </View>
                    <ChevronRight size={20} color={Colors.textDim} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.listItem} onPress={() => router.push('/history')}>
                    <View style={styles.itemInfo}>
                        <View style={styles.iconContainer}>
                            <Clock size={20} color={Colors.text} />
                        </View>
                        <Text style={styles.itemName}>History</Text>
                    </View>
                    <ChevronRight size={20} color={Colors.textDim} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.listItem} onPress={() => router.push('/my-statistics')}>
                    <View style={styles.itemInfo}>
                        <View style={styles.iconContainer}>
                            <BarChart2 size={20} color={Colors.text} />
                        </View>
                        <Text style={styles.itemName}>My Statistics</Text>
                    </View>
                    <ChevronRight size={20} color={Colors.textDim} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.listItem} onPress={() => router.push('/insights')}>
                    <View style={styles.itemInfo}>
                        <View style={styles.iconContainer}>
                            <Activity size={20} color={Colors.text} />
                        </View>
                        <Text style={styles.itemName}>Insights</Text>
                    </View>
                    <ChevronRight size={20} color={Colors.textDim} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.listItem} onPress={() => router.push('/entity-history-picker')}>
                    <View style={styles.itemInfo}>
                        <View style={styles.iconContainer}>
                            <ScrollText size={20} color={Colors.text} />
                        </View>
                        <Text style={styles.itemName}>Entity History</Text>
                    </View>
                    <ChevronRight size={20} color={Colors.textDim} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.listItem} onPress={() => router.push('/dashboard-v3')}>
                    <View style={styles.itemInfo}>
                        <View style={[styles.iconContainer, { backgroundColor: 'rgba(137,71,202,0.2)' }]}>
                            <LayoutGrid size={20} color="#8947ca" />
                        </View>
                        <View>
                            <Text style={styles.itemName}>Go to V3</Text>
                            <Text style={styles.itemSub}>Tablet widget dashboard</Text>
                        </View>
                    </View>
                    <ChevronRight size={20} color={Colors.textDim} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.listItem} onPress={() => router.push('/tv-lab')}>
                    <View style={styles.itemInfo}>
                        <View style={styles.iconContainer}>
                            <Monitor size={20} color={Colors.text} />
                        </View>
                        <Text style={styles.itemName}>Test TV</Text>
                    </View>
                    <ChevronRight size={20} color={Colors.textDim} />
                </TouchableOpacity>
            </View>
            */}
        </ScrollView >
    );

    const renderAccount = () => {
        const activeAccount = savedAccounts.find((a) => a.id === activeAccountId);
        return (
        <ScrollView contentContainerStyle={styles.listContent}>
            <View style={styles.section}>
                <Text style={styles.sectionHeader}>Signed in as</Text>
                <View style={styles.profileBlock}>
                    <Text style={styles.profileName}>{displayName}</Text>
                    <Text style={styles.profileRole}>{activeAccount?.profileName || roleName || 'User'}</Text>
                </View>
            </View>

            <View style={styles.section}>
                <View style={styles.accountSectionHeaderRow}>
                    <Text style={styles.sectionHeader}>Signed-In Accounts</Text>
                    {savedAccounts.length > 0 && (
                        <Text style={styles.accountCountBadge}>{savedAccounts.length}</Text>
                    )}
                </View>
                <Text style={styles.accountSectionHint}>
                    Accounts saved on this device. Remove any you no longer need.
                </Text>

                {loadingAccounts ? (
                    <ActivityIndicator color={Colors.primary} style={{ marginVertical: 20 }} />
                ) : savedAccounts.length === 0 ? (
                    <Text style={styles.itemSub}>No saved accounts found.</Text>
                ) : (
                    <View style={styles.accountList}>
                        {savedAccounts.map((account) => {
                            const isActive = account.id === activeAccountId;
                            const busy = removingAccountId === account.id;
                            const displayLabel = capitalizeWords(account.name || account.username) || 'User';
                            const initial = displayLabel.trim().charAt(0).toUpperCase() || '?';
                            return (
                                <View
                                    key={account.id}
                                    style={[styles.accountCard, isActive && styles.accountCardActive]}
                                >
                                    <View style={[styles.accountAvatar, isActive && styles.accountAvatarActive]}>
                                        <Text style={styles.accountAvatarText}>{initial}</Text>
                                    </View>

                                    <View style={styles.accountMeta}>
                                        <View style={styles.accountNameRow}>
                                            <Text style={styles.accountName} numberOfLines={1}>
                                                {displayLabel}
                                            </Text>
                                            {isActive && (
                                                <View style={styles.activeBadge}>
                                                    <Text style={styles.activeBadgeText}>ACTIVE</Text>
                                                </View>
                                            )}
                                        </View>
                                        <Text style={styles.accountSub} numberOfLines={1}>
                                            {account.username}
                                            {account.profileName ? `  ·  ${account.profileName}` : ''}
                                        </Text>
                                    </View>

                                    <TouchableOpacity
                                        style={[styles.accountRemoveBtn, busy && { opacity: 0.6 }]}
                                        onPress={() => handleRemoveAccount(account)}
                                        disabled={!!removingAccountId}
                                        hitSlop={6}
                                        activeOpacity={0.75}
                                    >
                                        {busy ? (
                                            <ActivityIndicator size="small" color={Colors.error} />
                                        ) : (
                                            <Text style={styles.accountRemoveText}>Remove</Text>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            );
                        })}
                    </View>
                )}
            </View>

            <View style={styles.section}>
                {logoutButton}
            </View>
        </ScrollView>
        );
    };




    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>{settingsAllowed ? 'Settings' : 'Account'}</Text>
            </View>

            {!settingsReady ? (
                <View style={styles.loadingScreen}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                    <Text style={styles.loadingText}>Loading settings…</Text>
                </View>
            ) : !settingsAllowed ? (
                <ScrollView contentContainerStyle={styles.listContent}>
                    <View style={styles.section}>
                        <Text style={styles.sectionHeader}>Signed in as</Text>
                        <View style={styles.profileBlock}>
                            <Text style={styles.profileName}>{displayName}</Text>
                            <Text style={styles.profileRole}>{roleName || 'User'}</Text>
                            <Text style={styles.restrictedHint}>Settings are restricted for this role.</Text>
                        </View>
                    </View>
                    <View style={styles.section}>
                        {logoutButton}
                    </View>
                </ScrollView>
            ) : (
                <>
            <View style={styles.tabs} collapsable={false}>
                {[
                    { id: 'general', label: 'General' },
                    /* Not used right now — re-enable by uncommenting these tabs.
                    { id: 'areas', label: 'Areas' },
                    { id: 'entities', label: 'Entities' },
                    { id: 'ai', label: 'A.I.' },
                    */
                    { id: 'account', label: 'Account' },
                ].map((tab) => {
                    const selected = activeTab === tab.id;
                    return (
                        <Pressable
                            key={tab.id}
                            style={({ pressed }) => [
                                styles.tab,
                                selected && styles.activeTab,
                                pressed && styles.tabPressed,
                            ]}
                            onPress={() => {
                                setActiveTab(tab.id);
                                setSelectedArea(null);
                            }}
                            hitSlop={6}
                            accessibilityRole="tab"
                            accessibilityState={{ selected }}
                            accessibilityLabel={tab.label}
                        >
                            <Text
                                style={[styles.tabText, selected && styles.activeTabText]}
                                numberOfLines={1}
                                adjustsFontSizeToFit
                                minimumFontScale={0.85}
                            >
                                {tab.label}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>

            <View style={styles.content} collapsable={false}>
                {activeTab === 'general' && renderGeneralSettings()}
                {/* Not used right now — re-enable by uncommenting these along with their tabs above.
                {activeTab === 'areas' && (selectedArea ? renderAreaDetails() : renderAreaList())}
                {activeTab === 'entities' && renderEntitiesList()}
                {activeTab === 'ai' && renderAIConfig()}
                */}
                {activeTab === 'account' && renderAccount()}
            </View>
                </>
            )}

            <MonitoredEntitiesModal
                visible={monitoredModalVisible}
                onClose={() => setMonitoredModalVisible(false)}
                adminUrl={adminUrl}
                onApplied={onEntitiesChanged}
            />
            <AlertEntitiesModal
                visible={alertModalVisible}
                onClose={() => setAlertModalVisible(false)}
                adminUrl={adminUrl}
            />
            <MyPreferencesModal
                visible={preferencesModalVisible}
                onClose={() => setPreferencesModalVisible(false)}
                adminUrl={adminUrl}
            />
            <PreferencedEntitiesModal
                visible={preferencedEntitiesModalVisible}
                onClose={() => setPreferencedEntitiesModalVisible(false)}
                adminUrl={adminUrl}
            />
        </View >
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: 60,
        paddingHorizontal: 20,
    },
    header: {
        marginBottom: 20,
    },
    title: {
        ...Heading.xl,
        color: '#fff',
    },
    loadingScreen: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingBottom: 80,
        gap: 14,
    },
    loadingText: {
        color: 'rgba(237,237,245,0.5)',
        fontSize: 14,
        fontFamily: CF.medium,
    },
    tabsScroll: {
        flexGrow: 0,
        marginBottom: 16,
        maxHeight: 48,
        zIndex: 2,
        elevation: 2,
    },
    tabs: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: 4,
        marginBottom: 16,
        // Keep above settings content, but below the app footer (TabBar ~10000)
        zIndex: 2,
        elevation: 2,
    },
    tab: {
        flex: 1,
        minHeight: 44,
        paddingHorizontal: 4,
        paddingVertical: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
    },
    tabPressed: {
        opacity: 0.7,
    },
    activeTab: {
        backgroundColor: 'rgba(255,255,255,0.12)',
    },
    tabText: {
        color: Colors.textDim,
        fontFamily: CF.semibold,
        fontSize: 12,
        textAlign: 'center',
    },
    activeTabText: {
        color: Colors.text,
        fontFamily: CF.bold,
        fontSize: 12,
    },
    content: {
        flex: 1,
        zIndex: 1,
    },
    listContent: {
        paddingBottom: 120, // Increased to avoid TabBar overlap
    },
    listItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    itemInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.05)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    itemName: {
        color: Colors.text,
        fontSize: 16,
        fontFamily: CF.medium,
        flex: 1, // Added flex to handle long texts
    },
    itemSub: {
        color: Colors.textDim,
        fontSize: 12,
    },
    reminderChips: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 10,
    },
    reminderChip: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    reminderChipActive: {
        backgroundColor: 'rgba(137,71,202,0.25)',
        borderColor: Colors.primary,
    },
    reminderChipText: {
        color: Colors.textDim,
        fontSize: 12,
        fontFamily: CF.semibold,
    },
    reminderChipTextActive: {
        color: '#fff',
    },
    stateText: {
        color: Colors.textDim,
        fontSize: 14,
    },
    backBtn: {
        marginBottom: 16,
    },
    backText: {
        color: Colors.primary,
        fontSize: 16,
        fontFamily: CF.semibold,
    },
    detailTitle: {
        ...Heading.md,
        color: Colors.text,
        marginBottom: 16,
    },
    deviceItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    deviceInfo: {
        flex: 1,
    },
    deviceName: {
        color: Colors.text,
        fontSize: 16,
    },
    deviceEntity: {
        color: Colors.textDim,
        fontSize: 12,
    },
    deviceState: {
        color: Colors.text,
        fontWeight: '600',
    },
    emptyText: {
        color: Colors.textDim,
        textAlign: 'center',
        marginTop: 40,
        fontStyle: 'italic',
    },
    // AI Config Styles
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    section: {
        marginBottom: 24,
    },
    sectionHeader: {
        color: Colors.text,
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 12,
    },
    modelSelector: {
        flexDirection: 'row',
        gap: 10,
    },
    modelOption: {
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 8,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'transparent',
        flexDirection: 'row',
        gap: 6
    },
    activeModelOption: {
        backgroundColor: Colors.primary + '20', // 20% opacity
        borderColor: Colors.primary,
    },
    modelText: {
        color: Colors.textDim,
        fontWeight: '600',
    },
    activeModelText: {
        color: Colors.primary,
    },
    inputContainer: {
        marginBottom: 16,
    },
    inputLabel: {
        color: Colors.textDim,
        marginBottom: 8,
        fontSize: 14,
    },
    input: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: 16,
        color: '#fff',
        fontSize: 16,
    },
    inputRow: {
        flexDirection: 'row',
        gap: 10,
        alignItems: 'center'
    },
    testBtn: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        paddingVertical: 16,
        paddingHorizontal: 20,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    testBtnText: {
        color: Colors.primary,
        fontWeight: 'bold',
        fontSize: 14
    },
    saveBtn: {
        backgroundColor: Colors.primary,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        borderRadius: 16,
        gap: 10,
        marginTop: 10
    },
    saveBtnText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16,
    },
    // Account Styles
    profileBlock: {
        paddingBottom: 4,
    },
    profileName: {
        fontSize: 22,
        fontFamily: CF.semibold,
        color: Colors.text,
        marginBottom: 4,
    },
    profileRole: {
        fontSize: 14,
        fontFamily: CF.regular,
        color: Colors.textDim,
    },
    restrictedHint: {
        marginTop: 10,
        fontSize: 13,
        fontFamily: CF.medium,
        color: 'rgba(255,255,255,0.45)',
    },
    logoutIconWrap: {
        backgroundColor: 'rgba(239,68,68,0.12)',
    },
    logoutItemName: {
        color: Colors.error,
        fontSize: 16,
        fontFamily: CF.medium,
    },
    accountSectionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    accountCountBadge: {
        color: 'rgba(237,237,245,0.5)',
        fontSize: 12,
        fontFamily: CF.semibold,
        backgroundColor: 'rgba(255,255,255,0.08)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        overflow: 'hidden',
    },
    accountSectionHint: {
        color: 'rgba(237,237,245,0.4)',
        fontSize: 12,
        fontFamily: CF.regular,
        marginTop: 4,
        marginBottom: 14,
        lineHeight: 17,
    },
    accountList: {
        gap: 10,
    },
    accountCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.035)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    accountCardActive: {
        backgroundColor: 'rgba(137, 71, 202, 0.12)',
        borderColor: 'rgba(137, 71, 202, 0.4)',
    },
    accountAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    accountAvatarActive: {
        backgroundColor: Colors.primary,
    },
    accountAvatarText: {
        color: '#fff',
        fontSize: 17,
        fontFamily: CF.semibold,
    },
    accountMeta: {
        flex: 1,
        minWidth: 0,
        gap: 3,
    },
    accountNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    accountName: {
        color: '#fff',
        fontSize: 15,
        fontFamily: CF.semibold,
        flexShrink: 1,
    },
    activeBadge: {
        backgroundColor: 'rgba(137, 71, 202, 0.25)',
        borderWidth: 1,
        borderColor: 'rgba(137, 71, 202, 0.5)',
        borderRadius: 8,
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    activeBadgeText: {
        color: Colors.primary,
        fontSize: 9.5,
        fontFamily: CF.semibold,
        letterSpacing: 0.4,
    },
    accountSub: {
        color: 'rgba(237,237,245,0.45)',
        fontSize: 12,
        fontFamily: CF.regular,
    },
    accountRemoveBtn: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: 'rgba(239,68,68,0.1)',
    },
    accountRemoveText: {
        color: Colors.error,
        fontSize: 12,
        fontFamily: CF.semibold,
    },
});

export default memo(SettingsView);
