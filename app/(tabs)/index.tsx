import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import LottieView from "lottie-react-native";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";

// ----- Types & helpers -----
type Vitamin = { id: string; name: string; takenDates: string[] };

const STORAGE_KEY = "vitamins:v1";
const NOTIF_FLAG_KEY = "notif:scheduled:v1";
const todayKey = () => new Date().toDateString();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function ensureNotifPermission() {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    const res = await Notifications.requestPermissionsAsync();
    if (res.status !== "granted") return false;
  }
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("daily", {
      name: "Daily",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  return true;
}

async function scheduleDailyReminderOnce(hour = 9, minute = 0) {
  const flag = await AsyncStorage.getItem(NOTIF_FLAG_KEY);
  if (flag === "1") return; // already scheduled

  const ok = await ensureNotifPermission();
  if (!ok) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Vita Streak",
      body: "Quick win: take your vitamins and keep the streak alive!",
    },
    trigger: { hour, minute, repeats: true }, // local time
  });

  await AsyncStorage.setItem(NOTIF_FLAG_KEY, "1");
}

// ----- Screen -----
export default function HomeScreen() {
  const [vitamins, setVitamins] = useState<Vitamin[] | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [badgeMsg, setBadgeMsg] = useState<string | null>(null);
  const confettiRef = useRef<LottieView>(null);

  const defaultVitamins: Vitamin[] = [
    { id: "multi", name: "Multivitamin", takenDates: [] },
    { id: "d3", name: "Vitamin D3", takenDates: [] },
    { id: "omega3", name: "Omega-3", takenDates: [] },
  ];

  // Load persisted state
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        setVitamins(raw ? (JSON.parse(raw) as Vitamin[]) : defaultVitamins);
      } catch {
        setVitamins(defaultVitamins);
      }
    })();
  }, []);

  // Save on change
  useEffect(() => {
    if (vitamins) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(vitamins)).catch(() => {});
    }
  }, [vitamins]);

  // Schedule daily reminder once after first load
  useEffect(() => {
    if (vitamins) scheduleDailyReminderOnce(9, 0);
  }, [vitamins]);

  // Midnight tick: re-render so todayKey() updates after midnight
  useEffect(() => {
    const id = setInterval(() => {
      setVitamins((v) => (v ? [...v] : v));
    }, 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const streakFor = (v: Vitamin) => {
    if (!v.takenDates.length) return 0;
    let streak = 0;
    let cur = todayKey();
    const sorted = [...v.takenDates].sort(
      (a, b) => new Date(b).getTime() - new Date(a).getTime()
    );
    for (const date of sorted) {
      if (date === cur) {
        streak++;
        const d = new Date(cur);
        d.setDate(d.getDate() - 1);
        cur = d.toDateString();
      } else {
        break;
      }
    }
    return streak;
  };

  const markTakenToday = (id: string) => {
    if (!vitamins) return;
    const today = todayKey();

    const current = vitamins.find((v) => v.id === id)!;
    if (current.takenDates.includes(today)) {
      // already taken today → no confetti, no state change
      return;
    }

    const prevStreak = streakFor(current);

    setVitamins((vs) =>
      vs!.map((v) =>
        v.id === id ? { ...v, takenDates: [...v.takenDates, today] } : v
      )
    );

    // visual feedback
    setTimeout(() => {
      setShowConfetti(true);
      confettiRef.current?.reset();
      confettiRef.current?.play();
      setTimeout(() => setShowConfetti(false), 1200);

      const nextStreak = prevStreak + 1;
      if (nextStreak === 7) {
        setBadgeMsg("7-day streak! 🔰 Keep it going!");
        setTimeout(() => setBadgeMsg(null), 1800);
      }
    }, 50);
  };

  if (!vitamins) {
    return (
      <SafeAreaView style={s.container}>
        <ActivityIndicator />
        <Text style={{ color: "white", marginTop: 8 }}>Loading…</Text>
      </SafeAreaView>
    );
  }

  const today = todayKey();

  return (
    <SafeAreaView style={s.container}>
      <Text style={s.title}>Vita Streak</Text>

      <FlatList
        data={vitamins}
        keyExtractor={(v) => v.id}
        contentContainerStyle={{ gap: 12 }}
        renderItem={({ item }) => {
          const takenToday = item.takenDates.includes(today);
          const streak = streakFor(item);
          return (
            <View style={s.card}>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{item.name}</Text>
                <Text style={s.meta}>
                  {takenToday ? "✅ Taken today" : "⬜ Not yet"} • Streak: {streak}🔥
                </Text>
              </View>
              <Pressable
                disabled={takenToday}
                onPress={() => markTakenToday(item.id)}
                style={[
                  s.btn,
                  takenToday && s.btnDone,
                  takenToday && { opacity: 0.75 },
                ]}
              >
                <Text style={[s.btnText, takenToday && s.btnTextDone]}>
                  {takenToday ? "Great!" : "Took it"}
                </Text>
              </Pressable>
            </View>
          );
        }}
      />

      {/* Confetti overlay */}
      {showConfetti && (
        <View style={s.overlay}>
          <LottieView
            ref={confettiRef}
            source={require("../../assets/confetti.json")}
            autoPlay
            loop={false}
            style={{ width: 320, height: 320 }}
          />
        </View>
      )}

      {/* Badge toast */}
      <Modal
        transparent
        visible={!!badgeMsg}
        animationType="fade"
        onRequestClose={() => setBadgeMsg(null)}
      >
        <View style={s.modalWrap}>
          <View style={s.toast}>
            <Text style={{ color: "white", fontWeight: "700" }}>{badgeMsg}</Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ----- styles -----
const s = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#0f172a" },
  title: { fontSize: 28, fontWeight: "700", color: "white", marginBottom: 12 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#111827",
  },
  name: { color: "white", fontSize: 18, fontWeight: "600" },
  meta: { color: "#9ca3af", marginTop: 4 },
  btn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 9999,
    backgroundColor: "#22c55e",
  },
  btnDone: { backgroundColor: "#064e3b" },
  btnText: { color: "black", fontWeight: "700" },
  btnTextDone: { color: "#bbf7d0" },
  overlay: {
    position: "absolute",
    inset: 0 as any,
    alignItems: "center",
    justifyContent: "center",
  },
  modalWrap: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  toast: { paddingVertical: 12, paddingHorizontal: 16, backgroundColor: "#1f2937", borderRadius: 12 },
});
