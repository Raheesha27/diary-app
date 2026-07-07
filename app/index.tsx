import { supabase } from "@/services/supabase";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ImageBackground, StyleSheet } from "react-native";

export default function SplashScreen() {
  const router = useRouter();

  useEffect(() => {
    const checkSessionAndRedirect = async () => {
      const { data } = await supabase.auth.getSession();

      // Wait out the splash duration regardless, so it doesn't flash too fast
      await new Promise((resolve) => setTimeout(resolve, 2000));

      if (data.session) {
        router.replace("/(tabs)");
      } else {
        router.replace("/login");
      }
    };

    checkSessionAndRedirect();
  }, []);

  return (
    <ImageBackground
      source={require("@/assets/images/splash-background.png")}
      style={styles.container}
      resizeMode="cover"
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
});
