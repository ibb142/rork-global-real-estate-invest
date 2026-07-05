//
//  VideoFeedViewModel.swift
//  Ivx
//
//  Loads the live production video feed (pinned property reels first).
//

import Foundation
import Observation

@Observable
final class VideoFeedViewModel {
    var videos: [FeedVideo] = []
    var isLoading = false
    var errorMessage: String?

    /// Videos attached to a JV deal — these render as Instagram-style property cards.
    var dealVideos: [FeedVideo] {
        videos.filter { $0.deal != nil }
    }

    func load() async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        do {
            videos = try await VideoFeedService.fetchFeed()
        } catch {
            errorMessage = error.localizedDescription
            print("[VideoFeed] fetch failed: \(error.localizedDescription)")
        }
        isLoading = false
    }
}
