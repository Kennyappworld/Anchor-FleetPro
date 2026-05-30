import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

const C = { navy: '#0A1628', navy2: '#0F2040', gold: '#F5A623', teal: '#00C9A7', white: '#fff', slate: '#94a3b8', red: '#E84B4B', green: '#22C55E', border: 'rgba(255,255,255,0.1)' };

export default function InspectionCompleteScreen({ route, navigation }) {
  const { inspectionId, tyreAlerts = [], odometer, deltaKm, vehicle } = route.params;
  const hasAlerts = tyreAlerts.length > 0;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.resultCard}>
        <Text style={styles.icon}>{hasAlerts ? '⚠️' : '✅'}</Text>
        <Text style={styles.resultTitle}>Inspection Submitted</Text>
        <Text style={styles.resultSub}>
          {hasAlerts
            ? `${tyreAlerts.length} tyre alert${tyreAlerts.length > 1 ? 's' : ''} flagged — fleet manager notified`
            : 'All clear — tamper-proof record saved'}
        </Text>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Summary</Text>
        <Row label="Vehicle" value={`${vehicle.plateNumber} — ${vehicle.make} ${vehicle.model}`} />
        <Row label="Odometer" value={`${odometer?.toLocaleString()} km`} />
        <Row label="Distance since last inspection" value={deltaKm > 0 ? `+${deltaKm.toLocaleString()} km` : 'First inspection'} />
        <Row label="Inspection ID" value={inspectionId.slice(0, 8).toUpperCase()} mono />
      </View>

      {hasAlerts && (
        <View style={styles.alertCard}>
          <Text style={styles.alertTitle}>Tyre Alerts</Text>
          {tyreAlerts.map((a, i) => (
            <View key={i} style={styles.alertRow}>
              <Text style={styles.alertPos}>{a.position}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.alertMsg}>{a.message}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity
        style={styles.doneBtn}
        onPress={() => navigation.navigate('Scan')}
        activeOpacity={0.85}
      >
        <Text style={styles.doneBtnText}>Scan Another Vehicle</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Row({ label, value, mono }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: C.border }}>
      <Text style={{ fontSize: 13, color: C.slate }}>{label}</Text>
      <Text style={{ fontSize: 13, color: C.white, fontFamily: mono ? 'monospace' : undefined }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.navy },
  resultCard: { margin: 20, backgroundColor: C.navy2, borderRadius: 16, padding: 28, alignItems: 'center', borderWidth: 0.5, borderColor: C.border },
  icon: { fontSize: 56, marginBottom: 12 },
  resultTitle: { fontSize: 22, fontWeight: '700', color: C.white, marginBottom: 6 },
  resultSub: { fontSize: 13, color: C.slate, textAlign: 'center' },
  summaryCard: { marginHorizontal: 20, marginBottom: 16, backgroundColor: C.navy2, borderRadius: 16, padding: 18, borderWidth: 0.5, borderColor: C.border },
  summaryTitle: { fontSize: 14, fontWeight: '700', color: C.gold, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  alertCard: { marginHorizontal: 20, marginBottom: 16, backgroundColor: 'rgba(232,75,75,0.1)', borderRadius: 16, padding: 18, borderWidth: 0.5, borderColor: 'rgba(232,75,75,0.3)' },
  alertTitle: { fontSize: 14, fontWeight: '700', color: C.red, marginBottom: 12 },
  alertRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 8 },
  alertPos: { fontSize: 13, fontWeight: '800', color: C.red, width: 28 },
  alertMsg: { fontSize: 12, color: '#fca5a5' },
  doneBtn: { marginHorizontal: 20, marginBottom: 40, backgroundColor: C.gold, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  doneBtnText: { fontSize: 16, fontWeight: '700', color: '#000' },
});
