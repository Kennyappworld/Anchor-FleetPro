import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Animated,
} from 'react-native';
import { inspectionAPI } from '../services/api';
import TyreSlot from '../components/TyreSlot';
import SessionTimer from '../components/SessionTimer';

const C = {
  navy: '#0A1628', navy2: '#0F2040', gold: '#F5A623', teal: '#00C9A7',
  white: '#fff', slate: '#94a3b8', slateD: '#475569', border: 'rgba(255,255,255,0.1)',
  red: '#E84B4B', green: '#22C55E', orange: '#F97316',
};

const CHECKLIST_ITEMS = [
  { key: 'lightsOk',   label: 'Lights & indicators' },
  { key: 'brakesOk',   label: 'Brakes (feel & pedal)' },
  { key: 'engineOilOk', label: 'Engine oil level' },
  { key: 'coolantOk',  label: 'Coolant level' },
  { key: 'exhaustOk',  label: 'Exhaust (smoke/noise)' },
  { key: 'wiperOk',    label: 'Windscreen wipers' },
  { key: 'hornOk',     label: 'Horn' },
  { key: 'steeringOk', label: 'Steering response' },
  { key: 'mirrorsOk',  label: 'Mirrors (all)' },
  { key: 'bodyDamage', label: 'Body damage (mark any)' },
];

