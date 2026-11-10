import { useMemo, useState } from "react";

import { useRouter } from "expo-router";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  ChevronRight,
} from "lucide-react-native";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { getRequiredStep, getRouteForStep } from "@/hooks/use-required-step";
import { useAccountStore, useAuthStore, usePurchasesStore } from "@/stores";
import client from "@/utils/api";

const SPRING_CONFIG = {
  damping: 15,
  stiffness: 400,
  mass: 0.5,
};

type TimeOption = {
  label: string;
  hourValue: number;
};

const AVAILABLE_TIMES: TimeOption[] = [
  { label: "6:00 AM", hourValue: 6 },
  { label: "6:30 AM", hourValue: 6.5 },
  { label: "7:00 AM", hourValue: 7 },
  { label: "7:30 AM", hourValue: 7.5 },
  { label: "8:00 AM", hourValue: 8 },
  { label: "8:30 AM", hourValue: 8.5 },
  { label: "9:00 AM", hourValue: 9 },
  { label: "9:30 AM", hourValue: 9.5 },
  { label: "10:00 AM", hourValue: 10 },
  { label: "10:30 AM", hourValue: 10.5 },
  { label: "11:00 AM", hourValue: 11 },
  { label: "11:30 AM", hourValue: 11.5 },
  { label: "12:00 PM", hourValue: 12 },
  { label: "12:30 PM", hourValue: 12.5 },
  { label: "1:00 PM", hourValue: 13 },
  { label: "1:30 PM", hourValue: 13.5 },
  { label: "2:00 PM", hourValue: 14 },
  { label: "2:30 PM", hourValue: 14.5 },
  { label: "3:00 PM", hourValue: 15 },
  { label: "3:30 PM", hourValue: 15.5 },
  { label: "4:00 PM", hourValue: 16 },
  { label: "4:30 PM", hourValue: 16.5 },
  { label: "5:00 PM", hourValue: 17 },
  { label: "5:30 PM", hourValue: 17.5 },
  { label: "6:00 PM", hourValue: 18 },
  { label: "6:30 PM", hourValue: 18.5 },
  { label: "7:00 PM", hourValue: 19 },
  { label: "7:30 PM", hourValue: 19.5 },
  { label: "8:00 PM", hourValue: 20 },
  { label: "8:30 PM", hourValue: 20.5 },
  { label: "9:00 PM", hourValue: 21 },
];

const DEFAULT_DAYS_TO_SHOW = 3;
const EXTENDED_DAYS_TO_SHOW = 14;

