/**
 * PlaybackScreen
 *
 * Entered by both host and participants once the host fires initiateStart().
 *
 * Timing flow:
 *  - `startAt`  — server-clock timestamp (ms) when audio must begin.
 *  - `localStart = clockSync.toLocalTime(startAt)` — equivalent local time.
 *  - Countdown display is driven by server time so every device shows the
 *    same number at the same moment.
 *  - audioPlayer.schedulePlayback(startAt) uses the two-phase scheduler
 *    (coarse setTimeout → 5 ms poll) to fire playAsync() within ~5 ms of
 *    localStart.
 *
 * For the host, the track is loaded here (if a URL was provided) because
 * the host skips LobbyScreen.  For participants, the track was pre-loaded
 * in LobbyScreen so schedulePlayback() is the only call needed.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  Switch,
} from 'react-native';
import { colors } from '../theme';
import clockSync from '../services/clockSync';
import audioPlayer from '../services/audioPlayer';
import { subscribeSession, pauseSession, resumeSession, endSession, setLoopMode, triggerLoop } from '../services/sessionService';

const COUNTDOWN_SECONDS = 5;

export default function PlaybackScreen({ navigation, route }) {
  const { roomCode, deviceId, trackUrl, captionUrl, startAt, isHost, lateJoin } = route.params;

  const [phase, setPhase] = useState('loading'); // 'loading' | 'countdown' | 'playing' | 'paused'
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const [errorMsg, setErrorMsg] = useState(null);

  const tickRef = useRef(null);
  const playedRef = useRef(false);
  const prevStatusRef = useRef(null);
  const startAtRef = useRef(startAt);
  const pausedPositionRef = useRef(0);

  // Loop
  const [loop, setLoop] = useState(false);
  const loopRef = useRef(false);
  const isLoopingRef = useRef(false);
  const prevLoopSequenceRef = useRef(null);

  useEffect(() => { loopRef.current = loop; }, [loop]);

  // Captions
  const captionsRef = useRef([]);
  const [activeRepeat, setActiveRepeat] = useState(null);
  const [activeInstruction, setActiveInstruction] = useState(null);
  const captionTickRef = useRef(null);

  // ── Setup ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;

    async function setup() {
      try {
        // Hosts load their track here; participants already loaded in LobbyScreen.
        if (isHost && trackUrl?.trim()) {
          await audioPlayer.loadTrack(trackUrl.trim());
        }

        if (!mounted) return;

        const isAlreadyPlaying = lateJoin || clockSync.now() > startAt;

        if (trackUrl?.trim()) {
          if (isAlreadyPlaying) {
            // Late joiner: seek to current position and play immediately.
            const offsetMs = Math.max(0, clockSync.now() - startAt);
            await audioPlayer.playFromOffset(offsetMs);
          } else {
            audioPlayer.schedulePlayback(startAt);
          }
        }

        if (isAlreadyPlaying) {
          setPhase('playing');
        } else {
          setPhase('countdown');
          startCountdown();
        }
      } catch (err) {
        if (!mounted) return;
        setErrorMsg(err.message ?? 'Failed to load track');
        // Still start countdown — other devices shouldn't wait for us.
        setPhase('countdown');
        startCountdown();
      }
    }

    setup();

    return () => {
      mounted = false;
      clearInterval(tickRef.current);
    };
  }, []);

  // ── Session subscription (pause / resume / ended) ──────────────────────────

  useEffect(() => {
    const unsub = subscribeSession(roomCode, (data) => {
      if (!data) {
        if (!isHost) {
          Alert.alert('Performance ended', 'The host has ended this performance.', [
            { text: 'OK', onPress: () => navigation.navigate('Home') },
          ]);
        } else {
          navigation.navigate('Home');
        }
        return;
      }

      const prev = prevStatusRef.current;
      prevStatusRef.current = data.status;

      if (data.status === 'paused' && prev !== 'paused') {
        pausedPositionRef.current = Math.max(0, clockSync.now() - startAtRef.current);
        clearInterval(tickRef.current);
        clearInterval(captionTickRef.current);
        audioPlayer.pause();
        setPhase('paused');
      } else if (data.status === 'starting' && prev === 'paused') {
        startAtRef.current = data.startAt;
        if (trackUrl?.trim()) audioPlayer.scheduleFromOffset(data.startAt, pausedPositionRef.current);
        setPhase('playing');
        startCaptionTick();
      }

      // Loop detection: loopSequence increments each time host triggers a loop
      const currentLoopSeq = data.loopSequence ?? 0;
      if (prevLoopSequenceRef.current === null) {
        prevLoopSequenceRef.current = currentLoopSeq;
      } else if (currentLoopSeq > prevLoopSequenceRef.current) {
        prevLoopSequenceRef.current = currentLoopSeq;
        startAtRef.current = data.startAt;
        isLoopingRef.current = false;
        if (trackUrl?.trim()) {
          audioPlayer.schedulePlayback(data.startAt);
        }
        setPhase('playing');
      }

      setLoop(data.loop ?? false);
    });
    return unsub;
  }, [roomCode]);

  // ── Countdown ticker ───────────────────────────────────────────────────────

  function startCountdown() {
    clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      const serverNow = clockSync.now();
      const remaining = Math.ceil((startAtRef.current - serverNow) / 1000);

      if (remaining > 0) {
        setSecondsLeft(remaining);
      } else {
        clearInterval(tickRef.current);
        setPhase('playing');
      }
    }, 100);
  }

  // ── Captions ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!captionUrl) return;
    fetch(captionUrl)
      .then((r) => r.json())
      .then((data) => { captionsRef.current = data; })
      .catch(() => {});
  }, [captionUrl]);

  function startCaptionTick() {
    clearInterval(captionTickRef.current);
    captionTickRef.current = setInterval(() => {
      const pos = Math.max(0, clockSync.now() - startAtRef.current);
      const cues = captionsRef.current;
      const findActive = (type) => cues.find((c) =>
        c.type === type && c.start <= pos && (c.end == null || c.end >= pos)
      );
      setActiveRepeat(findActive('repeat')?.text ?? null);
      setActiveInstruction(findActive('instruction')?.text ?? null);
    }, 100);
  }

  useEffect(() => {
    if (phase === 'playing') startCaptionTick();
    if (phase === 'paused') clearInterval(captionTickRef.current);
    return () => clearInterval(captionTickRef.current);
  }, [phase]);

  // Host: when track finishes and loop is on, trigger a synchronized loop for all
  useEffect(() => {
    if (!isHost || !trackUrl?.trim()) return;
    audioPlayer.setOnFinished(async () => {
      if (!loopRef.current || isLoopingRef.current) return;
      isLoopingRef.current = true;
      try { await triggerLoop(roomCode, 0); }
      catch (_) { isLoopingRef.current = false; }
    });
    return () => audioPlayer.setOnFinished(null);
  }, [isHost, trackUrl, roomCode]);

  // ── Pause / Resume (host only) ─────────────────────────────────────────────

  async function handlePause() {
    try { await pauseSession(roomCode); } catch (err) { Alert.alert('Error', err.message); }
  }

  async function handleResume() {
    try { await resumeSession(roomCode); } catch (err) { Alert.alert('Error', err.message); }
  }

  // ── Stop / leave ───────────────────────────────────────────────────────────

  async function handleStop() {
    clearInterval(tickRef.current);
    await audioPlayer.stop();

    if (isHost) {
      Alert.alert('End Session', 'Stop playback and end the session for everyone?', [
        { text: 'Cancel', style: 'cancel', onPress: () => {} },
        {
          text: 'End',
          style: 'destructive',
          onPress: async () => {
            await endSession(roomCode).catch(() => {});
            navigation.navigate('Home');
          },
        },
      ]);
    } else {
      navigation.navigate('Home');
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const isCountdown = phase === 'countdown';
  const isPlaying = phase === 'playing';
  const isPaused = phase === 'paused';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Top row: status + room code */}
        <View style={styles.topRow}>
          <Text style={styles.statusText}>
            {isCountdown ? 'Starting in…'
              : isPlaying ? 'Now playing'
              : isPaused ? 'Paused'
              : 'Preparing…'}
          </Text>
          <View style={styles.roomChip}>
            <Text style={styles.roomChipText}>{roomCode}</Text>
          </View>
        </View>

        {/* Main display */}
        <View style={styles.centerDisplay}>
          {isCountdown && (
            <Text style={[styles.countdown, secondsLeft === 1 && styles.countdownFinal]}>
              {secondsLeft}
            </Text>
          )}
          {(isPlaying || isPaused) && (
            <View style={styles.playingDisplay}>
              <PulsingDots paused={isPaused} />
            </View>
          )}
          {phase === 'loading' && (
            <Text style={styles.loadingText}>Loading…</Text>
          )}
        </View>

        {/* Error banner */}
        {errorMsg && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>Track error: {errorMsg}</Text>
            <Text style={styles.errorSub}>Countdown is still running for other devices.</Text>
          </View>
        )}

        {/* Instruction caption — above repeat, just above the bottom controls */}
        {!!activeInstruction && (
          <View style={styles.instructionBanner}>
            <Text style={styles.instructionText}>{activeInstruction}</Text>
          </View>
        )}

        {/* Repeat caption — above room code */}
        {!!activeRepeat && (
          <View style={styles.repeatBanner}>
            <Text style={styles.repeatText}>{activeRepeat}</Text>
          </View>
        )}

        {/* Host controls */}
        {isHost && isPlaying && (
          <TouchableOpacity style={styles.pauseBtn} onPress={handlePause}>
            <Text style={styles.pauseBtnText}>⏸  Pause</Text>
          </TouchableOpacity>
        )}
        {isHost && isPaused && (
          <TouchableOpacity style={styles.resumeBtn} onPress={handleResume}>
            <Text style={styles.resumeBtnText}>▶  Resume</Text>
          </TouchableOpacity>
        )}

        {/* Loop toggle (host) / Loop indicator (participants) */}
        {isHost ? (
          <View style={styles.loopRow}>
            <Text style={[styles.loopLabel, loop && styles.loopLabelActive]}>🔁  Loop audio</Text>
            <Switch
              value={loop}
              onValueChange={(v) => setLoopMode(roomCode, v).catch(() => {})}
              trackColor={{ false: colors.border, true: colors.primaryDim }}
              thumbColor={loop ? colors.primary : colors.textDim}
              ios_backgroundColor={colors.border}
            />
          </View>
        ) : loop ? (
          <View style={styles.loopIndicator}>
            <Text style={styles.loopIndicatorText}>🔁  Looping</Text>
          </View>
        ) : null}

        {/* Stop button */}
        {(isCountdown || isPlaying || isPaused) && (
          <TouchableOpacity style={styles.stopBtn} onPress={handleStop}>
            <Text style={styles.stopBtnText}>
              {isHost ? 'Stop & End Session' : 'Leave'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

// Simple animated dots to indicate active playback.
function PulsingDots({ paused = false }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % 4), 400);
    return () => clearInterval(id);
  }, [paused]);

  return (
    <View style={dots.row}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={[
            dots.dot,
            paused
              ? { opacity: 1, backgroundColor: colors.danger }
              : { opacity: frame > i ? 1 : 0.2, backgroundColor: colors.accent },
          ]}
        />
      ))}
    </View>
  );
}

