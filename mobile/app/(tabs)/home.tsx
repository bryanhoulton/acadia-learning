import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import { router } from 'expo-router';
import {
  Settings,
  Play,
  Flame,
  Clock,
  TrendingUp,
  ChevronRight,
  ChevronDown,
  User,
  UserPlus,
  MessageCircle,
} from 'lucide-react-native';
import {
  Alert,
  Text,
  View,
  Pressable,
  ScrollView,
  Modal,
  RefreshControl,
  Linking,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
  withDelay,
  withTiming,
  Easing,
  FadeInDown,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { Logo } from '@/components/ui/logo';
import { useAuthStore } from '@/stores';
import client from '@/utils/api';
import { DEV_TEXTED_TUTOR_BYPASS_KEY } from '../text-tutor';

// Snappy spring config
const SPRING_CONFIG = {
  damping: 15,
  stiffness: 400,
  mass: 0.5,
};

function StatCard({ 
  icon: Icon, 
  value, 
  label, 
  color = "#000",
  delay = 0,
}: { 
  icon: React.ElementType;
  value: string;
  label: string;
  color?: string;
  delay?: number;
}) {
  return (
    <Animated.View 
      entering={FadeInDown.duration(300).delay(delay).springify().damping(15).stiffness(150)}
      className="flex-1 bg-neutral-50 rounded-2xl p-4"
    >
      <Icon size={20} color={color} strokeWidth={2} />
      <Text className="text-2xl font-bold text-black mt-2">{value}</Text>
      <Text className="text-sm text-neutral-500">{label}</Text>
    </Animated.View>
  );
}

function PrimaryButton({ onPress, studentName }: { onPress: () => void; studentName: string }) {
  const scale = useSharedValue(1);
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0);

  useEffect(() => {
    // Subtle breathing animation - slower and more elegant
    const animate = () => {
      pulseOpacity.value = withSequence(
        withTiming(0.08, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.ease) })
      );
      pulseScale.value = withSequence(
        withTiming(1.08, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) })
      );
    };
    
    animate();
    const interval = setInterval(animate, 2400);
    return () => clearInterval(interval);
  }, []);

  const handlePressIn = () => {
    scale.value = withSpring(0.92, SPRING_CONFIG);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, SPRING_CONFIG);
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
    transform: [{ scale: pulseScale.value }],
  }));

  return (
    <Animated.View 
      entering={FadeInDown.duration(400).springify().damping(12).stiffness(100)}
      className="items-center"
    >
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <View className="relative items-center justify-center">
          {/* Pulse ring */}
          <Animated.View 
            style={pulseStyle}
            className="absolute w-48 h-48 rounded-full bg-black"
          />
          
          {/* Main button */}
          <Animated.View 
            style={animatedStyle}
            className="w-44 h-44 rounded-full bg-black items-center justify-center"
          >
            <Play size={56} color="#fff" fill="#fff" strokeWidth={0} />
          </Animated.View>
        </View>
      </Pressable>
      
      <Animated.Text 
        entering={FadeInDown.duration(300).delay(100).springify()}
        className="text-2xl font-bold text-black mt-6"
      >
        Start Session
      </Animated.Text>
      <Animated.Text 
        entering={FadeInDown.duration(300).delay(150).springify()}
        className="text-base text-neutral-500 mt-1"
      >
        for {studentName}
      </Animated.Text>
    </Animated.View>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onPress,
  delay = 0,
}: {
  icon: React.ElementType;
  label: string;
  onPress: () => void;
  delay?: number;
}) {
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withSpring(0.98, SPRING_CONFIG);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, SPRING_CONFIG);
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View entering={FadeInDown.duration(300).delay(delay).springify()}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <Animated.View
          style={animatedStyle}
          className="flex-row items-center justify-between p-4 bg-white rounded-2xl border border-neutral-200"
        >
          <View className="flex-row items-center gap-3">
            <View className="w-10 h-10 bg-neutral-100 rounded-xl items-center justify-center">
              <Icon size={20} color="#000" strokeWidth={2} />
            </View>
            <Text className="text-base font-medium text-black">{label}</Text>
          </View>
          <ChevronRight size={20} color="#a3a3a3" />
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondaryAction,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  secondaryLabel?: string;
  onSecondaryAction?: () => void;
}) {
  return (
    <Animated.View
      entering={FadeInDown.duration(400).springify()}
      className="flex-1 items-center justify-center px-8 py-12"
    >
      <View className="w-20 h-20 bg-neutral-100 rounded-full items-center justify-center mb-6">
        <Icon size={32} color="#525252" strokeWidth={2} />
      </View>
      <Text className="text-2xl font-bold text-black text-center mb-2">
        {title}
      </Text>
      <Text className="text-base text-neutral-500 text-center mb-8">
        {description}
      </Text>
      <Pressable
        onPress={onAction}
        className="bg-black px-8 py-4 rounded-2xl active:opacity-80 w-full"
      >
        <Text className="text-base font-semibold text-white text-center">
          {actionLabel}
        </Text>
      </Pressable>
      {secondaryLabel && onSecondaryAction && (
        <Pressable
          onPress={onSecondaryAction}
          className="mt-4 px-8 py-4 rounded-2xl border-2 border-neutral-200 active:bg-neutral-50 w-full"
        >
          <Text className="text-base font-semibold text-black text-center">
            {secondaryLabel}
          </Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

export default function HomeScreen() {
  const account = useAuthStore((state) => state.account);
  const selectedProfileId = useAuthStore((state) => state.selectedProfileId);
  const setSelectedProfileId = useAuthStore((state) => state.setSelectedProfileId);
  const refreshAccount = useAuthStore((state) => state.refreshAccount);
  const insets = useSafeAreaInsets();

  const [showStudentPicker, setShowStudentPicker] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    streak: 0,
    minutesToday: 0,
    sessionsThisWeek: 0,
    minutesThisWeek: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);

  // Redirect to text-tutor if they haven't texted yet
  useEffect(() => {
    const checkTextedTutor = async () => {
      if (account && account.has_texted_tutor === false) {
        // In dev mode, check for bypass flag
        if (__DEV__) {
          const bypass = await AsyncStorage.getItem(DEV_TEXTED_TUTOR_BYPASS_KEY);
          if (bypass === "true") {
            return; // Don't redirect, bypass is set
          }
        }
        router.replace("/text-tutor");
      }
    };
    checkTextedTutor();
  }, [account?.has_texted_tutor]);

  // Get all student profiles
  const studentProfiles = useMemo(
    () => account?.profiles?.filter((p) => p.profile_type === "student") || [],
    [account?.profiles]
  );

  // Update selected profile when account loads
  useEffect(() => {
    if (studentProfiles.length > 0 && !selectedProfileId) {
      setSelectedProfileId(studentProfiles[0].id);
    }
  }, [studentProfiles.length, selectedProfileId, studentProfiles, setSelectedProfileId]);

  const selectedProfile = studentProfiles.find(
    (p) => p.id === selectedProfileId
  );

  // Fetch stats for selected profile
  const fetchStats = async (profileId: string) => {
    try {
      setStatsLoading(true);
      const { data, error } = await client.GET(
        "/api/lms/accounts/profiles/{profile_id}/stats/",
        { params: { path: { profile_id: profileId } } }
      );
      
      if (data && !error) {
        setStats({
          streak: data.streak ?? 0,
          minutesToday: data.minutes_today ?? 0,
          sessionsThisWeek: data.sessions_this_week ?? 0,
          minutesThisWeek: data.minutes_this_week ?? 0,
        });
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setStatsLoading(false);
    }
  };

  // Fetch stats when selected profile changes
  useEffect(() => {
    if (selectedProfileId) {
      fetchStats(selectedProfileId);
    }
  }, [selectedProfileId]);

  const handleStartSession = () => {
    if (account?.is_locked && !account?.stripe_customer_id) {
      Alert.alert(
        "Subscription Required",
        "Start your free trial to begin tutoring sessions.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Start Trial", onPress: () => router.push("/paywall") }
        ]
      );
      return;
    }
    router.push("/classroom");
  };

  const handleViewProgress = () => {
    Alert.alert("Coming Soon", "Progress tracking will be available soon!");
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshAccount();
      if (selectedProfileId) {
        await fetchStats(selectedProfileId);
      }
    } catch (error) {
      console.error('Refresh error:', error);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View 
      className="flex-1 bg-white"
      style={{ paddingTop: insets.top }}
    >
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 py-4">
        <Logo variant="black" width={36} height={36} />

        {/* Student Switcher */}
        {studentProfiles.length > 1 && (
          <Pressable
            onPress={() => setShowStudentPicker(true)}
            className="flex-1 mx-4 flex-row items-center justify-center gap-2 bg-neutral-100 px-4 py-2 rounded-full active:bg-neutral-200"
            hitSlop={4}
          >
            <Text className="text-base font-medium text-black">
              {selectedProfile?.name || 'Select Student'}
            </Text>
            <ChevronDown size={16} color="#000" />
          </Pressable>
        )}

        <Pressable
          onPress={() => router.push("/(tabs)/settings")}
          className="w-10 h-10 items-center justify-center rounded-full bg-neutral-100 active:bg-neutral-200"
          hitSlop={8}
        >
          <Settings size={20} color="#000" strokeWidth={2} />
        </Pressable>
      </View>

      {/* Student Picker Modal */}
      <Modal
        visible={showStudentPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowStudentPicker(false)}
      >
        <View className="flex-1 bg-white">
          {/* Drag Handle */}
          <View className="items-center pt-3 pb-2">
            <View className="w-10 h-1 rounded-full bg-neutral-300" />
          </View>

          {/* Header */}
          <View className="px-6 py-4 border-b border-neutral-200">
            <Text className="text-2xl font-bold text-black">Select Student</Text>
          </View>

          <ScrollView 
            className="flex-1"
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          >
            <View className="px-6 py-4 gap-2">
              {studentProfiles.map((profile) => (
                <Pressable
                  key={profile.id}
                  onPress={() => {
                    setSelectedProfileId(profile.id);
                    setTimeout(() => setShowStudentPicker(false), 200);
                  }}
                  className={`flex-row items-center gap-3 p-4 rounded-2xl ${
                    profile.id === selectedProfileId
                      ? 'bg-black'
                      : 'bg-neutral-50 active:bg-neutral-100'
                  }`}
                >
                  <View className={`w-10 h-10 rounded-full items-center justify-center ${
                    profile.id === selectedProfileId ? 'bg-white/20' : 'bg-neutral-200'
                  }`}>
                    <User
                      size={20}
                      color={profile.id === selectedProfileId ? '#fff' : '#525252'}
                    />
                  </View>
                  <Text className={`text-lg font-medium flex-1 ${
                    profile.id === selectedProfileId ? 'text-white' : 'text-black'
                  }`}>
                    {profile.name}
                  </Text>
                  {profile.id === selectedProfileId && (
                    <View className="w-6 h-6 bg-white rounded-full items-center justify-center">
                      <Text className="text-black font-bold">✓</Text>
                    </View>
                  )}
                </Pressable>
              ))}

              {/* Add Student Option */}
              <Pressable
                onPress={() => {
                  setShowStudentPicker(false);
                  router.push("/profile/new");
                }}
                className="flex-row items-center gap-3 p-4 rounded-2xl border-2 border-dashed border-neutral-300 active:bg-neutral-50"
              >
                <View className="w-10 h-10 bg-neutral-100 rounded-full items-center justify-center">
                  <UserPlus size={20} color="#525252" />
                </View>
                <Text className="text-lg font-medium text-neutral-600">
                  Add New Student
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingBottom: insets.bottom + 24,
          flexGrow: 1,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#000000"
          />
        }
      >
        {/* Empty State: No Student Profiles */}
        {studentProfiles.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title="Let's get started!"
            description="Add a student profile to begin, or chat with your AI tutor who can help set things up."
            actionLabel="Add Student Profile"
            onAction={() => router.push("/profile/new")}
            secondaryLabel="Text Your Tutor"
            onSecondaryAction={() => {
              const ACADIA_PHONE = "+14155838050";
              const SMS_BODY = "Hi! I need help setting up my student's profile.";
              Linking.openURL(`sms:${ACADIA_PHONE}&body=${encodeURIComponent(SMS_BODY)}`);
            }}
          />
        ) : (
          /* Normal Content */
          <>
            {/* Primary CTA Section */}
            <View className="flex-1 items-center justify-center py-12">
              <PrimaryButton
                onPress={handleStartSession}
                studentName={selectedProfile?.name || "your student"}
              />
            </View>

            {/* Stats Section */}
            <View className="px-6 mb-6">
              <View className="flex-row gap-3">
                <StatCard
                  icon={Flame}
                  value={`${stats.streak}`}
                  label="Day streak"
                  color="#f97316"
                  delay={200}
                />
                <StatCard
                  icon={Clock}
                  value={`${stats.minutesToday}m`}
                  label="Today"
                  delay={250}
                />
                <StatCard
                  icon={TrendingUp}
                  value={`${stats.sessionsThisWeek}`}
                  label="This week"
                  delay={300}
                />
              </View>
            </View>

            {/* Quick Actions */}
            <View className="px-6 gap-3">
              <QuickAction
                icon={TrendingUp}
                label="View Progress"
                onPress={handleViewProgress}
                delay={350}
              />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