const INSPECTION_TYPES = ['PRE_TRIP', 'POST_TRIP', 'PERIODIC', 'INCIDENT'];
const CONDITIONS = ['EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'CRITICAL'];

export default function InspectionFormScreen({ route, navigation }) {
  const { vehicleData, driverData, sessionToken, expiresAt, sessionWindowSeconds, access } = route.params;

  // Driver fields (editable)
  const [driverName, setDriverName] = useState(driverData.fullName || '');
  const [driverLicence, setDriverLicence] = useState(driverData.licenceNumber || '');
  const [driverPhone, setDriverPhone] = useState(driverData.phone || '');

  // Odometer
  const [odometer, setOdometer] = useState('');
  const [odometerCaptured, setOdometerCaptured] = useState(false);
  const [odometerLoading, setOdometerLoading] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Inspection
  const [inspectionType, setInspectionType] = useState('PRE_TRIP');
  const [overallCondition, setOverallCondition] = useState('GOOD');
  const [checklist, setChecklist] = useState({});
  const [notes, setNotes] = useState('');

  // Tyres — one entry per position
  const [tyres, setTyres] = useState({
    FL: { serial: vehicleData.currentTyres?.find(t => t.position === 'FL')?.serialNumber || '', condition: 'GOOD', pressure: '', newTyre: false, brand: '', model: '', sizeSpec: '' },
    FR: { serial: vehicleData.currentTyres?.find(t => t.position === 'FR')?.serialNumber || '', condition: 'GOOD', pressure: '', newTyre: false, brand: '', model: '', sizeSpec: '' },
    RL: { serial: vehicleData.currentTyres?.find(t => t.position === 'RL')?.serialNumber || '', condition: 'GOOD', pressure: '', newTyre: false, brand: '', model: '', sizeSpec: '' },
    RR: { serial: vehicleData.currentTyres?.find(t => t.position === 'RR')?.serialNumber || '', condition: 'GOOD', pressure: '', newTyre: false, brand: '', model: '', sizeSpec: '' },
  });

  const [submitting, setSubmitting] = useState(false);

  const updateTyre = useCallback((pos, field, value) => {
    setTyres(prev => ({ ...prev, [pos]: { ...prev[pos], [field]: value } }));
  }, []);

  const toggleCheck = (key) => {
    setChecklist(prev => {
      const current = prev[key];
      // cycle: undefined → true → false → undefined
      if (current === undefined) return { ...prev, [key]: true };
      if (current === true) return { ...prev, [key]: false };
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const captureOdometer = async () => {
    const km = parseInt(odometer);
    if (!km || km < 1) { Alert.alert('Invalid', 'Enter a valid odometer reading'); return; }
    if (sessionExpired) { Alert.alert('Session expired', 'Please scan the vehicle again'); return; }
    setOdometerLoading(true);
    try {
      await inspectionAPI.captureOdometer(sessionToken, km);
      setOdometerCaptured(true);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to capture odometer');
    } finally {
      setOdometerLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!odometerCaptured) {
      Alert.alert('Odometer required', 'Please capture the odometer reading first');
      return;
    }
    if (!driverName.trim()) {
      Alert.alert('Driver name required', 'Enter or verify driver name');
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await inspectionAPI.submit({
        sessionToken,
        inspectionType,
        overallCondition,
        driverName: driverName.trim(),
        driverLicence: driverLicence.trim(),
        driverPhone: driverPhone.trim(),
        checklist,
        tyres,
        notes: notes.trim(),
      });

      if (data.success) {
        navigation.replace('InspectionComplete', {
          inspectionId: data.data.inspectionId,
          tyreAlerts: data.data.tyreAlerts,
          odometer: data.data.odometer,
          deltaKm: data.data.deltaKm,
          vehicle: vehicleData,
        });
      }
    } catch (err) {
      Alert.alert('Submission failed', err.response?.data?.error || 'Please try again');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>

      {/* Session timer bar */}
      {!odometerCaptured && (
        <SessionTimer
          expiresAt={expiresAt}
          windowSeconds={sessionWindowSeconds}
          onExpire={() => setSessionExpired(true)}
        />
      )}

      {/* Vehicle info banner */}
      <View style={styles.vehicleBanner}>
        <View>
          <Text style={styles.plateText}>{vehicleData.plateNumber}</Text>
          <Text style={styles.vehicleSubtext}>{vehicleData.make} {vehicleData.model} {vehicleData.year}</Text>
          <Text style={styles.vehicleSubtext}>VIN: {vehicleData.vin}</Text>
        </View>
        <View style={styles.odometerBadge}>
          <Text style={styles.odometerBadgeLabel}>Last recorded</Text>
          <Text style={styles.odometerBadgeValue}>{(vehicleData.currentOdometer || 0).toLocaleString()} km</Text>
        </View>
      </View>

      {/* Maintenance plan */}
      {vehicleData.nextServiceDate && (
        <View style={styles.alertBanner}>
          <Text style={styles.alertText}>
            Next service due: {new Date(vehicleData.nextServiceDate).toLocaleDateString('en-NG')}
            {vehicleData.nextServiceOdometer ? ` or ${vehicleData.nextServiceOdometer.toLocaleString()} km` : ''}
          </Text>
        </View>
      )}

      {/* Section: Odometer (time-locked) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Current Odometer *</Text>
        <Text style={styles.sectionNote}>
          {odometerCaptured
            ? `✅ Captured: ${parseInt(odometer).toLocaleString()} km`
            : `Must be entered within ${sessionWindowSeconds / 60} minutes of scanning vehicle`}
        </Text>
        {!odometerCaptured && (
          <View style={styles.odometerRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={odometer}
              onChangeText={setOdometer}
              keyboardType="numeric"
              placeholder="e.g. 46210"
              placeholderTextColor={C.slateD}
            />
            <Text style={styles.kmLabel}>km</Text>
            <TouchableOpacity
              style={[styles.captureBtn, odometerLoading && { opacity: 0.6 }]}
              onPress={captureOdometer}
              disabled={odometerLoading || sessionExpired}
            >
              {odometerLoading ? <ActivityIndicator color="#000" size="small" /> : <Text style={styles.captureBtnText}>Confirm</Text>}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Section: Driver details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Driver Details</Text>
        <Text style={styles.sectionNote}>Pre-filled from registry — edit if driver has changed</Text>

        <Text style={styles.fieldLabel}>Driver Name *</Text>
        <TextInput style={styles.input} value={driverName} onChangeText={setDriverName} placeholder="Full name" placeholderTextColor={C.slateD} />

        <Text style={styles.fieldLabel}>Licence Number</Text>
        <TextInput style={styles.input} value={driverLicence} onChangeText={setDriverLicence} placeholder="FED-20-00101" placeholderTextColor={C.slateD} autoCapitalize="characters" />

        <Text style={styles.fieldLabel}>Phone</Text>
        <TextInput style={styles.input} value={driverPhone} onChangeText={setDriverPhone} placeholder="08012345678" placeholderTextColor={C.slateD} keyboardType="phone-pad" />
      </View>

      {/* Section: Inspection type */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Inspection Type</Text>
        <View style={styles.pillRow}>
          {INSPECTION_TYPES.map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.pill, inspectionType === t && styles.pillActive]}
              onPress={() => setInspectionType(t)}
            >
              <Text style={[styles.pillText, inspectionType === t && styles.pillTextActive]}>
                {t.replace('_', ' ')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Section: Checklist */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Vehicle Checklist</Text>
        <Text style={styles.sectionNote}>Tap to mark pass ✅ or fail ❌ — leave blank to skip</Text>
        {CHECKLIST_ITEMS.map(({ key, label }) => {
          const val = checklist[key];
          return (
            <TouchableOpacity key={key} style={styles.checkRow} onPress={() => toggleCheck(key)} activeOpacity={0.7}>
              <Text style={styles.checkLabel}>{label}</Text>
              <View style={[styles.checkBadge,
                val === true ? styles.checkPass :
                val === false ? styles.checkFail :
                styles.checkSkip
              ]}>
                <Text style={styles.checkBadgeText}>
                  {val === true ? '✅ Pass' : val === false ? '❌ Fail' : '— Skip'}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Section: Overall condition */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Overall Vehicle Condition</Text>
        <View style={styles.pillRow}>
          {CONDITIONS.map(c => (
            <TouchableOpacity
              key={c}
              style={[styles.pill, overallCondition === c && styles.pillActive,
                c === 'CRITICAL' && overallCondition === c && { backgroundColor: C.red }]}
              onPress={() => setOverallCondition(c)}
            >
              <Text style={[styles.pillText, overallCondition === c && styles.pillTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Section: Tyre inspection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tyre Inspection</Text>
        <Text style={styles.sectionNote}>
          Scan or type each tyre serial. Mismatch triggers fleet manager alert.
          Tick "New tyre" if a tyre was replaced.
        </Text>
        {['FL', 'FR', 'RL', 'RR'].map(pos => (
          <TyreSlot
            key={pos}
            position={pos}
            data={tyres[pos]}
            recordedSerial={vehicleData.currentTyres?.find(t => t.position === pos)?.serialNumber}
            recordedKm={vehicleData.currentTyres?.find(t => t.position === pos)?.kmCovered}
            onUpdate={(field, val) => updateTyre(pos, field, val)}
            onScanSerial={() => navigation.navigate('BarcodeScanner', {
              onScan: (val) => updateTyre(pos, 'serial', val.toUpperCase()),
            })}
          />
        ))}
      </View>

      {/* Section: Notes */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notes</Text>
        <TextInput
          style={[styles.input, { height: 80, textAlignVertical: 'top', paddingTop: 12 }]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Any additional observations..."
          placeholderTextColor={C.slateD}
          multiline
        />
      </View>

      {/* Submit */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 40 }}>
        {!odometerCaptured && (
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>⏱ Capture odometer before submitting</Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.submitBtn, (submitting || !odometerCaptured) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting || !odometerCaptured}
          activeOpacity={0.85}
        >
          {submitting
            ? <ActivityIndicator color="#000" />
            : <Text style={styles.submitBtnText}>Submit Inspection Report</Text>
          }
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.navy },
  vehicleBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    margin: 16, backgroundColor: C.navy2, borderRadius: 14, padding: 16,
    borderWidth: 0.5, borderColor: C.border,
  },
  plateText: { fontSize: 22, fontWeight: '800', color: C.gold, letterSpacing: 1 },
  vehicleSubtext: { fontSize: 13, color: C.slate, marginTop: 2 },
  odometerBadge: { alignItems: 'flex-end' },
  odometerBadgeLabel: { fontSize: 10, color: C.slate, textTransform: 'uppercase', letterSpacing: 0.5 },
  odometerBadgeValue: { fontSize: 16, fontWeight: '700', color: C.white, marginTop: 2 },
  alertBanner: {
    marginHorizontal: 16, marginBottom: 8, backgroundColor: 'rgba(245,166,35,0.12)',
    borderRadius: 10, padding: 10, borderLeftWidth: 3, borderLeftColor: C.gold,
  },
  alertText: { fontSize: 12, color: C.gold },
  section: {
    marginHorizontal: 16, marginBottom: 16, backgroundColor: C.navy2,
    borderRadius: 14, padding: 16, borderWidth: 0.5, borderColor: C.border,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: C.white, marginBottom: 4 },
  sectionNote: { fontSize: 11, color: C.slate, marginBottom: 12 },
  fieldLabel: { fontSize: 11, color: C.slate, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5, marginTop: 10 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10,
    borderWidth: 0.5, borderColor: C.border,
    color: C.white, fontSize: 14, paddingHorizontal: 12, paddingVertical: 11,
  },
  odometerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kmLabel: { fontSize: 13, color: C.slate },
  captureBtn: { backgroundColor: C.teal, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 16 },
  captureBtnText: { color: '#000', fontWeight: '700', fontSize: 13 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 0.5, borderColor: C.border },
  pillActive: { backgroundColor: C.gold, borderColor: C.gold },
  pillText: { fontSize: 12, color: C.slate },
  pillTextActive: { color: '#000', fontWeight: '700' },
  checkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: C.border },
  checkLabel: { fontSize: 13, color: C.white, flex: 1 },
  checkBadge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6 },
  checkPass: { backgroundColor: 'rgba(34,197,94,0.2)' },
  checkFail: { backgroundColor: 'rgba(232,75,75,0.2)' },
  checkSkip: { backgroundColor: 'rgba(255,255,255,0.06)' },
  checkBadgeText: { fontSize: 12, color: C.white },
  warningBox: { backgroundColor: 'rgba(245,166,35,0.1)', borderRadius: 10, padding: 12, marginBottom: 12 },
  warningText: { fontSize: 13, color: C.gold, textAlign: 'center' },
  submitBtn: { backgroundColor: C.gold, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: '#000' },
});
