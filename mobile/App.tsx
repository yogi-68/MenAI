import React, { useState, useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "./src/lib/supabase";
import { Session } from "@supabase/supabase-js";
import { Colors } from "./src/theme";

// Screens
import LoginScreen from "./src/screens/LoginScreen";
import ChatScreen from "./src/screens/ChatScreen";
import MoodScreen from "./src/screens/MoodScreen";
import ExercisesScreen from "./src/screens/ExercisesScreen";
import ProfileScreen from "./src/screens/ProfileScreen";

const Tab = createBottomTabNavigator();

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return null; // Splash screen could go here
  }

  if (!session) {
    return (
      <>
        <StatusBar style="dark" />
        <LoginScreen />
      </>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarActiveTintColor: Colors.primary,
            tabBarInactiveTintColor: Colors.textMuted,
            tabBarStyle: {
              backgroundColor: Colors.bgPrimary,
              borderTopColor: Colors.border,
              height: 85,
              paddingBottom: 20,
              paddingTop: 8,
            },
            tabBarLabelStyle: {
              fontSize: 11,
              fontWeight: "600",
            },
            tabBarIcon: ({ color, size }) => {
              let iconName: keyof typeof Ionicons.glyphMap = "chatbubble";

              switch (route.name) {
                case "Chat":
                  iconName = "chatbubble";
                  break;
                case "Mood":
                  iconName = "analytics";
                  break;
                case "Exercises":
                  iconName = "fitness";
                  break;
                case "Profile":
                  iconName = "person";
                  break;
              }

              return <Ionicons name={iconName} size={size} color={color} />;
            },
          })}
        >
          <Tab.Screen name="Chat" component={ChatScreen} />
          <Tab.Screen name="Mood" component={MoodScreen} />
          <Tab.Screen name="Exercises" component={ExercisesScreen} />
          <Tab.Screen
            name="Profile"
            children={() => <ProfileScreen user={session?.user} />}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </>
  );
}
