import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar, Text, View, Platform, Alert } from 'react-native';
import LoginScreen from './src/screens/LoginScreen';
import ScanScreen from './src/screens/ScanScreen';
import InspectionFormScreen from './src/screens/InspectionFormScreen';
import InspectionCompleteScreen from './src/screens/InspectionCompleteScreen';
import DashboardScreen from './src/screens/DashboardScreen';

/**
 * BIOMETRIC / FACE ID — add after MVP
 * npm install react-native-biometrics
 * import ReactNativeBiometrics from 'react-native-biometrics';
 * const rnb = new ReactNativeBiometrics({ allowDeviceCredentials: true });
 * const { success } = await rnb.simplePrompt({ promptMessage: 'Verify identity' });
 * iOS Info.plist: NSFaceIDUsageDescription = "FleetAnchor uses Face ID to protect your account"
 */

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const THEME = { dark:true, colors:{ primary:'#F5A623', background:'#0A1628', card:'#0F2040', text:'#ffffff', border:'rgba(255,255,255,0.1)', notification:'#F5A623' } };
const SO = { headerStyle:{backgroundColor:'#0F2040'}, headerTintColor:'#fff', headerTitleStyle:{fontWeight:'700',fontSize:16}, contentStyle:{backgroundColor:'#0A1628'} };

function BarcodeScannerScreen({ route, navigation }) {
  return (
    <View style={{flex:1,backgroundColor:'#0A1628',alignItems:'center',justifyContent:'center',padding:30}}>
      <Text style={{fontSize:48,marginBottom:16}}>📷</Text>
      <Text style={{color:'#fff',fontSize:16,fontWeight:'700',textAlign:'center',marginBottom:8}}>Barcode Scanner</Text>
      <Text style={{color:'#94a3b8',fontSize:13,textAlign:'center',lineHeight:20}}>
        In production: uses react-native-vision-camera{'\n'}to scan tyre serials, VIN labels, and plate barcodes.{'\n\n'}Install: npm install react-native-vision-camera
      </Text>
    </View>
  );
}

function ScanStack() {
  return (
    <Stack.Navigator screenOptions={SO}>
      <Stack.Screen name="ScanVehicle" component={ScanScreen} options={{title:'⚓ Scan Vehicle'}} />
      <Stack.Screen name="InspectionForm" component={InspectionFormScreen} options={{title:'Inspection Report',headerBackTitle:'Back'}} />
      <Stack.Screen name="BarcodeScanner" component={BarcodeScannerScreen} options={{title:'Scan Barcode',presentation:'modal'}} />
      <Stack.Screen name="InspectionComplete" component={InspectionCompleteScreen} options={{title:'Report Submitted',headerLeft:()=>null,gestureEnabled:false}} />
    </Stack.Navigator>
  );
}

const PlaceholderScreen = ({ label }) => (
  <View style={{flex:1,backgroundColor:'#0A1628',alignItems:'center',justifyContent:'center'}}>
    <Text style={{color:'#94a3b8',fontSize:14}}>{label}</Text>
  </View>
);

function MainTabs({ user }) {
  return (
    <Tab.Navigator screenOptions={({ route }) => ({
      ...SO,
      tabBarStyle:{backgroundColor:'#0F2040',borderTopColor:'rgba(255,255,255,0.08)',borderTopWidth:0.5,height:62,paddingBottom:10},
      tabBarActiveTintColor:'#F5A623', tabBarInactiveTintColor:'#475569',
      tabBarLabelStyle:{fontSize:11,fontWeight:'600'},
      tabBarIcon:({focused})=><Text style={{fontSize:20,opacity:focused?1:0.45}}>{ {Home:'🏠',ScanTab:'🔍',HistoryTab:'📋',FleetTab:'🚗'}[route.name]||'📌'}</Text>,
    })}>
      <Tab.Screen name="Home" options={{title:'Dashboard'}}>
        {(props)=><DashboardScreen {...props} user={user}/>}
      </Tab.Screen>
      <Tab.Screen name="ScanTab" component={ScanStack} options={{title:'Scan',headerShown:false}}/>
      <Tab.Screen name="HistoryTab" options={{title:'Reports'}}>
        {()=><PlaceholderScreen label="Inspection history — coming soon"/>}
      </Tab.Screen>
      <Tab.Screen name="FleetTab" options={{title:'Fleet'}}>
        {()=><PlaceholderScreen label="Fleet list — coming soon"/>}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.multiGet(['user','accessToken']).then(([[,u],[,t]])=>{
      if (u && t) setUser(JSON.parse(u));
      setReady(true);
    }).catch(()=>setReady(true));
  }, []);

  const handleLogin = async (userData) => {
    setUser(userData);
    if (Platform.OS !== 'web') {
      setTimeout(() => {
        Alert.alert('Enable Biometric Login?','Use Face ID or fingerprint to sign in faster.',
          [{text:'Not now',style:'cancel'},{text:'Enable',onPress:async()=>{ await AsyncStorage.setItem('biometricEnabled','true'); }}]);
      }, 1500);
    }
  };

  if (!ready) return null;

  return (
    <NavigationContainer theme={THEME}>
      <StatusBar barStyle="light-content" backgroundColor="#0F2040"/>
      {!user ? <LoginScreen onLogin={handleLogin}/> : <MainTabs user={user}/>}
    </NavigationContainer>
  );
}
