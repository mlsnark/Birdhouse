/**
 * HostScreen
 *
 * Two modes:
 *  - Experience mode: launched from ExperienceDetailScreen with an experience object.
 *    Roles are pre-filled. Host just enters their name (and optionally picks a role).
 *  - Standalone mode: host defines everything from scratch (legacy flow).
 *
 * Lobby phase is the same in both modes.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, Image, Share,
} from 'react-native';
import * as Linking from 'expo-linking';
import { colors, radius } from '../theme';
import {
  generateRoomCode, createSession, subscribeSession,
  setParticipantTrack, setParticipantRole, markReady, initiateStart, endSession,
} from '../services/sessionService';
import { getLibrary } from '../services/trackLibrary';
import { getDeviceId } from '../utils/deviceId';
import clockSync from '../services/clockSync';
import audioPlayer from '../services/audioPlayer';
import LibraryPickerModal from '../components/LibraryPickerModal';

export default function HostScreen({ navigation, route }) {
  const experience = route.params?.experience ?? null;
  const isExperienceMode = !!experience;

  // Setup state
  const [hostName, setHostName] = useState('');
  const [hostTrackUrl, setHostTrackUrl] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [roles, setRoles] = useState(() => {
    if (!experience?.roles) return [];
    return Object.entries(experience.roles).map(([id, r]) => ({ id, name: r.name, trackUrl: r.trackUrl }));
  });

  // Lobby state
  const [phase, setPhase] = useState('setup');
  const [roomCode, setRoomCode] = useState('');
  const [session, setSession] = useState(null);
  const [starting, setStarting] = useState(false);
  const [trackDrafts, setTrackDrafts] = useState({});

  // Library
  const [library, setLibrary] = useState([]);
  const [libraryModal, setLibraryModal] = useState({ visible: false, onSelect: null });

  const deviceIdRef = useRef(null);
  const unsubscribeRef = useRef(null);

  useEffect(() => {
    (async () => {
      await clockSync.init();
      await audioPlayer.init();
      deviceIdRef.current = await getDeviceId();
      setLibrary(await getLibrary());
    })();
    return () => { if (unsubscribeRef.current) unsubscribeRef.current(); };
  }, []);

  // Re-load host track whenever their trackUrl changes in the lobby (e.g. after role reassignment).
  const loadedHostUrlRef = useRef(null);
  useEffect(() => {
    if (phase !== 'lobby' || !deviceIdRef.current) return;
    const myEntry = session?.participants?.[deviceIdRef.current];
    const url = myEntry?.trackUrl?.trim();
    if (!url || url === loadedHostUrlRef.current) return;
    loadedHostUrlRef.current = url;
    audioPlayer.loadTrack(url)
      .then(() => markReady(roomCode, deviceIdRef.current, true))
      .catch(() => markReady(roomCode, deviceIdRef.current, false));
  }, [session?.participants?.[deviceIdRef.current]?.trackUrl, phase]);

  // Navigate to Playback when session starts
  useEffect(() => {
    if (!session) return;
    if (session.status === 'starting' && session.startAt) {
      const myEntry = session.participants?.[deviceIdRef.current];
      navigation.replace('Playback', {
        roomCode, deviceId: deviceIdRef.current,
        trackUrl: myEntry?.trackUrl ?? '',
        startAt: session.startAt, isHost: true,
      });
    }
  }, [session?.status, session?.startAt]);

  // ── Roles (standalone mode only) ──────────────────────────────────────────

  function addRole() {
    setRoles((r) => [...r, { id: `${Date.now()}`, name: '', trackUrl: '' }]);
  }
  function updateRole(id, patch) {
    setRoles((r) => r.map((role) => (role.id === id ? { ...role, ...patch } : role)));
  }
  function deleteRole(id) {
    setRoles((r) => r.filter((role) => role.id !== id));
  }

  // ── Library ────────────────────────────────────────────────────────────────

  async function refreshLibrary() { setLibrary(await getLibrary()); }

  // ── Create session ─────────────────────────────────────────────────────────

  async function handleCreate() {
    if (!hostName.trim()) { Alert.alert('Name required', 'Please enter your name.'); return; }
    if (!isExperienceMode) {
      const incomplete = roles.find((r) => !r.name.trim() || !r.trackUrl.trim());
      if (incomplete) { Alert.alert('Incomplete role', 'Every role needs a name and a track URL.'); return; }
    }

    const code = generateRoomCode();
    const deviceId = deviceIdRef.current;

    // In experience mode: if a role was selected, use its track
    let myTrackUrl = hostTrackUrl.trim();
    if (isExperienceMode && selectedRoleId) {
      const role = roles.find((r) => r.id === selectedRoleId);
      myTrackUrl = role?.trackUrl ?? '';
    }

    try {
      await createSession(
        code, deviceId, hostName.trim(), myTrackUrl,
        roles,
        experience?.id ?? null,
        experience?.title ?? null,
        isExperienceMode ? (selectedRoleId ?? null) : null,
      );
      setRoomCode(code);
      setTrackDrafts({ [deviceId]: myTrackUrl });

      // Load host's track and mark ready (mirrors what LobbyScreen does for participants).
      if (myTrackUrl) {
        audioPlayer.loadTrack(myTrackUrl)
          .then(() => markReady(code, deviceId, true))
          .catch(() => markReady(code, deviceId, false));
      } else {
        // No track (coordinator only) — host is always considered ready.
        markReady(code, deviceId, true);
      }

      unsubscribeRef.current = subscribeSession(code, (data) => setSession(data));
      setPhase('lobby');
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  }

  // ── Track management (lobby) ───────────────────────────────────────────────

  const handleTrackChange = useCallback((deviceId, url) => {
    setTrackDrafts((d) => ({ ...d, [deviceId]: url }));
  }, []);

  const handleTrackSave = useCallback(async (deviceId) => {
    const url = (trackDrafts[deviceId] ?? '').trim();
    try { await setParticipantTrack(roomCode, deviceId, url); }
    catch (err) { Alert.alert('Error', err.message); }
  }, [roomCode, trackDrafts]);

  // ── Role reassignment (host only) ──────────────────────────────────────────

  function handleReassignRole(deviceId, currentRoleId) {
    const roleOptions = Object.entries(session?.roles ?? {}).map(([roleId, role]) => ({
      text: roleId === currentRoleId ? `${role.name} ✓` : role.name,
      onPress: async () => {
        try { await setParticipantRole(roomCode, deviceId, roleId); }
        catch (err) { Alert.alert('Error', err.message); }
      },
    }));
    Alert.alert('Reassign Role', 'Select a role for this participant:', [
      ...roleOptions,
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  // ── Start ──────────────────────────────────────────────────────────────────

  async function handleStart() {
    const participants = session?.participants ?? {};
    const missing = Object.entries(participants).filter(([, p]) => !p.isHost && !p.trackUrl?.trim());
    if (missing.length > 0) {
      Alert.alert('Missing tracks', `${missing.length} participant(s) have no track URL.`);
      return;
    }
    const anyWithTrack = Object.values(participants).some((p) => p.trackUrl?.trim());
    if (!anyWithTrack) {
      Alert.alert('No tracks assigned', 'At least one participant must have a track before starting.');
      return;
    }
    const notReady = Object.entries(participants).filter(([id, p]) => id !== deviceIdRef.current && !p.ready);
    if (notReady.length > 0) {
      Alert.alert('Not all ready', `${notReady.length} participant(s) still loading.`, [
        { text: 'Wait', style: 'cancel' },
        { text: 'Start Anyway', onPress: doStart },
      ]);
      return;
    }
    doStart();
  }

  async function handleShare() {
    const joinUrl = Linking.createURL('join', { queryParams: { prefillCode: roomCode } });
    const experienceLine = session?.title ? `"${session.title}" on Birdhouse` : 'my Birdhouse session';
    const message = `Join ${experienceLine}!\n\nRoom code: ${roomCode}\n\nTap to open: ${joinUrl}`;
    try {
      await Share.share({ message });
    } catch (_) {}
  }

  async function doStart() {
    setStarting(true);
    try { await initiateStart(roomCode, 5); }
    catch (err) { Alert.alert('Error', err.message); setStarting(false); }
  }

  function handleLeave() {
    Alert.alert('End Session', 'This will disconnect all participants.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Session', style: 'destructive',
        onPress: async () => {
          if (unsubscribeRef.current) unsubscribeRef.current();
          await endSession(roomCode).catch(() => {});
          navigation.goBack();
        },
      },
    ]);
  }

  // ── Render: Setup ──────────────────────────────────────────────────────────

  if (phase === 'setup') {
    return (
      <SafeAreaView style={s.safe}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.setupScroll} keyboardShouldPersistTaps="handled">

            {/* Experience header (experience mode) */}
            {isExperienceMode && (
              <View style={s.experienceHeader}>
                {experience.imageUrl ? (
                  <Image source={{ uri: experience.imageUrl }} style={s.experienceImage} resizeMode="cover" />
                ) : (
                  <View style={[s.experienceImage, s.experienceImagePlaceholder]}>
                    <Text style={s.experienceInitial}>{experience.title.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <Text style={s.experienceTitle}>{experience.title}</Text>
                {!!experience.description && (
                  <Text style={s.experienceSub}>{experience.description}</Text>
                )}
              </View>
            )}

            {!isExperienceMode && (
              <>
                <Text style={s.sectionTitle}>Host Setup</Text>
                <Text style={s.sectionSub}>Configure your session, then share the room code.</Text>
              </>
            )}

            {/* Host name */}
            <Label>Your Name</Label>
            <TextInput
              style={s.input}
              placeholder="e.g. Alice"
              placeholderTextColor={colors.textDim}
              value={hostName}
              onChangeText={setHostName}
              autoCapitalize="words"
            />

            {/* Experience mode: pick a role */}
            {isExperienceMode && roles.length > 0 && (
              <>
                <Label>Your Role (optional)</Label>
                <Text style={s.hint}>Pick a role if you're participating, or leave blank to coordinate only.</Text>
                {roles.map((role) => (
                  <TouchableOpacity
                    key={role.id}
                    style={[s.roleOption, selectedRoleId === role.id && s.roleOptionSelected]}
                    onPress={() => setSelectedRoleId(selectedRoleId === role.id ? null : role.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={s.roleOptionText}>{role.name}</Text>
                    {selectedRoleId === role.id && <Text style={s.roleOptionCheck}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </>
            )}

            {/* Standalone mode: track URL + roles */}
            {!isExperienceMode && (
              <>
                <Label>Your Track URL (optional)</Label>
                <View style={s.urlRow}>
                  <TextInput
                    style={[s.input, { flex: 1, marginBottom: 0 }]}
                    placeholder="https://…/your-track.mp3"
                    placeholderTextColor={colors.textDim}
                    value={hostTrackUrl}
                    onChangeText={setHostTrackUrl}
                    autoCapitalize="none"
                    keyboardType="url"
                  />
                  <TouchableOpacity
                    style={s.libraryBtn}
                    onPress={() => setLibraryModal({ visible: true, onSelect: (t) => setHostTrackUrl(t.url) })}
                  >
                    <Text style={s.libraryBtnText}>Library</Text>
                  </TouchableOpacity>
                </View>
                <Text style={s.hint}>Leave blank if you are only coordinating.</Text>

                <View style={s.rolesHeader}>
                  <Text style={s.sectionTitle}>Roles</Text>
                  <TouchableOpacity style={s.addRoleBtn} onPress={addRole}>
                    <Text style={s.addRoleBtnText}>+ Add Role</Text>
                  </TouchableOpacity>
                </View>
                <Text style={s.sectionSub}>Pre-assign tracks by role. Participants pick when joining.</Text>

                {roles.length === 0 && (
                  <Text style={s.emptyHint}>No roles — you'll assign tracks manually in the lobby.</Text>
                )}

                {roles.map((role) => (
                  <View key={role.id} style={s.roleCard}>
                    <View style={s.roleCardHeader}>
                      <TextInput
                        style={s.roleNameInput}
                        placeholder="Role name (e.g. Soprano)"
                        placeholderTextColor={colors.textDim}
                        value={role.name}
                        onChangeText={(v) => updateRole(role.id, { name: v })}
                        autoCapitalize="words"
                      />
                      <TouchableOpacity onPress={() => deleteRole(role.id)} style={s.removeRoleBtn}>
                        <Text style={s.removeRoleBtnText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={s.urlRow}>
                      <TextInput
                        style={[s.roleUrlInput, { flex: 1 }]}
                        placeholder="Track URL…"
                        placeholderTextColor={colors.textDim}
                        value={role.trackUrl}
                        onChangeText={(v) => updateRole(role.id, { trackUrl: v })}
                        autoCapitalize="none"
                        keyboardType="url"
                      />
                      <TouchableOpacity
                        style={s.libraryBtn}
                        onPress={() => setLibraryModal({ visible: true, onSelect: (t) => updateRole(role.id, { trackUrl: t.url }) })}
                      >
                        <Text style={s.libraryBtnText}>Library</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </>
            )}

            <TouchableOpacity style={s.primaryBtn} onPress={handleCreate} activeOpacity={0.85}>
              <Text style={s.primaryBtnText}>Create Session</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>

        <LibraryPickerModal
          visible={libraryModal.visible}
          library={library}
          onSelect={(track) => {
            libraryModal.onSelect?.(track);
            setLibraryModal({ visible: false, onSelect: null });
          }}
          onClose={() => setLibraryModal({ visible: false, onSelect: null })}
          onLibraryChange={refreshLibrary}
        />
      </SafeAreaView>
    );
  }

  // ── Render: Lobby ──────────────────────────────────────────────────────────

  const participants = session?.participants ?? {};
  const participantList = Object.entries(participants);
  const readyCount = participantList.filter(([, p]) => p.ready).length;
  const sessionRoles = session?.roles ?? {};
  const hasRoles = Object.keys(sessionRoles).length > 0;

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.lobbyScroll}>

          {/* Room code — tap to share */}
          <TouchableOpacity style={s.codeCard} onPress={handleShare} activeOpacity={0.85}>
            {session?.title && <Text style={s.sessionTitle}>{session.title}</Text>}
            <Text style={s.codeLabel}>ROOM CODE</Text>
            <Text style={s.codeText}>{roomCode}</Text>
            <Text style={s.codeSub}>Tap to share with participants ↑</Text>
          </TouchableOpacity>

          {/* Roles overview */}
          {hasRoles && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Roles</Text>
              {Object.entries(sessionRoles).map(([roleId, role]) => {
                const holders = participantList.filter(([, p]) => p.roleId === roleId);
                return (
                  <View key={roleId} style={s.roleStatusCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.roleStatusName}>{role.name}</Text>
                      <Text style={s.roleStatusUrl} numberOfLines={1}>{role.trackUrl}</Text>
                    </View>
                    {holders.length > 0 ? (
                      <View style={s.claimedBadge}>
                        <View style={[s.readyDot, holders.some(([,p]) => p.ready) && s.readyDotActive]} />
                        <Text style={s.claimedName}>{holders.map(([,p]) => p.name).join(', ')}</Text>
                      </View>
                    ) : (
                      <Text style={s.unclaimedText}>open</Text>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* Participants */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>
              Participants ({participantList.length}){'  '}
              <Text style={s.readyBadge}>{readyCount}/{participantList.length} ready</Text>
            </Text>

            {participantList.length === 0 && (
              <Text style={s.emptyHint}>Waiting for participants to join…</Text>
            )}

            {participantList.map(([id, participant]) => {
              const isMe = id === deviceIdRef.current;
              const draft = trackDrafts[id] ?? participant.trackUrl ?? '';
              const saved = participant.trackUrl ?? '';
              const isDirty = draft !== saved;
              const hasRole = !!participant.roleId;

              return (
                <View key={id} style={s.participantCard}>
                  <View style={s.participantHeader}>
                    <View>
                      <Text style={s.participantName}>{participant.name}{isMe ? '  (you)' : ''}</Text>
                      {hasRoles && (
                        <TouchableOpacity onPress={() => handleReassignRole(id, participant.roleId)}>
                          <Text style={[s.participantRole, s.participantRoleTap]}>
                            {participant.roleId && sessionRoles[participant.roleId]
                              ? sessionRoles[participant.roleId].name
                              : 'No role — tap to assign'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <View style={[s.readyDot, participant.ready && !!participant.trackUrl?.trim() && s.readyDotActive]} />
                  </View>

                  {!hasRole && (
                    <View style={s.trackRow}>
                      <TextInput
                        style={[s.trackInput, isDirty && s.trackInputDirty]}
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
                        <TouchableOpacity style={s.saveBtn} onPress={() => handleTrackSave(id)}>
                          <Text style={s.saveBtnText}>Save</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  {participant.ready && !!participant.trackUrl?.trim() && <Text style={s.readyText}>Track loaded</Text>}
                </View>
              );
            })}
          </View>

          <TouchableOpacity
            style={[s.primaryBtn, starting && s.btnDisabled]}
            onPress={handleStart}
            disabled={starting || participantList.length === 0}
            activeOpacity={0.85}
          >
            {starting ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Begin Experience</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={s.dangerBtn} onPress={handleLeave}>
            <Text style={s.dangerBtnText}>End Session</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Label({ children }) {
  return <Text style={s.label}>{children}</Text>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  setupScroll: { padding: 24, paddingTop: 12, paddingBottom: 40 },
  lobbyScroll: { padding: 20, paddingBottom: 40 },

  experienceHeader: { alignItems: 'center', marginBottom: 28 },
  experienceImage: { width: 120, height: 180, borderRadius: radius.md, marginBottom: 16, overflow: 'hidden' },
  experienceImagePlaceholder: { backgroundColor: colors.primaryDim, alignItems: 'center', justifyContent: 'center' },
  experienceInitial: { fontSize: 48, fontWeight: '900', color: 'rgba(255,255,255,0.4)' },
  experienceTitle: { fontSize: 24, fontWeight: '800', color: colors.text, textAlign: 'center', marginBottom: 6 },
  experienceSub: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },

  sectionTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 6 },
  sectionSub: { fontSize: 14, color: colors.textMuted, lineHeight: 20, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  hint: { fontSize: 12, color: colors.textDim, marginTop: 4, marginBottom: 16 },
  emptyHint: { color: colors.textDim, fontSize: 13, fontStyle: 'italic', marginBottom: 16 },

  input: {
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 14,
    color: colors.text, fontSize: 15, marginBottom: 16,
  },

  roleOption: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 2, borderColor: colors.border,
    paddingHorizontal: 16, paddingVertical: 14, marginBottom: 8,
  },
  roleOptionSelected: { borderColor: colors.primary, backgroundColor: colors.primaryDim },
  roleOptionText: { fontSize: 16, fontWeight: '600', color: colors.text },
  roleOptionCheck: { fontSize: 18, color: colors.accent },

  urlRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  libraryBtn: { backgroundColor: colors.primaryDim, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 14 },
  libraryBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },

  rolesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 6 },
  addRoleBtn: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 8 },
  addRoleBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  roleCard: {
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 10,
  },
  roleCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  roleNameInput: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 15,
  },
  removeRoleBtn: { padding: 6 },
  removeRoleBtnText: { color: colors.danger, fontSize: 18, fontWeight: '700' },
  roleUrlInput: {
    backgroundColor: colors.surface, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 13,
  },

  primaryBtn: {
    backgroundColor: colors.primary, borderRadius: radius.lg,
    paddingVertical: 16, alignItems: 'center', marginTop: 24, marginBottom: 12,
  },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },
  dangerBtn: { borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.danger },
  dangerBtnText: { color: colors.danger, fontSize: 15, fontWeight: '600' },

  codeCard: { backgroundColor: colors.primaryDim, borderRadius: radius.lg, padding: 24, alignItems: 'center', marginBottom: 28 },
  sessionTitle: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.7)', marginBottom: 8 },
  codeLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: 2, marginBottom: 8 },
  codeText: { fontSize: 48, fontWeight: '900', color: '#fff', letterSpacing: 8 },
  codeSub: { marginTop: 8, fontSize: 13, color: 'rgba(255,255,255,0.5)' },

  section: { marginBottom: 24 },
  readyBadge: { fontSize: 14, fontWeight: '500', color: colors.accent },

  roleStatusCard: {
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    padding: 12, marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  roleStatusName: { fontSize: 15, fontWeight: '600', color: colors.text },
  roleStatusUrl: { fontSize: 11, color: colors.textDim, marginTop: 2 },
  claimedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  claimedName: { fontSize: 13, color: colors.text, fontWeight: '500' },
  unclaimedText: { fontSize: 12, color: colors.textDim, fontStyle: 'italic' },

  participantCard: {
    backgroundColor: colors.card, borderRadius: radius.md,
    padding: 14, marginTop: 10, borderWidth: 1, borderColor: colors.border,
  },
  participantHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  participantName: { fontSize: 15, fontWeight: '600', color: colors.text },
  participantRole: { fontSize: 12, color: colors.primary, marginTop: 2 },
  participantRoleTap: { textDecorationLine: 'underline' },
  readyDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.textDim },
  readyDotActive: { backgroundColor: colors.accent },
  readyText: { fontSize: 12, color: colors.accent, marginTop: 6 },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trackInput: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 13,
  },
  trackInputDirty: { borderColor: colors.primary },
  saveBtn: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10 },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});
