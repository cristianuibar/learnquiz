import { Tabs } from 'expo-router'

export default function TabLayout() {
  return (
    <Tabs initialRouteName="today" screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="today" options={{ title: 'Today' }} />
      <Tabs.Screen name="path" options={{ title: 'Path' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  )
}
