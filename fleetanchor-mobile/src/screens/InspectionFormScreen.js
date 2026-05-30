import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Switch
} from 'react-native';
import { inspectionAPI } from '../services/api';
import TyreSlot from '../components/TyreSlot';
import SessionTimer from '../components/SessionTimer';

const C = { navy:'#0A1628', navy2:'#0F2040', gold:'#F5A623', teal:'#00C9A7', white:'#fff', slate:'#94a3b8', slateD:'#475569', border:'rgba(255,255,255,0.1)', red:'#E84B4B', green:'#22C55E', orange:'#F97316' };

const DEFAULT_CHECKLIST = [
  { key:'lightsOk',    label:'Lights & indicators',    required:true  },
  { key:'brakesOk',    label:'Brakes',                  required:true  },
  { key:'engineOilOk', label:'Engine oil level',        required:false },
  { key:'coolantOk',   label:'Coolant level',           required:false },
  { key:'exhaustOk',   label:'Exhaust condition',       required:false },
  { key:'wiperOk',     label:'Windscreen wipers',       required:false },
  { key:'hornOk',      label:'Horn',                    required:false },
  { key:'steeringOk',  label:'Steering response',       required:false },
  { key:'mirrorsOk',   label:'Mirrors (all)',           required:false },
  { key:'bodyDamage',  label:'Body damage observed',    required:false },
];

const TYPES = ['PRE_TRIP','POST_TRIP','PERIODIC','INCIDENT'];
const CONDITIONS = ['EXCELLENT','GOOD','FAIR','POOR','CRITICAL'];

