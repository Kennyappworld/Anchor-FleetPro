import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

export default function SessionTimer({ expiresAt, windowSeconds, onExpire }) {
  const expiry = new Date(expiresAt).getTime();
  const [remaining, setRemaining] = useState(Math.max(0, Math.floor((expiry - Date.now()) / 1000)));
  const pulseAnim = new Animated.Value(1);

  useEffect(() => {
    const interval = setInterval(() => {
      const r = Math.max(0, Math.floor((expiry - Date.now()) / 1000));
      setRemaining(r);
      if (r === 0) {
        clearInterval(interval);
        onExpire?.();
      }
    }, 500);
    return () => clearInterval(interval);
  }, [expiry]);

  useEffect(() => {
    if (remaining <= 60 && remaining > 0) {
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 300, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [remaining]);

  const pct = Math.max(0, remaining / windowSeconds);
  const isUrgent = remaining <= 60;
  const isExpired = remaining === 0;

  const color = isExpired ? '#E84B4B' : isUrgent ? '#F97316' : '#F5A623';
  const bgColor = isExpired ? 'rgba(232,75,75,0.15)' : isUrgent ? 'rgba(249,115,22,0.15)' : 'rgba(245,166,35,0.1)';

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;

  return (
    <Animated.View style={[styles.container, { backgroundColor: bgColor }, { transform: [{ scale: pulseAnim }] }]}>
      <View style={styles.row}>
        <View>
          <Text style={[styles.label, { color }]}>
            {isExpired ? '⛔ Session expired' : isUrgent ? '⚠️ Odometer window closing' : '⏱ Odometer window open'}
          </Text>
          <Text style={styles.sub}>
            {isExpired
              ? 'Scan the vehicle again to start a new session'
              : 'Capture odometer before this timer expires'}
          </Text>
        </View>
        <Text style={[styles.timer, { color }]}>{isExpired ? '0:00' : timeStr}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.bar, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { marginHorizontal: 16, marginTop: 12, borderRadius: 12, padding: 14, borderLeftWidth: 3, borderLeftColor: '#F5A623' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  sub: { fontSize: 11, color: '#94a3b8' },
  timer: { fontSize: 26, fontWeight: '800', fontFamily: 'monospace' },
  track: { height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' },
  bar: { height: 4, borderRadius: 2 },
});
