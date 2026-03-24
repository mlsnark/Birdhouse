/**
 * HostScreen
 *
 * 1. Creates a Firebase session with a generated room code.
 * 2. Displays the room code for participants to join.
 * 3. Lists connected participants; host can assign each a track URL.
 * 4. "Begin Experience" button writes startAt to Firebase, triggering all
 *    devices to navigate to PlaybackScreen.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { colors, radius } from '../theme';
import {
  generateRoomCode,
  createSession,
  subscribeSession,
  setParticipantTrack,
  initiateStart,
  endSession,
} from '../services/sessionService';
import { getDeviceId } from '../utils/deviceId';
import clockSync from '../services/clockSync';
import audioPlayer from '../services/audioPlayer';

export default function HostScreen({ navigation }) {
  const [phase, setPhase] = useState('setup'); // 'setup' | 'lobby'
  const [hostName, setHostName] = useState('');
  const [hostTrackUrl, setHostTrackUrl] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [session, setSession] = useState(null);
  const [starting, setStarting] = useState(false);
  const [trackDrafts, setTrackDrafts] = useState({}); // { deviceId: url }

  const deviceIdRef = useRef(null);
  const unsubscribeRef = useRef(null);

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;

    (async () => {
      await clockSync.init();
      await audioPlayer.init();
      deviceIdRef.current = await getDeviceId();
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // Navigate to Playback when session status flips to 'starting'.
  useEffect(() => {
    if (!session) return;
    if (session.status === 'starting' && session.startAt) {
      const myEntry = session.participants?.[deviceIdRef.current];
      navigation.replace('Playback', {
        roomCode,
        deviceId: deviceIdRef.current,
        trackUrl: myEntry?.trackUrl ?? '',
        startAt: session.startAt,
        isHost: true,
      });
    }
  }, [session?.status, session?.startAt]);

  // ── Create session ─────────────────────────────────────────────────────────

  async function handleCreate() {
    if (!hostName.trim()) {
      Alert.alert('Name required', 'Please enter your name.');
      return;
    }

    const code = generateRoomCode();
    const deviceId = deviceIdRef.current;

    try {
      await createSession(code, deviceId, hostName.trim(), hostTrackUrl.trim());
      setRoomCode(code);
      setTrackDrafts({ [deviceId]: hostTrackUrl.trim() });

      // Subscribe to live session updates.
      unsubscribeRef.current = subscribeSession(code, (data) => {
        setSession(data);
      });

      setPhase('lobby');
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  }

  // ── Track management ───────────────────────────────────────────────────────

  const handleTrackChange = useCallback((deviceId, url) => {
    setTrackDrafts((d) => ({ ...d, [deviceId]: url }));
  }, []);

  const handleTrackSave = useCallback(async (deviceId) => {
    const url = (trackDrafts[deviceId] ?? '').trim();
    try {
      await setParticipantTrack(roomCode, deviceId, url);
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  }, [roomCode, trackDrafts]);

  // ── Start countdown ────────────────────────────────────────────────────────

  async function handleStart() {
    // Validate every participant has a track URL.
    const participants = session?.participants ?? {};
    const missing = Object.entries(participants).filter(
      ([, p]) => !p.trackUrl?.trim(),
    );
    if (missing.length > 0) {
      Alert.alert(
        'Missing tracks',
        `${missing.length} participant(s) have no track URL assigned. Assign tracks before starting.`,
      );
      return;
    }

    const notReady = Object.entries(participants).filter(
      ([id, p]) => id !== deviceIdRef.current && !p.ready,
    );
    if (notReady.length > 0) {
      Alert.alert(
        'Participants not ready',
        `${notReady.length} participant(s) haven't finished loading their track yet. Start anyway?`,
        [
          { text: 'Wait', style: 'cancel' },
          { text: 'Start Anyway', onPress: doStart },
        ],
      );
      return;
    }

    doStart();
  }

  async function doStart() {
    setStarting(true);
    try {
      await initiateStart(roomCode, 5);
      // Navigation happens in the useEffect above when status changes.
    } catch (err) {
      Alert.alert('Error', err.message);
      setStarting(false);
    }
  }

  // ── Leave / end ────────────────────────────────────────────────────────────

  function handleLeave() {
    Alert.alert('End Session', 'This will disconnect all participants.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Session',
        style: 'destructive',
        onPress: async () => {
          if (unsubscribeRef.current) unsubscribeRef.current();
          await endSession(roomCode).catch(() => {});
          navigation.goBack();
        },
      },
    ]);
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  useEffect(
    () => () => {
      if (unsubscribeRef.current) unsubscribeRef.current();
    },
    [],
  );

  // ── Render: Setup ──────────────────────────────────────────────────────────

  if (phase === 'setup') {
    return (
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.setupScroll}>
            <Text style={styles.sectionTitle}>Host Setup</Text>
            <Text style={styles.sectionSub}>
              Configure the session, then share the room code with participants.
            </Text>

            <Label>Your Name</Label>
            <TextInput
              style={styles.input}
              placeholder="e.g. Alice"
              placeholderTextColor={colors.textDim}
              value={hostName}
              onChangeText={setHostName}
              autoCapitalize="words"
              returnKeyType="next"
            />

            <Label>Your Track URL (optional)</Label>
            <TextInput
              style={styles.input}
              placeholder="https://…/your-track.mp3"
              placeholderTextColor={colors.textDim}
              value={hostTrackUrl}
              onChangeText={setHostTrackUrl}
              autoCapitalize="none"
              keyboardType="url"
              returnKeyType="done"
            />
            <Text style={styles.hint}>
              Leave blank if you are only coordinating (no audio for you).
            </Text>

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={handleCreate}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>Create Session</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Render: Lobby ──────────────────────────────────────────────────────────

  const participants = session?.participants ?? {};
  const participantList = Object.entries(participants);
  const readyCount = participantList.filter(([, p]) => p.ready).length;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.lobbyScroll}>
          {/* Room code card */}
          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>ROOM CODE</Text>
            <Text style={styles.codeText}>{roomCode}</Text>
            <Text style={styles.codeSub}>
              Share this code with all participants
            </Text>
          </View>

          {/* Participant list */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Participants ({participantList.length})
              {'  '}
              <Text style={styles.readyBadge}>
                {readyCount}/{participantList.length} ready
              </Text>
            </Text>

            {participantList.length === 0 && (
              <Text style={styles.emptyHint}>
                Waiting for participants to join…
              </Text>
            )}

            {participantList.map(([id, participant]) => {
              const isMe = id === deviceIdRef.current;
              const draft = trackDrafts[id] ?? participant.trackUrl ?? '';
              const saved = participant.trackUrl ?? '';
              const isDirty = draft !== saved;

              return (
                <View key={id} style={styles.participantCard}>
                  <View style={styles.participantHeader}>
                    <Text style={styles.participantName}>
                      {participant.name}
                      {isMe ? '  (you)' : ''}
                    </Text>
                    <View
                      style={[
                        styles.readyDot,
                        participant.ready && styles.readyDotActive,
                      ]}
                    />
                  </View>

                  <View style={styles.trackRow}>
                    <TextInput
                      style={[styles.trackInput, isDirty && styles.trackInputDirty]}
                      placeholder="Track URL…"
                      placeholderTextColor={colors.textDim}
                      value={draft}
                      onChangeText={(url) => handleTrackChange(id, url)}
                      onBlur={() => handleTrackSave(id)}
                      autoCapitalize="none"
                      keyboardType="url"
                      returnKeyType="done"
                      onSubmitEditing={() => handleTrackSave(id)}
                    />
                    {isDirty && (
                      <TouchableOpacity
                        style={styles.saveBtn}
                        onPress={() => handleTrackSave(id)}
                      >
                        <Text style={styles.saveBtnText}>Save</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {participant.ready && (
                    <Text style={styles.readyText}>Track loaded</Text>
                  )}
                </View>
              );
            })}
          </View>

          {/* Actions */}
          <TouchableOpacity
            style={[styles.primaryBtn, starting && styles.btnDisabled]}
            onPress={handleStart}
            disabled={starting || participantList.length === 0}
            activeOpacity={0.85}
          >
            {starting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Begin Experience</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.dangerBtn} onPress={handleLeave}>
            <Text style={styles.dangerBtnText}>End Session</Text>
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

  // Setup
  setupScroll: { padding: 24, paddingTop: 12 },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  sectionSub: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: 28,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: colors.text,
    fontSize: 15,
    marginBottom: 16,
  },
  hint: {
    fontSize: 12,
    color: colors.textDim,
    marginTop: -10,
    marginBottom: 24,
  },

  // Lobby
  lobbyScroll: { padding: 20, paddingBottom: 40 },
  codeCard: {
    backgroundColor: colors.primaryDim,
    borderRadius: radius.lg,
    padding: 24,
    alignItems: 'center',
    marginBottom: 28,
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 2,
    marginBottom: 8,
  },
  codeText: {
    fontSize: 48,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 8,
  },
  codeSub: {
    marginTop: 8,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  section: { marginBottom: 24 },
  readyBadge: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.accent,
  },
  emptyHint: {
    color: colors.textDim,
    fontSize: 14,
    marginTop: 8,
    fontStyle: 'italic',
  },
  participantCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  participantHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  participantName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  readyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.textDim,
  },
  readyDotActive: { backgroundColor: colors.accent },
  readyText: {
    fontSize: 12,
    color: colors.accent,
    marginTop: 6,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trackInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 13,
  },
  trackInputDirty: { borderColor: colors.primary },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },

  // Shared buttons
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },
  dangerBtn: {
    borderRadius: radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.danger,
  },
  dangerBtnText: { color: colors.danger, fontSize: 15, fontWeight: '600' },
});
