import { Pressable, StyleSheet } from 'react-native';

/** Tap-outside-to-dismiss layer — place as first child inside a modal overlay. */
export default function ModalBackdrop({ onPress }) {
    return (
        <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel="Close"
        />
    );
}