function DateCard({
  date,
  selected,
  onPress,
  isToday,
  index = 0,
}: {
  date: Date;
  selected: boolean;
  onPress: () => void;
  isToday: boolean;
  index?: number;
}) {
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withSpring(0.95, SPRING_CONFIG);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, SPRING_CONFIG);
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const dayName = date.toLocaleDateString("en-US", { weekday: "short" });
  const dayNumber = date.getDate();
  const monthName = date.toLocaleDateString("en-US", { month: "short" });

  return (
    <Animated.View entering={FadeInDown.duration(200).delay(index * 30)}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <Animated.View
          style={animatedStyle}
          className={`items-center justify-center w-20 h-24 rounded-2xl border-2 ${
            selected ? "border-black bg-black" : "border-neutral-200 bg-white"
          }`}
        >
          <Text
            className={`text-xs font-medium ${
              selected ? "text-neutral-300" : "text-neutral-500"
            }`}
          >
            {isToday ? "Today" : dayName}
          </Text>
          <Text
            className={`text-2xl font-bold ${
              selected ? "text-white" : "text-black"
            }`}
          >
            {dayNumber}
          </Text>
          <Text
            className={`text-xs font-medium ${
              selected ? "text-neutral-300" : "text-neutral-500"
            }`}
          >
            {monthName}
          </Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

function TimeButton({
  time,
  selected,
  disabled,
  onPress,
}: {
  time: TimeOption;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    if (!disabled) {
      scale.value = withSpring(0.95, SPRING_CONFIG);
    }
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, SPRING_CONFIG);
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
    >
      <Animated.View
        style={animatedStyle}
        className={`h-12 items-center justify-center rounded-2xl border-2 ${
          selected
            ? "border-black bg-black"
            : disabled
              ? "border-neutral-100 bg-neutral-50"
              : "border-neutral-200 bg-white"
        }`}
      >
        <Text
          className={`text-sm font-semibold ${
            selected
              ? "text-white"
              : disabled
                ? "text-neutral-300"
                : "text-black"
          }`}
        >
          {time.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

function TimeCategoryButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 py-2.5 px-4 rounded-full border-2 ${
        selected ? "border-black bg-black" : "border-neutral-200 bg-white"
      }`}
    >
      <Text
        className={`text-sm font-semibold text-center capitalize ${
          selected ? "text-white" : "text-black"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function BookSessionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { updateProfile } = useAccountStore();
  const { account, refreshAccount } = useAuthStore();

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [timeCategory, setTimeCategory] = useState<
    "morning" | "afternoon" | "evening"
  >("afternoon");
  const [showExtendedDates, setShowExtendedDates] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showTrialWarning, setShowTrialWarning] = useState(false);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dates = useMemo(() => {
    const days: Date[] = [];
    const now = new Date();
    // If current time is 9:00 PM (21:00) or later, start from tomorrow
    const startDay = now.getHours() >= 21 ? 1 : 0;
    const daysToShow = showExtendedDates
      ? EXTENDED_DAYS_TO_SHOW
      : DEFAULT_DAYS_TO_SHOW;

    for (let i = startDay; i < daysToShow + startDay; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      d.setHours(0, 0, 0, 0);
      days.push(d);
    }
    return days;
  }, [showExtendedDates]);

  const getTimesByCategory = (
    category: "morning" | "afternoon" | "evening",
  ) => {
    return AVAILABLE_TIMES.filter((time) => {
      if (category === "morning") {
        return time.hourValue < 12;
      } else if (category === "afternoon") {
        return time.hourValue >= 12 && time.hourValue < 18;
      } else {
        return time.hourValue >= 18;
      }
    });
  };

  const isTimeDisabled = (time: TimeOption) => {
    if (!selectedDate) return false;

    const isToday = selectedDate.toDateString() === new Date().toDateString();
    if (!isToday) return false;

    const now = new Date();
    const currentHour = now.getHours() + now.getMinutes() / 60;
    // Disable times that are less than 30 minutes from now
    return time.hourValue < currentHour + 0.5;
  };

  const handleShowMoreDates = () => {
    if (!showExtendedDates) {
      setShowTrialWarning(true);
    }
  };

  const confirmShowMoreDates = () => {
    setShowTrialWarning(false);
    setShowExtendedDates(true);
  };

  const handleBookSession = async () => {
    if (!selectedDate || !selectedTime) {
      Alert.alert(
        "Select a Time",
        "Please select a date and time for your first session.",
      );
      return;
    }

    setLoading(true);

    try {
      // Get the student profile to update
      const studentProfile = account?.profiles?.find(
        (p) => p.profile_type === "student",
      );

      if (studentProfile) {
        // Get timezone label
        const timezoneLabel =
          Intl.DateTimeFormat("en-US", {
            timeZoneName: "long",
          })
            .formatToParts(new Date())
            .find((part) => part.type === "timeZoneName")?.value ||
          "local time";

        // Update profile with booking info
        await updateProfile(studentProfile.id, {
          metadata: JSON.stringify({
            ...JSON.parse(studentProfile.metadata || "{}"),
            first_session_date: selectedDate.toISOString(),
            first_session_time: selectedTime,
            first_session_timezone: timezoneLabel,
          }),
        });
      }

      // Initialize entity with booking flag
      await client.POST("/api/lms/accounts/initialize-entity/", {
        body: {
          platform: "mobile",
        },
      });

      await refreshAccount();

      // Use self-healing navigation to determine next step
      const { isPremium } = usePurchasesStore.getState();
      const updatedAccount = useAuthStore.getState().account;
      const step = getRequiredStep(updatedAccount, isPremium, true);
      const route = getRouteForStep(step, true);

      router.replace(route as any);
    } catch (err) {
      console.error("Error booking session:", err);
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const isDateBeyondTrial = (date: Date) => {
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 3);
    trialEndDate.setHours(23, 59, 59, 999);
    return date > trialEndDate;
  };

  const selectedDateBeyondTrial = selectedDate
    ? isDateBeyondTrial(selectedDate)
    : false;

  return (
    <View
      className="flex-1 bg-white"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      {/* Trial Warning Modal */}
      {showTrialWarning && (
        <View className="absolute inset-0 z-50 bg-black/50 items-center justify-center px-6">
          <Animated.View
            entering={FadeIn.duration(200)}
            className="bg-white rounded-3xl p-6 w-full max-w-sm"
          >
            <View className="items-center mb-4">
              <View className="w-14 h-14 bg-amber-100 rounded-full items-center justify-center mb-3">
                <AlertTriangle size={28} color="#f59e0b" />
              </View>
              <Text className="text-xl font-bold text-black text-center">
                Trial Period Reminder
              </Text>
            </View>

            <Text className="text-neutral-600 text-center mb-6 leading-relaxed">
              Your free trial lasts 7 days. Booking a session more than 3 days
              out means it may fall outside your trial period. You'll need an
              active subscription to attend.
            </Text>

            <View className="gap-3">
              <Button
                variant="primary"
                size="lg"
                onPress={confirmShowMoreDates}
              >
                Show More Dates
              </Button>
              <Button
                variant="ghost"
                size="lg"
                onPress={() => setShowTrialWarning(false)}
              >
                Go Back
              </Button>
            </View>
          </Animated.View>
        </View>
      )}

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View
          entering={FadeInDown.duration(300).springify()}
          className="items-center mt-8 mb-8"
        >
          <View className="w-16 h-16 bg-neutral-100 rounded-full items-center justify-center mb-4">
            <Calendar size={32} color="#000" />
          </View>
          <Text className="text-3xl font-bold text-black text-center">
            Book Your First{"\n"}Session
          </Text>
          <Text className="text-lg text-neutral-500 text-center mt-2">
            Pick a time that works for you
          </Text>
        </Animated.View>

        {/* Date Selection */}
        <Animated.View
          entering={FadeInDown.duration(300).delay(100).springify()}
          className="mb-6"
        >
          <Text className="text-lg font-bold text-black mb-3">
            Select a day
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12 }}
          >
            {dates.map((date, index) => (
              <DateCard
                key={date.toISOString()}
                date={date}
                selected={selectedDate?.toDateString() === date.toDateString()}
                onPress={() => {
                  setSelectedDate(date);
                  setSelectedTime(null); // Reset time when date changes
                }}
                isToday={date.toDateString() === new Date().toDateString()}
                index={index}
              />
            ))}

            {/* Show More Button */}
            {!showExtendedDates && (
              <Pressable
                onPress={handleShowMoreDates}
                className="items-center justify-center w-20 h-24 rounded-2xl border-2 border-dashed border-neutral-300 bg-neutral-50"
              >
                <ChevronRight size={20} color="#737373" />
                <Text className="text-xs text-neutral-500 font-medium mt-1">
                  More
                </Text>
              </Pressable>
            )}
          </ScrollView>

          {/* Trial period indicator for selected date */}
          {selectedDateBeyondTrial && (
            <Animated.View
              entering={FadeIn.duration(200)}
              className="flex-row items-center gap-2 mt-3 p-3 bg-amber-50 rounded-xl border border-amber-200"
            >
              <AlertTriangle size={16} color="#f59e0b" />
              <Text className="text-amber-700 text-sm flex-1">
                This date may be outside your trial period
              </Text>
            </Animated.View>
          )}
        </Animated.View>

        {/* Time Selection */}
        <Animated.View
          entering={FadeInDown.duration(300).delay(200).springify()}
          className="mb-6"
        >
          <Text className="text-lg font-bold text-black mb-3">
            Select a time
          </Text>

          {selectedDate ? (
            <>
              {/* Time Category Buttons */}
              <View className="flex-row gap-3 mb-4">
                <TimeCategoryButton
                  label="morning"
                  selected={timeCategory === "morning"}
                  onPress={() => {
                    setTimeCategory("morning");
                    setSelectedTime(null);
                  }}
                />
                <TimeCategoryButton
                  label="afternoon"
                  selected={timeCategory === "afternoon"}
                  onPress={() => {
                    setTimeCategory("afternoon");
                    setSelectedTime(null);
                  }}
                />
                <TimeCategoryButton
                  label="evening"
                  selected={timeCategory === "evening"}
                  onPress={() => {
                    setTimeCategory("evening");
                    setSelectedTime(null);
                  }}
                />
              </View>

              {/* Time Grid */}
              <View
                className="flex-row flex-wrap"
                style={{ marginHorizontal: -4 }}
              >
                {getTimesByCategory(timeCategory).map((time) => (
                  <View
                    key={time.hourValue}
                    style={{
                      width: "33.333%",
                      paddingHorizontal: 4,
                      marginBottom: 8,
                    }}
                  >
                    <TimeButton
                      time={time}
                      selected={selectedTime === time.label}
                      disabled={isTimeDisabled(time)}
                      onPress={() => setSelectedTime(time.label)}
                    />
                  </View>
                ))}
              </View>
            </>
          ) : (
            <View className="p-8 rounded-2xl border-2 border-dashed border-neutral-200 bg-neutral-50">
              <Text className="text-neutral-500 text-center">
                Select a day above first
              </Text>
            </View>
          )}
        </Animated.View>
      </ScrollView>

      {/* Bottom CTA */}
      <View className="px-6 pb-4 pt-2 border-t border-neutral-100">
        <Button
          variant="primary"
          size="xl"
          onPress={handleBookSession}
          loading={loading}
          disabled={!selectedDate || !selectedTime || loading}
          iconRight={ArrowRight}
        >
          Book Session
        </Button>

        <Text className="text-neutral-400 text-xs text-center mt-3">
          You can always reschedule later
        </Text>
      </View>
    </View>
  );
}
