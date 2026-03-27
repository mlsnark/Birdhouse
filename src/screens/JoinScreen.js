/**
 * JoinScreen — two-phase join flow.
 *
 * Phase 1 ("lookup"): enter room code + name → fetch session
 * Phase 2 ("roles"):  show experience info + role picker (if roles defined)
 *                     otherwise join immediately
 *
 * Can receive prefillCode from ExperienceDetailScreen.
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, Alert, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView, Image,
} from 'react-native';
import { colors, radius } from '../theme';
import { fetchSession, joinSession, joinSessionWithRole, joinLate } from '../services/sessionService';
import { getDeviceId } from '../utils/deviceId';
import clockSync from '../services/clockSync';
import audioPlayer from '../services/audioPlayer';

const POSTER_COLORS = ['#4C1D95', '#065F46', '#1E3A5F', '#7C2D12', '#374151', '#713F12'];
function posterColor(title = '') {
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return POSTER_COLORS[h % POSTER_COLORS.length];
}

export default function JoinScreen({ navigation, route }) {
  const prefillCode = route.params?.prefillCode ?? '';

  const [phase, setPhase] = useState('lookup');
  const [roomCode, setRoomCode] = useState(prefillCode);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState(null);
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [lateJoin, setLateJoin] = useState(false);

  const deviceIdRef = useRef(null);

  useEffect(() => {
    (async () => {
      await clockSync.init();
      await audioPlayer.init();
      deviceIdRef.current = await getDeviceId();
    })();
  }, []);

  // ── Phase 1 ────────────────────────────────────────────────────────────────

  async function handleLookup() {
    const code = roomCode.trim().toUpperCase();
    const trimmedName = name.trim();

    if (code.length !== 6) { Alert.alert('Invalid code', 'Room codes are 6 characters.'); return; }
    if (!trimmedName) { Alert.alert('Name required', 'Please enter your name.'); return; }

    setLoading(true);
    try {
      const data = await fetchSession(code);

      if (data.status === 'starting') {
        // Session already in progress — late join flow
        const hasRoles = Object.keys(data.roles ?? {}).length > 0;
        setSession(data);
        setLateJoin(true);
        if (hasRoles) {
          setPhase('roles');
          setLoading(false);
        } else {
          // No roles: join late with no track URL, go straight to playback
          await joinLate(code, deviceIdRef.current, trimmedName, null);
          navigation.replace('Playback', {
            roomCode: code, deviceId: deviceIdRef.current,
            trackUrl: '', startAt: data.startAt, isHost: false, lateJoin: true,
          });
        }
        return;
      }

      if (data.status !== 'lobby') {
        Alert.alert('Session unavailable', 'This session has ended.');
        setLoading(false);
        return;
      }

      const hasRoles = Object.keys(data.roles ?? {}).length > 0;
      if (hasRoles) {
        setSession(data);
        setPhase('roles');
        setLoading(false);
      } else {
        await joinSession(code, deviceIdRef.current, trimmedName);
        navigation.replace('Lobby', { roomCode: code, deviceId: deviceIdRef.current, name: trimmedName });
      }
    } catch (err) {
      Alert.alert('Could not join', err.message);
      setLoading(false);
    }
  }

  // ── Phase 2 ────────────────────────────────────────────────────────────────

  async function handleJoinWithRole() {
    if (!selectedRoleId) { Alert.alert('Pick a role', 'Please select a role before joining.'); return; }

    const code = roomCode.trim().toUpperCase();
    const trimmedName = name.trim();

    setLoading(true);
    try {
      if (lateJoin) {
        const { session: live, trackUrl } = await joinLate(code, deviceIdRef.current, trimmedName, selectedRoleId);
        navigation.replace('Playback', {
          roomCode: code, deviceId: deviceIdRef.current,
          trackUrl, startAt: live.startAt, isHost: false, lateJoin: true,
        });
      } else {
        await joinSessionWithRole(code, deviceIdRef.current, trimmedName, selectedRoleId);
        navigation.replace('Lobby', { roomCode: code, deviceId: deviceIdRef.current, name: trimmedName });
      }
    } catch (err) {
      Alert.alert('Could not join', err.message);
      try {
        const refreshed = await fetchSession(code);
        setSession(refreshed);
      } catch {}
      setLoading(false);
    }
  }

  // ── Render: Lookup ─────────────────────────────────────────────────────────

  if (phase === 'lookup') {
    return (
      <SafeAreaView style={s.safe}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.container}>
            <Text style={s.title}>Join a Session</Text>
            <Text style={s.sub}>Ask your host for the 6-character room code.</Text>

            <Label>Room Code</Label>
            <TextInput
              style={s.codeInput}
              placeholder="XXXXXX"
              placeholderTextColor={colors.textDim}
              value={roomCode}
              onChangeText={(t) => setRoomCode(t.toUpperCase())}
              autoCapitalize="characters"
              maxLength={6}
              returnKeyType="next"
            />

            <Label>Your Name</Label>
            <TextInput
              style={s.input}
              placeholder="e.g. Bob"
              placeholderTextColor={colors.textDim}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={handleLookup}
            />

            <TouchableOpacity
              style={[s.primaryBtn, loading && s.btnDisabled]}
              onPress={handleLookup}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Continue</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Render: Role picker ────────────────────────────────────────────────────

  const roles = session?.roles ?? {};
  const participants = session?.participants ?? {};
  const bgColor = posterColor(session?.title ?? '');

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.container}>

        {/* Experience info */}
        {session?.title && (
          <View style={s.experienceCard}>
            <Text style={s.experienceTitle}>{session.title}</Text>
            <Text style={s.experienceSub}>Room · {roomCode.toUpperCase()}</Text>
          </View>
        )}

        {lateJoin && (
          <View style={s.lateJoinBanner}>
            <Text style={s.lateJoinText}>Session in progress — you'll sync to the current position</Text>
          </View>
        )}

        <Text style={s.title}>Pick Your Role</Text>
        <Text style={s.sub}>Select the part you will play in this session.</Text>

        {Object.entries(roles).map(([roleId, role]) => {
          const isSelected = selectedRoleId === roleId;
          const othersWithRole = Object.values(participants).filter(
            (p) => p.roleId === roleId && p.name
          );

          return (
            <TouchableOpacity
              key={roleId}
              style={[s.roleCard, isSelected && s.roleCardSelected]}
              onPress={() => setSelectedRoleId(roleId)}
              activeOpacity={0.8}
            >
              <View style={s.roleCardContent}>
                <View style={{ flex: 1 }}>
                  <Text style={s.roleName}>{role.name}</Text>
                  {othersWithRole.length > 0 && (
                    <Text style={s.roleTakenText}>
                      {othersWithRole.map((p) => p.name).join(', ')} also selected
                    </Text>
                  )}
                </View>
                {isSelected && <Text style={s.roleCheck}>✓</Text>}
              </View>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          style={[s.primaryBtn, (loading || !selectedRoleId) && s.btnDisabled, { marginTop: 24 }]}
          onPress={handleJoinWithRole}
          disabled={loading || !selectedRoleId}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.primaryBtnText}>
              {selectedRoleId
                ? (lateJoin ? `Join Live as ${roles[selectedRoleId]?.name}` : `Join as ${roles[selectedRoleId]?.name}`)
                : 'Select a Role'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={s.backBtn} onPress={() => setPhase('lookup')}>
          <Text style={s.backBtnText}>← Back</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Label({ children }) {
  return <Text style={s.label}>{children}</Text>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 24, paddingTop: 12 },
  title: { fontSize: 26, fontWeight: '700', color: colors.text, marginBottom: 6 },
  sub: { fontSize: 14, color: colors.textMuted, marginBottom: 28, lineHeight: 20 },
  label: {
    fontSize: 13, fontWeight: '600', color: colors.textMuted,
    marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  codeInput: {
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 20, paddingVertical: 18,
    color: colors.text, fontSize: 32, fontWeight: '800',
    letterSpacing: 6, textAlign: 'center', marginBottom: 24,
  },
  input: {
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 14,
    color: colors.text, fontSize: 15, marginBottom: 28,
  },
  primaryBtn: {
    backgroundColor: colors.primary, borderRadius: radius.lg,
    paddingVertical: 16, alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },

  experienceCard: {
    backgroundColor: colors.primaryDim, borderRadius: radius.md,
    padding: 16, marginBottom: 24, alignItems: 'center',
  },
  experienceTitle: { fontSize: 18, fontWeight: '800', color: '#fff', textAlign: 'center' },
  experienceSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4 },

  roleCard: {
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 2, borderColor: colors.border,
    padding: 16, marginBottom: 10,
  },
  roleCardSelected: { borderColor: colors.primary, backgroundColor: colors.primaryDim },
  roleCardContent: { flexDirection: 'row', alignItems: 'center' },
  roleName: { fontSize: 17, fontWeight: '700', color: colors.text },
  roleTakenText: { fontSize: 12, color: colors.textDim, marginTop: 2 },
  roleCheck: { fontSize: 20, color: colors.accent, fontWeight: '700' },

  backBtn: { marginTop: 16, alignItems: 'center', paddingVertical: 10 },
  backBtnText: { color: colors.textMuted, fontSize: 15 },

  lateJoinBanner: {
    backgroundColor: colors.accentDim ?? '#1a3a2a',
    borderRadius: radius.md, padding: 12, marginBottom: 16,
    borderWidth: 1, borderColor: colors.accent,
  },
  lateJoinText: { color: colors.accent, fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
