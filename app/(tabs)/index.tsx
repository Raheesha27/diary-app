import { getAllLocalEntryDates as getLocalEntryDates } from "@/services/localdb";
import { supabase } from "@/services/supabase";
import { syncPendingEntries } from "@/services/sync";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Calendar, DateData } from "react-native-calendars";
export default function CalendarScreen() {
  const [selectedDate, setSelectedDate] = useState("");
  const [entryDates, setEntryDates] = useState<string[]>([]);
  const router = useRouter();

  const loadEntryDates = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return;

    // Local first — works even on a cold start with no network
    const localDates = await getLocalEntryDates(userId);
    setEntryDates(localDates);

    // Then try Supabase to catch anything newer (e.g. entries from another device)
    try {
      const { data, error } = await supabase
        .from("entries")
        .select("entry_date")
        .eq("user_id", userId);

      if (error) throw error;

      const remoteDates = data.map((row) => row.entry_date);
      setEntryDates(Array.from(new Set([...localDates, ...remoteDates])));
    } catch (err) {
      console.log(
        "Could not refresh entry dates (likely offline) — using local dates only:",
        err,
      );
    }
  }, []);

  // Refetch every time this screen comes into focus (e.g. after saving an entry and navigating back)
  useFocusEffect(
    useCallback(() => {
      syncPendingEntries().then(() => {
        loadEntryDates();
      });
    }, [loadEntryDates]),
  );

  const onDayPress = (day: DateData) => {
    setSelectedDate(day.dateString);
    router.push(`/entry/${day.dateString}`);
  };

  // Build the markedDates object: dots for entry dates, highlight for selected date
  const markedDates = entryDates.reduce(
    (acc, date) => {
      acc[date] = { marked: true, dotColor: "#1D3D47" };
      return acc;
    },
    {} as Record<string, any>,
  );

  if (selectedDate) {
    markedDates[selectedDate] = {
      ...(markedDates[selectedDate] || {}),
      selected: true,
      selectedColor: "#1D3D47",
    };
  }

  return (
    <View style={styles.container}>
      <Calendar
        onDayPress={onDayPress}
        markedDates={markedDates}
        theme={{
          selectedDayBackgroundColor: "#1D3D47",
          todayTextColor: "#1D3D47",
          arrowColor: "#1D3D47",
          dotColor: "#1D3D47",
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
});
