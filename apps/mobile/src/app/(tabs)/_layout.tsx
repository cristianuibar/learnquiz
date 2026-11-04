import { Tabs } from 'expo-router'
import { TabBar } from '@/components/tab-bar'

export default function TabLayout() {
  return (
    <Tabs
      initialRouteName="today"
      backBehavior="initialRoute"
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tabs.Screen name="today" options={{ title: 'Today' }} />
      <Tabs.Screen name="path" options={{ title: 'Path' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  )
}
