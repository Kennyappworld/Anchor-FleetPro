import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';

const C = {
  navy2: '#0F2040', gold: '#F5A623', teal: '#00C9A7',
  white: '#fff', slate: '#94a3b8', slateD: '#475569',
  border: 'rgba(255,255,255,0.1)', red: '#E84B4B', green: '#22C55E',
};

const POSITIONS = { FL: 'Front Left', FR: 'Front Right', RL: 'Rear Left', RR: 'Rear Right' };
const CONDITIONS = ['GOOD', 'WORN', 'DAMAGED', 'REPLACE'];

export default function TyreSlot({ position, data, recordedSerial, recordedKm, onUpdate, onScanSerial }) {
  const [expanded, setExpanded] = useState(false);

  const serialMatch = !data.serial || !recordedSerial
    ? null
    : data.serial.toUpperCase() === recordedSerial.toUpperCase();

  const serialStatus = !data.serial ? 'empty'
    : data.newTyre ? 'new'
    : serialMatch === true ? 'match'
    : 'mismatch';

  return (
    <View style={styles.container}>
      {/* Header row */}
      <TouchableOpacity style={styles.header} onPress={() => setExpanded(e => !e)} activeOpacity={0.8}>
        <View style={styles.headerLeft}>
          <View style={[styles.positionBadge,
            serialStatus === 'match' ? styles.posGreen :
            serialStatus === 'mismatch' ? styles.posRed :
            serialStatus === 'new' ? styles.posTeal :
            styles.posGray
          ]}>
            <Text style={styles.positionText}>{position}</Text>
          </View>
          <View>
            <Text style={styles.positionLabel}>{POSITIONS[position]}</Text>
            {recordedKm !== undefined && (
              <Text style={styles.kmInfo}>{recordedKm?.toLocaleString() || 0} km on this tyre</Text>
            )}
          </View>
        </View>
        <View style={styles.headerRight}>
          {data.serial ? (
            <Text style={[styles.serialPreview,
              serialStatus === 'match' ? { color: C.green } :
              serialStatus === 'mismatch' ? { color: C.red } :
              { color: C.teal }
            ]}>
              {serialStatus === 'match' ? '✓ ' : serialStatus === 'mismatch' ? '⚠ ' : '+ '}{data.serial.slice(0, 8)}...
            </Text>
          ) : <Text style={styles.tapHint}>Tap to expand</Text>}
          <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.body}>
          {/* New tyre toggle */}
          <TouchableOpacity
            style={[styles.newTyreToggle, data.newTyre && styles.newTyreToggleActive]}
            onPress={() => onUpdate('newTyre', !data.newTyre)}
          >
            <Text style={[styles.newTyreText, data.newTyre && { color: '#000' }]}>
              {data.newTyre ? '✓ New tyre fitted' : 'Mark as new tyre'}
            </Text>
          </TouchableOpacity>

          {/* Serial number */}
          <Text style={styles.fieldLabel}>Tyre Serial Number (DOT)</Text>
          <View style={styles.serialRow}>
            <TextInput
              style={[styles.input, { flex: 1 },
                serialStatus === 'match' && styles.inputGreen,
                serialStatus === 'mismatch' && styles.inputRed,
              ]}
              value={data.serial}
              onChangeText={v => onUpdate('serial', v.toUpperCase())}
              placeholder="e.g. DOT-ABC-DEF-1234"
              placeholderTextColor={C.slateD}
              autoCapitalize="characters"
            />
            <TouchableOpacity style={styles.scanBtn} onPress={onScanSerial}>
              <Text style={styles.scanBtnText}>Scan</Text>
            </TouchableOpacity>
          </View>

          {/* Mismatch warning */}
          {serialStatus === 'mismatch' && (
            <View style={styles.mismatchWarning}>
              <Text style={styles.mismatchTitle}>⚠️ Serial mismatch</Text>
              <Text style={styles.mismatchText}>Expected: {recordedSerial}</Text>
              <Text style={styles.mismatchText}>Found: {data.serial}</Text>
              <Text style={styles.mismatchNote}>Fleet manager will be notified automatically.</Text>
            </View>
          )}

          {/* New tyre details */}
          {data.newTyre && (
            <>
              <Text style={styles.fieldLabel}>Brand</Text>
              <TextInput style={styles.input} value={data.brand} onChangeText={v => onUpdate('brand', v)} placeholder="e.g. Bridgestone" placeholderTextColor={C.slateD} />
              <Text style={styles.fieldLabel}>Model</Text>
              <TextInput style={styles.input} value={data.model} onChangeText={v => onUpdate('model', v)} placeholder="e.g. Turanza T005" placeholderTextColor={C.slateD} />
              <Text style={styles.fieldLabel}>Size Specification</Text>
              <TextInput style={styles.input} value={data.sizeSpec} onChangeText={v => onUpdate('sizeSpec', v)} placeholder="e.g. 225/65R17" placeholderTextColor={C.slateD} />
            </>
          )}

          {/* Condition */}
          <Text style={styles.fieldLabel}>Condition</Text>
          <View style={styles.condRow}>
            {CONDITIONS.map(c => (
              <TouchableOpacity
                key={c}
                style={[styles.condPill,
                  data.condition === c && { backgroundColor: c === 'REPLACE' ? C.red : c === 'DAMAGED' ? '#F97316' : C.teal, borderColor: 'transparent' }
                ]}
                onPress={() => onUpdate('condition', c)}
              >
                <Text style={[styles.condText, data.condition === c && { color: '#000', fontWeight: '700' }]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Pressure */}
          <Text style={styles.fieldLabel}>Tyre Pressure (PSI)</Text>
          <TextInput
            style={styles.input}
            value={data.pressure}
            onChangeText={v => onUpdate('pressure', v)}
            placeholder="e.g. 35"
            placeholderTextColor={C.slateD}
            keyboardType="numeric"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 10, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  positionBadge: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  posGreen: { backgroundColor: 'rgba(34,197,94,0.2)' },
  posRed: { backgroundColor: 'rgba(232,75,75,0.2)' },
  posTeal: { backgroundColor: 'rgba(0,201,167,0.2)' },
  posGray: { backgroundColor: 'rgba(255,255,255,0.08)' },
  positionText: { fontSize: 13, fontWeight: '800', color: C.white },
  positionLabel: { fontSize: 13, fontWeight: '600', color: C.white },
  kmInfo: { fontSize: 11, color: C.slate, marginTop: 2 },
  serialPreview: { fontSize: 11, fontFamily: 'monospace' },
  tapHint: { fontSize: 11, color: C.slateD },
  chevron: { fontSize: 11, color: C.slate },
  body: { padding: 14, paddingTop: 4, borderTopWidth: 0.5, borderTopColor: 'rgba(255,255,255,0.06)' },
  newTyreToggle: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 8, borderWidth: 0.5, borderColor: C.teal, alignSelf: 'flex-start', marginBottom: 12 },
  newTyreToggleActive: { backgroundColor: C.teal, borderColor: C.teal },
  newTyreText: { fontSize: 12, color: C.teal, fontWeight: '600' },
  fieldLabel: { fontSize: 10, color: C.slate, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5, marginTop: 10 },
  input: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.1)', color: C.white, fontSize: 13, paddingHorizontal: 11, paddingVertical: 9 },
  inputGreen: { borderColor: 'rgba(34,197,94,0.5)', backgroundColor: 'rgba(34,197,94,0.06)' },
  inputRed: { borderColor: 'rgba(232,75,75,0.5)', backgroundColor: 'rgba(232,75,75,0.06)' },
  serialRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  scanBtn: { backgroundColor: 'rgba(245,166,35,0.2)', borderRadius: 8, paddingVertical: 9, paddingHorizontal: 14, borderWidth: 0.5, borderColor: 'rgba(245,166,35,0.4)' },
  scanBtnText: { fontSize: 12, color: '#F5A623', fontWeight: '600' },
  mismatchWarning: { backgroundColor: 'rgba(232,75,75,0.1)', borderRadius: 8, padding: 10, marginTop: 8, borderLeftWidth: 2, borderLeftColor: C.red },
  mismatchTitle: { fontSize: 12, fontWeight: '700', color: C.red, marginBottom: 4 },
  mismatchText: { fontSize: 11, color: '#fca5a5', fontFamily: 'monospace' },
  mismatchNote: { fontSize: 11, color: C.slate, marginTop: 4 },
  condRow: { flexDirection: 'row', gap: 8 },
  condPill: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.04)' },
  condText: { fontSize: 11, color: C.slate },
});
