import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { inspectionAPI } from '../services/api';

const C = { navy:'#0A1628', navy2:'#0F2040', navy3:'#1A3A5C', gold:'#F5A623', teal:'#00C9A7', white:'#fff', slate:'#94a3b8', slateD:'#475569', border:'rgba(255,255,255,0.1)', red:'#E84B4B', green:'#22C55E', orange:'#F97316', purple:'#8B5CF6' };

function StatCard({ label, value, color, sub }) {
  return (
    <View style={[S.statCard, { borderTopColor: color, borderTopWidth: 3 }]}>
      <Text style={[S.statValue, { color }]}>{value}</Text>
      <Text style={S.statLabel}>{label}</Text>
      {sub ? <Text style={S.statSub}>{sub}</Text> : null}
    </View>
  );
}

function ScoreBar({ label, score, color }) {
  return (
    <View style={S.scoreRow}>
      <Text style={S.scoreLabel}>{label}</Text>
      <View style={S.scoreTrack}>
        <View style={[S.scoreFill, { width: `${Math.min(100, score)}%`, backgroundColor: color }]} />
      </View>
      <Text style={[S.scoreNum, { color }]}>{score}</Text>
    </View>
  );
}

export default function DashboardScreen({ navigation, user }) {
  const [data, setData] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [sumRes, lbRes] = await Promise.allSettled([
        inspectionAPI.summary(),
        inspectionAPI.leaderboard?.() || Promise.resolve(null),
      ]);
      if (sumRes.status === 'fulfilled') setData(sumRes.value.data?.data);
      if (lbRes.status === 'fulfilled' && lbRes.value) setLeaderboard(lbRes.value.data?.data || []);
    } catch { /* silently fail */ }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const d = data || {};
  const isDriver = user?.role === 'DRIVER';

  return (
    <ScrollView
      style={S.container}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.gold} />}
    >
      {/* Header */}
      <View style={S.header}>
        <View>
          <Text style={S.greeting}>Good {new Date().getHours() < 12 ? 'morning' : 'afternoon'} 👋</Text>
          <Text style={S.userName}>{user?.fullName?.split(' ')[0] || 'Driver'}</Text>
        </View>
        <TouchableOpacity style={S.scanCta} onPress={() => navigation.navigate('ScanTab')}>
          <Text style={S.scanCtaText}>Scan Vehicle</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={S.loadingBox}><ActivityIndicator color={C.gold} size="large" /></View>
      ) : (
        <>
          {/* Trial banner */}
          {d.access?.trial && d.access?.daysLeft <= 14 && (
            <View style={S.trialBanner}>
              <Text style={S.trialText}>⏳ Driver app trial: <Text style={{ fontWeight:'700' }}>{d.access.daysLeft} days left</Text> — upgrade to Enterprise</Text>
            </View>
          )}

          {/* Stats grid */}
          <Text style={S.sectionTitle}>This Month</Text>
          <View style={S.statsGrid}>
            <StatCard label="Inspections" value={d.recentInspections ?? '—'} color={C.teal} />
            <StatCard label="Vehicles Checked" value={d.vehiclesInspectedThisMonth ?? '—'} color={C.gold} />
            <StatCard label="Tyre Alerts" value={d.tyreAlerts ?? '—'} color={d.tyreAlerts > 0 ? C.red : C.green} sub={d.tyreAlerts > 0 ? 'Action needed' : 'All clear'} />
            <StatCard label="Total Inspections" value={d.totalInspections ?? '—'} color={C.purple} sub="All time" />
          </View>

          {/* Compliance health */}
          <Text style={S.sectionTitle}>Compliance Health</Text>
          <View style={S.compCard}>
            <ScoreBar label="Checklist completion" score={87} color={C.teal} />
            <ScoreBar label="On-time inspections" score={92} color={C.green} />
            <ScoreBar label="Tyre integrity" score={d.tyreAlerts > 0 ? Math.max(10, 100 - d.tyreAlerts * 15) : 100} color={d.tyreAlerts > 0 ? C.orange : C.green} />
          </View>

          {/* Driver leaderboard */}
          {!isDriver && leaderboard.length > 0 && (
            <>
              <Text style={S.sectionTitle}>Top Drivers This Month</Text>
              <View style={S.leaderCard}>
                {leaderboard.slice(0, 5).map((item, i) => (
                  <View key={item.driverId} style={[S.leaderRow, i < leaderboard.slice(0,5).length - 1 && { borderBottomWidth: 0.5, borderBottomColor: C.border }]}>
                    <View style={[S.rankBadge, i === 0 && { backgroundColor: 'rgba(245,166,35,0.25)' }, i === 1 && { backgroundColor: 'rgba(148,163,184,0.2)' }, i === 2 && { backgroundColor: 'rgba(180,83,9,0.2)' }]}>
                      <Text style={[S.rankNum, i === 0 && { color: C.gold }, i === 1 && { color: C.slate }, i === 2 && { color: C.orange }]}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={S.driverName}>{item.driver?.fullName || 'Unknown'}</Text>
                      <Text style={S.driverSub}>{item.totalInspections} inspections · {item.passRate?.toFixed(0)}% pass rate</Text>
                    </View>
                    <View style={[S.scorePill, { backgroundColor: item.score >= 80 ? 'rgba(34,197,94,0.2)' : item.score >= 60 ? 'rgba(245,166,35,0.2)' : 'rgba(232,75,75,0.2)' }]}>
                      <Text style={[S.scorePillText, { color: item.score >= 80 ? C.green : item.score >= 60 ? C.gold : C.red }]}>{item.score}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Quick actions */}
          <Text style={S.sectionTitle}>Quick Actions</Text>
          <View style={S.actionsGrid}>
            {[
              { icon:'🔍', label:'Scan Vehicle',  color:'rgba(0,201,167,0.15)', onPress:() => navigation.navigate('ScanTab') },
              { icon:'📋', label:'My Reports',    color:'rgba(245,166,35,0.15)', onPress:() => navigation.navigate('HistoryTab') },
              { icon:'🚗', label:'Fleet List',    color:'rgba(59,130,246,0.15)', onPress:() => navigation.navigate('FleetTab') },
              { icon:'🏆', label:'Leaderboard',   color:'rgba(139,92,246,0.15)', onPress:() => {} },
            ].map(({ icon, label, color, onPress }) => (
              <TouchableOpacity key={label} style={[S.actionBtn, { backgroundColor: color }]} onPress={onPress} activeOpacity={0.8}>
                <Text style={S.actionIcon}>{icon}</Text>
                <Text style={S.actionLabel}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const S = StyleSheet.create({
  container: { flex:1, backgroundColor:C.navy },
  header: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:20, paddingTop:20, paddingBottom:16 },
  greeting: { fontSize:13, color:C.slate },
  userName: { fontSize:22, fontWeight:'800', color:C.white, marginTop:2 },
  scanCta: { backgroundColor:C.gold, borderRadius:12, paddingVertical:10, paddingHorizontal:18 },
  scanCtaText: { fontSize:13, fontWeight:'700', color:'#000' },
  loadingBox: { alignItems:'center', paddingTop:60 },
  trialBanner: { marginHorizontal:20, marginBottom:12, backgroundColor:'rgba(245,166,35,0.1)', borderRadius:10, padding:12, borderLeftWidth:3, borderLeftColor:C.gold },
  trialText: { fontSize:12, color:C.gold },
  sectionTitle: { fontSize:11, fontWeight:'700', color:C.slate, textTransform:'uppercase', letterSpacing:1, marginHorizontal:20, marginTop:20, marginBottom:10 },
  statsGrid: { flexDirection:'row', flexWrap:'wrap', marginHorizontal:12, gap:8 },
  statCard: { flex:1, minWidth:'44%', backgroundColor:C.navy2, borderRadius:14, padding:16, borderWidth:0.5, borderColor:C.border },
  statValue: { fontSize:28, fontWeight:'800' },
  statLabel: { fontSize:11, color:C.slate, marginTop:4 },
  statSub: { fontSize:10, color:C.slateD, marginTop:2 },
  compCard: { marginHorizontal:20, backgroundColor:C.navy2, borderRadius:14, padding:18, borderWidth:0.5, borderColor:C.border, gap:14 },
  scoreRow: { flexDirection:'row', alignItems:'center', gap:10 },
  scoreLabel: { fontSize:12, color:C.slate, width:140 },
  scoreTrack: { flex:1, height:5, backgroundColor:'rgba(255,255,255,0.08)', borderRadius:3, overflow:'hidden' },
  scoreFill: { height:5, borderRadius:3 },
  scoreNum: { fontSize:12, fontWeight:'700', width:28, textAlign:'right' },
  leaderCard: { marginHorizontal:20, backgroundColor:C.navy2, borderRadius:14, overflow:'hidden', borderWidth:0.5, borderColor:C.border },
  leaderRow: { flexDirection:'row', alignItems:'center', padding:14, gap:12 },
  rankBadge: { width:36, height:36, borderRadius:10, alignItems:'center', justifyContent:'center' },
  rankNum: { fontSize:16, fontWeight:'700', color:C.white },
  driverName: { fontSize:13, fontWeight:'600', color:C.white },
  driverSub: { fontSize:11, color:C.slate, marginTop:2 },
  scorePill: { paddingVertical:4, paddingHorizontal:10, borderRadius:8 },
  scorePillText: { fontSize:14, fontWeight:'800' },
  actionsGrid: { flexDirection:'row', flexWrap:'wrap', marginHorizontal:12, gap:10 },
  actionBtn: { flex:1, minWidth:'44%', borderRadius:14, padding:18, alignItems:'center' },
  actionIcon: { fontSize:28, marginBottom:8 },
  actionLabel: { fontSize:12, fontWeight:'600', color:C.white },
});
