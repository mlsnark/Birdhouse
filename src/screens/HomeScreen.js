import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { colors, radius } from '../theme';

export default function HomeScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Wordmark */}
        <View style={styles.header}>
          <Text style={styles.logo}>🐦</Text>
          <Text style={styles.title}>Birdhouse</Text>
          <Text style={styles.tagline}>
            Synchronized audio experiences, together.
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary]}
            onPress={() => navigation.navigate('Host')}
            activeOpacity={0.85}
          >
            <Text style={styles.btnIcon}>🎙</Text>
            <View>
              <Text style={styles.btnLabel}>Host a Session</Text>
              <Text style={styles.btnSub}>
                Create a room and control playback
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, styles.btnSecondary]}
            onPress={() => navigation.navigate('Join')}
            activeOpacity={0.85}
          >
            <Text style={styles.btnIcon}>🎧</Text>
            <View>
              <Text style={styles.btnLabel}>Join a Session</Text>
              <Text style={styles.btnSub}>
                Enter a room code to participate
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>
          All devices must be on the same network for best results.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    paddingBottom: 32,
  },
  header: {
    marginTop: 64,
    alignItems: 'center',
  },
  logo: {
    fontSize: 64,
    marginBottom: 12,
  },
  title: {
    fontSize: 40,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -1,
  },
  tagline: {
    marginTop: 10,
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  actions: {
    gap: 14,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 20,
    paddingHorizontal: 22,
    borderRadius: radius.lg,
  },
  btnPrimary: {
    backgroundColor: colors.primary,
  },
  btnSecondary: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnIcon: {
    fontSize: 28,
  },
  btnLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  btnSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  footer: {
    textAlign: 'center',
    fontSize: 12,
    color: colors.textDim,
    lineHeight: 18,
  },
});
