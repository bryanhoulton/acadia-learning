import { useState } from "react";

import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, ArrowRight, Check } from "lucide-react-native";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { getTimeZone } from "react-native-localize";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";
import { getRequiredStep, getRouteForStep } from "@/hooks/use-required-step";
import { useAccountStore, useAuthStore, usePurchasesStore } from "@/stores";
import client from "@/utils/api";
import { Picker } from "@react-native-picker/picker";

const SPRING_CONFIG = {
  damping: 15,
  stiffness: 400,
  mass: 0.5,
};

const GRADES = [
  { label: "Pre-K", value: "Pre-K" },
  { label: "Kindergarten", value: "K" },
  { label: "1st Grade", value: "1" },
  { label: "2nd Grade", value: "2" },
  { label: "3rd Grade", value: "3" },
  { label: "4th Grade", value: "4" },
  { label: "5th Grade", value: "5" },
  { label: "6th Grade", value: "6" },
  { label: "7th Grade", value: "7" },
  { label: "8th Grade", value: "8" },
  { label: "9th Grade", value: "9" },
  { label: "10th Grade", value: "10" },
  { label: "11th Grade", value: "11" },
  { label: "12th Grade", value: "12" },
];

const SUBJECTS = [
  { label: "Math", value: "math", emoji: "🔢" },
  { label: "Reading", value: "reading", emoji: "📖" },
  { label: "Writing", value: "writing", emoji: "✏️" },
  { label: "Science", value: "science", emoji: "🔬" },
  { label: "All Subjects", value: "all", emoji: "📚" },
];

