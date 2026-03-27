import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';

import HomeScreen from './src/screens/HomeScreen';
import BrowseScreen from './src/screens/BrowseScreen';
import CreateExperienceScreen from './src/screens/CreateExperienceScreen';
import ExperienceDetailScreen from './src/screens/ExperienceDetailScreen';
import HostScreen from './src/screens/HostScreen';
import JoinScreen from './src/screens/JoinScreen';
import LobbyScreen from './src/screens/LobbyScreen';
import PlaybackScreen from './src/screens/PlaybackScreen';
import { colors } from './src/theme';

const Stack = createNativeStackNavigator();

const NavTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.surface,
    border: colors.border,
    primary: colors.primary,
    text: colors.text,
  },
};

const linking = {
  prefixes: [Linking.createURL('/'), 'birdhouse://'],
  config: {
    screens: {
      Join: {
        path: 'join',
        parse: { prefillCode: (v) => String(v).toUpperCase() },
      },
    },
  },
};

export default function App() {
  return (
    <NavigationContainer theme={NavTheme} linking={linking}>
      <StatusBar style="light" />
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '700' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Browse"
          component={BrowseScreen}
          options={({ navigation }) => ({
            title: 'Experiences',
            headerRight: () => (
              <HeaderButton
                label="+ Create"
                onPress={() => navigation.navigate('CreateExperience')}
              />
            ),
          })}
        />
        <Stack.Screen
          name="CreateExperience"
          component={CreateExperienceScreen}
          options={({ route }) => ({
            title: route.params?.experience ? 'Edit Experience' : 'New Experience',
          })}
        />
        <Stack.Screen
          name="ExperienceDetail"
          component={ExperienceDetailScreen}
          options={{ title: '' }}
        />
        <Stack.Screen
          name="Host"
          component={HostScreen}
          options={({ route }) => ({
            title: route.params?.experience ? 'Host Session' : 'Host a Session',
          })}
        />
        <Stack.Screen
          name="Join"
          component={JoinScreen}
          options={{ title: 'Join a Session' }}
        />
        <Stack.Screen
          name="Lobby"
          component={LobbyScreen}
          options={({ route }) => ({
            title: `Room ${route.params?.roomCode ?? ''}`,
            headerBackVisible: false,
            gestureEnabled: false,
          })}
        />
        <Stack.Screen
          name="Playback"
          component={PlaybackScreen}
          options={{ headerShown: false, gestureEnabled: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function HeaderButton({ label, onPress }) {
  const { TouchableOpacity, Text } = require('react-native');
  return (
    <TouchableOpacity onPress={onPress} style={{ paddingHorizontal: 4 }}>
      <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 15 }}>{label}</Text>
    </TouchableOpacity>
  );
}
