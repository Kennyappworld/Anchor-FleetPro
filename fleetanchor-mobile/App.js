import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar, Text } from 'react-native';

import LoginScreen from './src/screens/LoginScreen';
import ScanScreen from './src/screens/ScanScreen';
import InspectionFormScreen from './src/screens/InspectionFormScreen';
import InspectionCompleteScreen from './src/screens/InspectionCompleteScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const THEME = { dark: true, colors: { primary: '#F5A623', background: '#0A1628', card: '#0F2040', text: '#ffffff', border: 'rgba(255,255,255,0.1)', notification: '#F5A623' } };

const SCREEN_OPTIONS = {
  headerStyle: { backgroundColor: '#0F2040' },
  headerTintColor: '#fff',
  headerTitleStyle: { fontWeight: '700' },
  contentStyle: { backgroundColor: '#0A1628' },
};

function InspectionStack() {
  return (
    <Stack.Navigator screenOptions={SCREEN_OPTIONS}>
      <Stack.Screen name="Scan" component={ScanScreen} options={{ title: 'Scan Vehicle' }} />
      <Stack.Screen name="InspectionForm" component={InspectionFormScreen} options={{ title: 'Inspection Report', headerBackTitle: 'Back' }} />
      <Stack.Screen name="InspectionComplete" component={InspectionCompleteScreen} options={{ title: 'Report Submitted', headerLeft: () => null }} />
    </Stack.Navigator>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('user').then(u => {
      if (u) setUser(JSON.parse(u));
      setLoading(false);
    });
  }, []);

  if (loading) return null;

  if (!user) {
    return (
      <NavigationContainer theme={THEME}>
        <StatusBar barStyle="light-content" backgroundColor="#0A1628" />
        <LoginScreen onLogin={setUser} />
      </NavigationContainer>
    );
  }

  return (
    <NavigationContainer theme={THEME}>
      <StatusBar barStyle="light-content" backgroundColor="#0F2040" />
      <InspectionStack />
    </NavigationContainer>
  );
}
