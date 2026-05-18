/**
 * CaptionEditorModal — edit timed caption cues for a role.
 *
 * Format: JSON array of cue objects:
 *   { "start": <ms>, "end": <ms>, "type": "repeat"|"instruction", "text": "..." }
 *
 * "repeat"       → spoken text, shown at the bottom in white
 * "instruction" → stage directions, shown at the top in amber
 *
 * "end" is optional; if omitted the cue shows until the next one starts.
 */
import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { uploadCaptions } from '../services/storageService';
import { colors, radius } from '../theme';

const EXAMPLE = JSON.stringify([
  { start: 0,    end: 4000,  type: 'instruction', text: 'Sit down. Close your eyes.' },
  { start: 4000, end: 9000,  type: 'repeat',       text: 'The way one once called a number to hear the time.' },
  { start: 9500, end: 13000, type: 'instruction', text: 'Look slowly to the left.' },
  { start: 13000,end: 18000, type: 'repeat',       text: "You don't attend it. You access it." },
], null, 2);

function validate(text) {
  const parsed = JSON.parse(text); // throws on bad JSON
  if (!Array.isArray(parsed)) throw new Error('Root must be a JSON array [ … ]');
  parsed.forEach((cue, i) => {
    if (typeof cue.start !== 'number') throw new Error(`Cue ${i}: "start" must be a number (ms)`);
    if (typeof cue.text !== 'string')  throw new Error(`Cue ${i}: "text" must be a string`);
    if (cue.type !== 'repeat' && cue.type !== 'instruction')
      throw new Error(`Cue ${i}: "type" must be "repeat" or "instruction"`);
  });
  return parsed;
}

export default function CaptionEditorModal({
  visible, captionUrl, experienceId, roleId, onSave, onClose,
}) {
  const [json, setJson] = useState('');
  const [saving, setSaving] = useState(false);

  // Load existing captions when modal opens
  useEffect(() => {
    if (!visible) { setJson(''); return; }
    if (captionUrl) {
      fetch(captionUrl)
        .then((r) => r.text())
        .then((t) => setJson(t))
        .catch(() => {});
    }
  }, [visible, captionUrl]);

  async function handleUploadFile() {
    try {
      const DocumentPicker = require('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', 'public.json'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const text = await (await fetch(result.assets[0].uri)).text();
      setJson(text);
    } catch (err) {
      Alert.alert('Error reading file', err.message);
    }
  }

  async function handleSave() {
    const trimmed = json.trim();
    if (!trimmed) {
      // Clearing captions
      onSave(null);
      onClose();
      return;
    }
    try {
      validate(trimmed);
    } catch (err) {
      Alert.alert('Invalid captions', err.message);
      return;
    }
    setSaving(true);
    try {
      const url = await uploadCaptions(trimmed, experienceId ?? 'unknown', roleId ?? 'unknown');
      onSave(url);
      onClose();
    } catch (err) {
      Alert.alert('Upload failed', err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} style={s.headerBtn}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Caption Cues</Text>
          <TouchableOpacity onPress={handleSave} style={s.headerBtn} disabled={saving}>
            {saving
              ? <ActivityIndicator color={colors.primary} size="small" />
              : <Text style={s.saveText}>Save</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView style={s.scroll} keyboardShouldPersistTaps="handled">
          {/* Guide */}
          <View style={s.guide}>
            <Text style={s.guideTitle}>Format guide</Text>
            <Text style={s.guideText}>
              Each cue needs <Text style={s.code}>start</Text> (ms from track start),{' '}
              <Text style={s.code}>type</Text> (<Text style={s.repeatBadge}>repeat</Text> or{' '}
              <Text style={s.instrBadge}>instruction</Text>), and <Text style={s.code}>text</Text>.{'\n'}
              <Text style={s.code}>end</Text> is optional.
            </Text>
            <Text style={s.guideText}>
              <Text style={s.repeatBadge}>repeat</Text> — spoken words, shown at <Text style={{ color: '#fff' }}>bottom</Text>{'\n'}
              <Text style={s.instrBadge}>instruction</Text> — stage directions, shown at <Text style={{ color: '#fff' }}>top</Text>
            </Text>
          </View>

          {/* Example */}
          <TouchableOpacity style={s.exampleBtn} onPress={() => setJson(EXAMPLE)}>
            <Text style={s.exampleBtnText}>Load example</Text>
          </TouchableOpacity>

          {/* Editor */}
          <Text style={s.label}>CAPTIONS JSON</Text>
          <TextInput
            style={s.editor}
            value={json}
            onChangeText={setJson}
            multiline
            placeholder={EXAMPLE}
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
          />

          {/* Actions */}
          <TouchableOpacity style={s.uploadBtn} onPress={handleUploadFile}>
            <Text style={s.uploadBtnText}>Upload .json File</Text>
          </TouchableOpacity>

          {!!json.trim() && (
            <TouchableOpacity style={s.clearBtn} onPress={() => setJson('')}>
              <Text style={s.clearBtnText}>Clear Captions</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerBtn: { minWidth: 60 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  cancelText: { fontSize: 16, color: colors.textMuted },
  saveText: { fontSize: 16, fontWeight: '700', color: colors.primary, textAlign: 'right' },

  scroll: { flex: 1, padding: 16 },

  guide: {
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    padding: 14, marginBottom: 12,
  },
  guideTitle: { fontSize: 13, fontWeight: '700', color: colors.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  guideText: { fontSize: 13, color: colors.textMuted, lineHeight: 20, marginBottom: 4 },
  code: { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', color: colors.text },
  repeatBadge: { color: '#fff', fontWeight: '700' },
  instrBadge: { color: '#FCD34D', fontWeight: '700' },

  exampleBtn: { alignSelf: 'flex-start', marginBottom: 16 },
  exampleBtnText: { color: colors.primary, fontWeight: '600', fontSize: 14 },

  label: {
    fontSize: 12, fontWeight: '600', color: colors.textMuted,
    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6,
  },
  editor: {
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    padding: 12, color: colors.text, fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    minHeight: 200, textAlignVertical: 'top',
    marginBottom: 12,
  },

  uploadBtn: {
    backgroundColor: colors.primaryDim, borderRadius: radius.md,
    paddingVertical: 13, alignItems: 'center', marginBottom: 10,
  },
  uploadBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },

  clearBtn: { alignItems: 'center', paddingVertical: 10 },
  clearBtnText: { color: colors.danger, fontSize: 14, fontWeight: '600' },
});
