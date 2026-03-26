/**
 * BrowseScreen — scrollable catalog of all published experiences.
 * Tap a card to view details. Tap + to create a new experience.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image,
  StyleSheet, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { colors, radius } from '../theme';
import { subscribeExperiences } from '../services/experienceService';

const POSTER_COLORS = ['#4C1D95', '#065F46', '#1E3A5F', '#7C2D12', '#374151', '#713F12'];

function posterColor(title = '') {
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return POSTER_COLORS[h % POSTER_COLORS.length];
}

function ExperienceCard({ item, onPress }) {
  const roleCount = Object.keys(item.roles || {}).length;
  const bgColor = posterColor(item.title);

  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.85}>
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={s.poster} resizeMode="cover" />
      ) : (
        <View style={[s.poster, s.posterPlaceholder, { backgroundColor: bgColor }]}>
          <Text style={s.posterInitial}>{(item.title || '?').charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={s.cardBody}>
        <Text style={s.cardTitle} numberOfLines={2}>{item.title}</Text>
        {!!item.description && (
          <Text style={s.cardDesc} numberOfLines={2}>{item.description}</Text>
        )}
        <View style={s.cardMeta}>
          <Text style={s.cardCreator}>By {item.createdBy}</Text>
          {roleCount > 0 && (
            <View style={s.roleBadge}>
              <Text style={s.roleBadgeText}>{roleCount} {roleCount === 1 ? 'role' : 'roles'}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function BrowseScreen({ navigation }) {
  const [experiences, setExperiences] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeExperiences((list) => {
      setExperiences(list);
      setLoading(false);
    });
    return unsub;
  }, []);

  return (
    <SafeAreaView style={s.safe}>
      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} size="large" />
      ) : (
        <FlatList
          data={experiences}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.list}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyTitle}>No experiences yet</Text>
              <Text style={s.emptyText}>Tap + Create to publish the first one.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <ExperienceCard
              item={item}
              onPress={() => navigation.navigate('ExperienceDetail', { experience: item })}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 16, paddingBottom: 40 },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
    overflow: 'hidden',
  },
  poster: {
    width: '100%',
    height: 200,
  },
  posterPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterInitial: {
    fontSize: 72,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.3)',
  },
  cardBody: { padding: 16 },
  cardTitle: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 6 },
  cardDesc: { fontSize: 14, color: colors.textMuted, lineHeight: 20, marginBottom: 10 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardCreator: { fontSize: 12, color: colors.textDim },
  roleBadge: {
    backgroundColor: colors.primaryDim,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  roleBadgeText: { fontSize: 11, color: '#fff', fontWeight: '600' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
});
