/**
 * ExperienceDetailScreen — full view of a single experience.
 *
 * Shows poster, title, description, creator, and roles list.
 * "Host This" → HostScreen (pre-filled from experience)
 * "Join a Session" → inline room-code entry → JoinScreen
 * Edit button visible only to the creator (matched by deviceId).
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Image,
  StyleSheet, SafeAreaView, TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { colors, radius } from '../theme';
import { getDeviceId } from '../utils/deviceId';

const POSTER_COLORS = ['#4C1D95', '#065F46', '#1E3A5F', '#7C2D12', '#374151', '#713F12'];
function posterColor(title = '') {
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return POSTER_COLORS[h % POSTER_COLORS.length];
}

export default function ExperienceDetailScreen({ navigation, route }) {
  const experience = route.params?.experience;
  const [isCreator, setIsCreator] = useState(false);
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const scrollRef = useRef(null);

  const roles = experience?.roles
    ? Object.entries(experience.roles).map(([id, r]) => ({ id, ...r }))
    : [];

  useEffect(() => {
    getDeviceId().then((id) => {
      setIsCreator(id === experience?.createdByDeviceId);
    });
  }, []);

  if (!experience) {
    return (
      <SafeAreaView style={s.safe}>
        <Text style={{ color: colors.text, padding: 24 }}>Experience not found.</Text>
      </SafeAreaView>
    );
  }

  function handleHostThis() {
    navigation.navigate('Host', { experience });
  }

  function handleJoin() {
    const code = roomCode.trim().toUpperCase();
    if (code.length !== 6) {
      Alert.alert('Invalid code', 'Room codes are 6 characters.');
      return;
    }
    navigation.navigate('Join', { prefillCode: code });
  }

  const bgColor = posterColor(experience.title);

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scrollRef} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* Poster */}
        {experience.imageUrl ? (
          <Image source={{ uri: experience.imageUrl }} style={s.poster} resizeMode="cover" />
        ) : (
          <View style={[s.poster, s.posterPlaceholder, { backgroundColor: bgColor }]}>
            <Text style={s.posterInitial}>{experience.title.charAt(0).toUpperCase()}</Text>
          </View>
        )}

        <View style={s.body}>
          {/* Header */}
          <View style={s.titleRow}>
            <Text style={s.title}>{experience.title}</Text>
            {isCreator && (
              <TouchableOpacity
                style={s.editBtn}
                onPress={() => navigation.navigate('CreateExperience', { experience })}
              >
                <Text style={s.editBtnText}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={s.creator}>By {experience.createdBy}</Text>

          {!!experience.description && (
            <Text style={s.description}>{experience.description}</Text>
          )}

          {/* Roles */}
          {roles.length > 0 && (
            <View style={s.rolesSection}>
              <Text style={s.rolesTitle}>Roles ({roles.length})</Text>
              {roles.map((role) => (
                <View key={role.id} style={s.roleRow}>
                  <View style={s.roleDot} />
                  <Text style={s.roleName}>{role.name}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Actions */}
          <TouchableOpacity style={s.primaryBtn} onPress={handleHostThis} activeOpacity={0.85}>
            <Text style={s.primaryBtnText}>Host This Experience</Text>
          </TouchableOpacity>

          {!showJoinInput ? (
            <TouchableOpacity
              style={s.secondaryBtn}
              onPress={() => {
                setShowJoinInput(true);
                setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
              }}
              activeOpacity={0.85}
            >
              <Text style={s.secondaryBtnText}>Join a Session</Text>
            </TouchableOpacity>
          ) : (
            <View style={s.joinBox}>
              <Text style={s.joinLabel}>Enter the room code from your host:</Text>
              <TextInput
                style={s.codeInput}
                placeholder="XXXXXX"
                placeholderTextColor={colors.textDim}
                value={roomCode}
                onChangeText={(t) => setRoomCode(t.toUpperCase())}
                autoCapitalize="characters"
                maxLength={6}
                autoFocus
              />
              <TouchableOpacity style={s.primaryBtn} onPress={handleJoin} activeOpacity={0.85}>
                <Text style={s.primaryBtnText}>Continue</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowJoinInput(false); setRoomCode(''); }}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: 80 },

  poster: { width: '100%', height: 280 },
  posterPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  posterInitial: { fontSize: 100, fontWeight: '900', color: 'rgba(255,255,255,0.25)' },

  body: { padding: 24 },

  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 },
  title: { flex: 1, fontSize: 28, fontWeight: '900', color: colors.text, lineHeight: 34 },
  editBtn: {
    marginLeft: 12, marginTop: 4,
    backgroundColor: colors.card, borderRadius: radius.sm,
    paddingHorizontal: 14, paddingVertical: 6,
    borderWidth: 1, borderColor: colors.border,
  },
  editBtnText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },

  creator: { fontSize: 13, color: colors.textDim, marginBottom: 16 },
  description: { fontSize: 15, color: colors.textMuted, lineHeight: 22, marginBottom: 24 },

  rolesSection: {
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    padding: 16, marginBottom: 28,
  },
  rolesTitle: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 4 },
  roleDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  roleName: { fontSize: 15, color: colors.text },

  primaryBtn: {
    backgroundColor: colors.primary, borderRadius: radius.lg,
    paddingVertical: 16, alignItems: 'center', marginBottom: 12,
  },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  secondaryBtn: {
    borderRadius: radius.lg, paddingVertical: 15, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
    marginBottom: 12,
  },
  secondaryBtnText: { color: colors.text, fontSize: 17, fontWeight: '600' },

  joinBox: {
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    padding: 16, marginBottom: 12,
  },
  joinLabel: { fontSize: 13, color: colors.textMuted, marginBottom: 12 },
  codeInput: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 20, paddingVertical: 16,
    color: colors.text, fontSize: 28, fontWeight: '800',
    letterSpacing: 6, textAlign: 'center', marginBottom: 12,
  },
  cancelText: { textAlign: 'center', color: colors.textDim, fontSize: 14, paddingVertical: 8 },
});
