/**
 * BrowseScreen — 2-column grid of experiences.
 * Each tile is a square image (or color placeholder) with the title overlaid.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image,
  StyleSheet, SafeAreaView, ActivityIndicator, Dimensions,
} from 'react-native';
import { colors, radius } from '../theme';
import { subscribeExperiences } from '../services/experienceService';

const POSTER_COLORS = ['#4C1D95', '#065F46', '#1E3A5F', '#7C2D12', '#374151', '#713F12'];

function posterColor(title = '') {
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return POSTER_COLORS[h % POSTER_COLORS.length];
}

const GAP = 10;
const PADDING = 12;
const TILE_SIZE = (Dimensions.get('window').width - PADDING * 2 - GAP) / 2;

function ExperienceTile({ item, onPress }) {
  const bgColor = posterColor(item.title);

  return (
    <TouchableOpacity style={s.tile} onPress={onPress} activeOpacity={0.8}>
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={s.tileImage} resizeMode="cover" />
      ) : (
        <View style={[s.tileImage, { backgroundColor: bgColor }]} />
      )}
      {/* Dark gradient overlay + title */}
      <View style={s.tileOverlay}>
        <Text style={s.tileTitle} numberOfLines={2}>{item.title}</Text>
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
          numColumns={2}
          columnWrapperStyle={s.row}
          contentContainerStyle={s.list}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyTitle}>No performances yet</Text>
              <Text style={s.emptyText}>Tap + Create to publish the first one.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <ExperienceTile
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
  list: { padding: PADDING, paddingBottom: 40 },
  row: { gap: GAP, marginBottom: GAP },

  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.card,
  },
  tileImage: {
    ...StyleSheet.absoluteFillObject,
  },
  tileOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 10,
    paddingTop: 24,
    paddingBottom: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  tileTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 18,
  },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
});
