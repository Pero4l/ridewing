/* eslint-disable react-hooks/set-state-in-effect --
 * These screens load data on mount. The effect only *starts* an async fetch;
 * the state updates it triggers all land after an `await`, so there is no
 * synchronous setState during render. The rule cannot see across the async
 * boundary and flags the fetch helper instead.
 */
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";

import {
  Avatar,
  Badge,
  Button,
  Card,
  Divider,
  ErrorState,
  Row,
  Screen,
  Spinner,
  T,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import type { Community } from "@/lib/types";

export default function CommunityScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();

  const [community, setCommunity] = useState<Community | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ community: Community }>(`/api/communities/${slug}`);
      setCommunity(res.community);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this group.");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update the group.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Screen>
        <Spinner label="Loading group" />
      </Screen>
    );
  }

  if (error && !community) {
    return (
      <Screen>
        <ErrorState message={error} onRetry={() => void load()} />
      </Screen>
    );
  }

  if (!community) {
    return (
      <Screen>
        <T className="p-4">Group not found</T>
      </Screen>
    );
  }

  const role = community.viewerRole;
  const isMember = role !== null && community.viewerStatus === "active";
  const pending = community.viewerJoinRequestStatus === "pending";
  const canModerate = role === "owner" || role === "admin" || role === "moderator";

  return (
    <Screen>
      {/* RN ScrollView has no content-container className, so padding/gap stay inline. */}
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <Card className="gap-3">
          {community.image ? (
            <Image
              source={{ uri: community.image }}
              className="h-[140px] rounded-[12px] bg-raised"
              contentFit="cover"
              transition={150}
            />
          ) : null}

          <Row className="justify-between">
            <T size={22} weight="800" className="flex-1">
              {community.name}
            </T>
            {role ? <Badge label={role} tone="accent" /> : null}
          </Row>

          <T size={13} muted>
            {community.memberCount} members
            {community.joinPolicy === "request" ? " · approval required" : ""}
          </T>

          {community.bio ? <T size={14}>{community.bio}</T> : null}

          {error ? (
            <T size={13} tone="danger">
              {error}
            </T>
          ) : null}

          <Row gap={10}>
            {isMember ? (
              <>
                <Button
                  label="Leave"
                  variant="secondary"
                  className="flex-1"
                  loading={busy}
                  onPress={() => act(() => api.post(`/api/communities/${community.slug}/leave`))}
                />
                <Button
                  label="Open chat"
                  variant="ghost"
                  className="flex-1"
                  onPress={() => router.push("/(tabs)/messages")}
                />
              </>
            ) : pending ? (
              <Button label="Request pending" variant="secondary" disabled onPress={() => {}} />
            ) : (
              <Button
                label={community.joinPolicy === "request" ? "Request to join" : "Join group"}
                className="flex-1"
                loading={busy}
                onPress={() => act(() => api.post(`/api/communities/${community.slug}/join`))}
              />
            )}
          </Row>
        </Card>

        <Card className="gap-2.5">
          <T size={15} weight="700">
            About
          </T>
          <Divider />
          <Row gap={12}>
            {community.owner ? <Avatar user={community.owner} size={40} /> : null}
            <View>
              <T size={13} weight="600">
                {community.owner?.displayName}
              </T>
              <T size={12} muted>
                Owner · joined {relativeTime(community.createdAt)}
              </T>
            </View>
          </Row>
        </Card>

        {canModerate ? (
          <Card className="gap-2.5">
            <T size={15} weight="700">
              Moderation
            </T>
            <T size={13} muted>
              You can review join requests and manage members here.
            </T>
            <Button
              label="Review requests"
              variant="secondary"
              onPress={() => act(() => api.get(`/api/communities/${community.slug}/join-requests`))}
            />
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}