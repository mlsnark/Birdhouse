/**
 * LobbyScreen — participant waiting room.
 *
 * Responsibilities:
 *  1. Subscribe to session updates.
 *  2. When the host assigns a track URL, start loading it via audioPlayer.
 *  3. Mark ready:true in Firebase once the track is fully loaded.
 *  4. When session.status → 'starting', navigate to PlaybackScreen.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { colors, radius } from '../theme';
import { subscribeSession, markReady } from '../services/sessionService';
import audioPlayer from '../services/audioPlayer';

export default function LobbyScreen({ navigation, route }) {
  const { roomCode, deviceId, name } = route.params;

  const [session, setSession] = useState(null);
  const [loadingTrack, setLoadingTrack] = useState(false);
  const [trackLoaded, setTrackLoaded] = useState(false);
  const [trackError, setTrackError] = useState(null);

  const loadedUrlRef = useRef(null); // track which URL we've already loaded
  const unsubRef = useRef(null);

  // ── Subscribe to session ───────────────────────────────────────────────────

  useEffect(() => {
    unsubRef.current = subscribeSession(roomCode, (data) => {
      if (!data) {
        Alert.alert('Session ended', 'The host ended the session.', [
          { text: 'OK', onPress: () => navigation.navigate('Home') },
        ]);
        return;
      }
      setSession(data);
    });

    return () => {
      if (unsubRef.current) unsubRef.current();
    };
  }, [roomCode]);

  // ── Load track when host assigns URL ──────────────────────────────────────

  useEffect(() => {
    if (!session) return;

    const me = session.participants?.[deviceId];
    if (!me) return;

    const url = me.trackUrl?.trim();
    if (!url || url === loadedUrlRef.current) return;

    // New (or changed) track URL assigned — load it.
    loadedUrlRef.current = url;
    setTrackLoaded(false);
    setTrackError(null);
    setLoadingTrack(true);

    audioPlayer
      .loadTrack(url)
      .then(() => {
        setLoadingTrack(false);
        setTrackLoaded(true);
        return markReady(roomCode, deviceId, true);
      })
      .catch((err) => {
        setLoadingTrack(false);
        setTrackError(err.message ?? 'Failed to load track');
        markReady(roomCode, deviceId, false);
      });
  }, [session?.participants?.[deviceId]?.trackUrl]);

  // ── Watch for 'starting' status ────────────────────────────────────────────

  useEffect(() => {
    if (!session) return;
    if (session.status === 'starting' && session.startAt) {
      const me = session.participants?.[deviceId];
      navigation.replace('Playback', {
        roomCode,
        deviceId,
        trackUrl: me?.trackUrl ?? '',
        captionUrl: me?.roleId ? (session.roles?.[me.roleId]?.captionUrl ?? null) : null,
        startAt: session.startAt,
        isHost: false,
      });
    }
  }, [session?.status, session?.startAt]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const me = session?.participants?.[deviceId];
  const participantList = Object.values(session?.participants ?? {});
  const readyCount = participantList.filter((p) => p.ready).length;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Room info */}
        <View style={styles.roomBadge}>
          <Text style={styles.roomLabel}>SESSION</Text>
          <Text style={styles.roomCode}>{roomCode}</Text>
        </View>

        {/* Your track status */}
        <View style={styles.trackCard}>
          <Text style={styles.cardTitle}>Your Track</Text>

          {!me?.trackUrl ? (
            <View style={styles.waitingRow}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={styles.waitingText}>
                Waiting for host to assign your track…
              </Text>
            </View>
          ) : loadingTrack ? (
            <View style={styles.waitingRow}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={styles.waitingText}>Loading track…</Text>
            </View>
          ) : trackError ? (
            <View>
              <Text style={styles.errorText}>{trackError}</Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => {
                  loadedUrlRef.current = null;
                  // Force re-trigger
                  setSession((s) => ({ ...s }));
                }}
              >
                <Text style={styles.retryBtnText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : trackLoaded ? (
            <View style={styles.readyRow}>
              <Text style={styles.readyIcon}>✓</Text>
              <Text style={styles.readyText}>Track loaded — ready to play</Text>
            </View>
          ) : null}

          {me?.trackUrl ? (
            <Text style={styles.trackUrl} numberOfLines={1}>
              {me.trackUrl}
            </Text>
          ) : null}
        </View>

        {/* Session participants */}
        <View style={styles.participantsCard}>
          <Text style={styles.cardTitle}>
            Participants — {readyCount}/{participantList.length} ready
          </Text>
          {participantList.map((p, i) => (
            <View key={i} style={styles.participantRow}>
              <View
                style={[styles.dot, p.ready && styles.dotReady]}
              />
              <Text style={styles.participantName}>
                {p.name}
                {p.isHost ? '  (host)' : ''}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Waiting for the host to begin the experience…
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, padding: 24 },

  roomBadge: {
    alignItems: 'center',
    marginBottom: 28,
    paddingTop: 8,
  },
  roomLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textDim,
    letterSpacing: 2,
    marginBottom: 4,
  },
  roomCode: {
    fontSize: 36,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: 6,
  },

  trackCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  waitingText: { color: colors.textMuted, fontSize: 14 },
  readyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  readyIcon: { fontSize: 18, color: colors.accent },
  readyText: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  trackUrl: {
    marginTop: 10,
    fontSize: 11,
    color: colors.textDim,
    fontFamily: 'Courier New',
  },
  errorText: { color: colors.danger, fontSize: 13, marginBottom: 10 },
  retryBtn: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  retryBtnText: { color: colors.danger, fontWeight: '600', fontSize: 13 },

  participantsCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 5,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.textDim,
  },
  dotReady: { backgroundColor: colors.accent },
  participantName: { color: colors.text, fontSize: 14 },

  footer: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 16,
  },
  footerText: {
    color: colors.textDim,
    fontSize: 13,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
