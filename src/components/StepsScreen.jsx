import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  Alert,
  ActivityIndicator,
  StatusBar,
  AppState
} from 'react-native';
import { initialize, requestPermission, readRecords } from 'react-native-health-connect';
import { SafeAreaView } from 'react-native-safe-area-context';
import BackgroundTimer from 'react-native-background-timer';

const API_BASE_URL = 'http://192.168.1.4:3000/api'; // real deive IP address of backend server

const StepsScreen = () => {
  const [stepsData, setStepsData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const appState = useRef(AppState.currentState);
  const intervalRef = useRef(null);
  const lastFetchTime = useRef(Date.now());

  // Send step data to backend API
  const sendStepDataToAPI = async (stepIntervals) => {
    try {
      setIsSyncing(true);
      const response = await fetch(`${API_BASE_URL}/steps`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          stepIntervals: stepIntervals.map(interval => ({
            intervalStart: interval.start.toISOString(),
            intervalEnd: interval.end.toISOString(),
            timeLabel: interval.time,
            stepCount: interval.steps
          }))
        }),
      });

      const data = await response.json();
      if (data.success) {
        console.log('✅ Successfully stored step data:', data.message);
        setLastSyncTime(new Date());
      } else {
        console.error('❌ Failed to store step data:', data.message);
      }
    } catch (error) {
      console.error('❌ API call failed:', error);
      // Don't show alert for API failures to avoid interrupting user experience
    } finally {
      setIsSyncing(false);
    }
  };
  

  // Initialize Health Connect
  const initializeHealthConnect = async () => {
    try {
      const result = await initialize();
      console.log('Health Connect initialized:', result);
      setIsInitialized(true);
      return true;
    } catch (error) {
      console.error('Failed to initialize Health Connect:', error);
      Alert.alert('Error', 'Failed to initialize Health Connect. Please ensure Health Connect is installed and updated.');
      return false;
    }
  };

  // Request permissions
  const requestPermissions = async () => {
    try {
      const permissions = await requestPermission([
        {
          accessType: 'read',
          recordType: 'Steps',
        },
      ]);
      console.log('Permissions result:', permissions);
      return permissions.every(permission => permission.status === 'granted');
    } catch (error) {
      console.error('Permission request failed:', error);
      Alert.alert('Error', 'Failed to request permissions. Please grant access to step data.');
      return false;
    }
  };

  // Get today's start and end time
  const getTodayTimeRange = () => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    
    return {
      startTime: startOfDay.toISOString(),
      endTime: endOfDay.toISOString()
    };
  };

  // Generate 5-minute intervals for today
  const generate5MinuteIntervals = () => {
    const intervals = [];
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    
    // Round current time down to nearest 5-minute mark
    const currentMinutes = now.getMinutes();
    const roundedMinutes = Math.floor(currentMinutes / 5) * 5;
    const currentRoundedTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), roundedMinutes, 0);
    
    console.log(`⏰ Current time: ${now.toLocaleTimeString()}, Rounded to: ${currentRoundedTime.toLocaleTimeString()}`);

    for (let time = new Date(startOfDay); time <= currentRoundedTime; time.setMinutes(time.getMinutes() + 5)) {
      const intervalStart = new Date(time);
      const intervalEnd = new Date(time.getTime() + 5 * 60 * 1000); // Add 5 minutes
      
      intervals.push({
        start: intervalStart,
        end: intervalEnd,
        label: intervalStart.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        })
      });
    }
    
    console.log(`📊 Generated ${intervals.length} intervals (last: ${intervals[intervals.length-1]?.label})`);
    return intervals;
  };

  // Aggregate steps by 5-minute intervals
  const aggregateStepsByInterval = (steps, intervals) => {
    const aggregatedData = [];

    for (const interval of intervals) {
      const intervalSteps = steps.filter(step => {
        const stepTime = new Date(step.startTime);
        return stepTime >= interval.start && stepTime < interval.end;
      });

      const totalSteps = intervalSteps.reduce((sum, step) => sum + step.count, 0);
      
      const intervalData = {
        id: interval.start.getTime().toString(),
        time: interval.label,
        steps: totalSteps,
        start: interval.start,
        end: interval.end,
        interval: `${interval.start.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        })} - ${interval.end.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        })}`
      };
      
      aggregatedData.push(intervalData);
    }

    return aggregatedData.reverse(); // Show most recent first
  };

  // Fetch steps data
  const fetchStepsData = async () => {
    if (!isInitialized) {
      return;
    }

    console.log('🔄 Fetching step data from Health Connect...');
    setLoading(true);
    try {
      const { startTime, endTime } = getTodayTimeRange();
      
      const stepsRecords = await readRecords('Steps', {
        timeRangeFilter: {
          operator: 'between',
          startTime,
          endTime,
        },
      });

      console.log(`📊 Found ${stepsRecords.records.length} step records`);

      const intervals = generate5MinuteIntervals();
      const aggregatedData = aggregateStepsByInterval(stepsRecords.records, intervals);
      
      setStepsData(aggregatedData);
      console.log(`📈 Aggregated into ${aggregatedData.length} intervals`);

      // Send data to backend API
      if (aggregatedData.length > 0) {
        console.log('📤 Sending data to backend...');
        await sendStepDataToAPI(aggregatedData);
      }
    } catch (error) {
      console.error('❌ Error fetching steps data:', error);
      Alert.alert('Error', 'Failed to fetch steps data. Please check your permissions.');
    } finally {
      setLoading(false);
    }
  };

  // Setup and initial data fetch
  const setupHealthConnect = async () => {
    setLoading(true);
    
    const initialized = await initializeHealthConnect();
    if (!initialized) {
      setLoading(false);
      return;
    }

    const permissionsGranted = await requestPermissions();
    if (!permissionsGranted) {
      setLoading(false);
      return;
    }

    await fetchStepsData();
  };

  // Refresh data
  const onRefresh = async () => {
    setRefreshing(true);
    await fetchStepsData();
    setRefreshing(false);
  };

  useEffect(() => {
    setupHealthConnect();
  }, []);

  // Setup app state listener and auto-sync
  useEffect(() => {
    if (!isInitialized) return;

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    setupAutoSync();
    
    return () => {
      subscription?.remove();
      if (intervalRef.current) {
        console.log('🛑 Clearing auto-sync intervals');
        clearInterval(intervalRef.current);
        BackgroundTimer.clearInterval(intervalRef.current);
      }
    };
  }, [isInitialized]);

  // Manual refresh
  useEffect(() => {
    if (isInitialized) {
      // Start with immediate fetch
      lastFetchTime.current = Date.now();
      fetchStepsData();
    }
  }, [isInitialized]);

  // Handle app state changes
  const handleAppStateChange = (nextAppState) => {
    console.log(`🔄 App state changed from ${appState.current} to ${nextAppState}`);
    
    if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      // App came to foreground
      const timeSinceLastFetch = Date.now() - lastFetchTime.current;
      console.log(`⏰ App returned to foreground. Time since last fetch: ${Math.round(timeSinceLastFetch / 1000)}s`);
      
      // If it's been more than 4 minutes, fetch immediately
      if (timeSinceLastFetch > 4 * 60 * 1000) {
        console.log('🚀 Fetching data immediately due to long background time');
        fetchStepsData();
      }
    }
    
    appState.current = nextAppState;
  };

  // Setup persistent auto-sync
  const setupAutoSync = () => {
    // Clear existing intervals
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      BackgroundTimer.clearInterval(intervalRef.current);
    }
    
    console.log('⏰ Setting up persistent 5-minute auto-sync...');
    
    // Use BackgroundTimer for persistence across app states
    intervalRef.current = BackgroundTimer.setInterval(() => {
      const now = new Date();
      console.log(`⏰ Background sync triggered at ${now.toLocaleTimeString()}`);
      lastFetchTime.current = Date.now();
      
      // Fetch data even when app is in background
      fetchStepsData();
    }, 5 * 60 * 1000); // 5 minutes
    
    console.log('✅ Persistent background sync enabled');
  };

  const renderStepItem = ({ item }) => (
    <View style={styles.stepItem}>
      <View style={styles.stepInfo}>
        <Text style={styles.timeText}>{item.time}</Text>
        <Text style={styles.intervalText}>{item.interval}</Text>
      </View>
      <Text style={styles.stepsText}>{item.steps.toLocaleString()} steps</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
      <View style={styles.header}>
        <Text style={styles.title}>Today's Steps</Text>
        <Text style={styles.subtitle}>
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}
        </Text>
        {lastSyncTime && (
          <View>
            <Text style={styles.syncStatus}>
              {isSyncing ? '🔄 Syncing...' : `✅ Last sync: ${lastSyncTime.toLocaleTimeString()}`}
            </Text>
            <Text style={styles.nextSyncText}>
              ⏰ Auto-sync every 5 minutes
            </Text>
          </View>
        )}
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading steps data...</Text>
        </View>
      ) : (
        <FlatList
          data={stepsData}
          renderItem={renderStepItem}
          keyExtractor={(item) => item.id}
          style={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No step data available for today</Text>
              <Text style={styles.emptySubtext}>
                Make sure Health Connect is recording your steps
              </Text>
            </View>
          )}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    padding: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#6c757d',
  },
  syncStatus: {
    fontSize: 12,
    color: '#28a745',
    marginTop: 4,
    fontWeight: '500',
  },
  nextSyncText: {
    fontSize: 11,
    color: '#007AFF',
    marginTop: 2,
  },
  list: {
    flex: 1,
    padding: 16,
  },
  stepItem: {
    backgroundColor: '#ffffff',
    padding: 16,
    marginBottom: 12,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  stepInfo: {
    flex: 1,
  },
  timeText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 4,
  },
  intervalText: {
    fontSize: 14,
    color: '#6c757d',
  },
  stepsText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6c757d',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6c757d',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
});

export default StepsScreen;