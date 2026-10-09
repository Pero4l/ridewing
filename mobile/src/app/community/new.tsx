import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";

import { ErrorBanner } from "@/components/auth";
import { Button, Card, Field, T } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import type { Community } from "@/lib/types";

export default function NewCommunityScreen() {
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [joinPolicy, setJoinPolicy] = useState<"open" | "request">("open");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return () => setBusy(false);
  }, []);

  async function onCreate() {
    setError(null);
    setBusy(true);
    try {
      const res = await api.post<{ community: Community }>("/api/communities", {
        name: name.trim(),
        bio: bio.trim() || undefined,
        joinPolicy,
      });
      router.replace(`/community/${res.community.slug}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the group.");
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Card className="gap-3.5">
        <Field
          label="Group name"
          value={name}
          onChangeText={setName}
          placeholder="Midnight Riders"
          hint="At least 3 characters."
        />
        <Field
          label="About"
          value={bio}
          onChangeText={setBio}
          placeholder="Who rides with us, and where."
          multiline
          numberOfLines={4}
          // Inline on purpose: <Field> sets its own `className` on the TextInput, so a
          // className cannot be forwarded through it. Kept verbatim to avoid changing
          // how this input renders.
          style={{ minHeight: 90, textAlignVertical: "top" }}
        />

        <View className="gap-2">
          <T size={13} weight="600" muted>
            Who can join
          </T>
          <View className="flex-row gap-2.5">
            <Button
              label="Anyone"
              variant={joinPolicy === "open" ? "primary" : "secondary"}
              className="flex-1"
              onPress={() => setJoinPolicy("open")}
            />
            <Button
              label="Approve each"
              variant={joinPolicy === "request" ? "primary" : "secondary"}
              className="flex-1"
              onPress={() => setJoinPolicy("request")}
            />
          </View>
          <T size={12} muted>
            {joinPolicy === "open"
              ? "Anyone can join straight away."
              : "New members wait for a moderator to approve them."}
          </T>
        </View>

        <ErrorBanner message={error} />

        <Button
          label="Create group"
          onPress={onCreate}
          loading={busy}
          disabled={name.trim().length < 3}
        />
      </Card>
    </ScrollView>
  );
}