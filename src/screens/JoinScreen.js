/**
 * JoinScreen — participants enter a room code and their name, then join.
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
import { joinSession } from '../services/sessionService';
import { getDeviceId } from '../utils/deviceId';
import clockSync from '../services/clockSync';
import audioPlayer from '../services/audioPlayer';

export default function JoinScreen({ navigation }) {
  const [roomCode, setRoomCode] = useState('');
  const [name, setName] = useState('');
  const [joining, setJoining] = useState(false);
  const deviceIdRef = useRef(null);

  useEffect(() => {
    (async () => {
      await clockSync.init();
      await audioPlayer.init();
      deviceIdRef.current = await getDeviceId();
    })();
  }, []);

  async function handleJoin() {
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

    setJoining(true);
    try {
      await joinSession(code, deviceIdRef.current, trimmedName);
      navigation.replace('Lobby', {
        roomCode: code,
        deviceId: deviceIdRef.current,
        name: trimmedName,
      });
    } catch (err) {
      Alert.alert('Could not join', err.message);
      setJoining(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>Join a Session</Text>
          <Text style={styles.sub}>
            Ask your host for the 6-character room code.
          </Text>

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
            onSubmitEditing={handleJoin}
          />

          <TouchableOpacity
            style={[styles.primaryBtn, joining && styles.btnDisabled]}
            onPress={handleJoin}
            disabled={joining}
            activeOpacity={0.85}
          >
            {joining ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Join</Text>
            )}
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
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  sub: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 32,
    lineHeight: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  codeInput: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 20,
    paddingVertical: 18,
    color: colors.text,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 6,
    textAlign: 'center',
    marginBottom: 24,
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
    marginBottom: 28,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },
});
