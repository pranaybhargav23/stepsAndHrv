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

// API Configuration with fallbacks (prioritize localhost due to ADB port forwarding)
const API_CONFIGS = [
  'http://localhost:3000/api',      // ADB port forwarding (should work now)
  'http://192.168.1.4:3000/api',   // Current WiFi IP
  'http://10.0.2.2:3000/api',      // Android emulator
  'http://127.0.0.1:3000/api'       // IP fallback
];

let CURRENT_API_BASE_URL = API_CONFIGS[0];

const HeartRateScreen = () => {
  const [heartRateData, setHeartRateData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const appState = useRef(AppState.currentState);
  const intervalRef = useRef(null);
  const lastFetchTime = useRef(Date.now());

  // Test API connectivity and find working endpoint
  const testApiConnection = async () => {
    for (const apiUrl of API_CONFIGS) {
      try {
        console.log(`🔍 Testing API connection: ${apiUrl}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(`${apiUrl}/health`, { 
          method: 'GET',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
          }
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          console.log(`✅ API connection successful: ${apiUrl}`, data);
          CURRENT_API_BASE_URL = apiUrl;
          return true;
        } else {
          console.log(`❌ API responded with status ${response.status}: ${apiUrl}`);
        }
      } catch (error) {
        console.log(`❌ Failed to connect to: ${apiUrl} - ${error.message}`);
      }
    }
    console.log('❌ All API endpoints failed');
    return false;
  };

  // Send heart rate data to backend API
  const sendHeartRateDataToAPI = async (heartRateIntervals) => {
    try {
      setIsSyncing(true);
      
      // Test connection first if previous call failed
      const isConnected = await testApiConnection();
      if (!isConnected) {
        console.log('⚠️ No API connection available, skipping sync');
        return;
      }
      
      console.log(`📤 Sending Heart Rate data to: ${CURRENT_API_BASE_URL}`);
      
      const response = await fetch(`${CURRENT_API_BASE_URL}/heartrate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000,
        body: JSON.stringify({
          heartRateIntervals: heartRateIntervals.map(interval => ({
            intervalStart: interval.start.toISOString(),
            intervalEnd: interval.end.toISOString(),
            timeLabel: interval.time,
            heartRateValue: interval.heartRate
          }))
        }),
      });

      const data = await response.json();
      if (data.success) {
        console.log('✅ Successfully stored Heart Rate data:', data.message);
        setLastSyncTime(new Date());
      } else {
        console.error('❌ Failed to store Heart Rate data:', data.message);
      }
    } catch (error) {
      console.error('❌ API call failed:', error.message);
      // Show user-friendly message for network issues
      if (error.message.includes('Network request failed') || error.message.includes('fetch')) {
        console.log('🌐 Network issue detected - backend server might be offline');
      }
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
          recordType: 'HeartRate',
        },
      ]);
      console.log('Heart Rate Permissions result:', permissions);
      return permissions.every(permission => permission.status === 'granted');
    } catch (error) {
      console.error('Permission request failed:', error);
      Alert.alert('Error', 'Failed to request Heart Rate permissions. Please grant access to heart rate data.');
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
    
    console.log(`📊 Generated ${intervals.length} Heart Rate intervals (last: ${intervals[intervals.length-1]?.label})`);
    return intervals;
  };

  // Aggregate Heart Rate by 5-minute intervals
  const aggregateHeartRateByInterval = (records, intervals) => {
    const aggregatedData = [];

    for (const interval of intervals) {
      const intervalRecords = [];
      
      // Extract all samples that fall within this interval
      for (const record of records) {
        if (record.samples && Array.isArray(record.samples)) {
          for (const sample of record.samples) {
            const sampleTime = new Date(sample.time);
            if (sampleTime >= interval.start && sampleTime < interval.end) {
              intervalRecords.push({
                beatsPerMinute: sample.beatsPerMinute,
                time: sample.time
              });
            }
          }
        }
      }

      let avgHeartRate = 0;
      
      if (intervalRecords.length > 0) {
        avgHeartRate = intervalRecords.reduce((sum, sample) => sum + (sample.beatsPerMinute || 0), 0) / intervalRecords.length;
      }
      
      const intervalData = {
        id: interval.start.getTime().toString(),
        time: interval.label,
        heartRate: Math.round(avgHeartRate * 10) / 10, // Round to 1 decimal place
        recordCount: intervalRecords.length,
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

  // Fetch Heart Rate data
  const fetchHeartRateData = async () => {
    if (!isInitialized) {
      return;
    }

    console.log('🔄 Fetching Heart Rate data from Health Connect...');
    setLoading(true);
    try {
      const { startTime, endTime } = getTodayTimeRange();
      console.log(`📅 Date range: ${startTime} to ${endTime}`);
      
      console.log('🔍 Fetching Heart Rate data...');
      const heartRateRecords = await readRecords('HeartRate', {
        timeRangeFilter: {
          operator: 'between',
          startTime,
          endTime,
        },
      });
      
      console.log(`📊 Found ${heartRateRecords.records.length} Heart Rate records`);
      
      if (heartRateRecords.records.length > 0) {
        console.log('🔍 Sample Heart Rate record:', JSON.stringify(heartRateRecords.records[0], null, 2));
        
        // Count total samples
        const totalSamples = heartRateRecords.records.reduce((count, record) => 
          count + (record.samples ? record.samples.length : 0), 0
        );
        console.log(`💓 Total heart rate samples found: ${totalSamples}`);
        
        // Show some sample BPM values
        const sampleBPMs = heartRateRecords.records
          .slice(0, 3)
          .flatMap(record => record.samples || [])
          .map(sample => sample.beatsPerMinute);
        console.log('💓 Sample BPM values:', sampleBPMs);
      } else {
        console.log('⚠️ No Heart Rate data found!');
        console.log('💡 Tips:');
        console.log('- Make sure you have a fitness tracker/smartwatch');
        console.log('- Check if apps like Samsung Health, Google Fit are recording data');
        console.log('- Try some physical activity to generate heart rate data');
      }

      const intervals = generate5MinuteIntervals();
      const aggregatedData = aggregateHeartRateByInterval(heartRateRecords.records, intervals);
      
      setHeartRateData(aggregatedData);
      console.log(`📈 Aggregated ${heartRateRecords.records.length} records into ${aggregatedData.length} intervals`);
      console.log('📊 Sample aggregated data:', aggregatedData.slice(0, 3));

      // Send data to backend API
      if (aggregatedData.length > 0) {
        console.log('📤 Sending Heart Rate data to backend...');
        await sendHeartRateDataToAPI(aggregatedData);
      }
    } catch (error) {
      console.error('❌ Error fetching Heart Rate data:', error);
      Alert.alert('Error', `Failed to fetch Heart Rate data: ${error.message}`);
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

    await fetchHeartRateData();
  };

  // Handle app state changes
  const handleAppStateChange = (nextAppState) => {
    console.log(`🔄 App state changed from ${appState.current} to ${nextAppState}`);
    
    if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      // App came to foreground
      const timeSinceLastFetch = Date.now() - lastFetchTime.current;
      console.log(`⏰ App returned to foreground. Time since last fetch: ${Math.round(timeSinceLastFetch / 1000)}s`);
      
      // If it's been more than 4 minutes, fetch immediately
      if (timeSinceLastFetch > 4 * 60 * 1000) {
        console.log('🚀 Fetching Heart Rate data immediately due to long background time');
        fetchHeartRateData();
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
    
    console.log('⏰ Setting up persistent 5-minute Heart Rate auto-sync...');
    
    // Use BackgroundTimer for persistence across app states
    intervalRef.current = BackgroundTimer.setInterval(() => {
      const now = new Date();
      console.log(`⏰ Background Heart Rate sync triggered at ${now.toLocaleTimeString()}`);
      lastFetchTime.current = Date.now();
      
      // Fetch data even when app is in background
      fetchHeartRateData();
    }, 5 * 60 * 1000); // 5 minutes
    
    console.log('✅ Persistent Heart Rate background sync enabled');
  };

  // Refresh data
  const onRefresh = async () => {
    setRefreshing(true);
    await fetchHeartRateData();
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
        console.log('🛑 Clearing Heart Rate auto-sync intervals');
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
      fetchHeartRateData();
    }
  }, [isInitialized]);

  const renderHeartRateItem = ({ item }) => (
    <View style={styles.heartRateItem}>
      <View style={styles.heartRateInfo}>
        <Text style={styles.timeText}>{item.time}</Text>
        <Text style={styles.intervalText}>{item.interval}</Text>
        {item.recordCount > 0 && (
          <Text style={styles.recordCount}>
            {item.recordCount} HR records
          </Text>
        )}
      </View>
      <View style={styles.valueContainer}>
        <Text style={styles.heartRateText}>
          {item.heartRate > 0 ? `${item.heartRate.toFixed(0)} bpm` : '-- bpm'}
        </Text>
        {item.recordCount === 0 && (
          <Text style={styles.noDataText}>No data</Text>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
      <View style={styles.header}>
        <Text style={styles.title}>Today's Heart Rate</Text>
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
            <Text style={styles.apiStatus}>
              🌐 API: {CURRENT_API_BASE_URL.replace('http://', '').replace('/api', '')}
            </Text>
          </View>
        )}
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#dc3545" />
          <Text style={styles.loadingText}>Loading Heart Rate data...</Text>
        </View>
      ) : (
        <FlatList
          data={heartRateData}
          renderItem={renderHeartRateItem}
          keyExtractor={(item) => item.id}
          style={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No Heart Rate data available for today</Text>
              <Text style={styles.emptySubtext}>
                Make sure Health Connect is recording your heart rate data
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
    fontSize: 24,
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
    color: '#dc3545',
    marginTop: 2,
  },
  apiStatus: {
    fontSize: 10,
    color: '#6c757d',
    marginTop: 2,
    fontFamily: 'monospace',
  },
  list: {
    flex: 1,
    padding: 16,
  },
  heartRateItem: {
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
    borderLeftWidth: 4,
    borderLeftColor: '#dc3545',
  },
  heartRateInfo: {
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
  heartRateText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#dc3545',
  },
  valueContainer: {
    alignItems: 'flex-end',
  },
  recordCount: {
    fontSize: 12,
    color: '#28a745',
    marginTop: 2,
  },
  noDataText: {
    fontSize: 12,
    color: '#6c757d',
    fontStyle: 'italic',
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

export default HeartRateScreen;