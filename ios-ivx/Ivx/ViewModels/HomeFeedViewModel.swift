//
//  HomeFeedViewModel.swift
//  Ivx
//
//  Loads the canonical investor-first home feed — the exact same block
//  sequence (3 featured deals → 1 featured project video → repeat) that the
//  landing page and Android app render.
//

import Foundation
import Observation

@Observable
final class HomeFeedViewModel {
    var blocks: [HomeFeedBlock] = []
    var isLoading = false
    var errorMessage: String?

    func load() async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        do {
            blocks = try await VideoFeedService.fetchHomeFeed()
        } catch {
            errorMessage = error.localizedDescription
            print("[HomeFeed] fetch failed: \(error.localizedDescription)")
        }
        isLoading = false
    }
}
