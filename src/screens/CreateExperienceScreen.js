/**
 * CreateExperienceScreen — create or edit a published experience.
 *
 * Receives optional `experience` param for editing an existing one.
 * Image is picked from the phone and uploaded to Firebase Storage.
 * Roles are defined here and each can be assigned a track from the library.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, radius } from '../theme';
import { createExperience, updateExperience, deleteExperience } from '../services/experienceService';
import { uploadImage } from '../services/storageService';
import { getLibrary } from '../services/trackLibrary';
import { getDeviceId } from '../utils/deviceId';
import LibraryPickerModal from '../components/LibraryPickerModal';
import CaptionEditorModal from '../components/CaptionEditorModal';

const CREATOR_NAME_KEY = '@birdhouse_creator_name';

export default function CreateExperienceScreen({ navigation, route }) {
  const existing = route.params?.experience ?? null;
  const isEditing = !!existing;

  // Form state
  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [creatorName, setCreatorName] = useState(existing?.createdBy ?? '');
  const [imageUri, setImageUri] = useState(null);      // local URI (newly picked)
  const [imageUrl, setImageUrl] = useState(existing?.imageUrl ?? null); // existing remote URL
  const [roles, setRoles] = useState(() => {
    if (!existing?.roles) return [];
    return Object.entries(existing.roles).map(([id, r]) => ({
      id, name: r.name, trackUrl: r.trackUrl, captionUrl: r.captionUrl ?? null,
      maxParticipants: r.maxParticipants ?? 1,
    }));
  });
  const [captionModal, setCaptionModal] = useState({ visible: false, roleId: null });

  const [publishing, setPublishing] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [library, setLibrary] = useState([]);
  const [libraryModal, setLibraryModal] = useState({ visible: false, onSelect: null });

  const deviceIdRef = useRef(null);

  useEffect(() => {
    (async () => {
      deviceIdRef.current = await getDeviceId();
      setLibrary(await getLibrary());
      if (!isEditing) {
        const saved = await AsyncStorage.getItem(CREATOR_NAME_KEY);
        if (saved) setCreatorName(saved);
      }
    })();
  }, []);

  // ── Image picker ───────────────────────────────────────────────────────────

  async function pickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo library access to pick a poster image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [2, 3],
      quality: 0.8,
    });

    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
      setImageUrl(null); // will be uploaded on publish
    }
  }

  // ── Roles ──────────────────────────────────────────────────────────────────

  function addRole() {
    setRoles((r) => [...r, { id: `${Date.now()}`, name: '', trackUrl: '', captionUrl: null, maxParticipants: 1 }]);
  }

  function updateRole(id, patch) {
    setRoles((r) => r.map((role) => (role.id === id ? { ...role, ...patch } : role)));
  }

  function deleteRole(id) {
    setRoles((r) => r.filter((role) => role.id !== id));
  }

  // ── Library ────────────────────────────────────────────────────────────────

  function openLibrary(onSelect) {
    setLibraryModal({ visible: true, onSelect });
  }

  async function refreshLibrary() {
    setLibrary(await getLibrary());
  }

  // ── Publish ────────────────────────────────────────────────────────────────

  async function handlePublish() {
    if (!title.trim()) { Alert.alert('Title required'); return; }
    if (!creatorName.trim()) { Alert.alert('Your name required'); return; }
    const incomplete = roles.find((r) => !r.name.trim() || !r.trackUrl.trim());
    if (incomplete) { Alert.alert('Incomplete role', 'Every role needs a name and a track URL.'); return; }

    setPublishing(true);
    try {
      // Save creator name for next time
      await AsyncStorage.setItem(CREATOR_NAME_KEY, creatorName.trim());

      // Upload image if a new one was picked
      let finalImageUrl = imageUrl;
      if (imageUri) {
        setUploadingImage(true);
        const tempId = existing?.id ?? `temp_${Date.now()}`;
        finalImageUrl = await uploadImage(imageUri, tempId, () => {});
        setUploadingImage(false);
      }

      if (isEditing) {
        await updateExperience(existing.id, {
          title, description, imageUrl: finalImageUrl, roles,
        });
        Alert.alert('Saved', 'Experience updated.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
      } else {
        await createExperience({
          title, description,
          createdBy: creatorName.trim(),
          createdByDeviceId: deviceIdRef.current,
          imageUrl: finalImageUrl,
          roles,
        });
        Alert.alert('Published!', 'Your experience is now live.', [
          { text: 'OK', onPress: () => navigation.navigate('Browse') },
        ]);
      }
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setPublishing(false);
      setUploadingImage(false);
    }
  }

  async function handleDelete() {
    Alert.alert('Delete Experience', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await deleteExperience(existing.id).catch(() => {});
          navigation.navigate('Browse');
        },
      },
    ]);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const posterSource = imageUri ? { uri: imageUri } : imageUrl ? { uri: imageUrl } : null;

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {/* Poster */}
          <TouchableOpacity style={s.posterArea} onPress={pickImage} activeOpacity={0.8}>
            {posterSource ? (
              <Image source={posterSource} style={s.posterImage} resizeMode="cover" />
            ) : (
              <View style={s.posterPlaceholder}>
                <Text style={s.posterIcon}>🖼</Text>
                <Text style={s.posterHint}>Tap to add a poster image</Text>
              </View>
            )}
            {uploadingImage && (
              <View style={s.posterOverlay}>
                <ActivityIndicator color="#fff" />
              </View>
            )}
            <View style={s.posterEditBadge}>
              <Text style={s.posterEditText}>{posterSource ? 'Change' : 'Add'} Image</Text>
            </View>
          </TouchableOpacity>

          {/* Details */}
          <Label>Title</Label>
          <TextInput
            style={s.input}
            placeholder="e.g. Forest Symphony"
            placeholderTextColor={colors.textDim}
            value={title}
            onChangeText={setTitle}
            autoCapitalize="words"
          />

          <Label>Description</Label>
          <TextInput
            style={[s.input, s.multiline]}
            placeholder="Describe the experience for participants…"
            placeholderTextColor={colors.textDim}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />

          {!isEditing && (
            <>
              <Label>Your Name</Label>
              <TextInput
                style={s.input}
                placeholder="e.g. Alice"
                placeholderTextColor={colors.textDim}
                value={creatorName}
                onChangeText={setCreatorName}
                autoCapitalize="words"
              />
            </>
          )}

          {/* Roles */}
          <View style={s.rolesHeader}>
            <Text style={s.sectionTitle}>Roles</Text>
            <TouchableOpacity style={s.addRoleBtn} onPress={addRole}>
              <Text style={s.addRoleBtnText}>+ Add Role</Text>
            </TouchableOpacity>
          </View>
          <Text style={s.sectionSub}>
            Define the parts participants will play — each with its own audio track.
          </Text>

          {roles.length === 0 && (
            <Text style={s.emptyHint}>No roles defined yet.</Text>
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
                <TouchableOpacity onPress={() => deleteRole(role.id)} style={s.removeBtn}>
                  <Text style={s.removeBtnText}>✕</Text>
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
                  onPress={() => openLibrary((t) => updateRole(role.id, { trackUrl: t.url }))}
                >
                  <Text style={s.libraryBtnText}>Library</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={s.captionBtn}
                onPress={() => setCaptionModal({ visible: true, roleId: role.id })}
              >
                <Text style={s.captionBtnText}>
                  {role.captionUrl ? '✎ Edit Captions' : '+ Add Captions'}
                </Text>
              </TouchableOpacity>

              {/* Capacity */}
              <View style={s.capacityRow}>
                <Text style={s.capacityLabel}>Max participants</Text>
                <View style={s.capacityStepper}>
                  <TouchableOpacity
                    style={s.stepBtn}
                    onPress={() => {
                      const cur = role.maxParticipants;
                      if (cur === null) updateRole(role.id, { maxParticipants: 999 });
                      else if (cur > 1) updateRole(role.id, { maxParticipants: cur - 1 });
                    }}
                  >
                    <Text style={s.stepBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={s.capacityValue}>
                    {role.maxParticipants === null ? '∞' : role.maxParticipants}
                  </Text>
                  <TouchableOpacity
                    style={s.stepBtn}
                    onPress={() => {
                      const cur = role.maxParticipants;
                      if (cur === null) return;
                      if (cur >= 999) updateRole(role.id, { maxParticipants: null });
                      else updateRole(role.id, { maxParticipants: cur + 1 });
                    }}
                  >
                    <Text style={s.stepBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
                <Text style={s.capacityHint}>
                  {role.maxParticipants === null ? 'Unlimited' : role.maxParticipants === 1 ? 'Unique role' : `Up to ${role.maxParticipants}`}
                </Text>
              </View>
            </View>
          ))}

          {/* Publish */}
          <TouchableOpacity
            style={[s.publishBtn, publishing && s.btnDisabled]}
            onPress={handlePublish}
            disabled={publishing}
            activeOpacity={0.85}
          >
            {publishing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.publishBtnText}>{isEditing ? 'Save Changes' : 'Publish Experience'}</Text>
            )}
          </TouchableOpacity>

          {isEditing && (
            <TouchableOpacity style={s.deleteBtn} onPress={handleDelete}>
              <Text style={s.deleteBtnText}>Delete Experience</Text>
            </TouchableOpacity>
          )}
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

      {(() => {
        const activeRole = roles.find((r) => r.id === captionModal.roleId);
        return (
          <CaptionEditorModal
            visible={captionModal.visible}
            captionUrl={activeRole?.captionUrl ?? null}
            experienceId={existing?.id ?? `new_${Date.now()}`}
            roleId={captionModal.roleId}
            onSave={(url) => updateRole(captionModal.roleId, { captionUrl: url })}
            onClose={() => setCaptionModal({ visible: false, roleId: null })}
          />
        );
      })()}
    </SafeAreaView>
  );
}

