import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, Animated, FlatList,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: W } = Dimensions.get('window');
const C = {
  navy: '#0A1628', navy2: '#0F2040', gold: '#F5A623', teal: '#00C9A7',
  white: '#fff', slate: '#94a3b8', slateD: '#475569', border: 'rgba(255,255,255,0.1)',
  red: '#E84B4B', green: '#22C55E', purple: '#8B5CF6',
};

const SLIDES = [
  {
    icon: '⚓',
    color: C.gold,
    title: 'Welcome to FleetAnchor Driver',
    subtitle: 'Your vehicle inspection companion',
    body: 'This app helps you complete vehicle inspections, track tyre conditions, and keep your fleet compliant — all from your phone.',
    tip: null,
  },
  {
    icon: '🔍',
    color: C.teal,
    title: 'Step 1 — Scan Your Vehicle',
    subtitle: 'Tap "Scan Vehicle" from the home screen',
    body: 'Point your camera at the number plate or VIN barcode, or simply type the plate number manually. The app pulls up the full vehicle record instantly.',
    tip: '💡 Tip: The vehicle must be registered in your fleet by your fleet manager before it appears.',
  },
  {
    icon: '⏱',
    color: C.gold,
    title: 'Step 2 — Enter Odometer (5 min)',
    subtitle: 'You have exactly 5 minutes after scanning',
    body: 'Walk to the vehicle dashboard, read the odometer, and type it in. Tap "Lock In". This window prevents entering another vehicle\'s mileage.',
    tip: '⚠️ If the timer expires, scan the vehicle again to get a new window.',
  },
  {
    icon: '✅',
    color: C.green,
    title: 'Step 3 — Checklist',
    subtitle: 'Tap each item — Pass or Fail',
    body: 'Work through the pre-trip checklist set by your fleet manager. Tap each item once for ✅ Pass, twice for ❌ Fail. Required items must be checked before you can submit.',
    tip: '💡 Tip: Your fleet manager customises what appears on this checklist.',
  },
  {
    icon: '🔵',
    color: '#8B5CF6',
    title: 'Step 4 — Tyre Inspection',
    subtitle: 'FL · FR · RL · RR — four tyre slots',
    body: 'Expand each tyre slot and scan the serial number (DOT code) on the tyre sidewall, or type it. The app checks it matches the record on file.',
    tip: '🚨 Mismatch? Your fleet manager is alerted instantly. If a tyre was replaced, tap "New tyre fitted" and enter the details.',
  },
  {
    icon: '🔄',
    color: C.gold,
    title: 'Tyre Serial Numbers',
    subtitle: 'Where to find the DOT code',
    body: 'Look for "DOT" on the tyre sidewall followed by a series of letters and numbers (e.g. DOT-ABC-DEF-1234). This is the unique ID for every tyre. Scan the barcode above it or type it manually.',
    tip: '💡 Tip: Scan in good light. If scanning fails, type the alphanumeric code directly.',
  },
  {
    icon: '📤',
    color: C.teal,
    title: 'Step 5 — Submit Report',
    subtitle: 'Tap "Submit Inspection Report"',
    body: 'Once all required fields are complete and odometer is locked, tap Submit. A tamper-proof record is saved instantly. You\'ll see your inspection ID and any tyre alerts.',
    tip: '✅ Done! Your fleet manager can view this report in real time.',
  },
  {
    icon: '🔑',
    color: C.gold,
    title: 'Login & Biometric',
    subtitle: 'Fast, secure sign-in options',
    body: 'Sign in with your email and password on first use. You\'ll be offered to enable Face ID or fingerprint for faster future logins. Contact your fleet manager if you\'ve been locked out.',
    tip: '💡 Forgot password? Tap "Forgot Password" on the login screen to submit a reset request to your manager.',
  },
  {
    icon: '🏆',
    color: '#F97316',
    title: 'Driver Dashboard',
    subtitle: 'Track your performance',
    body: 'Your home screen shows this month\'s inspections, tyre alerts, compliance health bars, and the driver leaderboard. Aim for 100% checklist completion and zero tyre alerts.',
    tip: '🌟 Top drivers are ranked monthly by their fleet manager.',
  },
];

