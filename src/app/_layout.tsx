import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { EmergencyBanner } from '../components/EmergencyBanner';
import { clearLastCrash, crashReportText, readLastCrash, recordCrash, type CrashRecord } from '../services/crashLog';
import { DefibProvider } from '../state/DefibContext';
import { configureMapEngine } from '../services/mapEngine';
import { SettingsProvider, useSettings } from '../state/SettingsContext';

/* ------------------------------------------------------------------ */
/* Last-resort error screen: shown instead of the app closing.         */
/* Deliberately uses only plain React Native so it cannot fail itself. */
/* ------------------------------------------------------------------ */

function PlainButton({ label, onPress, red }: { label: string; onPress: () => void; red?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        minHeight: 60,
        borderRadius: 12,
        backgroundColor: red ? '#C3002F' : '#1D70B8',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
      }}
    >
      <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    recordCrash(error, 'screen');
  }, [error]);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#FFFFFF' }} contentContainerStyle={{ padding: 24, paddingTop: 72, gap: 16 }}>
      <Text style={{ fontSize: 28, fontWeight: '800', color: '#0B0C0C' }}>Something went wrong</Text>
      <Text style={{ fontSize: 20, color: '#0B0C0C' }}>
        If someone has collapsed, call 999 now – the call handler can direct you to the nearest defibrillator.
      </Text>
      <PlainButton label="Call 999" red onPress={() => Linking.openURL('tel:999')} />
      <PlainButton label="Try again" onPress={retry} />
      <PlainButton
        label="Send error details"
        onPress={() => Share.share({ message: crashReportText({ message: String(error?.message ?? error), stack: error?.stack, at: Date.now(), where: 'screen' }) })}
      />
      <Text selectable style={{ fontSize: 14, color: '#505A5F' }}>
        {String(error?.message ?? error)}
      </Text>
    </ScrollView>
  );
}

/** After an unexpected close, offer to share what went wrong. */
function LastCrashNotice() {
  const [crash, setCrash] = useState<CrashRecord | null>(() => readLastCrash());
  if (!crash) return null;
  const dismiss = () => {
    clearLastCrash();
    setCrash(null);
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 }}>
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, gap: 14 }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: '#0B0C0C' }}>The app closed unexpectedly</Text>
          <Text style={{ fontSize: 18, color: '#0B0C0C' }}>
            Sending the details below to the developer helps fix it.
          </Text>
          <Text selectable numberOfLines={6} style={{ fontSize: 14, color: '#505A5F' }}>
            {crash.message}
          </Text>
          <PlainButton label="Send error details" onPress={() => Share.share({ message: crashReportText(crash) })} />
          <PlainButton label="Close" onPress={dismiss} />
        </View>
      </View>
    </Modal>
  );
}

function ThemedStack() {
  const { theme, settings } = useSettings();
  const c = theme.colors;
  useEffect(() => {
    configureMapEngine(settings.mapCacheMb);
  }, [settings.mapCacheMb]);
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <StatusBar style={theme.highContrast || theme.dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.background },
          headerTintColor: c.text,
          headerTitleStyle: { fontSize: theme.font.large, fontWeight: '700', color: c.text },
          headerShadowVisible: !theme.highContrast,
          headerBackTitle: 'Back',
          headerBackButtonDisplayMode: 'default',
          contentStyle: { backgroundColor: c.background },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'UK LifeDrop AED', headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ title: 'Welcome', headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="map" options={{ title: 'Defibrillator map', headerShown: false }} />
        <Stack.Screen name="nearby" options={{ title: 'Nearby defibrillators' }} />
        <Stack.Screen name="defib/[id]" options={{ title: 'Defibrillator' }} />
        <Stack.Screen name="add" options={{ title: 'Add a defibrillator' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="streetview" options={{ title: 'Street View' }} />
        <Stack.Screen name="offline" options={{ title: 'Offline maps' }} />
        <Stack.Screen name="sources" options={{ title: 'Data sources' }} />
      </Stack>
      <EmergencyBanner />
      <LastCrashNotice />
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <DefibProvider>
          <ThemedStack />
        </DefibProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