function SelectCard({
  label,
  emoji,
  selected,
  onPress,
  index = 0,
}: {
  label: string;
  emoji?: string;
  selected: boolean;
  onPress: () => void;
  index?: number;
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
          className={`flex-row items-center justify-between p-5 rounded-2xl border-2 ${
            selected
              ? "border-black bg-neutral-50"
              : "border-neutral-200 bg-white"
          }`}
        >
          <View className="flex-row items-center gap-3">
            {emoji && <Text className="text-2xl">{emoji}</Text>}
            <Text
              className={`text-lg font-semibold ${selected ? "text-black" : "text-neutral-900"}`}
            >
              {label}
            </Text>
          </View>
          {selected && (
            <View className="w-6 h-6 bg-black rounded-full items-center justify-center">
              <Check size={14} color="#fff" strokeWidth={3} />
            </View>
          )}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

export default function NewProfileScreen() {
  const router = useRouter();
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  const isOnboarding = onboarding === "true";

  const insets = useSafeAreaInsets();

  const refreshAccount = useAuthStore((state) => state.refreshAccount);
  const { createStudentProfile, updateTimezone } = useAccountStore();

  const [step, setStep] = useState<"name" | "grade" | "subject">("name");
  const [name, setName] = useState("");
  const [grade, setGrade] = useState<string>("3"); // Default to 3rd grade
  const [subjects, setSubjects] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  const totalSteps = isOnboarding ? 3 : 2;
  const stepIndex = step === "name" ? 0 : step === "grade" ? 1 : 2;

  const canContinue =
    (step === "name" && name.trim().length >= 2) ||
    step === "grade" || // Grade is always selected with wheel picker
    (step === "subject" && subjects.length > 0);

  const toggleSubject = (value: string) => {
    setSubjects((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value],
    );
  };

  const handleNext = async () => {
    if (step === "name") {
      if (name.trim().length < 2) {
        setError("Name must be at least 2 characters");
        return;
      }
      setError("");
      setStep("grade");
    } else if (step === "grade") {
      if (isOnboarding) {
        // Go to subject step for onboarding
        setStep("subject");
      } else {
        // Create profile directly for add-student flow
        await createProfile();
      }
    } else if (step === "subject") {
      // Create profile with subject
      await createProfile();
    }
  };

  const createProfile = async () => {
    setIsCreating(true);

    const metadata = JSON.stringify({
      grade: grade || undefined,
      ...(subjects.length > 0 && { subjects }),
    });
    const { error: createError } = await createStudentProfile(
      name.trim(),
      metadata,
    );

    if (createError) {
      Alert.alert("Error", createError);
      setIsCreating(false);
      return;
    }

    await refreshAccount();

    if (isOnboarding) {
      // Update timezone
      try {
        const deviceTimezone = getTimeZone();
        await updateTimezone(deviceTimezone);
      } catch (err) {
        console.error("Error updating timezone:", err);
      }

      // Initialize entity
      try {
        await client.POST("/api/lms/accounts/initialize-entity/", {
          body: {
            platform: "mobile",
          },
        });
      } catch (err) {
        console.error("Error initializing entity:", err);
      }

      // Use self-healing navigation to determine next step
      const { checkPremiumStatus } = usePurchasesStore.getState();
      const isPremium = await checkPremiumStatus();
      const account = useAuthStore.getState().account;

      const step = getRequiredStep(account, isPremium, true);
      const route = getRouteForStep(step, true);

      router.replace(route as any);
    } else {
      router.back();
    }
  };

  const handleBack = () => {
    if (step === "subject") {
      setStep("grade");
    } else if (step === "grade") {
      setStep("name");
    } else if (isOnboarding) {
      // Can't go back during onboarding
      return;
    } else if (name || grade) {
      Alert.alert(
        "Discard Changes",
        "Are you sure you want to discard this new profile?",
        [
          { text: "Keep Editing", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => router.back(),
          },
        ],
      );
    } else {
      router.back();
    }
  };

  const showBackButton = !isOnboarding || step !== "name";
  const title = isOnboarding ? "Set Up Profile" : "Add Student";
  const buttonText =
    step === "name"
      ? "Continue"
      : step === "grade"
        ? isOnboarding
          ? "Continue"
          : "Create Profile"
        : "Create Profile";

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-white"
    >
      <View className="flex-1 bg-white" style={{ paddingTop: insets.top }}>
        {/* Header */}
        <View className="flex-row items-center px-6 py-4 border-b border-neutral-100">
          {showBackButton ? (
            <Pressable
              onPress={handleBack}
              className="w-10 h-10 items-center justify-center rounded-full bg-neutral-100 mr-4"
            >
              <ArrowLeft size={20} color="#000" />
            </Pressable>
          ) : (
            <View className="w-10 h-10 mr-4" />
          )}
          <Text className="text-xl font-bold text-black">{title}</Text>
        </View>

        {/* Progress indicator */}
        <View className="flex-row gap-2 px-6 pt-4">
          {Array.from({ length: totalSteps }).map((_, index) => (
            <View
              key={index}
              className={`h-1.5 flex-1 rounded-full ${
                index <= stepIndex ? "bg-black" : "bg-neutral-200"
              }`}
            />
          ))}
        </View>

        <ScrollView
          className="flex-1 px-6"
          contentContainerStyle={{ paddingBottom: 24, paddingTop: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {step === "name" && (
            <View className="gap-6">
              <View className="gap-2">
                <Text className="text-3xl font-bold text-black">
                  {isOnboarding
                    ? "What's your\nchild's name?"
                    : "What's their name?"}
                </Text>
                <Text className="text-base text-neutral-500">
                  {isOnboarding
                    ? "We'll personalize their learning experience"
                    : "Enter your student's name"}
                </Text>
              </View>

              <TextInput
                value={name}
                onChange={setName}
                placeholder="Student name"
                error={!!error}
                errorMessage={error}
                autoFocus
              />
            </View>
          )}

          {step === "grade" && (
            <View className="gap-6">
              <View className="gap-2">
                <Text className="text-3xl font-bold text-black">
                  What grade is{"\n"}
                  {name} in?
                </Text>
                <Text className="text-base text-neutral-500">
                  Scroll to select their grade level
                </Text>
              </View>

              <View className="bg-neutral-50 rounded-2xl overflow-hidden">
                <Picker
                  selectedValue={grade}
                  onValueChange={(value) => setGrade(value)}
                  itemStyle={{ fontSize: 20, fontWeight: "500" }}
                >
                  {GRADES.map((g) => (
                    <Picker.Item
                      key={g.value}
                      label={g.label}
                      value={g.value}
                    />
                  ))}
                </Picker>
              </View>
            </View>
          )}

          {step === "subject" && (
            <View className="gap-6">
              <View className="gap-2">
                <Text className="text-3xl font-bold text-black">
                  What subjects need{"\n"}the most help?
                </Text>
                <Text className="text-base text-neutral-500">
                  Select all that apply
                </Text>
              </View>

              <View className="gap-3">
                {SUBJECTS.map((s, index) => (
                  <SelectCard
                    key={s.value}
                    label={s.label}
                    emoji={s.emoji}
                    selected={subjects.includes(s.value)}
                    onPress={() => toggleSubject(s.value)}
                    index={index}
                  />
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        {/* Bottom Button */}
        <View
          className="px-6 py-4 bg-white border-t border-neutral-100"
          style={{ paddingBottom: insets.bottom + 16 }}
        >
          <Button
            variant="primary"
            size="xl"
            onPress={handleNext}
            loading={isCreating}
            disabled={!canContinue || isCreating}
            iconRight={ArrowRight}
          >
            {buttonText}
          </Button>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
