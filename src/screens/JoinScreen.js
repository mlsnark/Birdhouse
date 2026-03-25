/**
 * JoinScreen — two-phase join flow.
 *
 * Phase 1 ("lookup"): enter room code + name → fetch session
 * Phase 2 ("roles"):  if the session has roles, show a role picker
 *                     otherwise join immediately (no roles defined)
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { colors, radius } from '../theme';
import { fetchSession, joinSession, joinSessionWithRole } from '../services/sessionService';
import { getDeviceId } from '../utils/deviceId';
import clockSync from '../services/clockSync';
import audioPlayer from '../services/audioPlayer';

export default function JoinScreen({ navigation }) {
  const [phase, setPhase] = useState('lookup'); // 'lookup' | 'roles'
  const [roomCode, setRoomCode] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState(null);
  const [selectedRoleId, setSelectedRoleId] = useState(null);

  const deviceIdRef = useRef(null);

  useEffect(() => {
    (async () => {
      await clockSync.init();
      await audioPlayer.init();
      deviceIdRef.current = await getDeviceId();
    })();
  }, []);

  // ── Phase 1: look up session ───────────────────────────────────────────────

  async function handleLookup() {
    const code = roomCode.trim().toUpperCase();
    const trimmedName = name.trim();

    if (code.length !== 6) {
      Alert.alert('Invalid code', 'Room codes are 6 characters long.');
      return;
    }
    if (!trimmedName) {
      Alert.alert('Name required', 'Please enter your name.');
      return;
    }

    setLoading(true);
    try {
      const data = await fetchSession(code);

      if (data.status !== 'lobby') {
        Alert.alert('Session unavailable', 'This session has already started.');
        setLoading(false);
        return;
      }

      const roles = data.roles ?? {};
      const hasRoles = Object.keys(roles).length > 0;

      if (hasRoles) {
        setSession(data);
        setPhase('roles');
        setLoading(false);
      } else {
        // No roles — join directly
        await joinSession(code, deviceIdRef.current, trimmedName);
        navigation.replace('Lobby', {
          roomCode: code,
          deviceId: deviceIdRef.current,
          name: trimmedName,
        });
      }
    } catch (err) {
      Alert.alert('Could not join', err.message);
      setLoading(false);
    }
  }

  // ── Phase 2: claim role and join ───────────────────────────────────────────

  async function handleJoinWithRole() {
    if (!selectedRoleId) {
      Alert.alert('Pick a role', 'Please select a role before joining.');
      return;
    }

    const code = roomCode.trim().toUpperCase();
    const trimmedName = name.trim();

    setLoading(true);
    try {
      await joinSessionWithRole(code, deviceIdRef.current, trimmedName, selectedRoleId);
      navigation.replace('Lobby', {
        roomCode: code,
        deviceId: deviceIdRef.current,
        name: trimmedName,
      });
    } catch (err) {
      Alert.alert('Could not join', err.message);
      // Refresh session in case a role was just taken
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
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>Join a Session</Text>
            <Text style={styles.sub}>Ask your host for the 6-character room code.</Text>

            <Label>Room Code</Label>
            <TextInput
              style={styles.codeInput}
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
              style={styles.input}
              placeholder="e.g. Bob"
              placeholderTextColor={colors.textDim}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={handleLookup}
            />

            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.btnDisabled]}
              onPress={handleLookup}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Continue</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Render: Role picker ────────────────────────────────────────────────────

  const roles = session?.roles ?? {};
  const participants = session?.participants ?? {};

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>Pick Your Role</Text>
          <Text style={styles.sub}>
            Select the part you will play in this session.
          </Text>

          {Object.entries(roles).map(([roleId, role]) => {
            const isTaken = role.takenBy && role.takenBy !== deviceIdRef.current;
            const takenByName = isTaken ? participants[role.takenBy]?.name : null;
            const isSelected = selectedRoleId === roleId;

            return (
              <TouchableOpacity
                key={roleId}
                style={[
                  styles.roleCard,
                  isSelected && styles.roleCardSelected,
                  isTaken && styles.roleCardTaken,
                ]}
                onPress={() => !isTaken && setSelectedRoleId(roleId)}
                disabled={isTaken}
                activeOpacity={0.8}
              >
                <View style={styles.roleCardContent}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.roleName, isTaken && styles.roleNameTaken]}>{role.name}</Text>
                    {isTaken && (
                      <Text style={styles.roleTakenText}>Taken by {takenByName ?? 'someone'}</Text>
                    )}
                  </View>
                  {isSelected && <Text style={styles.roleCheckmark}>✓</Text>}
                </View>
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            style={[styles.primaryBtn, (loading || !selectedRoleId) && styles.btnDisabled, { marginTop: 24 }]}
            onPress={handleJoinWithRole}
            disabled={loading || !selectedRoleId}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>
                {selectedRoleId ? `Join as ${roles[selectedRoleId]?.name}` : 'Select a Role'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.backBtn} onPress={() => setPhase('lookup')}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Label({ children }) {
  return <Text style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 24, paddingTop: 12 },
  title: { fontSize: 26, fontWeight: '700', color: colors.text, marginBottom: 6 },
  sub: { fontSize: 14, color: colors.textMuted, marginBottom: 32, lineHeight: 20 },
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

  roleCard: {
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 2, borderColor: colors.border,
    padding: 16, marginBottom: 10,
  },
  roleCardSelected: { borderColor: colors.primary, backgroundColor: colors.primaryDim },
  roleCardTaken: { opacity: 0.4 },
  roleCardContent: { flexDirection: 'row', alignItems: 'center' },
  roleName: { fontSize: 17, fontWeight: '700', color: colors.text },
  roleNameTaken: { color: colors.textMuted },
  roleTakenText: { fontSize: 12, color: colors.textDim, marginTop: 2 },
  roleCheckmark: { fontSize: 20, color: colors.accent, fontWeight: '700' },

  backBtn: { marginTop: 16, alignItems: 'center', paddingVertical: 10 },
  backBtnText: { color: colors.textMuted, fontSize: 15 },
});
