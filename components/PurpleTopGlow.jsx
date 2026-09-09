import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

/**
 * Purple header glow used on Home. Rendered with expo-image so Android
 * does not steal taps the way a stacked React Native Image overlay did.
 */
export default function PurpleTopGlow() {
    return (
        <View
            pointerEvents="none"
            collapsable={false}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={styles.wrap}
        >
            <Image
                source={require('../assets/shadow.png')}
                style={styles.image}
                contentFit="contain"
                pointerEvents="none"
                accessible={false}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 462.37,
        alignItems: 'center',
        zIndex: 1,
        elevation: 0,
    },
    image: {
        width: 521.82,
        height: 462.37,
    },
});
