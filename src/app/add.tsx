import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { AedMap, UK_CENTER, type AedMapHandle } from '../components/map/AedMap';
import { buildFeatures } from '../components/map/features';
import { TimeStepper } from '../components/TimeStepper';
import { AppText, BigButton, Card, ChoiceCard, Notice, Screen, SectionTitle, ToggleRow } from '../components/ui';
import { cloudEnabled } from '../services/cloud';
import { formatDistance, haversineMeters, isInUK } from '../lib/geo';
import { DAY_NAMES, buildOpeningHours, describeWeek, parseOpeningHours, type DaySchedule } from '../lib/openingHours';
import type { AccessType, LatLng } from '../lib/types';
import { useDefibs } from '../state/DefibContext';
import { openDefib } from '../state/hooks';
import { useSettings } from '../state/SettingsContext';

type Step = 'location' | 'access' | 'hours' | 'details' | 'review' | 'done';

const DEFAULT_WEEK: DaySchedule[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ open: d < 5, start: 9 * 60, end: 17 * 60 }));
const PIN_PATTERN = /^[0-9A-Za-z#*]{1,12}$/;

function StepHeader({ index, total, title }: { index: number; total: number; title: string }) {
  return (
    <View style={{ gap: 4 }}>
      <AppText variant="small" bold muted>
        STEP {index} OF {total}
      </AppText>
      <SectionTitle>{title}</SectionTitle>
    </View>
  );
}

function Field({
  label,
  hint,
  value,
  onChangeText,
  multiline,
  keyboardType,
  maxLength,
  placeholder,
  secure,
}: {
  label: string;
  hint?: string;
  value: string;
  onChangeText: (t: string) => void;
  multiline?: boolean;
  keyboardType?: 'default' | 'number-pad' | 'email-address' | 'phone-pad';
  maxLength?: number;
  placeholder?: string;
  secure?: boolean;
}) {
  const { theme } = useSettings();
  const c = theme.colors;
  return (
    <View style={{ gap: theme.space(1) }}>
      <AppText variant="large" bold>
        {label}
      </AppText>
      {hint ? (
        <AppText variant="small" muted>
          {hint}
        </AppText>
      ) : null}
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        keyboardType={keyboardType}
        maxLength={maxLength}
        placeholder={placeholder}
        placeholderTextColor={c.textMuted}
        secureTextEntry={secure}
        style={{
          minHeight: multiline ? theme.touch * 2 : theme.touch,
          borderWidth: 2,
          borderColor: c.border,
          borderRadius: theme.radius,
          backgroundColor: theme.highContrast ? '#000000' : '#FFFFFF',
          color: c.text,
          fontSize: theme.font.body,
          padding: theme.space(3),
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  );
}

export default function AddDefibrillator() {
  const { theme } = useSettings();
  const c = theme.colors;
  const { userLocation, requestLocation, all, statusOf, addDefib } = useDefibs();
  const params = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const [initialPin] = useState<LatLng | null>(() => {
    const lat = Number(params.lat);
    const lng = Number(params.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) && params.lat ? { latitude: lat, longitude: lng } : null;
  });

  const [step, setStep] = useState<Step>('location');
  const [pin, setPin] = useState<LatLng | null>(initialPin);
  const [zoom, setZoom] = useState(initialPin ? 18 : 6);
  const [locating, setLocating] = useState(false);
  const [accessType, setAccessType] = useState<AccessType | null>(null);
  const [pinCode, setPinCode] = useState('');
  const [restricted247, setRestricted247] = useState(true);
  const [week, setWeek] = useState<DaySchedule[]>(DEFAULT_WEEK);
  const [description, setDescription] = useState('');
  const [siteName, setSiteName] = useState('');
  const [contact, setContact] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const mapRef = useRef<AedMapHandle>(null);
  const [start] = useState<LatLng | null>(() => initialPin ?? userLocation);

  const needsHours = accessType === 'business_hours' || (accessType === 'restricted' && !restricted247);
  const steps: Step[] = needsHours
    ? ['location', 'access', 'hours', 'details', 'review']
    : ['location', 'access', 'details', 'review'];
  const stepIndex = steps.indexOf(step) + 1;

  const openingHours = needsHours ? buildOpeningHours(week) : '24/7';
  const weekSummary = useMemo(() => describeWeek(parseOpeningHours(openingHours)), [openingHours]);

  const nearbyExisting = useMemo(() => {
    if (!pin) return null;
    const close = all
      .filter((d) => Math.abs(d.latitude - pin.latitude) < 0.001 && Math.abs(d.longitude - pin.longitude) < 0.002)
      .map((d) => ({ d, m: haversineMeters(pin, d) }))
      .filter((x) => x.m < 30)
      .sort((a, b) => a.m - b.m);
    return close[0] ?? null;
  }, [pin, all]);

  // Existing defibrillators near the pin, so duplicates are easy to spot.
  const nearbyFeatures = useMemo(() => {
    const near = start
      ? all.filter((d) => Math.abs(d.latitude - start.latitude) < 0.05 && Math.abs(d.longitude - start.longitude) < 0.08)
      : [];
    return buildFeatures(near, statusOf, {
      showClosed: true,
      showUnknown: true,
      showRestricted: true,
      quick: { openNow: false, allDay: false, noCode: false },
    });
  }, [start, all, statusOf]);

  const go = (dir: 1 | -1) => {
    const i = steps.indexOf(step);
    const next = steps[i + dir];
    if (next) setStep(next);
    else if (dir === -1) router.back();
  };

  const useMyLocation = async () => {
    setLocating(true);
    const p = (await requestLocation()) ?? userLocation;
    setLocating(false);
    if (p) {
      setPin(p);
      setZoom(18);
      mapRef.current?.flyTo(p, 18);
    } else Alert.alert('Location unavailable', 'Allow location access, or move the map to put the pin on the spot.');
  };

  const pickPhoto = async (camera: boolean) => {
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Camera not allowed', 'You can allow camera access in your phone settings, or choose an existing photo.');
        return;
      }
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, allowsEditing: false, exif: false };
    const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (!res.canceled && res.assets[0]) setPhoto(res.assets[0].uri);
  };

  const validateAndNext = () => {
    if (step === 'location') {
      if (!pin) return Alert.alert('Place the pin', 'Tap “Use my current location”, or move the map so the pin is on the defibrillator.');
      if (zoom < 15) return Alert.alert('Zoom in closer', 'Zoom in on the map so the pin can be placed on the exact spot.');
      if (!isInUK(pin)) return Alert.alert('Outside the UK', 'This app only covers defibrillators in the United Kingdom.');
    }
    if (step === 'access') {
      if (!accessType) return Alert.alert('Choose an access type', 'Tell us how people can get to the defibrillator.');
      if (accessType === 'restricted' && pinCode && !PIN_PATTERN.test(pinCode.trim())) {
        return Alert.alert('Check the code', 'Codes can contain numbers, letters, # and * (up to 12 characters).');
      }
    }
    if (step === 'hours' && week.every((d) => !d.open)) {
      return Alert.alert('No opening hours', 'Mark at least one day as open, or choose “24/7 Public”.');
    }
    if (step === 'details' && description.trim().length < 5) {
      return Alert.alert(
        'Describe the location',
        'Add a short description so people can find it, e.g. “On the wall outside the post office”.',
      );
    }
    go(1);
  };

  const submit = async () => {
    if (!pin || !accessType) return;
    setSaving(true);
    try {
      const d = await addDefib({
        location: pin,
        accessType,
        pinCode: accessType === 'restricted' ? pinCode : undefined,
        openingHours,
        locationDescription: description,
        siteName,
        contact,
        photoTempUri: photo,
      });
      setSavedId(d.id);
      setStep('done');
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const renderNav = (nextLabel = 'Continue', onNext: () => void = validateAndNext) => (
    <View style={{ flexDirection: 'row', gap: theme.space(2) }}>
      <BigButton label="Back" icon="arrow-left" variant="secondary" onPress={() => go(-1)} style={{ flex: 1 }} />
      <BigButton label={nextLabel} icon="arrow-right" onPress={onNext} loading={saving} style={{ flex: 2 }} />
    </View>
  );

  /* ---------------- step 1: location (map moves under a fixed centre pin) ---------------- */
  if (step === 'location') {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <View style={{ padding: theme.space(4), paddingBottom: theme.space(2), gap: theme.space(2) }}>
          <StepHeader index={stepIndex} total={steps.length} title="Where is it?" />
          <AppText variant="small" muted>
            Move the map so the red pin sits exactly on the cabinet. Zoom in for accuracy.
          </AppText>
        </View>
        <View
          style={{ flex: 1, minHeight: 240, borderTopWidth: theme.borderWidth, borderBottomWidth: theme.borderWidth, borderColor: c.border }}
          accessibilityLabel="Map. Move the map to put the pin on the defibrillator."
        >
          <AedMap
            ref={mapRef}
            features={nearbyFeatures}
            initialCenter={start ?? UK_CENTER}
            initialZoom={start ? 18 : 5.2}
            showUser={!!userLocation}
            onRegionChange={(r) => {
              setZoom(r.zoom);
              if (r.zoom >= 12) setPin(r.center);
            }}
          />
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ alignItems: 'center', transform: [{ translateY: -22 }] }}>
              <MaterialCommunityIcons name="map-marker" size={52} color={c.emergency} />
            </View>
            <View style={{ position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: '#000', opacity: 0.35 }} />
          </View>
          <View style={{ position: 'absolute', right: 12, bottom: 12 }}>
            <BigButton label="My location" icon="crosshairs-gps" size="compact" loading={locating} onPress={useMyLocation} />
          </View>
        </View>
        <View style={{ padding: theme.space(4), gap: theme.space(2) }}>
          <AppText variant="small" muted>
            {pin && zoom >= 15
              ? `Pin at ${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)}`
              : 'Zoom in to street level to place the pin.'}
          </AppText>
          {renderNav()}
        </View>
      </View>
    );
  }

  /* ---------------- done ---------------- */
  if (step === 'done') {
    return (
      <Screen contentStyle={{ alignItems: 'stretch', paddingTop: theme.space(8) }}>
        <View style={{ alignItems: 'center', gap: theme.space(2) }}>
          <MaterialCommunityIcons name="check-circle" size={theme.font.huge * 2.2} color={c.status.available.bg} />
          <SectionTitle>Thank you</SectionTitle>
        </View>
        <AppText variant="large" center>
          The defibrillator is saved on this phone and will show on your map straight away.
        </AppText>
        <AppText variant="body" center muted>
          {cloudEnabled
            ? 'It is being shared with other users now. If you are offline it will be sent automatically later.'
            : 'Cloud sharing is not set up in this build, so it is only on this phone.'}
        </AppText>
        {savedId ? (
          <BigButton
            label="View it"
            icon="eye"
            onPress={() => {
              router.back();
              openDefib(savedId);
            }}
          />
        ) : null}
        <BigButton label="Done" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <Screen>
        {/* ---------------- step 2: access type ---------------- */}
        {step === 'access' ? (
          <>
            <StepHeader index={stepIndex} total={steps.length} title="How can people get to it?" />
            <View accessibilityRole="radiogroup" style={{ gap: theme.space(3) }}>
              <ChoiceCard
                title="24/7 Public"
                description="Unlocked cabinet anyone can open at any time."
                icon="clock-check"
                selected={accessType === '24/7'}
                onPress={() => setAccessType('24/7')}
              />
              <ChoiceCard
                title="Locked / Restricted"
                description="Cabinet with a keypad or lock."
                icon="lock"
                selected={accessType === 'restricted'}
                onPress={() => setAccessType('restricted')}
              />
              <ChoiceCard
                title="Business Hours Only"
                description="Inside a shop, office, gym or similar – only when it is open."
                icon="store-clock"
                selected={accessType === 'business_hours'}
                onPress={() => setAccessType('business_hours')}
              />
            </View>
            {accessType === 'restricted' ? (
              <Card>
                <Field
                  label="Cabinet keypad code (optional)"
                  hint="Only add a code that is meant to be shared publicly. If you leave it blank, people will be told the 999 call handler can give them the code."
                  value={pinCode}
                  onChangeText={(t) => setPinCode(t.replace(/\s/g, ''))}
                  keyboardType="default"
                  maxLength={12}
                  placeholder="e.g. C1234"
                />
                <ToggleRow
                  label="Available 24 hours a day"
                  description="Turn off if the cabinet is only reachable at certain times."
                  value={restricted247}
                  onValueChange={setRestricted247}
                />
              </Card>
            ) : null}
            {renderNav()}
          </>
        ) : null}

        {/* ---------------- step 3: hours ---------------- */}
        {step === 'hours' ? (
          <>
            <StepHeader index={stepIndex} total={steps.length} title="When is it available?" />
            <BigButton
              label="Use Monday’s hours for every open day"
              icon="content-copy"
              variant="secondary"
              size="compact"
              onPress={() => setWeek((w) => w.map((d) => (d.open ? { ...d, start: w[0].start, end: w[0].end } : d)))}
            />
            {week.map((d, i) => (
              <Card key={DAY_NAMES[i]}>
                <ToggleRow
                  label={DAY_NAMES[i]}
                  description={d.open ? 'Open' : 'Closed all day'}
                  value={d.open}
                  onValueChange={(open) => setWeek((w) => w.map((x, j) => (j === i ? { ...x, open } : x)))}
                />
                {d.open ? (
                  <>
                    <TimeStepper
                      label={`${DAY_NAMES[i]} opens`}
                      value={d.start}
                      onChange={(start) => setWeek((w) => w.map((x, j) => (j === i ? { ...x, start } : x)))}
                    />
                    <TimeStepper
                      label={`${DAY_NAMES[i]} closes`}
                      value={d.end}
                      allowMidnightEnd
                      onChange={(end) => setWeek((w) => w.map((x, j) => (j === i ? { ...x, end } : x)))}
                    />
                  </>
                ) : null}
              </Card>
            ))}
            {renderNav()}
          </>
        ) : null}

        {/* ---------------- step 4: details & photo ---------------- */}
        {step === 'details' ? (
          <>
            <StepHeader index={stepIndex} total={steps.length} title="Describe where it is" />
            <Field
              label="Location notes"
              hint="Help someone in a hurry find it."
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={500}
              placeholder="e.g. Mounted on the red brick wall outside the village post office"
            />
            <Field label="Building or site name (optional)" value={siteName} onChangeText={setSiteName} maxLength={100} />
            <Field
              label="Contact (optional)"
              hint="Who looks after it – e.g. parish council phone or email. This will be shown publicly."
              value={contact}
              onChangeText={setContact}
              maxLength={100}
            />
            <AppText variant="large" bold>
              Photo of the cabinet (optional)
            </AppText>
            {photo ? (
              <>
                <Image
                  source={{ uri: photo }}
                  accessibilityLabel="Selected photo"
                  style={{ width: '100%', height: 220, borderRadius: theme.radius }}
                  resizeMode="cover"
                />
                <BigButton label="Remove photo" icon="delete" variant="secondary" size="compact" onPress={() => setPhoto(null)} />
              </>
            ) : (
              <View style={{ flexDirection: 'row', gap: theme.space(2) }}>
                <BigButton
                  label="Take photo"
                  icon="camera"
                  variant="secondary"
                  onPress={() => pickPhoto(true)}
                  style={{ flex: 1 }}
                />
                <BigButton
                  label="Choose photo"
                  icon="image"
                  variant="secondary"
                  onPress={() => pickPhoto(false)}
                  style={{ flex: 1 }}
                />
              </View>
            )}
            {renderNav()}
          </>
        ) : null}

        {/* ---------------- step 5: review ---------------- */}
        {step === 'review' && pin && accessType ? (
          <>
            <StepHeader index={stepIndex} total={steps.length} title="Check and submit" />
            {nearbyExisting ? (
              <Notice
                tone="warning"
                text={`A defibrillator is already recorded ${formatDistance(nearbyExisting.m).metric} from this spot. Only submit if this is a different one.`}
              />
            ) : null}
            <Card>
              <AppText bold>Location</AppText>
              <AppText>
                {pin.latitude.toFixed(5)}, {pin.longitude.toFixed(5)}
              </AppText>
              <AppText bold>Access</AppText>
              <AppText>
                {accessType === '24/7'
                  ? '24/7 Public'
                  : accessType === 'restricted'
                    ? 'Locked / Restricted'
                    : 'Business hours only'}
              </AppText>
              {accessType === 'restricted' ? (
                <Text style={{ color: c.text, fontSize: theme.font.large, fontWeight: '800' }}>
                  Code: {pinCode || 'not shared (999 will give it)'}
                </Text>
              ) : null}
              <AppText bold>Hours</AppText>
              {openingHours === '24/7' ? (
                <AppText>24 hours, every day</AppText>
              ) : (
                weekSummary?.map((r) => (
                  <AppText key={r.day}>
                    {r.day}: {r.text}
                  </AppText>
                ))
              )}
              <AppText bold>Location notes</AppText>
              <AppText>{description}</AppText>
              {siteName ? <AppText>Site: {siteName}</AppText> : null}
              {contact ? <AppText>Contact: {contact}</AppText> : null}
              {photo ? <AppText>Photo attached</AppText> : null}
            </Card>
            <AppText variant="small" muted>
              Everything above, including any code, will be visible to other users. Do not include personal information.
            </AppText>
            {renderNav('Submit', submit)}
          </>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}
