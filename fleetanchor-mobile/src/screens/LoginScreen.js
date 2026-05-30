import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authAPI } from '../services/api';

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing fields', 'Please enter email and password');
      return;
    }
    setLoading(true);
    try {
      const { data } = await authAPI.login(email.trim().toLowerCase(), password);
      if (data.success) {
        await AsyncStorage.setItem('accessToken', data.accessToken);
        await AsyncStorage.setItem('refreshToken', data.refreshToken);
        await AsyncStorage.setItem('user', JSON.stringify(data.user));
        onLogin(data.user);
      }
    } catch (err) {
      Alert.alert('Login failed', err.response?.data?.error || 'Check your credentials and try again');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.logoBox}>
        <Text style={styles.anchor}>⚓</Text>
        <Text style={styles.appName}>FleetAnchor Pro</Text>
        <Text style={styles.tagline}>Driver Inspection Portal</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Email Address</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="your@email.com"
          placeholderTextColor="#64748b"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />

        <Text style={styles.label}>Password</Text>
        <View style={styles.pwRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPw}
            placeholder="••••••••••••"
            placeholderTextColor="#64748b"
            autoComplete="password"
          />
          <TouchableOpacity onPress={() => setShowPw(s => !s)} style={styles.eyeBtn}>
            <Text style={styles.eyeText}>{showPw ? '🙈' : '👁️'}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#000" />
            : <Text style={styles.loginBtnText}>Sign In</Text>
          }
        </TouchableOpacity>

        <Text style={styles.note}>Contact your fleet manager if you need access.</Text>
      </View>

      <Text style={styles.footer}>Protected by 2FA, rate limiting, and end-to-end encryption</Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A1628', justifyContent: 'center', paddingHorizontal: 24 },
  logoBox: { alignItems: 'center', marginBottom: 32 },
  anchor: { fontSize: 56, marginBottom: 8 },
  appName: { fontSize: 26, fontWeight: '700', color: '#fff', letterSpacing: -0.5 },
  tagline: { fontSize: 13, color: '#F5A623', marginTop: 4, letterSpacing: 1.5, textTransform: 'uppercase' },
  card: { backgroundColor: '#0F2040', borderRadius: 16, padding: 24, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.1)' },
  label: { fontSize: 11, fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.12)',
    color: '#fff',
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pwRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn: { paddingHorizontal: 10, paddingVertical: 12 },
  eyeText: { fontSize: 18 },
  loginBtn: {
    backgroundColor: '#F5A623',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  loginBtnDisabled: { opacity: 0.6 },
  loginBtnText: { fontSize: 15, fontWeight: '700', color: '#000', letterSpacing: 0.3 },
  note: { fontSize: 12, color: '#64748b', textAlign: 'center', marginTop: 16 },
  footer: { fontSize: 11, color: '#334155', textAlign: 'center', marginTop: 32 },
});
