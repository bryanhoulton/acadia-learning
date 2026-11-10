import { Stack } from 'expo-router';

export default function TabLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "fade",
        animationDuration: 150,
        gestureEnabled: true,
        gestureDirection: "horizontal",
        contentStyle: { backgroundColor: '#ffffff' },
      }}
    >
      <Stack.Screen
        name="home"
        options={{
          animation: "fade",
          animationDuration: 150,
        }}
      />

      <Stack.Screen
        name="demo"
        options={{
          animation: "slide_from_right",
          animationDuration: 200,
        }}
      />

      <Stack.Screen
        name="classroom"
        options={{
          animation: "slide_from_bottom",
          animationDuration: 250,
          presentation: "fullScreenModal",
          gestureDirection: "vertical",
        }}
      />

      <Stack.Screen
        name="settings"
        options={{
          animation: "slide_from_right",
          animationDuration: 200,
        }}
      />

      <Stack.Screen
        name="blocks"
        options={{
          animation: "slide_from_right",
          animationDuration: 200,
        }}
      />
    </Stack>
  );
}
