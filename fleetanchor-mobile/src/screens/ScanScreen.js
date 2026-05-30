import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Vibration, ScrollView,
} from 'react-native';
import { inspectionAPI } from '../services/api';

const COLORS = {
  navy: '#0A1628', navy2: '#0F2040', navy3: '#1A3A5C',
  gold: '#F5A623', teal: '#00C9A7', white: '#fff',
  slate: '#94a3b8', slateD: '#475569', border: 'rgba(255,255,255,0.1)',
  red: '#E84B4B', green: '#22C55E', orange: '#F97316',
};

export default function ScanScreen({ navigation }) {
  const [mode, setMode] = useState('type'); // 'scan' | 'type'
  const [plateInput, setPlateInput] = useState('');
  const [vinInput, setVinInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleScan = async (value, type = 'plate') => {
    if (!value.trim()) {
      setError('Enter a plate number or VIN');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await inspectionAPI.scanVehicle(
        type === 'plate' ? value.trim().toUpperCase() : undefined,
        type === 'vin' ? value.trim().toUpperCase() : undefined,
      );

      if (data.success) {
        Vibration.vibrate(100);
        navigation.navigate('InspectionForm', {
          vehicleData: data.data.vehicle,
          driverData: data.data.driver,
          sessionToken: data.data.sessionToken,
          expiresAt: data.data.expiresAt,
          sessionWindowSeconds: data.data.sessionWindowSeconds,
          access: data.data.access,
        });
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Vehicle not found';
      setError(msg);
      Vibration.vibrate([0, 100, 50, 100]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ flexGrow: 1 }}>
      <View style={styles.header}>
        <Text style={styles.title}>Scan Vehicle</Text>
        <Text style={styles.subtitle}>Scan plate/VIN or type it manually</Text>
      </View>

      {/* Mode toggle */}
      <View style={styles.modeToggle}>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'type' && styles.modeBtnActive]}
          onPress={() => setMode('type')}
        >
          <Text style={[styles.modeBtnText, mode === 'type' && styles.modeBtnTextActive]}>Type manually</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'scan' && styles.modeBtnActive]}
          onPress={() => {
            setMode('scan');
            navigation.navigate('BarcodeScanner', {
              onScan: (value, type) => {
                setMode('type');
                if (type === 'vin') setVinInput(value);
                else setPlateInput(value);
              },
            });
          }}
        >
          <Text style={[styles.modeBtnText, mode === 'scan' && styles.modeBtnTextActive]}>Scan barcode</Text>
        </TouchableOpacity>
      </View>

      {/* Input area */}
      <View style={styles.inputCard}>
        <Text style={styles.inputLabel}>Plate Number</Text>
        <TextInput
          style={styles.input}
          value={plateInput}
          onChangeText={v => { setPlateInput(v.toUpperCase()); setVinInput(''); }}
          placeholder="e.g. LND-421-XY"
          placeholderTextColor={COLORS.slateD}
          autoCapitalize="characters"
          returnKeyType="search"
          onSubmitEditing={() => plateInput && handleScan(plateInput, 'plate')}
        />

        <Text style={[styles.inputLabel, { marginTop: 16 }]}>— or VIN —</Text>
        <TextInput
          style={styles.input}
          value={vinInput}
          onChangeText={v => { setVinInput(v.toUpperCase()); setPlateInput(''); }}
          placeholder="WNXNF4327A6000001"
          placeholderTextColor={COLORS.slateD}
          autoCapitalize="characters"
          maxLength={17}
          returnKeyType="search"
          onSubmitEditing={() => vinInput && handleScan(vinInput, 'vin')}
        />

        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.searchBtn, loading && styles.searchBtnDisabled]}
          onPress={() => {
            if (plateInput) handleScan(plateInput, 'plate');
            else if (vinInput) handleScan(vinInput, 'vin');
            else setError('Enter a plate number or VIN first');
          }}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#000" />
            : <Text style={styles.searchBtnText}>Pull Vehicle Record</Text>
          }
        </TouchableOpacity>
      </View>

      {/* Info box */}
      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>How it works</Text>
        <Text style={styles.infoLine}>1. Scan or type the plate / VIN</Text>
        <Text style={styles.infoLine}>2. Vehicle details auto-populate</Text>
        <Text style={styles.infoLine}>3. Enter current odometer (5-min window)</Text>
        <Text style={styles.infoLine}>4. Complete inspection checklist</Text>
        <Text style={styles.infoLine}>5. Scan each tyre serial number</Text>
        <Text style={styles.infoLine}>6. Submit — tamper-proof record saved</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  header: { padding: 24, paddingTop: 16 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.white },
  subtitle: { fontSize: 13, color: COLORS.slate, marginTop: 4 },
  modeToggle: {
    flexDirection: 'row', marginHorizontal: 20, marginBottom: 16,
    backgroundColor: COLORS.navy2, borderRadius: 10, padding: 3,
  },
  modeBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  modeBtnActive: { backgroundColor: COLORS.gold },
  modeBtnText: { fontSize: 13, color: COLORS.slate, fontWeight: '500' },
  modeBtnTextActive: { color: '#000', fontWeight: '700' },
  inputCard: {
    marginHorizontal: 20, backgroundColor: COLORS.navy2,
    borderRadius: 16, padding: 20, borderWidth: 0.5, borderColor: COLORS.border,
  },
  inputLabel: { fontSize: 11, color: COLORS.slate, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10,
    borderWidth: 0.5, borderColor: COLORS.border,
    color: COLORS.white, fontSize: 15, paddingHorizontal: 14, paddingVertical: 12,
    letterSpacing: 1,
  },
  errorBox: { backgroundColor: 'rgba(232,75,75,0.15)', borderRadius: 8, padding: 10, marginTop: 12 },
  errorText: { color: COLORS.red, fontSize: 13 },
  searchBtn: {
    backgroundColor: COLORS.gold, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', marginTop: 20,
  },
  searchBtnDisabled: { opacity: 0.6 },
  searchBtnText: { fontSize: 15, fontWeight: '700', color: '#000' },
  infoBox: {
    margin: 20, backgroundColor: COLORS.navy2,
    borderRadius: 16, padding: 18, borderWidth: 0.5, borderColor: COLORS.border,
  },
  infoTitle: { fontSize: 12, fontWeight: '700', color: COLORS.gold, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoLine: { fontSize: 13, color: COLORS.slate, marginBottom: 5 },
});