function Label({ children }) {
  return <Text style={s.label}>{children}</Text>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 20, paddingBottom: 48 },

  posterArea: {
    width: '100%', height: 240,
    borderRadius: radius.lg, overflow: 'hidden',
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border,
    marginBottom: 24, justifyContent: 'center', alignItems: 'center',
  },
  posterImage: { width: '100%', height: '100%' },
  posterPlaceholder: { alignItems: 'center', gap: 8 },
  posterIcon: { fontSize: 40 },
  posterHint: { fontSize: 14, color: colors.textMuted },
  posterOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  posterEditBadge: {
    position: 'absolute', bottom: 10, right: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 4,
  },
  posterEditText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  label: {
    fontSize: 13, fontWeight: '600', color: colors.textMuted,
    marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 14,
    color: colors.text, fontSize: 15, marginBottom: 16,
  },
  multiline: { height: 100, paddingTop: 12 },

  sectionTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  sectionSub: { fontSize: 13, color: colors.textMuted, marginBottom: 16, lineHeight: 18 },
  rolesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 6 },
  addRoleBtn: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 8 },
  addRoleBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  emptyHint: { color: colors.textDim, fontSize: 13, fontStyle: 'italic', marginBottom: 16 },

  roleCard: {
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    padding: 12, marginBottom: 10,
  },
  roleCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  roleNameInput: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 15,
  },
  removeBtn: { padding: 6 },
  removeBtnText: { color: colors.danger, fontSize: 18, fontWeight: '700' },
  urlRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roleUrlInput: {
    backgroundColor: colors.surface, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 13,
  },
  libraryBtn: { backgroundColor: colors.primaryDim, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10 },
  captionBtn: { marginTop: 8, alignSelf: 'flex-start' },
  captionBtnText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  capacityRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10 },
  capacityLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600', flex: 1 },
  capacityStepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepBtnText: { color: colors.text, fontSize: 18, fontWeight: '600', lineHeight: 22 },
  capacityValue: { fontSize: 16, fontWeight: '700', color: colors.text, minWidth: 32, textAlign: 'center' },
  capacityHint: { fontSize: 11, color: colors.textDim, fontStyle: 'italic' },
  libraryBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },

  publishBtn: {
    backgroundColor: colors.primary, borderRadius: radius.lg,
    paddingVertical: 16, alignItems: 'center', marginTop: 28, marginBottom: 12,
  },
  publishBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },
  deleteBtn: {
    borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: colors.danger,
  },
  deleteBtnText: { color: colors.danger, fontSize: 15, fontWeight: '600' },
});
