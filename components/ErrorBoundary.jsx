import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';

export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ errorInfo });
        console.error('[ErrorBoundary] Caught error:', error?.message);
        console.error('[ErrorBoundary] Component stack:', errorInfo?.componentStack);
    }

    render() {
        if (this.state.hasError) {
            return (
                <View style={styles.container}>
                    <Text style={styles.title}>Something went wrong</Text>
                    <ScrollView style={styles.scroll}>
                        <Text style={styles.errorText}>{this.state.error?.toString()}</Text>
                        {this.state.errorInfo?.componentStack && (
                            <Text style={styles.stackText}>{this.state.errorInfo.componentStack}</Text>
                        )}
                    </ScrollView>
                    <TouchableOpacity
                        style={styles.button}
                        onPress={() => this.setState({ hasError: false, error: null, errorInfo: null })}
                    >
                        <Text style={styles.buttonText}>Try Again</Text>
                    </TouchableOpacity>
                </View>
            );
        }

        return this.props.children;
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#16161e',
        padding: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        color: '#FF5252',
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 16,
    },
    scroll: {
        maxHeight: 300,
        width: '100%',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: 12,
        marginBottom: 20,
    },
    errorText: {
        color: '#FF8A80',
        fontSize: 14,
        marginBottom: 8,
    },
    stackText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 11,
    },
    button: {
        backgroundColor: '#8947ca',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 12,
    },
    buttonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 16,
    },
});
