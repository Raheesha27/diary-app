import { supabase } from "@/services/supabase";
import { Ionicons } from "@expo/vector-icons";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export default function ProfileScreen() {
  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [entryCount, setEntryCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const router = useRouter();

  const loadProfile = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return;

    setEmail(user.email ?? null);

    // Load or create profile row
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.log("Profile load error:", profileError.message);
    } else if (profile) {
      setDisplayName(profile.display_name ?? "");
      setAvatarUrl(profile.avatar_url ?? null);
    } else {
      // No profile row yet — create one
      await supabase.from("profiles").insert({ id: user.id });
    }

    // Count entries
    const { count, error: countError } = await supabase
      .from("entries")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (!countError) setEntryCount(count ?? 0);

    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile]),
  );

  const saveDisplayName = async () => {
    setSavingName(true);
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return;

    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName })
      .eq("id", user.id);

    setSavingName(false);
    setEditingName(false);

    if (error) {
      Alert.alert("Error", "Could not save your name.");
    }
  };

  const pickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "We need access to your photos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });

    if (result.canceled) return;

    setUploadingAvatar(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Not logged in");

      const uri = result.assets[0].uri;
      const file = new File(uri);
      const bytes = await file.bytes();
      const fileName = `${Date.now()}.jpg`;
      const path = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, bytes, { contentType: "image/jpeg" });
      if (uploadError) throw uploadError;

      const { data: signedData, error: signError } = await supabase.storage
        .from("avatars")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signError) throw signError;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: signedData.signedUrl })
        .eq("id", user.id);
      if (updateError) throw updateError;

      setAvatarUrl(signedData.signedUrl);
    } catch (err: any) {
      Alert.alert("Upload failed", err.message ?? "Something went wrong.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace("/login");
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1D3D47" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={pickAvatar} disabled={uploadingAvatar}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
        ) : (
          <View style={styles.avatarCircle}>
            <Ionicons name="person" size={40} color="#fff" />
          </View>
        )}
        <View style={styles.avatarEditBadge}>
          {uploadingAvatar ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="camera" size={14} color="#fff" />
          )}
        </View>
      </TouchableOpacity>

      {editingName ? (
        <View style={styles.nameEditRow}>
          <TextInput
            style={styles.nameInput}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Enter your name"
            autoFocus
          />
          <TouchableOpacity onPress={saveDisplayName} disabled={savingName}>
            <Ionicons name="checkmark-circle" size={28} color="#1D3D47" />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.nameRow}
          onPress={() => setEditingName(true)}
        >
          <Text style={styles.displayName}>
            {displayName || "Add your name"}
          </Text>
          <Ionicons name="pencil" size={16} color="#888" />
        </TouchableOpacity>
      )}

      <Text style={styles.email}>{email}</Text>

      <View style={styles.statBox}>
        <Text style={styles.statNumber}>{entryCount}</Text>
        <Text style={styles.statLabel}>
          {entryCount === 1 ? "Entry" : "Entries"} Written
        </Text>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color="#c0392b" />
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    paddingTop: 60,
    backgroundColor: "#fff",
  },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  avatarCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#1D3D47",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  avatarEditBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#1D3D47",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 16,
  },
  displayName: {
    fontSize: 20,
    fontWeight: "600",
    color: "#222",
  },
  nameEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    width: "80%",
  },
  nameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
  },
  email: {
    fontSize: 14,
    color: "#888",
    marginTop: 4,
    marginBottom: 24,
  },
  statBox: {
    alignItems: "center",
    backgroundColor: "#f2f2f2",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
    marginBottom: 40,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1D3D47",
  },
  statLabel: {
    fontSize: 13,
    color: "#666",
    marginTop: 4,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#c0392b",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    gap: 8,
  },
  logoutText: {
    color: "#c0392b",
    fontWeight: "600",
    fontSize: 16,
  },
});
