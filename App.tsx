import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { StatusBar } from "expo-status-bar";
import "./src/i18n/i18n"; // side-effect import: configures i18next before anything renders
import { useTranslation } from "react-i18next";
import { ensureSignedIn } from "./src/auth/AuthService";

/**
 * Starting point only. This just proves the wiring (i18n + auth) works end
 * to end; the real screens (Home, TripDetail, PartyDetail, trash, etc.)
 * still need to be built here, translated from reference/web-prototype/jabharn.jsx
 * — see docs/GETTING_STARTED.md for the suggested order.
 */
export default function App() {
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ensureSignedIn()
      .then(() => setReady(true))
      .catch((e) => setError(e.message ?? String(e)));
  }, []);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>
          Auth setup needed: fill in src/firebase/firebaseConfig.ts with your
          real Firebase project keys first.
        </Text>
        <Text style={styles.errorDetail}>{error}</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <StatusBar style="dark" />
      <Text style={styles.title}>{t("app.nameLocal")}</Text>
      <Text style={styles.tagline}>{t("app.tagline")}</Text>
      <Text style={styles.todo}>
        ✅ i18n + auth wired up. Next: build the real screens — see
        docs/GETTING_STARTED.md
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F3EE",
    padding: 24,
  },
  title: { fontSize: 28, fontWeight: "700", color: "#1E2A26" },
  tagline: { fontSize: 14, color: "#5B685F", marginTop: 4 },
  todo: { fontSize: 12, color: "#1F6F54", marginTop: 24, textAlign: "center" },
  error: { fontSize: 14, color: "#B8352E", textAlign: "center" },
  errorDetail: { fontSize: 11, color: "#5B685F", marginTop: 8, textAlign: "center" },
});
