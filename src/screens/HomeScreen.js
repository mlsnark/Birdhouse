/**
 * HomeScreen — landing page.
 * Browse published experiences or join a session directly with a code.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
} from 'react-native';
import { colors, radius } from '../theme';
import { getDeviceId } from '../utils/deviceId';

export default function HomeScreen({ navigation }) {
  const [deviceId, setDeviceId] = useState('');
  useEffect(() => { getDeviceId().then(setDeviceId); }, []);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>

        <View style={s.header}>
          <Text style={s.logo}>🐦</Text>
          <Text style={s.title}>Birdhouse</Text>
          <Text style={s.tagline}>Synchronized audio experiences, together.</Text>
        </View>

        <View style={s.actions}>
          <TouchableOpacity
            style={[s.btn, s.btnPrimary]}
            onPress={() => navigation.navigate('Browse')}
            activeOpacity={0.85}
          >
            <Text style={s.btnIcon}>🎭</Text>
            <View>
              <Text style={s.btnLabel}>Browse Experiences</Text>
              <Text style={s.btnSub}>Explore and host published experiences</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.btn, s.btnSecondary]}
            onPress={() => navigation.navigate('Join')}
            activeOpacity={0.85}
          >
            <Text style={s.btnIcon}>🎧</Text>
            <View>
              <Text style={[s.btnLabel, { color: colors.text }]}>Join with a Code</Text>
              <Text style={[s.btnSub, { color: colors.textMuted }]}>Enter a room code from your host</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View>
          <Text style={s.footer}>
            All devices must be on the same network for best results.
          </Text>
          <Text selectable style={s.deviceId}>Device ID: {deviceId}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: {
    flex: 1, paddingHorizontal: 24,
    justifyContent: 'space-between', paddingBottom: 32,
  },
  header: { marginTop: 64, alignItems: 'center' },
  logo: { fontSize: 64, marginBottom: 12 },
  title: { fontSize: 40, fontWeight: '800', color: colors.text, letterSpacing: -1 },
  tagline: { marginTop: 10, fontSize: 15, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },

  actions: { gap: 14 },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    paddingVertical: 20, paddingHorizontal: 22,
    borderRadius: radius.lg,
  },
  btnPrimary: { backgroundColor: colors.primary },
  btnSecondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  btnIcon: { fontSize: 28 },
  btnLabel: { fontSize: 17, fontWeight: '700', color: '#fff' },
  btnSub: { fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 2 },

  footer: { textAlign: 'center', fontSize: 12, color: colors.textDim, lineHeight: 18 },
  deviceId: { textAlign: 'center', fontSize: 10, color: colors.textDim, marginTop: 6, opacity: 0.5 },
});
