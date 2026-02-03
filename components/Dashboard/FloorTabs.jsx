import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/Colors';
import { House } from 'lucide-react-native';

const FLOORS = [
    { id: 'Default View', label: 'Home', icon: House },
    { id: 'GF', label: 'GF' }
];

export default function FloorTabs({ activeTab, onTabChange }) {
    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.container}
            contentContainerStyle={styles.content}
        >
            {FLOORS.map((floor) => {
                const isActive = activeTab === floor.id;
                const Icon = floor.icon;

                return (
                    <TouchableOpacity
                        key={floor.id}
                        style={[styles.tab, isActive && styles.activeTab]}
                        onPress={() => onTabChange(floor.id)}
                    >
                        {Icon ? (
                            <Icon size={20} color={isActive ? '#000' : Colors.textDim} />
                        ) : (
                            <Text style={[styles.tabText, isActive && styles.activeTabText]}>
                                {floor.label}
                            </Text>
                        )}
                    </TouchableOpacity>
                );
            })}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 20,
    },
    content: {
        paddingHorizontal: 20,
    },
    tab: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 25,
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: Colors.surface,
        marginRight: 10,
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: 44,
    },
    activeTab: {
        backgroundColor: '#FF8A80',
        borderColor: '#FF8A80',
    },
    tabText: {
        color: Colors.textDim,
        fontWeight: '600',
        fontSize: 15,
    },
    activeTabText: {
        color: '#000',
        fontWeight: 'bold',
    },
});
