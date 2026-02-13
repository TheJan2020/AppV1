import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, FlatList, TextInput, Alert, ActivityIndicator, Switch } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Map, Layers, ChevronRight, User, LogOut, Brain, Check, Save, Bell, Settings, Play, Wifi, Clock, BarChart2, ScrollText, Database, Activity, Smartphone, Heart, Sparkles } from 'lucide-react-native';
import { router } from 'expo-router';
import { AIService } from '../../services/ai';
import * as SecureStore from 'expo-secure-store';
import MonitoredEntitiesModal from './MonitoredEntitiesModal';
import AlertEntitiesModal from './AlertEntitiesModal';
import MyPreferencesModal from './MyPreferencesModal';
import PreferencedEntitiesModal from './PreferencedEntitiesModal';

export default function SettingsView({
    areas = [],
    entities = [],
    registryDevices = [],
    registryEntities = [],
    onSettingChange,
    onPlayMedia,
    onNetwork,
    showFamily, // Prop from parent
    autoRoomVisit, // Prop from parent
    autoRoomResume, // Prop from parent
    showVoiceAssistant // Prop from parent
}) {
    const [activeTab, setActiveTab] = useState('general');
    const [selectedArea, setSelectedArea] = useState(null);
    const [faceIdEnabled, setFaceIdEnabled] = useState(false);

    useEffect(() => {
        SecureStore.getItemAsync('face_id_enabled').then(val => {
            setFaceIdEnabled(val === 'true');
        });
    }, []);

    // Modals
    const [monitoredModalVisible, setMonitoredModalVisible] = useState(false);
    const [alertModalVisible, setAlertModalVisible] = useState(false);
    const [preferencesModalVisible, setPreferencesModalVisible] = useState(false);
    const [preferencedEntitiesModalVisible, setPreferencedEntitiesModalVisible] = useState(false);

    // Generic Toggle Handler (Persist + Notify Parent)
    const handleToggleSetting = async (key, val) => {
        // Map prop keys to SecureStore keys
        let storeKey = '';
        if (key === 'showFamily') storeKey = 'settings_show_family';
        if (key === 'autoRoomVisit') storeKey = 'settings_auto_room_visit';
        if (key === 'autoRoomResume') storeKey = 'settings_auto_room_resume';
        if (key === 'showVoiceAssistant') storeKey = 'settings_show_voice_assistant';

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
                            <Text style={styles.itemSub}>Show person badges on dashboard</Text>
                        </View>
                    </View>
                    <Switch
                        value={showFamily}
                        onValueChange={(val) => handleToggleSetting('showFamily', val)}
                        trackColor={{ false: '#767577', true: Colors.primary }}
                        thumbColor={showFamily ? '#fff' : '#f4f3f4'}
                    />
                </View>

                {/* Auto Room (Visit) Toggle */}
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

                {/* Automations Page Button */}
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

                {/* Auto Room (Background) Toggle */}
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

                {/* Voice Assistant Toggle */}
                <View style={styles.listItem}>
                    <View style={styles.itemInfo}>
                        <View style={styles.iconContainer}>
                            <Sparkles size={20} color={Colors.text} />
                        </View>
                        <View>
                            <Text style={styles.itemName}>Voice Assistant</Text>
                            <Text style={styles.itemSub}>Show voice assistant on dashboard</Text>
                        </View>
                    </View>
                    <Switch
                        value={showVoiceAssistant}
                        onValueChange={(val) => handleToggleSetting('showVoiceAssistant', val)}
                        trackColor={{ false: '#767577', true: Colors.primary }}
                        thumbColor={showVoiceAssistant ? '#fff' : '#f4f3f4'}
                    />
                </View>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionHeader}>Data & System</Text>
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
                            await SecureStore.setItemAsync('face_id_enabled', val.toString());
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

            <View style={styles.section}>
                <Text style={styles.sectionHeader}>Quick Actions</Text>

                <TouchableOpacity style={styles.listItem} onPress={onPlayMedia}>
                    <View style={styles.itemInfo}>
                        <View style={styles.iconContainer}>
                            <Play size={20} color={Colors.text} />
                        </View>
                        <Text style={styles.itemName}>Play Media</Text>
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
            </View>
        </ScrollView >
    );

    const renderAccount = () => (
        <ScrollView contentContainerStyle={styles.accountContent}>
            <View style={styles.profileSection}>
                <View style={[styles.iconContainer, { width: 80, height: 80, borderRadius: 40, marginBottom: 16 }]}>
                    <User size={40} color={Colors.text} />
                </View>
                <Text style={styles.profileName}>Zeyad</Text>
                <Text style={styles.profileRole}>Administrator</Text>
            </View>

            <View style={styles.section}>
                {/* Transferred to General Settings */}
            </View>

            <TouchableOpacity
                style={styles.testPushBtn}
                onPress={async () => {
                    try {
                        const adminUrl = process.env.EXPO_PUBLIC_ADMIN_URL?.replace(/\/$/, '');
                        if (!adminUrl) {
                            Alert.alert('Configuration Error', 'EXPO_PUBLIC_ADMIN_URL is missing in .env');
                            return;
                        }

                        const loading = Alert.alert('Sending...', 'Triggering test notification...', [], { cancelable: false });
                        const response = await fetch(`${adminUrl}/api/notifications/send`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                title: 'Test Notification',
                                body: 'This is a test notification from your HA App!',
                                data: { test: true }
                            })
                        });
                        const data = await response.json();
                        if (response.ok) {
                            Alert.alert('Success', `Sent ${data.count} notifications`);
                        } else {
                            Alert.alert('Error', 'Failed to send: ' + (data.error || 'Unknown error'));
                        }
                    } catch (e) {
                        Alert.alert('Error', 'Network Error: ' + e.message);
                    }
                }}
            >
                <Bell size={20} color={Colors.primary} />
                <Text style={styles.testPushText}>Test Push Notification</Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={styles.logoutBtn}
                onPress={() => {
                    // Navigate to login
                    router.replace('/login');
                }}
            >
                <LogOut size={20} color={Colors.error} />
                <Text style={styles.logoutText}>Log Out</Text>
            </TouchableOpacity>
        </ScrollView>
    );


    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Settings</Text>
            </View>

            <View style={styles.tabs}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'general' && styles.activeTab]}
                    onPress={() => { setActiveTab('general'); setSelectedArea(null); }}
                >
                    <Text style={[styles.tabText, activeTab === 'general' && styles.activeTabText]}>General</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'areas' && styles.activeTab]}
                    onPress={() => { setActiveTab('areas'); setSelectedArea(null); }}
                >
                    <Text style={[styles.tabText, activeTab === 'areas' && styles.activeTabText]}>Areas</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'entities' && styles.activeTab]}
                    onPress={() => { setActiveTab('entities'); setSelectedArea(null); }}
                >
                    <Text style={[styles.tabText, activeTab === 'entities' && styles.activeTabText]}>Entities</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'ai' && styles.activeTab]}
                    onPress={() => { setActiveTab('ai'); setSelectedArea(null); }}
                >
                    <Text style={[styles.tabText, activeTab === 'ai' && styles.activeTabText]}>A.I.</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'account' && styles.activeTab]}
                    onPress={() => { setActiveTab('account'); setSelectedArea(null); }}
                >
                    <Text style={[styles.tabText, activeTab === 'account' && styles.activeTabText]}>Account</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.content}>
                {activeTab === 'general' && renderGeneralSettings()}
                {activeTab === 'areas' && (selectedArea ? renderAreaDetails() : renderAreaList())}
                {activeTab === 'entities' && renderEntitiesList()}
                {activeTab === 'ai' && renderAIConfig()}
                {activeTab === 'account' && renderAccount()}
            </View>


            <MonitoredEntitiesModal
                visible={monitoredModalVisible}
                onClose={() => setMonitoredModalVisible(false)}
            />
            <AlertEntitiesModal
                visible={alertModalVisible}
                onClose={() => setAlertModalVisible(false)}
            />
            <MyPreferencesModal
                visible={preferencesModalVisible}
                onClose={() => setPreferencesModalVisible(false)}
            />
            <PreferencedEntitiesModal
                visible={preferencedEntitiesModalVisible}
                onClose={() => setPreferencedEntitiesModalVisible(false)}
            />
        </View >
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: 60,
    },
    header: {
        marginBottom: 20,
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#fff',
    },
    tabs: {
        flexDirection: 'row',
        marginBottom: 20,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: 4,
    },
    tab: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 8,
    },
    activeTab: {
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    tabText: {
        color: Colors.textDim,
        fontWeight: '600',
    },
    activeTabText: {
        color: Colors.text,
        fontWeight: 'bold',
    },
    content: {
        flex: 1,
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
        fontWeight: '500',
        flex: 1, // Added flex to handle long texts
    },
    itemSub: {
        color: Colors.textDim,
        fontSize: 12,
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
        fontWeight: '600',
    },
    detailTitle: {
        color: Colors.text,
        fontSize: 20,
        fontWeight: 'bold',
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
    accountContent: {
        flexGrow: 1, // Changed from flex: 1 to flexGrow: 1 for ScrollView
        alignItems: 'center',
        paddingTop: 40,
    },
    profileSection: {
        alignItems: 'center',
        marginBottom: 60,
    },
    profileName: {
        fontSize: 24,
        fontWeight: 'bold',
        color: Colors.text,
        marginBottom: 4,
    },
    profileRole: {
        fontSize: 16,
        color: Colors.textDim,
    },
    testPushBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(59, 130, 246, 0.1)', // Light Blue
        paddingVertical: 16,
        paddingHorizontal: 32,
        borderRadius: 16,
        gap: 12,
        borderWidth: 1,
        borderColor: 'rgba(59, 130, 246, 0.3)',
        marginBottom: 20
    },
    testPushText: {
        color: Colors.primary,
        fontSize: 16,
    },
    logoutBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 40, // Fixed margin instead of auto
        marginBottom: 40,
        padding: 16, // Increase hit area
    },
    logoutText: {
        color: Colors.error,
        fontSize: 16,
        fontWeight: '600',
    },
});
