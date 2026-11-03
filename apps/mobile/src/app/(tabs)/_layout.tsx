import { Tabs } from 'expo-router'

// The bar stays hidden until the Path screen replaces its placeholder; the
// Path issue switches `tabBar` to `TabBar` from '@/components/tab-bar'.
export default function TabLayout() {
  return (
    <Tabs
      initialRouteName="today"
      backBehavior="initialRoute"
      screenOptions={{ headerShown: false }}
      tabBar={() => null}
    >
      <Tabs.Screen name="today" options={{ title: 'Today' }} />
      <Tabs.Screen name="path" options={{ title: 'Path' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  )
}