export default function TutorialScreen({ navigation, onComplete }) {
  const [current, setCurrent] = useState(0);
  const flatRef = useRef(null);

  const goTo = (index) => {
    setCurrent(index);
    flatRef.current?.scrollToIndex({ index, animated: true });
  };

  const next = () => {
    if (current < SLIDES.length - 1) goTo(current + 1);
    else finish();
  };

  const finish = async () => {
    await AsyncStorage.setItem('tutorialDone', 'true');
    if (onComplete) onComplete();
    else navigation?.navigate('Home');
  };

  const slide = SLIDES[current];

  return (
    <View style={S.container}>
      {/* Skip button */}
      <TouchableOpacity style={S.skipBtn} onPress={finish}>
        <Text style={S.skipText}>Skip</Text>
      </TouchableOpacity>

      {/* Slides */}
      <FlatList
        ref={flatRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, i) => String(i)}
        onMomentumScrollEnd={e => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / W);
          setCurrent(idx);
        }}
        renderItem={({ item }) => <Slide slide={item} />}
      />

      {/* Dots */}
      <View style={S.dotsRow}>
        {SLIDES.map((_, i) => (
          <TouchableOpacity key={i} onPress={() => goTo(i)}>
            <View style={[S.dot, i === current && S.dotActive, { backgroundColor: i === current ? slide.color : 'rgba(255,255,255,0.2)' }]} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Navigation */}
      <View style={S.navRow}>
        {current > 0 ? (
          <TouchableOpacity style={S.prevBtn} onPress={() => goTo(current - 1)}>
            <Text style={S.prevBtnText}>← Back</Text>
          </TouchableOpacity>
        ) : <View style={{ flex: 1 }} />}

        <View style={S.counter}>
          <Text style={S.counterText}>{current + 1} / {SLIDES.length}</Text>
        </View>

        <TouchableOpacity
          style={[S.nextBtn, { backgroundColor: slide.color }]}
          onPress={next}
          activeOpacity={0.85}
        >
          <Text style={S.nextBtnText}>
            {current === SLIDES.length - 1 ? 'Get Started' : 'Next →'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Slide({ slide }) {
  return (
    <View style={[S.slide, { width: W }]}>
      <View style={[S.iconCircle, { backgroundColor: slide.color + '20', borderColor: slide.color + '40' }]}>
        <Text style={S.iconText}>{slide.icon}</Text>
      </View>
      <Text style={[S.slideTitle, { color: slide.color }]}>{slide.title}</Text>
      <Text style={S.slideSubtitle}>{slide.subtitle}</Text>
      <View style={S.bodyBox}>
        <Text style={S.bodyText}>{slide.body}</Text>
      </View>
      {slide.tip && (
        <View style={S.tipBox}>
          <Text style={S.tipText}>{slide.tip}</Text>
        </View>
      )}
    </View>
  );
}

const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.navy },
  skipBtn: { position: 'absolute', top: 52, right: 20, zIndex: 10, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)' },
  skipText: { fontSize: 12, color: C.slate, fontWeight: '500' },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingTop: 60 },
  iconCircle: { width: 88, height: 88, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 24, borderWidth: 1 },
  iconText: { fontSize: 44 },
  slideTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 8, letterSpacing: -0.5 },
  slideSubtitle: { fontSize: 13, color: C.slate, textAlign: 'center', marginBottom: 20, fontWeight: '500' },
  bodyBox: { backgroundColor: C.navy2, borderRadius: 14, padding: 18, marginBottom: 14, borderWidth: 0.5, borderColor: C.border, width: '100%' },
  bodyText: { fontSize: 14, color: '#CBD5E1', lineHeight: 22, textAlign: 'center' },
  tipBox: { backgroundColor: 'rgba(245,166,35,0.08)', borderRadius: 10, padding: 12, borderLeftWidth: 3, borderLeftColor: C.gold, width: '100%' },
  tipText: { fontSize: 12, color: C.gold, lineHeight: 18 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 16 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotActive: { width: 20, height: 6, borderRadius: 3 },
  navRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingBottom: 40, gap: 12 },
  prevBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center' },
  prevBtnText: { fontSize: 14, color: C.slate, fontWeight: '600' },
  counter: { paddingHorizontal: 12 },
  counterText: { fontSize: 12, color: C.slateD },
  nextBtn: { flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  nextBtnText: { fontSize: 14, fontWeight: '800', color: '#000' },
});
