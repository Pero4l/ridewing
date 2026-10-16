import { useEffect } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";

/**
 * Controlled inline video, used by the feed and reels.
 *
 * The player is created once per mount and driven entirely by props:
 * `playing` starts/pauses, `muted` flips the audio. The parent renders the
 * poster underneath — the video surface only covers it once frames flow, so
 * there is never a black flash or a stuck first frame.
 */
export function FeedVideo({
  uri,
  style,
  playing,
  muted,
  contentFit = "cover",
}: {
  uri: string;
  style?: StyleProp<ViewStyle>;
  playing: boolean;
  muted: boolean;
  contentFit?: "cover" | "contain";
}) {
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = true;
    p.muted = true;
  });

  // The expo-video player is an imperative handle by design — the docs drive
  // it with direct property writes. The immutability rule assumes hook values
  // are React-managed state, which does not apply here.
  /* eslint-disable react-hooks/immutability */
  useEffect(() => {
    player.muted = muted;
  }, [player, muted]);

  useEffect(() => {
    try {
      if (playing) player.play();
      else player.pause();
    } catch {
      // Player torn down mid-transition — harmless.
    }
  }, [player, playing]);
  /* eslint-enable react-hooks/immutability */

  useEffect(() => {
    return () => {
      try {
        player.release();
      } catch {
        // Already released.
      }
    };
  }, [player]);

  return (
    <View style={style}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit={contentFit}
        nativeControls={false}
        allowsPictureInPicture={false}
      />
      {/* The parent renders the poster underneath this surface: the video
          only covers it once frames flow, so there is never a black flash. */}
    </View>
  );
}