export default function InspectionFormScreen({ route, navigation }) {
  const { vehicleData, driverData, sessionToken, expiresAt, sessionWindowSeconds, access, checklistTemplate } = route.params;

  const [driverName, setDriverName] = useState(driverData.fullName || '');
  const [driverLicence, setDriverLicence] = useState(driverData.licenceNumber || '');
  const [driverPhone, setDriverPhone] = useState(driverData.phone || '');
  const [odometer, setOdometer] = useState('');
  const [odometerCaptured, setOdometerCaptured] = useState(false);
  const [odometerLoading, setOdometerLoading] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [inspType, setInspType] = useState('PRE_TRIP');
  const [condition, setCondition] = useState('GOOD');
  const [checklist, setChecklist] = useState({});
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const checklistItems = checklistTemplate?.items || DEFAULT_CHECKLIST;
  const tyrePositions = vehicleData.tyrePositions || ['FL','FR','RL','RR'];
  const initialTyres = {};
  tyrePositions.forEach(pos => {
    const rec = vehicleData.currentTyres?.find(t => t.position === pos);
    initialTyres[pos] = { serial: rec?.serialNumber || '', condition:'GOOD', pressure:'', newTyre:false, brand:'', model:'', sizeSpec:'' };
  });
  const [tyres, setTyres] = useState(initialTyres);

  const updateTyre = useCallback((pos, field, val) => setTyres(p => ({ ...p, [pos]: { ...p[pos], [field]: val } })), []);

  const toggleCheck = (key) => {
    setChecklist(prev => {
      if (prev[key] === undefined) return { ...prev, [key]: true };
      if (prev[key] === true) return { ...prev, [key]: false };
      const n = { ...prev }; delete n[key]; return n;
    });
  };

  const captureOdometer = async () => {
    const km = parseInt(odometer);
    if (!km || km < 1) { Alert.alert('Invalid', 'Enter a valid odometer reading in km'); return; }
    if (sessionExpired) { Alert.alert('Session expired', 'Scan the vehicle again to restart'); return; }
    setOdometerLoading(true);
    try {
      await inspectionAPI.captureOdometer(sessionToken, km);
      setOdometerCaptured(true);
    } catch (err) {
      Alert.alert('Failed', err.response?.data?.error || 'Could not capture odometer');
    } finally { setOdometerLoading(false); }
  };

  const handleSubmit = async () => {
    if (!odometerCaptured) { Alert.alert('Odometer required', 'Capture the odometer reading first'); return; }
    if (!driverName.trim()) { Alert.alert('Driver name required'); return; }
    const failedRequired = checklistItems.filter(i => i.required && checklist[i.key] === undefined);
    if (failedRequired.length > 0) {
      Alert.alert('Required items', `Please check: ${failedRequired.map(i => i.label).join(', ')}`);
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await inspectionAPI.submit({
        sessionToken, inspectionType: inspType, overallCondition: condition,
        driverName: driverName.trim(), driverLicence: driverLicence.trim(), driverPhone: driverPhone.trim(),
        checklist, tyres, notes: notes.trim(),
      });
      if (data.success) {
        navigation.replace('InspectionComplete', {
          inspectionId: data.data.inspectionId, tyreAlerts: data.data.tyreAlerts,
          odometer: data.data.odometer, deltaKm: data.data.deltaKm, vehicle: vehicleData,
        });
      }
    } catch (err) {
      Alert.alert('Submission failed', err.response?.data?.error || 'Please try again');
    } finally { setSubmitting(false); }
  };

  return (
    <ScrollView style={S.container} showsVerticalScrollIndicator={false}>
      {!odometerCaptured && <SessionTimer expiresAt={expiresAt} windowSeconds={sessionWindowSeconds} onExpire={() => setSessionExpired(true)} />}

      {/* Vehicle banner */}
      <View style={S.vehicleBanner}>
        <View style={{ flex: 1 }}>
          <Text style={S.plate}>{vehicleData.plateNumber}</Text>
          <Text style={S.vehicleSub}>{vehicleData.make} {vehicleData.model} {vehicleData.year} · {vehicleData.vin}</Text>
          {vehicleData.nextServiceDate && <Text style={S.serviceAlert}>Service due: {new Date(vehicleData.nextServiceDate).toLocaleDateString('en-NG')}</Text>}
        </View>
        <View style={S.odomBadge}>
          <Text style={S.odomBadgeLabel}>Last km</Text>
          <Text style={S.odomBadgeVal}>{(vehicleData.currentOdometer||0).toLocaleString()}</Text>
        </View>
      </View>

      {/* Expiring docs warning */}
      {vehicleData.documents?.filter(d => d.daysUntilExpiry <= 30).map((d, i) => (
        <View key={i} style={[S.docWarn, d.daysUntilExpiry < 0 && { borderLeftColor: C.red }]}>
          <Text style={[S.docWarnText, d.daysUntilExpiry < 0 && { color: C.red }]}>
            {d.daysUntilExpiry < 0 ? '⛔' : '⚠️'} {d.docType.replace(/_/g,' ')} {d.daysUntilExpiry < 0 ? `expired ${Math.abs(d.daysUntilExpiry)}d ago` : `expires in ${d.daysUntilExpiry}d`}
          </Text>
        </View>
      ))}

      {/* Odometer section */}
      <Section title="Current Odometer *" note={odometerCaptured ? `✅ Captured: ${parseInt(odometer).toLocaleString()} km` : `Enter within ${sessionWindowSeconds/60} min of scanning`}>
        {!odometerCaptured && (
          <View style={{ flexDirection:'row', gap:8, alignItems:'center' }}>
            <TextInput style={[S.input,{flex:1}]} value={odometer} onChangeText={setOdometer} keyboardType="numeric" placeholder="e.g. 46210" placeholderTextColor={C.slateD} />
            <Text style={{color:C.slate,fontSize:13}}>km</Text>
            <TouchableOpacity style={[S.confirmBtn,odometerLoading&&{opacity:.6}]} onPress={captureOdometer} disabled={odometerLoading||sessionExpired}>
              {odometerLoading ? <ActivityIndicator color="#000" size="small"/> : <Text style={S.confirmBtnText}>Lock In</Text>}
            </TouchableOpacity>
          </View>
        )}
      </Section>

      {/* Inspection type */}
      <Section title="Inspection Type">
        <View style={S.pillRow}>
          {TYPES.map(t => <Pill key={t} label={t.replace('_',' ')} active={inspType===t} onPress={()=>setInspType(t)} />)}
        </View>
      </Section>

      {/* Driver details */}
      <Section title="Driver Details" note="Pre-filled — edit if driver has changed">
        <Field label="Driver Name *" value={driverName} onChange={setDriverName} placeholder="Full name" />
        <Field label="Licence Number" value={driverLicence} onChange={setDriverLicence} placeholder="FED-20-00101" caps />
        <Field label="Phone" value={driverPhone} onChange={setDriverPhone} placeholder="08012345678" phone />
      </Section>

      {/* Checklist */}
      <Section title={checklistTemplate ? checklistTemplate.name : 'Pre-Trip Checklist'} note="Tap each item — pass or fail">
        {checklistItems.map(({ key, label, required }) => {
          const val = checklist[key];
          return (
            <TouchableOpacity key={key} style={S.checkRow} onPress={() => toggleCheck(key)} activeOpacity={0.7}>
              <View style={{ flex:1 }}>
                <Text style={S.checkLabel}>{label}{required ? ' *' : ''}</Text>
              </View>
              <View style={[S.checkBadge, val===true?S.checkPass:val===false?S.checkFail:S.checkSkip]}>
                <Text style={S.checkBadgeText}>{val===true?'✅ Pass':val===false?'❌ Fail':'Skip'}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </Section>

      {/* Vehicle condition */}
      <Section title="Overall Vehicle Condition">
        <View style={S.pillRow}>
          {CONDITIONS.map(c => (
            <Pill key={c} label={c} active={condition===c} onPress={()=>setCondition(c)}
              color={condition===c && c==='CRITICAL' ? C.red : condition===c && c==='POOR' ? C.orange : undefined}
            />
          ))}
        </View>
      </Section>

      {/* Tyre inspection */}
      <Section title={`Tyre Inspection (${tyrePositions.length} positions)`} note="Scan serial or type. Mismatches alert fleet manager instantly.">
        {tyrePositions.map(pos => (
          <TyreSlot key={pos} position={pos} data={tyres[pos]}
            recordedSerial={vehicleData.currentTyres?.find(t=>t.position===pos)?.serialNumber}
            recordedKm={vehicleData.currentTyres?.find(t=>t.position===pos)?.kmCovered}
            onUpdate={(f,v)=>updateTyre(pos,f,v)}
            onScanSerial={()=>navigation.navigate('BarcodeScanner',{ onScan:(v)=>updateTyre(pos,'serial',v.toUpperCase()) })}
          />
        ))}
      </Section>

      {/* Notes */}
      <Section title="Notes">
        <TextInput style={[S.input,{height:80,textAlignVertical:'top',paddingTop:12}]} value={notes} onChangeText={setNotes} placeholder="Any observations, faults, or remarks..." placeholderTextColor={C.slateD} multiline />
      </Section>

      <View style={{ paddingHorizontal:20, paddingBottom:48 }}>
        {!odometerCaptured && <View style={S.warnBox}><Text style={S.warnText}>⏱ Lock in the odometer before submitting</Text></View>}
        <TouchableOpacity style={[S.submitBtn,(submitting||!odometerCaptured)&&{opacity:.45}]} onPress={handleSubmit} disabled={submitting||!odometerCaptured} activeOpacity={0.85}>
          {submitting ? <ActivityIndicator color="#000"/> : <Text style={S.submitBtnText}>Submit Inspection Report</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function Section({ title, note, children }) {
  return (
    <View style={S.section}>
      <Text style={S.sectionTitle}>{title}</Text>
      {note ? <Text style={S.sectionNote}>{note}</Text> : null}
      {children}
    </View>
  );
}
function Field({ label, value, onChange, placeholder, caps, phone }) {
  return (
    <>
      <Text style={S.fieldLabel}>{label}</Text>
      <TextInput style={[S.input,{marginBottom:10}]} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={C.slateD} autoCapitalize={caps?'characters':phone?'none':'words'} keyboardType={phone?'phone-pad':'default'} />
    </>
  );
}
function Pill({ label, active, onPress, color }) {
  return (
    <TouchableOpacity style={[S.pill, active&&[S.pillA,color&&{backgroundColor:color,borderColor:color}]]} onPress={onPress}>
      <Text style={[S.pillT, active&&S.pillTA]}>{label}</Text>
    </TouchableOpacity>
  );
}

const S = StyleSheet.create({
  container:{flex:1,backgroundColor:C.navy},
  vehicleBanner:{flexDirection:'row',alignItems:'center',margin:16,backgroundColor:C.navy2,borderRadius:14,padding:16,borderWidth:0.5,borderColor:C.border},
  plate:{fontSize:22,fontWeight:'800',color:C.gold,letterSpacing:1},
  vehicleSub:{fontSize:12,color:C.slate,marginTop:2},
  serviceAlert:{fontSize:11,color:C.orange,marginTop:4},
  odomBadge:{alignItems:'flex-end',marginLeft:12},
  odomBadgeLabel:{fontSize:10,color:C.slate,textTransform:'uppercase',letterSpacing:0.5},
  odomBadgeVal:{fontSize:18,fontWeight:'700',color:C.white,marginTop:2},
  docWarn:{marginHorizontal:16,marginBottom:6,backgroundColor:'rgba(245,166,35,0.1)',borderRadius:8,padding:10,borderLeftWidth:3,borderLeftColor:C.gold},
  docWarnText:{fontSize:12,color:C.gold},
  section:{marginHorizontal:16,marginBottom:14,backgroundColor:C.navy2,borderRadius:14,padding:16,borderWidth:0.5,borderColor:C.border},
  sectionTitle:{fontSize:14,fontWeight:'700',color:C.white,marginBottom:3},
  sectionNote:{fontSize:11,color:C.slate,marginBottom:12},
  input:{backgroundColor:'rgba(255,255,255,0.05)',borderRadius:10,borderWidth:0.5,borderColor:C.border,color:C.white,fontSize:14,paddingHorizontal:12,paddingVertical:10},
  fieldLabel:{fontSize:10,color:C.slate,fontWeight:'600',textTransform:'uppercase',letterSpacing:0.4,marginBottom:5,marginTop:8},
  confirmBtn:{backgroundColor:C.teal,borderRadius:10,paddingVertical:10,paddingHorizontal:16},
  confirmBtnText:{color:'#000',fontWeight:'700',fontSize:13},
  pillRow:{flexDirection:'row',flexWrap:'wrap',gap:8},
  pill:{paddingVertical:7,paddingHorizontal:14,borderRadius:20,backgroundColor:'rgba(255,255,255,0.06)',borderWidth:0.5,borderColor:C.border},
  pillA:{backgroundColor:C.gold,borderColor:C.gold},
  pillT:{fontSize:12,color:C.slate},
  pillTA:{color:'#000',fontWeight:'700'},
  checkRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingVertical:11,borderBottomWidth:0.5,borderBottomColor:C.border},
  checkLabel:{fontSize:13,color:C.white},
  checkBadge:{paddingVertical:4,paddingHorizontal:10,borderRadius:6},
  checkPass:{backgroundColor:'rgba(34,197,94,0.2)'},
  checkFail:{backgroundColor:'rgba(232,75,75,0.2)'},
  checkSkip:{backgroundColor:'rgba(255,255,255,0.06)'},
  checkBadgeText:{fontSize:12,color:C.white},
  warnBox:{backgroundColor:'rgba(245,166,35,0.1)',borderRadius:10,padding:12,marginBottom:12},
  warnText:{fontSize:13,color:C.gold,textAlign:'center'},
  submitBtn:{backgroundColor:C.gold,borderRadius:14,paddingVertical:16,alignItems:'center'},
  submitBtnText:{fontSize:16,fontWeight:'700',color:'#000'},
});