const dots = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    justifyContent: 'center',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.accent,
  },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: {
    flex: 1,
    paddingHorizontal: 32,
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    marginTop: 8,
  },
  statusText: {
    fontSize: 16,
    color: colors.textMuted,
    fontWeight: '500',
    letterSpacing: 0.5,
  },

  centerDisplay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  countdown: {
    fontSize: 180,
    fontWeight: '900',
    color: colors.primary,
    lineHeight: 200,
    // Slight shadow for depth
    textShadowColor: colors.primaryDim,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 40,
  },
  countdownFinal: {
    color: colors.accent,
    textShadowColor: colors.accentDim,
  },

  playingDisplay: { alignItems: 'center' },
  loadingText: {
    fontSize: 24,
    color: colors.textMuted,
  },

  errorBanner: {
    backgroundColor: '#2D0000',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: colors.danger,
  },
  errorText: { color: colors.danger, fontWeight: '600', fontSize: 13 },
  errorSub: { color: '#FF9999', fontSize: 12, marginTop: 4 },

  roomChip: {
    backgroundColor: colors.card,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 18,
  },
  roomChipText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 3,
  },

  instructionBanner: {
    alignSelf: 'stretch', marginBottom: 12,
    backgroundColor: 'rgba(252,211,77,0.12)',
    borderRadius: 10, paddingHorizontal: 20, paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(252,211,77,0.3)',
  },
  instructionText: {
    color: '#FCD34D', fontSize: 18, fontWeight: '600',
    textAlign: 'center', lineHeight: 26,
  },
  repeatBanner: {
    alignSelf: 'stretch', marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10, paddingHorizontal: 20, paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  repeatText: {
    color: '#fff', fontSize: 18, fontWeight: '500',
    textAlign: 'center', lineHeight: 26,
  },

  pauseBtn: {
    backgroundColor: colors.primaryDim,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 40,
    marginBottom: 12,
  },
  pauseBtnText: { color: '#fff', fontWeight: '700', fontSize: 17 },
  resumeBtn: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 40,
    marginBottom: 12,
  },
  resumeBtnText: { color: '#fff', fontWeight: '700', fontSize: 17 },
  stopBtn: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 32,
    marginBottom: 8,
  },
  stopBtnText: { color: colors.danger, fontWeight: '600', fontSize: 15 },

  loopRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    alignSelf: 'stretch',
    backgroundColor: colors.card, borderRadius: 999,
    borderWidth: 1, borderColor: colors.border,
    paddingVertical: 12, paddingHorizontal: 20, marginBottom: 12,
  },
  loopLabel: { fontSize: 15, fontWeight: '600', color: colors.textMuted },
  loopLabelActive: { color: colors.text },
  loopIndicator: {
    backgroundColor: colors.card, borderRadius: 999,
    borderWidth: 1, borderColor: colors.border,
    paddingVertical: 8, paddingHorizontal: 20, marginBottom: 12,
  },
  loopIndicatorText: { color: colors.textMuted, fontSize: 14, fontWeight: '500' },
});
