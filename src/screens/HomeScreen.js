/**
 * HomeScreen — landing page.
 * Browse published performances or join a session directly with a code.
 */
import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Image, Clipboard, Alert
} from 'react-native';
import { colors, radius } from '../theme';
import { getDeviceId } from '../utils/deviceId';

export default function HomeScreen({ navigation }) {
  const deviceIdRef = useRef(null);
  useEffect(() => { getDeviceId().then((id) => { deviceIdRef.current = id; }); }, []);

  function handleFooterLongPress() {
    if (!deviceIdRef.current) return;
    Clipboard.setString(deviceIdRef.current);
    Alert.alert('Device ID copied', deviceIdRef.current);
  }
  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>

        <View style={s.header}>
          <Image source={require('../../assets/logo.png')} style={s.logo} resizeMode="contain" />
          <Text style={s.title}>Birdhouse</Text>
          <Text style={s.tagline}>Synchronized audio performances</Text>
        </View>

        <View style={s.actions}>
          <TouchableOpacity
            style={[s.btn, s.btnPrimary]}
            onPress={() => navigation.navigate('Browse')}
            activeOpacity={0.85}
          >
            <Text style={[s.btnIcon, { color: '#ffffff', fontSize: 25 }]}>𓅆</Text>
            <View>
              <Text style={s.btnLabel}>Browse Performances</Text>
              <Text style={s.btnSub}>Explore and host an experience</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.btn, s.btnSecondary]}
            onPress={() => navigation.navigate('Join')}
            activeOpacity={0.85}
          >
            <Text style={[s.btnIcon, { color: '#ffffff', fontSize: 20 }]}>𓉸</Text>
            <View>
              <Text style={[s.btnLabel, { color: colors.text }]}>Join Performance</Text>
              <Text style={[s.btnSub, { color: colors.textMuted }]}>Enter a room code from your host</Text>
            </View>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onLongPress={handleFooterLongPress} delayLongPress={1500}>
          <Text style={s.footer}>
            All devices must be on the same network for best results.
          </Text>
        </TouchableOpacity>
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
  logo: { width: 180, height: 180, marginBottom: 0 },
  title: { fontSize: 40, fontWeight: '800', color: colors.text, letterSpacing: -1 },
  tagline: { marginTop: 10, fontSize: 15, color: colors.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: -60 },

  actions: { gap: 14 },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    paddingVertical: 20, paddingHorizontal: 22,
    borderRadius: radius.lg,
  },
  btnPrimary: { backgroundColor: '#6B5B9E' },
  btnSecondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  btnIcon: { fontSize: 28 },
  btnLabel: { fontSize: 17, fontWeight: '700', color: '#fff' },
  btnSub: { fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 2 },

  footer: { textAlign: 'center', fontSize: 12, color: colors.textDim, lineHeight: 18 },
});
