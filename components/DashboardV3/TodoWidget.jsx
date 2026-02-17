import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { ListTodo, Square, CheckSquare } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import * as Haptics from 'expo-haptics';

const DUMMY_ITEMS = [
    { uid: 'demo-1', summary: 'Buy groceries', status: 'needs_action' },
    { uid: 'demo-2', summary: 'Fix kitchen light', status: 'needs_action' },
    { uid: 'demo-3', summary: 'Schedule dentist', status: 'completed' },
    { uid: 'demo-4', summary: 'Clean garage', status: 'needs_action' },
    { uid: 'demo-5', summary: 'Update smart plugs firmware', status: 'completed' },
];

export default function TodoWidget({ entities, sendMessage, callService, span = 1, totalColumns = 4 }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [todoEntityId, setTodoEntityId] = useState(null);
    const [isDummy, setIsDummy] = useState(false);

    const todoEntities = entities.filter(e => e.entity_id.startsWith('todo.'));

    useEffect(() => {
        if (todoEntities.length > 0) {
            const firstTodo = todoEntities[0].entity_id;
            setTodoEntityId(firstTodo);
            fetchItems(firstTodo);
        } else {
            // No todo entities — show dummy data
            setItems(DUMMY_ITEMS);
            setIsDummy(true);
            setLoading(false);
        }
    }, [todoEntities.length]);

    const fetchItems = async (entityId) => {
        if (!sendMessage || !entityId) {
            setLoading(false);
            return;
        }

        try {
            const result = await sendMessage({
                type: 'todo/item/list',
                entity_id: entityId,
            });

            if (result?.items) {
                setItems(result.items);
            }
        } catch (e) {
            console.log('[TodoWidget] Error:', e);
        }
        setLoading(false);
    };

    const handleToggle = async (item) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        const newStatus = item.status === 'completed' ? 'needs_action' : 'completed';

        if (isDummy) {
            // Just toggle locally for demo items
            setItems(prev =>
                prev.map(i => i.uid === item.uid ? { ...i, status: newStatus } : i)
            );
            return;
        }

        if (!callService || !todoEntityId) return;

        try {
            await callService('todo', 'update_item', {
                entity_id: todoEntityId,
                item: item.uid,
                status: newStatus,
            });

            setItems(prev =>
                prev.map(i => i.uid === item.uid ? { ...i, status: newStatus } : i)
            );
        } catch (e) {
            console.log('[TodoWidget] Toggle error:', e);
        }
    };

    const widthPercent = `${(span / totalColumns) * 100 - 1}%`;
    const pendingCount = items.filter(i => i.status !== 'completed').length;

    return (
        <View style={[styles.card, { width: widthPercent }]}>
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <ListTodo size={16} color={Colors.textDim} />
                    <Text style={styles.title}>To-Do</Text>
                </View>
                {pendingCount > 0 && (
                    <View style={styles.countBadge}>
                        <Text style={styles.countText}>{pendingCount}</Text>
                    </View>
                )}
            </View>

            {loading ? (
                <ActivityIndicator size="small" color={Colors.textDim} style={{ paddingVertical: 16 }} />
            ) : items.length === 0 ? (
                <Text style={styles.empty}>No items</Text>
            ) : (
                <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
                    {items.map(item => {
                        const done = item.status === 'completed';
                        return (
                            <TouchableOpacity
                                key={item.uid}
                                style={styles.itemRow}
                                onPress={() => handleToggle(item)}
                                activeOpacity={0.7}
                            >
                                {done ? (
                                    <CheckSquare size={16} color="#81C784" />
                                ) : (
                                    <Square size={16} color={Colors.textDim} />
                                )}
                                <Text style={[styles.itemText, done && styles.itemDone]} numberOfLines={1}>
                                    {item.summary}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        borderRadius: 20,
        padding: 16,
        marginBottom: 10,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    title: {
        color: Colors.text,
        fontSize: 14,
        fontWeight: '600',
    },
    countBadge: {
        backgroundColor: '#8947ca',
        borderRadius: 10,
        paddingHorizontal: 7,
        paddingVertical: 2,
    },
    countText: {
        color: 'white',
        fontSize: 11,
        fontWeight: '700',
    },
    empty: {
        color: Colors.textDim,
        fontSize: 13,
        textAlign: 'center',
        paddingVertical: 16,
    },
    list: {
        maxHeight: 200,
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 6,
    },
    itemText: {
        color: Colors.text,
        fontSize: 13,
        flex: 1,
    },
    itemDone: {
        color: Colors.textDim,
        textDecorationLine: 'line-through',
    },
});
