import {
  useEffect,
  useState,
} from 'react';

import { Picker } from '@react-native-picker/picker';
import {
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import {
  ArrowLeft,
  Trash2,
} from 'lucide-react-native';
import {
  Alert,
  ScrollView,
  Text,
  View,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { TextInput } from '@/components/ui/text-input';
import {
  parseMetadata,
  ProfileMetadata,
} from '@/constants';
import {
  useAccountStore,
  useAuthStore,
} from '@/stores';

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

// Map old grade ranges to individual grades for backward compatibility
function normalizeGrade(grade: string): string {
  const gradeMap: Record<string, string> = {
    "K-2": "1",
    "3-5": "4",
    "6-8": "7",
    "9-12": "10",
  };
  return gradeMap[grade] || grade || "3";
}

export default function ProfileDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  const account = useAuthStore((state) => state.account);
  const refreshAccount = useAuthStore((state) => state.refreshAccount);
  const updateProfile = useAccountStore((state) => state.updateProfile);
  const deleteProfile = useAccountStore((state) => state.deleteProfile);

  const profile = account?.profiles?.find((p) => p.id === id);
  const metadata = parseMetadata(profile?.metadata);

  const [name, setName] = useState(profile?.name || "");
  const [grade, setGrade] = useState(normalizeGrade(metadata.grade || ""));

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (!profile && account) {
      router.back();
    }
  }, [profile, account, router]);

  useEffect(() => {
    const currentMetadata = parseMetadata(profile?.metadata);
    const hasChanges =
      name !== (profile?.name || "") ||
      grade !== normalizeGrade(currentMetadata.grade || "");

    setIsDirty(hasChanges);
  }, [name, grade, profile]);

  const handleSave = async () => {
    if (!id || !profile) return;

    setIsSaving(true);

    const newMetadata: ProfileMetadata = {
      grade: grade || undefined,
    };

    const { error } = await updateProfile(id, {
      name: name || undefined,
      metadata: JSON.stringify(newMetadata),
    });

    if (error) {
      Alert.alert("Error", error);
    } else {
      await refreshAccount();
      setIsDirty(false);
      router.back();
    }
    setIsSaving(false);
  };

  const handleDelete = () => {
    const studentProfiles = account?.profiles?.filter(
      (p) => p.profile_type === "student"
    );

    if (studentProfiles && studentProfiles.length <= 1) {
      Alert.alert(
        "Cannot Delete",
        "You need at least one student profile.",
        [{ text: "OK" }]
      );
      return;
    }

    Alert.alert(
      "Delete Profile",
      `Are you sure you want to delete ${name}'s profile? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (!id) return;
            setIsDeleting(true);
            const { error } = await deleteProfile(id);
            if (error) {
              Alert.alert("Error", error);
              setIsDeleting(false);
            } else {
              await refreshAccount();
              router.back();
            }
          },
        },
      ]
    );
  };

  const handleBack = () => {
    if (isDirty) {
      Alert.alert(
        "Unsaved Changes",
        "Save your changes before leaving?",
        [
          { text: "Discard", style: "destructive", onPress: () => router.back() },
          { text: "Save", onPress: handleSave },
        ]
      );
    } else {
      router.back();
    }
  };

  if (!profile) return null;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-white"
    >
      <View 
        className="flex-1 bg-white"
        style={{ paddingTop: insets.top }}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-6 py-4 border-b border-neutral-100">
          <Pressable
            onPress={handleBack}
            className="w-10 h-10 items-center justify-center rounded-full bg-neutral-100"
          >
            <ArrowLeft size={20} color="#000" />
          </Pressable>
          <Text className="text-xl font-bold text-black">Edit Profile</Text>
          <Pressable
            onPress={handleDelete}
            disabled={isDeleting}
            className="w-10 h-10 items-center justify-center rounded-full bg-red-50"
          >
            <Trash2 size={18} color="#ef4444" />
          </Pressable>
        </View>

        <ScrollView 
          className="flex-1 px-6"
          contentContainerStyle={{ paddingBottom: 24, paddingTop: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Name Input */}
          <View className="gap-6 mb-8">
            <View className="gap-2">
              <Text className="text-sm font-semibold text-neutral-500 uppercase tracking-wide">
                Name
              </Text>
              <TextInput
                value={name}
                onChange={setName}
                placeholder="Student name"
              />
            </View>
          </View>

          {/* Grade Selection */}
          <View className="gap-4">
            <Text className="text-sm font-semibold text-neutral-500 uppercase tracking-wide">
              Grade Level
            </Text>
            <View className="bg-neutral-50 rounded-2xl overflow-hidden">
              <Picker
                selectedValue={grade}
                onValueChange={(value) => setGrade(value)}
                itemStyle={{ fontSize: 20, fontWeight: '500' }}
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
        </ScrollView>

        {/* Bottom Button */}
        {isDirty && (
          <View 
            className="px-6 py-4 bg-white border-t border-neutral-100"
            style={{ paddingBottom: insets.bottom + 16 }}
          >
            <Button
              variant="primary"
              size="xl"
              onPress={handleSave}
              loading={isSaving}
              disabled={isSaving}
            >
              Save Changes
            </Button>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
