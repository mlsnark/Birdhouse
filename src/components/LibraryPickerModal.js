/**
 * LibraryPickerModal — shared modal for browsing, adding, and picking
 * tracks from the local track library. Supports uploading from the phone.
 */
import React, { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  ScrollView, SafeAreaView, ActivityIndicator, Alert,
  StyleSheet,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { colors, radius } from '../theme';
import { addTrack, removeTrack } from '../services/trackLibrary';
import { uploadTrack } from '../services/storageService';

export default function LibraryPickerModal({ visible, library, onSelect, onClose, onLibraryChange }) {
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  async function handleAdd() {
    if (!newName.trim() || !newUrl.trim()) return;
    await addTrack(newName.trim(), newUrl.trim());
    setNewName('');
    setNewUrl('');
    onLibraryChange?.();
  }

  async function handleDelete(id) {
    await removeTrack(id);
    onLibraryChange?.();
  }

  async function handleUpload() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const file = result.assets[0];
      const filename = file.name ?? `track_${Date.now()}.mp3`;

      setUploading(true);
      setUploadProgress(0);

      const url = await uploadTrack(file.uri, filename, setUploadProgress);

      setNewUrl(url);
      if (!newName.trim()) setNewName(filename.replace(/\.[^/.]+$/, ''));
    } catch (err) {
      Alert.alert('Upload failed', err.message ?? 'Could not upload file.');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <Text style={s.title}>Track Library</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={s.closeBtn}>Done</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={s.scroll} keyboardShouldPersistTaps="handled">
          <Text style={s.sectionLabel}>Add New Track</Text>

          <TouchableOpacity
            style={[s.uploadBtn, uploading && s.disabled]}
            onPress={handleUpload}
            disabled={uploading}
          >
            {uploading ? (
              <View style={s.row}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={s.uploadBtnText}>Uploading… {Math.round(uploadProgress * 100)}%</Text>
              </View>
            ) : (
              <Text style={s.uploadBtnText}>Upload from Phone</Text>
            )}
          </TouchableOpacity>

          <Text style={s.orDivider}>— or paste a URL —</Text>

          <TextInput
            style={s.input}
            placeholder="Track name (e.g. Soprano Part)"
            placeholderTextColor={colors.textDim}
            value={newName}
            onChangeText={setNewName}
          />
          <TextInput
            style={s.input}
            placeholder="URL (https://…)"
            placeholderTextColor={colors.textDim}
            value={newUrl}
            onChangeText={setNewUrl}
            autoCapitalize="none"
            keyboardType="url"
          />
          <TouchableOpacity
            style={[s.addBtn, (!newName.trim() || !newUrl.trim()) && s.disabled]}
            onPress={handleAdd}
            disabled={!newName.trim() || !newUrl.trim()}
          >
            <Text style={s.addBtnText}>+ Save to Library</Text>
          </TouchableOpacity>

          <Text style={[s.sectionLabel, { marginTop: 24 }]}>Saved Tracks</Text>

          {library.length === 0 && (
            <Text style={s.emptyText}>No saved tracks yet.</Text>
          )}

          {library.map((track) => (
            <View key={track.id} style={s.trackRow}>
              <View style={s.trackInfo}>
                <Text style={s.trackName}>{track.name}</Text>
                <Text style={s.trackUrl} numberOfLines={1}>{track.url}</Text>
              </View>
              <TouchableOpacity style={s.pickBtn} onPress={() => onSelect(track)}>
                <Text style={s.pickBtnText}>Pick</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.deleteBtn} onPress={() => handleDelete(track.id)}>
                <Text style={s.deleteBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  closeBtn: { fontSize: 16, color: colors.primary, fontWeight: '600' },
  scroll: { padding: 20 },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
  },
  uploadBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginBottom: 12 },
  uploadBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orDivider: { textAlign: 'center', color: colors.textDim, fontSize: 12, marginBottom: 12 },
  input: {
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 12,
    color: colors.text, fontSize: 14, marginBottom: 10,
  },
  addBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  disabled: { opacity: 0.4 },
  emptyText: { color: colors.textDim, fontStyle: 'italic', fontSize: 13 },
  trackRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    padding: 12, marginBottom: 8, gap: 8,
  },
  trackInfo: { flex: 1 },
  trackName: { fontSize: 14, fontWeight: '600', color: colors.text },
  trackUrl: { fontSize: 11, color: colors.textDim, marginTop: 2 },
  pickBtn: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8 },
  pickBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  deleteBtn: { padding: 6 },
  deleteBtnText: { color: colors.danger, fontSize: 16, fontWeight: '700' },
});
