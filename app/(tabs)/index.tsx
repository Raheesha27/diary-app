import { getAllLocalEntryDates as getLocalEntryDates } from "@/services/localdb";
import { supabase } from "@/services/supabase";
import { syncPendingEntries } from "@/services/sync";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Calendar, DateData } from "react-native-calendars";

function formatDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function CalendarScreen() {
  const [selectedDate, setSelectedDate] = useState("");
  const [entryDates, setEntryDates] = useState<string[]>([]);
  const [currentMonth, setCurrentMonth] = useState(
    formatDateString(new Date()),
  );
  const [pickerType, setPickerType] = useState<"month" | "year" | null>(null);
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

  const changeMonth = (offset: number) => {
    const nextDate = new Date(currentMonth);
    nextDate.setMonth(nextDate.getMonth() + offset);
    setCurrentMonth(formatDateString(nextDate));
  };

  const selectMonth = (monthIndex: number) => {
    const nextDate = new Date(currentMonth);
    nextDate.setMonth(monthIndex);
    setCurrentMonth(formatDateString(nextDate));
    setPickerType(null);
  };

  const selectYear = (year: number) => {
    const nextDate = new Date(currentMonth);
    nextDate.setFullYear(year);
    setCurrentMonth(formatDateString(nextDate));
    setPickerType(null);
  };

  const monthOptions = useMemo(
    () => [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ],
    [],
  );

  const yearOptions = useMemo(() => {
    const currentYear = new Date(currentMonth).getFullYear();
    return Array.from({ length: 41 }, (_, index) => currentYear - 20 + index);
  }, [currentMonth]);

  const markedDates = entryDates.reduce(
    (acc, date) => {
      acc[date] = { marked: true, dotColor: "#7DD3FC" };
      return acc;
    },
    {} as Record<string, any>,
  );

  if (selectedDate) {
    markedDates[selectedDate] = {
      ...(markedDates[selectedDate] || {}),
      selected: true,
      selectedColor: "#2D6CDF",
    };
  }

  return (
    <View style={styles.container}>
      <View style={styles.calendarWrapper}>
        <Modal
          transparent
          visible={pickerType !== null}
          animationType="fade"
          onRequestClose={() => setPickerType(null)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setPickerType(null)}
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                {pickerType === "month" ? "Select month" : "Select year"}
              </Text>
              <View style={styles.optionGrid}>
                {(pickerType === "month" ? monthOptions : yearOptions).map(
                  (option, index) => (
                    <TouchableOpacity
                      key={option}
                      style={styles.optionButton}
                      onPress={() =>
                        pickerType === "month"
                          ? selectMonth(index)
                          : selectYear(option as number)
                      }
                    >
                      <Text style={styles.optionText}>{option}</Text>
                    </TouchableOpacity>
                  ),
                )}
              </View>
            </View>
          </TouchableOpacity>
        </Modal>

        <Calendar
          current={currentMonth}
          onDayPress={onDayPress}
          markedDates={markedDates}
          style={styles.calendar}
          onMonthChange={(month) => setCurrentMonth(month.dateString)}
          renderHeader={(date: any) => {
            const displayDate = new Date(date);
            const monthLabel = displayDate.toLocaleString("en-US", {
              month: "long",
            });
            const yearLabel = displayDate.getFullYear();

            return (
              <View style={styles.headerRow}>
                <TouchableOpacity
                  style={styles.navButton}
                  onPress={() => changeMonth(-1)}
                >
                  <Text style={styles.navButtonText}>‹</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.monthLabelBox}
                  onPress={() => setPickerType("month")}
                >
                  <Text style={styles.monthLabel}>{monthLabel}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.yearLabelBox}
                  onPress={() => setPickerType("year")}
                >
                  <Text style={styles.yearLabel}>{yearLabel}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.navButton}
                  onPress={() => changeMonth(1)}
                >
                  <Text style={styles.navButtonText}>›</Text>
                </TouchableOpacity>
              </View>
            );
          }}
          theme={{
            backgroundColor: "#030712",
            calendarBackground: "#030712",
            textSectionTitleColor: "#8FA1B2",
            selectedDayBackgroundColor: "#2D6CDF",
            selectedDayTextColor: "#ffffff",
            todayTextColor: "#7DD3FC",
            dayTextColor: "#F8FAFC",
            monthTextColor: "#F8FAFC",
            arrowColor: "#7DD3FC",
            dotColor: "#7DD3FC",
            textDisabledColor: "#4B5563",
            monthTextFontWeight: "700",
            textMonthFontSize: 20,
            textDayFontSize: 15,
            textDayHeaderFontSize: 13,
            "stylesheet.calendar.header": {
              week: {
                marginTop: 6,
                flexDirection: "row",
                justifyContent: "space-around",
              },
            },
          }}
          hideArrows={true}
          enableSwipeMonths={true}
          hideExtraDays={false}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#030712",
  },
  calendarWrapper: {
    flex: 1,
    backgroundColor: "#030712",
    paddingHorizontal: 2,
    paddingTop: 35,
    paddingBottom: 0,
  },
  calendar: {
    borderRadius: 0,
    paddingBottom: 0,
    height: "100%",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingTop: 10,
    paddingBottom: 12,
    marginBottom: 8,
  },
  navButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  navButtonText: {
    color: "#F8FAFC",
    fontSize: 18,
    fontWeight: "700",
  },
  monthLabelBox: {
    alignItems: "center",
    flex: 1,
    marginHorizontal: 6,
    paddingVertical: 4,
  },
  yearLabelBox: {
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  monthLabel: {
    color: "#F8FAFC",
    fontSize: 18,
    fontWeight: "700",
  },
  yearLabel: {
    color: "#7DD3FC",
    fontSize: 12,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#0F172A",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  modalTitle: {
    color: "#F8FAFC",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  optionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  optionButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#374151",
    minWidth: 90,
    alignItems: "center",
    marginBottom: 8,
  },
  optionText: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "600",
  },
});
