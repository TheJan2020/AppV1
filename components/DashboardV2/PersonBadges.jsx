import React from 'react';
import { View, Text, StyleSheet, Image, ScrollView } from 'react-native';

const HA_URL = process.env.EXPO_PUBLIC_HA_URL?.replace(/\/$/, '');

export default function PersonBadges({ entities, config }) {
    if (!entities) return null;

    const people = entities.filter(e => e.entity_id.startsWith('person.'));

    if (people.length === 0) return null;

    return (
        <View style={styles.container}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scroll}
            >
                {people.map(person => {
                    const isHome = person.state === 'home';
                    const name = person.attributes?.friendly_name || person.entity_id.split('.')[1];
                    // Only append HA_URL if picture path is relative
                    const picturePath = person.attributes?.entity_picture;
                    const picture = picturePath
                        ? (picturePath.startsWith('http') ? picturePath : `${HA_URL}${picturePath}`)
                        : null;

                    return (
                        <View key={person.entity_id} style={styles.personContainer}>
                            <View style={[styles.imageWrapper, isHome ? styles.borderHome : styles.borderAway]}>
                                {picture ? (
                                    <Image source={{ uri: picture }} style={styles.image} />
                                ) : (
                                    <View style={[styles.image, styles.placeholder]}>
                                        <Text style={styles.initials}>{name.charAt(0).toUpperCase()}</Text>
                                    </View>
                                )}
                            </View>
                            <View style={[styles.statusBadge, isHome ? styles.bgHome : styles.bgAway]}>
                                <Text style={styles.statusText}>{person.state}</Text>
                            </View>
                            <Text style={styles.name} numberOfLines={1}>{name}</Text>
                        </View>
                    );
                })}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 20,
        height: 100, // Fixed height to prevent layout jumps
    },
    scroll: {
        paddingHorizontal: 20,
        gap: 20,
        alignItems: 'center'
    },
    personContainer: {
        alignItems: 'center',
        gap: 6
    },
    imageWrapper: {
        width: 60,
        height: 60,
        borderRadius: 30,
        padding: 3, // Space for border
        borderWidth: 2,
        justifyContent: 'center',
        alignItems: 'center',
    },
    borderHome: {
        borderColor: '#4CAF50', // Green
    },
    borderAway: {
        borderColor: '#9E9E9E', // Grey/Red
    },
    image: {
        width: '100%',
        height: '100%',
        borderRadius: 30,
        backgroundColor: '#333'
    },
    placeholder: {
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#555'
    },
    initials: {
        color: '#fff',
        fontSize: 24,
        fontWeight: 'bold'
    },
    statusBadge: {
        position: 'absolute',
        bottom: 24, // Overlap bottom of circle
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.3)',
        zIndex: 10
    },
    bgHome: {
        backgroundColor: '#4CAF50'
    },
    bgAway: {
        backgroundColor: '#757575'
    },
    statusText: {
        color: 'white',
        fontSize: 7,
        fontWeight: 'bold',
        textTransform: 'capitalize'
    },
    name: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 12,
        fontWeight: '500',
        marginTop: 4
    },
    sensorText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 10,
        fontWeight: '400'
    }
});
