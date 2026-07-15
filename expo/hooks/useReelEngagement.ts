/**
 * useReelEngagement — manages likes, comments, shares, saves, and views
 * for reels with optimistic updates and server sync.
 *
 * Engagement state is keyed by reel ID and persisted to the backend.
 * Optimistic updates are rolled back if the API call fails.
 */
import { useCallback, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import {
  toggleProjectLike,
  trackProjectShare,
  fetchProjectComments,
  addProjectComment,
  deleteProjectComment,
  type ProjectComment,
} from '@/lib/project-engagement';
import {
  toggleVideoSave,
  trackVideoEvent,
  getViewerId,
} from '@/lib/video-platform';
import type { FeedVideo } from '@/lib/video-feed';

export interface EngagementState {
  likeCount: number;
  commentCount: number;
  shareCount: number;
  saveCount: number;
  liked: boolean;
  saved: boolean;
  following: boolean;
}

export interface ReelEngagementAPI {
  engagements: Record<string, EngagementState>;
  initEngagements: (videos: FeedVideo[]) => void;
  handleLike: (video: FeedVideo, userId: string | null) => void;
  handleDoubleTapLike: (video: FeedVideo, userId: string | null) => void;
  handleSave: (video: FeedVideo, viewerId: string | null) => void;
  handleShare: (video: FeedVideo, userId: string | null, shareType: string) => void;
  handleView: (video: FeedVideo) => void;
  trackWatch: (video: FeedVideo, watchMs: number) => void;
}

function defaultEngagement(video: FeedVideo): EngagementState {
  return {
    likeCount: video.like_count ?? 0,
    commentCount: video.comment_count ?? 0,
    shareCount: video.share_count ?? 0,
    saveCount: video.save_count ?? 0,
    liked: false,
    saved: false,
    following: false,
  };
}

export function useReelEngagement(): ReelEngagementAPI {
  const [engagements, setEngagements] = useState<Record<string, EngagementState>>({});
  const viewSessionRef = useRef<Set<string>>(new Set());

  const initEngagements = useCallback((videos: FeedVideo[]) => {
    setEngagements((prev) => {
      const next = { ...prev };
      for (const v of videos) {
        if (!next[v.id]) next[v.id] = defaultEngagement(v);
      }
      return next;
    });
  }, []);

  const handleLike = useCallback((video: FeedVideo, userId: string | null) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Optimistic update
    setEngagements((prev) => {
      const cur = prev[video.id] ?? defaultEngagement(video);
      return {
        ...prev,
        [video.id]: {
          ...cur,
          liked: !cur.liked,
          likeCount: cur.likeCount + (cur.liked ? -1 : 1),
        },
      };
    });

    // Server sync with rollback
    void toggleProjectLike(video.id, userId)
      .then((result) => {
        setEngagements((prev) => ({
          ...prev,
          [video.id]: {
            ...(prev[video.id] as EngagementState),
            liked: result.liked,
            likeCount: result.likeCount,
          },
        }));
      })
      .catch(() => {
        // Rollback
        setEngagements((prev) => {
          const cur = prev[video.id] ?? defaultEngagement(video);
          return {
            ...prev,
            [video.id]: {
              ...cur,
              liked: !cur.liked,
              likeCount: cur.likeCount + (cur.liked ? -1 : 1),
            },
          };
        });
      });
  }, []);

  const handleDoubleTapLike = useCallback(
    (video: FeedVideo, userId: string | null) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      void trackVideoEvent('double_tap_like', video.id);
      const cur = engagements[video.id];
      if (!cur || !cur.liked) {
        handleLike(video, userId);
      }
    },
    [engagements, handleLike],
  );

  const handleSave = useCallback((video: FeedVideo, viewerId: string | null) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    setEngagements((prev) => {
      const cur = prev[video.id] ?? defaultEngagement(video);
      return {
        ...prev,
        [video.id]: {
          ...cur,
          saved: !cur.saved,
          saveCount: cur.saveCount + (cur.saved ? -1 : 1),
        },
      };
    });

    void toggleVideoSave(video.id, viewerId)
      .then((result) => {
        setEngagements((prev) => ({
          ...prev,
          [video.id]: {
            ...(prev[video.id] as EngagementState),
            saved: result.saved,
            saveCount: result.saveCount,
          },
        }));
      })
      .catch(() => {
        setEngagements((prev) => {
          const cur = prev[video.id] ?? defaultEngagement(video);
          return {
            ...prev,
            [video.id]: {
              ...cur,
              saved: !cur.saved,
              saveCount: cur.saveCount + (cur.saved ? -1 : 1),
            },
          };
        });
      });
  }, []);

  const handleShare = useCallback(
    (video: FeedVideo, userId: string | null, shareType: string) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      setEngagements((prev) => {
        const cur = prev[video.id] ?? defaultEngagement(video);
        return {
          ...prev,
          [video.id]: { ...cur, shareCount: cur.shareCount + 1 },
        };
      });

      void trackProjectShare(video.id, shareType as never, userId)
        .then((result) => {
          setEngagements((prev) => ({
            ...prev,
            [video.id]: {
              ...(prev[video.id] as EngagementState),
              shareCount: result.shareCount,
            },
          }));
        })
        .catch(() => {
          setEngagements((prev) => {
            const cur = prev[video.id] ?? defaultEngagement(video);
            return {
              ...prev,
              [video.id]: { ...cur, shareCount: Math.max(0, cur.shareCount - 1) },
            };
          });
        });
    },
    [],
  );

  const handleView = useCallback((video: FeedVideo) => {
    // One view-count session per reel per feed session
    if (viewSessionRef.current.has(video.id)) return;
    viewSessionRef.current.add(video.id);
    void trackVideoEvent('view', video.id);
  }, []);

  const trackWatch = useCallback((video: FeedVideo, watchMs: number) => {
    void trackVideoEvent('watch', video.id, { watch_ms: watchMs });
  }, []);

  return {
    engagements,
    initEngagements,
    handleLike,
    handleDoubleTapLike,
    handleSave,
    handleShare,
    handleView,
    trackWatch,
  };
}
