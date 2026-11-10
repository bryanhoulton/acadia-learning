import React, { useState } from 'react';

import { router } from 'expo-router';
import {
  ArrowLeft,
  Check,
  Heart,
  Plus,
  Send,
  Settings,
  Star,
  Trash,
} from 'lucide-react-native';
import {
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ActionIcon,
  Button,
  PhoneInput,
  Select,
  type SelectOption,
  TextInput,
  VerificationCodeInput,
} from '@/components/ui';
import { Logo } from '@/components/ui/logo';

const SAMPLE_OPTIONS: SelectOption<string>[] = [
  { label: "Option 1", value: "1" },
  { label: "Option 2", value: "2" },
  { label: "Option 3", value: "3" },
];

export default function ComponentShowcaseScreen() {
  const insets = useSafeAreaInsets();

  // Demo state
  const [textValue, setTextValue] = useState("");
  const [phoneValue, setPhoneValue] = useState("");
  const [fullPhoneValue, setFullPhoneValue] = useState("");
  const [codeValue, setCodeValue] = useState("");
  const [selectValue, setSelectValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLoadingDemo = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 2000);
  };

  return (
    <View className="flex-1 bg-white" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="px-4 pb-4 bg-white border-b border-neutral-200">
        <View className="flex-row items-center gap-3 mb-2">
          <ActionIcon
            onPress={() => router.back()}
            variant="subtle"
            size="sm"
            icon={ArrowLeft}
          />
          <Text className="text-2xl font-bold text-neutral-900">
            Component Showcase
          </Text>
        </View>
        <Text className="text-sm text-neutral-600 ml-12">
          All UI components with NativeWind styling
        </Text>
      </View>

      {/* Content */}
      <ScrollView className="flex-1 bg-neutral-50">
        <View className="p-4 gap-8">
          {/* Logo Section */}
          <Section title="Logo">
            <View className="flex-row gap-6 items-center justify-center flex-wrap">
              <View className="items-center gap-2">
                <Logo variant="primary" width={80} height={80} />
                <Text className="text-xs text-neutral-600">Primary</Text>
              </View>
              <View className="items-center gap-2 bg-primary-500 p-4 rounded-lg">
                <Logo variant="white" width={80} height={80} />
                <Text className="text-xs text-white">White</Text>
              </View>
            </View>
          </Section>

          {/* Button Section */}
          <Section title="Buttons">
            <View className="gap-4">
              {/* Variants */}
              <SubSection title="Variants">
                <View className="gap-3">
                  <Button variant="primary" size="md">
                    Primary Button
                  </Button>
                  <Button variant="subtle" size="md">
                    Subtle Button
                  </Button>
                  <Button variant="default" size="md">
                    Default Button
                  </Button>
                </View>
              </SubSection>

              {/* Sizes */}
              <SubSection title="Sizes">
                <View className="gap-3">
                  <Button variant="primary" size="sm">
                    Small Button
                  </Button>
                  <Button variant="primary" size="md">
                    Medium Button
                  </Button>
                  <Button variant="primary" size="lg">
                    Large Button
                  </Button>
                </View>
              </SubSection>

              {/* With Icons */}
              <SubSection title="With Icons">
                <View className="gap-3">
                  <Button variant="primary" size="md" iconLeft={Plus}>
                    Add Item
                  </Button>
                  <Button variant="default" size="md" iconRight={Send}>
                    Send Message
                  </Button>
                  <Button
                    variant="subtle"
                    size="md"
                    iconLeft={Check}
                    iconRight={Star}
                  >
                    Both Icons
                  </Button>
                </View>
              </SubSection>

              {/* States */}
              <SubSection title="States">
                <View className="gap-3">
                  <Button
                    variant="primary"
                    size="md"
                    loading={loading}
                    onPress={handleLoadingDemo}
                  >
                    {loading ? "Loading..." : "Click to Load"}
                  </Button>
                  <Button variant="primary" size="md" disabled>
                    Disabled Button
                  </Button>
                </View>
              </SubSection>
            </View>
          </Section>

          {/* Action Icons */}
          <Section title="Action Icons">
            <View className="gap-4">
              {/* Variants */}
              <SubSection title="Variants">
                <View className="flex-row gap-3 flex-wrap">
                  <ActionIcon variant="primary" size="md" icon={Heart} />
                  <ActionIcon variant="subtle" size="md" icon={Settings} />
                  <ActionIcon variant="default" size="md" icon={Plus} />
                </View>
              </SubSection>

              {/* Sizes */}
              <SubSection title="Sizes">
                <View className="flex-row gap-3 items-center flex-wrap">
                  <ActionIcon variant="primary" size="sm" icon={Heart} />
                  <ActionIcon variant="primary" size="md" icon={Heart} />
                  <ActionIcon variant="primary" size="lg" icon={Heart} />
                </View>
              </SubSection>

              {/* States */}
              <SubSection title="States">
                <View className="flex-row gap-3 flex-wrap">
                  <ActionIcon variant="primary" size="md" icon={Check} />
                  <ActionIcon
                    variant="primary"
                    size="md"
                    icon={Trash}
                    disabled
                  />
                </View>
              </SubSection>
            </View>
          </Section>

          {/* Text Input */}
          <Section title="Text Input">
            <View className="gap-4">
              <SubSection title="Basic">
                <TextInput
                  label="Name"
                  value={textValue}
                  onChange={setTextValue}
                  placeholder="Enter your name"
                />
              </SubSection>

              <SubSection title="With Error">
                <TextInput
                  label="Email"
                  value=""
                  onChange={() => {}}
                  placeholder="Enter your email"
                  error={true}
                  errorMessage="This field is required"
                />
              </SubSection>

              <SubSection title="Disabled">
                <TextInput
                  label="Disabled Field"
                  value="Can't edit this"
                  onChange={() => {}}
                  disabled
                />
              </SubSection>
            </View>
          </Section>

          {/* Phone Input */}
          <Section title="Phone Input">
            <PhoneInput
              value={phoneValue}
              onChange={(value, fullNumber) => {
                setPhoneValue(value);
                setFullPhoneValue(fullNumber);
              }}
              placeholder="Phone number"
              variant="default"
              size="md"
            />
            {fullPhoneValue && (
              <Text className="text-sm text-neutral-600 mt-2">
                Full number: {fullPhoneValue}
              </Text>
            )}
          </Section>

          {/* Verification Code Input */}
          <Section title="Verification Code Input">
            <VerificationCodeInput
              value={codeValue}
              onChange={setCodeValue}
              length={6}
              variant="default"
            />
            {codeValue && (
              <Text className="text-sm text-neutral-600 mt-2">
                Code: {codeValue}
              </Text>
            )}
          </Section>

          {/* Select */}
          <Section title="Select">
            <View className="gap-4">
              <SubSection title="Basic">
                <Select
                  label="Choose an option"
                  value={selectValue}
                  onChange={setSelectValue}
                  options={SAMPLE_OPTIONS}
                  placeholder="Select something..."
                />
              </SubSection>

              <SubSection title="With Error">
                <Select
                  label="Required Field"
                  value={null}
                  onChange={() => {}}
                  options={SAMPLE_OPTIONS}
                  placeholder="Please select..."
                  error={true}
                  errorMessage="This field is required"
                />
              </SubSection>

              <SubSection title="Disabled">
                <Select
                  label="Disabled Select"
                  value="1"
                  onChange={() => {}}
                  options={SAMPLE_OPTIONS}
                  disabled
                />
              </SubSection>
            </View>
          </Section>

          {/* Color Palette */}
          <Section title="Color Palette">
            <View className="gap-3">
              <ColorSwatch label="Primary" className="bg-primary-500" />
              <ColorSwatch label="Success" className="bg-success-500" />
              <ColorSwatch label="Error" className="bg-error-500" />
              <ColorSwatch label="Warning" className="bg-warning-500" />
              <ColorSwatch label="Info" className="bg-info-500" />
              <ColorSwatch
                label="Neutral 50"
                className="bg-neutral-50"
                textColor="text-neutral-900"
              />
              <ColorSwatch label="Neutral 500" className="bg-neutral-500" />
              <ColorSwatch label="Neutral 900" className="bg-neutral-900" />
            </View>
          </Section>

          {/* Typography */}
          <Section title="Typography">
            <View className="gap-3">
              <Text className="text-4xl font-bold text-neutral-900">
                Heading 1
              </Text>
              <Text className="text-3xl font-bold text-neutral-900">
                Heading 2
              </Text>
              <Text className="text-2xl font-bold text-neutral-900">
                Heading 3
              </Text>
              <Text className="text-xl font-semibold text-neutral-900">
                Heading 4
              </Text>
              <Text className="text-lg font-semibold text-neutral-900">
                Heading 5
              </Text>
              <Text className="text-base text-neutral-700">
                Body text - Regular
              </Text>
              <Text className="text-base font-semibold text-neutral-900">
                Body text - Semibold
              </Text>
              <Text className="text-sm text-neutral-600">Small text</Text>
              <Text className="text-xs text-neutral-500">Extra small text</Text>
            </View>
          </Section>

          {/* Bottom Padding */}
          <View style={{ paddingBottom: insets.bottom + 16 }} />
        </View>
      </ScrollView>
    </View>
  );
}

// Helper Components
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-4">
      <Text className="text-lg font-bold text-neutral-900 px-2">{title}</Text>
      <View className="bg-white rounded-xl p-4 border border-neutral-300">
        {children}
      </View>
    </View>
  );
}

function SubSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold text-neutral-700">{title}</Text>
      {children}
    </View>
  );
}

function ColorSwatch({
  label,
  className,
  textColor = "text-white",
}: {
  label: string;
  className: string;
  textColor?: string;
}) {
  return (
    <View
      className={`h-12 rounded-lg items-center justify-center ${className}`}
    >
      <Text className={`font-semibold ${textColor}`}>{label}</Text>
    </View>
  );
}
