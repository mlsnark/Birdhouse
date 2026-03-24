import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from './src/screens/HomeScreen';
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

export default function App() {
  return (
    <NavigationContainer theme={NavTheme}>
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
          name="Host"
          component={HostScreen}
          options={{ title: 'Host a Session' }}
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
          options={{
            headerShown: false,
            gestureEnabled: false,
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
