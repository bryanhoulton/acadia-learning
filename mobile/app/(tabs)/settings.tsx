import { useState } from "react";

import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Blocks,
  Bug,
  ChevronRight,
  CreditCard,
  LogOut,
  Plus,
  RotateCcw,
  Trash2,
  User,
} from "lucide-react-native";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  useAccountStore,
  useAuthStore,
  usePurchasesStore,
} from "@/stores";

const SPRING_CONFIG = {
  damping: 15,
  stiffness: 400,
  mass: 0.5,
};

function ProfileCard({
  name,
  onPress,
  index,
}: {
  name: string;
  onPress: () => void;
  index: number;
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
    <Animated.View
      entering={FadeInDown.duration(250)
        .delay(index * 50)
        .springify()}
    >
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <Animated.View
          style={animatedStyle}
          className="flex-row items-center justify-between p-4 bg-neutral-50 rounded-2xl"
        >
          <View className="flex-row items-center gap-3">
            <View className="w-10 h-10 bg-neutral-200 rounded-full items-center justify-center">
              <User size={20} color="#525252" />
            </View>
            <Text className="text-base font-medium text-black">{name}</Text>
          </View>
          <ChevronRight size={20} color="#a3a3a3" />
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onPress,
  destructive = false,
  loading = false,
  index = 0,
  subtitle,
}: {
  icon: React.ElementType;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  loading?: boolean;
  index?: number;
  subtitle?: string;
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

  const iconColor = destructive ? "#ef4444" : "#525252";
  const textColor = destructive ? "text-red-500" : "text-neutral-600";

  return (
    <Animated.View
      entering={FadeInDown.duration(250)
        .delay(index * 50)
        .springify()}
    >
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={loading}
      >
        <Animated.View
          style={animatedStyle}
          className="flex-row items-center gap-3 p-4"
        >
          <Icon size={20} color={iconColor} strokeWidth={2} />
          <View className="flex-1">
            <Text className={`text-base ${textColor}`}>
              {loading ? "Loading..." : label}
            </Text>
            {subtitle && (
              <Text className="text-sm text-neutral-400">{subtitle}</Text>
            )}
          </View>
          <ChevronRight size={18} color="#d4d4d4" />
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const account = useAuthStore((state) => state.account);
  const authLogout = useAuthStore((state) => state.logout);
  const deleteAccount = useAuthStore((state) => state.deleteAccount);

  const { isPremium, presentCustomerCenter, logout: purchasesLogout } = usePurchasesStore();

  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const studentProfiles =
    account?.profiles?.filter((p) => p.profile_type === "student") || [];

  const handleLogout = async () => {
    setIsLoggingOut(true);
    // Logout from both auth and RevenueCat
    await Promise.all([authLogout(), purchasesLogout()]);
    router.replace("/welcome");
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure? This will permanently delete all your data and cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Final Confirmation",
              "This is permanent. Delete your account?",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete Forever",
                  style: "destructive",
                  onPress: async () => {
                    setIsDeletingAccount(true);
                    const { error } = await deleteAccount();

                    if (error) {
                      Alert.alert("Error", error);
                      setIsDeletingAccount(false);
                    } else {
                      await purchasesLogout();
                      router.replace("/welcome");
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleManageSubscription = async () => {
    await presentCustomerCenter();
  };

  return (
    <View
      className="flex-1 bg-white"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      {/* Header */}
      <View className="flex-row items-center gap-4 px-6 py-4">
        <Pressable
          onPress={() => router.replace("/(tabs)/home")}
          className="w-10 h-10 items-center justify-center rounded-full bg-neutral-100 active:bg-neutral-200"
          hitSlop={8}
        >
          <ArrowLeft size={20} color="#000" />
        </Pressable>
        <Text className="text-xl font-bold text-black">Settings</Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Students Section */}
        <View className="mb-8">
          <View className="flex-row items-center justify-between mb-4">
            <Animated.Text
              entering={FadeInDown.duration(250).springify()}
              className="text-sm font-semibold text-neutral-500 uppercase tracking-wide"
            >
              Students
            </Animated.Text>
            <Animated.View entering={FadeInDown.duration(250).springify()}>
              <Pressable
                onPress={() => router.push("/profile/new")}
                className="w-8 h-8 items-center justify-center rounded-full bg-black active:bg-neutral-800"
                hitSlop={8}
              >
                <Plus size={16} color="#fff" strokeWidth={2.5} />
              </Pressable>
            </Animated.View>
          </View>

          <View className="gap-2">
            {studentProfiles.map((profile, index) => (
              <ProfileCard
                key={profile.id}
                name={profile.name || "Unnamed"}
                onPress={() => router.push(`/profile/${profile.id}`)}
                index={index}
              />
            ))}
          </View>
        </View>

        {/* Subscription Section */}
        <View className="mb-8">
          <Animated.Text
            entering={FadeInDown.duration(250).delay(50).springify()}
            className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-2"
          >
            Subscription
          </Animated.Text>

          <View className="bg-neutral-50 rounded-2xl overflow-hidden">
            <MenuItem
              icon={CreditCard}
              label="Manage Subscription"
              subtitle={isPremium ? "Acadia Learning Pro" : "Free"}
              onPress={handleManageSubscription}
              index={0}
            />
          </View>
        </View>

        {/* Account Section */}
        <View className="mb-8">
          <Animated.Text
            entering={FadeInDown.duration(250).delay(100).springify()}
            className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-2"
          >
            Account
          </Animated.Text>

          <View className="bg-neutral-50 rounded-2xl overflow-hidden">
            <MenuItem
              icon={LogOut}
              label="Log out"
              onPress={handleLogout}
              loading={isLoggingOut}
              index={0}
            />
            <View className="h-px bg-neutral-200 mx-4" />
            <MenuItem
              icon={Trash2}
              label="Delete account"
              onPress={handleDeleteAccount}
              destructive
              loading={isDeletingAccount}
              index={1}
            />
          </View>
        </View>

        {/* Dev Section - Only visible in development */}
        {__DEV__ && (
          <View>
            <Animated.Text
              entering={FadeInDown.duration(250).delay(150).springify()}
              className="text-sm font-semibold text-orange-500 uppercase tracking-wide mb-2"
            >
              🛠 Developer
            </Animated.Text>

            <View className="bg-orange-50 rounded-2xl overflow-hidden border border-orange-200">
              <MenuItem
                icon={RotateCcw}
                label="Reset RevenueCat (New User)"
                subtitle="Logout & create new anonymous user"
                onPress={() => {
                  Alert.alert(
                    "Reset RevenueCat",
                    "This will log you out of RevenueCat and create a new anonymous user. You'll see the paywall again.",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Reset",
                        onPress: async () => {
                          await purchasesLogout();
                          Alert.alert("Done", "RevenueCat reset. Go to paywall to test.");
                        },
                      },
                    ]
                  );
                }}
                index={0}
              />
              <View className="h-px bg-orange-200 mx-4" />
              <MenuItem
                icon={Bug}
                label="Go to Paywall"
                subtitle="Test the subscription flow"
                onPress={() => router.push("/paywall")}
                index={1}
              />
              <View className="h-px bg-orange-200 mx-4" />
              <MenuItem
                icon={Blocks}
                label="Canvas Blocks"
                subtitle="Preview all block types"
                onPress={() => router.push("/(tabs)/blocks")}
                index={2}
              />
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
