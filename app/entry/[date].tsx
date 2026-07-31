import { getLocalEntryByDate, upsertLocalEntry } from "@/services/localdb";
import { supabase } from "@/services/supabase";
import { Ionicons } from "@expo/vector-icons";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

function moodEmoji(mood: string): string {
  const map: Record<string, string> = {
    happy: "😊",
    sad: "😢",
    anxious: "😰",
    calm: "😌",
    excited: "🎉",
    angry: "😠",
    grateful: "🙏",
    reflective: "🤔",
    neutral: "😐",
  };
  return map[mood] ?? "📝";
}

export default function EntryScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const router = useRouter();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [existingEntryId, setExistingEntryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [mood, setMood] = useState<string | null>(null);

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);
  const audioPlayer = useAudioPlayer(audioUri ?? undefined);
  const playerStatus = useAudioPlayerStatus(audioPlayer);

  // --- LOAD EXISTING ENTRY ---
  useEffect(() => {
    const loadEntry = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) {
        setLoading(false);
        return;
      }

      // Check local DB first — works even with no network
      const localRow: any = await getLocalEntryByDate(userId, date as string);
      if (localRow) {
        setExistingEntryId(localRow.id);
        setCaption(localRow.caption ?? "");
        setImageUri(
          localRow.image_remote_url ?? localRow.image_local_uri ?? null,
        );
        setAudioUri(
          localRow.audio_remote_url ?? localRow.audio_local_uri ?? null,
        );
        setIsEditing(false);
        setLoading(false);
      } else {
        setIsEditing(true);
        setLoading(false);
      }

      // Then try Supabase, to catch anything newer
      try {
        const { data, error } = await supabase
          .from("entries")
          .select("*")
          .eq("user_id", userId)
          .eq("entry_date", date)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          setExistingEntryId(data.id);
          setCaption(data.caption ?? "");
          setImageUri(data.image_url ?? null);
          setAudioUri(data.audio_url ?? null);
          setIsEditing(false);
          if (data.ai_mood) setMood(data.ai_mood);

          await upsertLocalEntry({
            id: data.id,
            user_id: userId,
            entry_date: date as string,
            caption: data.caption,
            image_local_uri: null,
            image_remote_url: data.image_url,
            audio_local_uri: null,
            audio_remote_url: data.audio_url,
            sync_status: "synced",
          });
        }
      } catch (err) {
        console.log(
          "Supabase fetch failed (likely offline) — using local data only:",
          err,
        );
      }

      setLoading(false);
    };
    loadEntry();
  }, [date]);

  // --- IMAGE PICKING ---
  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission needed",
        "We need access to your photos to add an image.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsEditing: true,
    });
    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
    }
  };

  // --- AUDIO RECORDING ---
  const startRecording = async () => {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Permission needed",
          "We need microphone access to record a voice note.",
        );
        return;
      }
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
    } catch {
      Alert.alert("Error", "Could not start recording.");
    }
  };

  const stopRecording = async () => {
    await audioRecorder.stop();
    setAudioUri(audioRecorder.uri);
  };

  const togglePlayback = async () => {
    if (playerStatus.playing) {
      audioPlayer.pause();
    } else {
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
      });
      audioPlayer.seekTo(0);
      audioPlayer.play();
    }
  };

  // --- UPLOAD HELPERS ---
  const uploadFile = async (uri: string, bucket: string, fileExt: string) => {
    const file = new File(uri);
    const bytes = await file.bytes();
    const fileName = `${Date.now()}.${fileExt}`;
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    const path = `${userId}/${fileName}`;
    const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
      contentType: fileExt === "jpg" ? "image/jpeg" : "audio/m4a",
    });
    if (error) throw error;
    const { data, error: urlError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    if (urlError) throw urlError;
    return data.signedUrl;
  };

  const isLocalUri = (uri: string | null) => !!uri && !uri.startsWith("http");

  // --- MOOD ANALYSIS ---
  const analyzeMood = async (caption: string, entryId: string) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token || !caption.trim()) return;

      const response = await fetch(
        "https://cnhgenchxdmzomaaggec.supabase.co/functions/v1/analyze-mood",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ caption }),
        },
      );

      const result = await response.json();
      if (result.mood) {
        setMood(result.mood);
        await supabase
          .from("entries")
          .update({ ai_mood: result.mood })
          .eq("id", entryId);
      }
    } catch (err) {
      console.log("Mood analysis failed (non-blocking):", err);
    }
  };

  // --- SAVE ---
  const handleSave = async () => {
    if (!caption && !imageUri && !audioUri) {
      Alert.alert(
        "Empty entry",
        "Add a photo, caption, or voice note before saving.",
      );
      return;
    }

    setSaving(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) throw new Error("Not logged in");

      try {
        let imageUrl: string | null = imageUri;
        let audioUrl: string | null = audioUri;

        if (isLocalUri(imageUri)) {
          imageUrl = await uploadFile(
            imageUri as string,
            "entry-images",
            "jpg",
          );
        }
        if (isLocalUri(audioUri)) {
          audioUrl = await uploadFile(audioUri as string, "entry-audio", "m4a");
        }

        let dbError;
        let newId = existingEntryId;
        if (existingEntryId) {
          const { error } = await supabase
            .from("entries")
            .update({
              caption,
              image_url: imageUrl,
              audio_url: audioUrl,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingEntryId);
          dbError = error;
        } else {
          const { data, error } = await supabase
            .from("entries")
            .insert({
              user_id: userId,
              entry_date: date,
              caption,
              image_url: imageUrl,
              audio_url: audioUrl,
            })
            .select()
            .single();
          dbError = error;
          newId = data?.id ?? null;
        }

        if (dbError) throw dbError;

        await upsertLocalEntry({
          id: newId as string,
          user_id: userId,
          entry_date: date as string,
          caption,
          image_local_uri: null,
          image_remote_url: imageUrl,
          audio_local_uri: null,
          audio_remote_url: audioUrl,
          sync_status: "synced",
        });

        setImageUri(imageUrl);
        setAudioUri(audioUrl);
        setExistingEntryId(newId);
        setIsEditing(false);
        if (caption.trim() && newId) {
          analyzeMood(caption, newId as string);
        }
      } catch (onlineErr) {
        console.log(
          "Online save failed, falling back to local-only save:",
          onlineErr,
        );
        const localId = existingEntryId ?? Crypto.randomUUID();
        await upsertLocalEntry({
          id: localId,
          user_id: userId,
          entry_date: date as string,
          caption,
          image_local_uri: isLocalUri(imageUri) ? imageUri : null,
          image_remote_url: isLocalUri(imageUri) ? null : imageUri,
          audio_local_uri: isLocalUri(audioUri) ? audioUri : null,
          audio_remote_url: isLocalUri(audioUri) ? null : audioUri,
          sync_status: "pending",
        });
        setExistingEntryId(localId);
        setIsEditing(false);
        Alert.alert(
          "Saved offline",
          "No internet connection right now — your entry is saved on this device and will sync automatically once you're back online.",
        );
      }
    } catch (err: any) {
      Alert.alert("Save failed", err.message ?? "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1D3D47" />
      </View>
    );
  }

  // --- VIEW MODE ---
  if (!isEditing) {
    return (
      <View style={styles.viewContainer}>
        <ScrollView contentContainerStyle={styles.viewContent}>
          <Text style={styles.dateLabel}>{date}</Text>

          {mood && (
            <Text style={styles.moodTag}>
              {moodEmoji(mood)} {mood}
            </Text>
          )}

          {imageUri && (
            <Image source={{ uri: imageUri }} style={styles.postImage} />
          )}

          {audioUri && (
            <TouchableOpacity
              style={styles.audioPlayerBar}
              onPress={togglePlayback}
            >
              <Ionicons
                name={playerStatus.playing ? "pause-circle" : "play-circle"}
                size={36}
                color="#1D3D47"
              />
              <Text style={styles.audioPlayerText}>
                {playerStatus.playing ? "Playing voice note..." : "Voice note"}
              </Text>
            </TouchableOpacity>
          )}

          {caption ? <Text style={styles.postCaption}>{caption}</Text> : null}
        </ScrollView>

        <TouchableOpacity
          style={styles.editFab}
          onPress={() => setIsEditing(true)}
        >
          <Ionicons name="pencil" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  }

  // --- EDIT MODE ---
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.dateLabel}>{date}</Text>

      <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.image} />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="image-outline" size={40} color="#999" />
            <Text style={styles.imagePlaceholderText}>Tap to add a photo</Text>
          </View>
        )}
      </TouchableOpacity>

      <TextInput
        style={styles.captionInput}
        placeholder="Write about your day..."
        placeholderTextColor="#999"
        value={caption}
        onChangeText={setCaption}
        multiline
      />

      <View style={styles.audioSection}>
        <Text style={styles.audioLabel}>Voice note (optional)</Text>
        <View style={styles.audioButtons}>
          {!recorderState.isRecording ? (
            <TouchableOpacity
              style={styles.audioButton}
              onPress={startRecording}
            >
              <Ionicons name="mic" size={20} color="#fff" />
              <Text style={styles.audioButtonText}>Record</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.audioButton, styles.recordingButton]}
              onPress={stopRecording}
            >
              <Ionicons name="stop" size={20} color="#fff" />
              <Text style={styles.audioButtonText}>Stop</Text>
            </TouchableOpacity>
          )}

          {audioUri && !recorderState.isRecording && (
            <TouchableOpacity
              style={styles.playButton}
              onPress={togglePlayback}
            >
              <Ionicons
                name={playerStatus.playing ? "pause" : "play"}
                size={20}
                color="#1D3D47"
              />
              <Text style={styles.playButtonText}>
                {playerStatus.playing ? "Pause" : "Play"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <TouchableOpacity
        style={styles.saveButton}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.saveButtonText}>
          {saving
            ? "Saving..."
            : existingEntryId
              ? "Update Entry"
              : "Save Entry"}
        </Text>
      </TouchableOpacity>

      {existingEntryId && (
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => setIsEditing(false)}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, paddingBottom: 60 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  viewContainer: { flex: 1, backgroundColor: "#fff" },
  viewContent: { paddingBottom: 100 },
  postImage: { width: "100%", aspectRatio: 1, backgroundColor: "#f2f2f2" },
  audioPlayerBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#f2f2f2",
    gap: 10,
  },
  audioPlayerText: { fontSize: 15, color: "#1D3D47", fontWeight: "500" },
  postCaption: {
    fontSize: 16,
    lineHeight: 22,
    color: "#222",
    paddingHorizontal: 20,
    marginTop: 16,
  },
  moodTag: {
    fontSize: 14,
    color: "#1D3D47",
    paddingHorizontal: 20,
    paddingTop: 8,
    fontWeight: "500",
  },
  editFab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#1D3D47",
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  dateLabel: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1D3D47",
    marginBottom: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  imagePicker: {
    width: "100%",
    height: 250,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 20,
    backgroundColor: "#f2f2f2",
  },
  image: { width: "100%", height: "100%" },
  imagePlaceholder: { flex: 1, justifyContent: "center", alignItems: "center" },
  imagePlaceholderText: { color: "#999", marginTop: 8 },
  captionInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: "top",
    marginBottom: 20,
  },
  audioSection: { marginBottom: 24 },
  audioLabel: { fontSize: 14, color: "#666", marginBottom: 8 },
  audioButtons: { flexDirection: "row", gap: 12 },
  audioButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1D3D47",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
  },
  recordingButton: { backgroundColor: "#c0392b" },
  audioButtonText: { color: "#fff", fontWeight: "600" },
  playButton: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1D3D47",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
  },
  playButtonText: { color: "#1D3D47", fontWeight: "600" },
  saveButton: {
    backgroundColor: "#1D3D47",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
  },
  saveButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  cancelButton: { marginTop: 12, padding: 14, alignItems: "center" },
  cancelButtonText: { color: "#999", fontSize: 15 },
});
