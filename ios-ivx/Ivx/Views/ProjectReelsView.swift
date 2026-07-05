//
//  ProjectReelsView.swift
//  Ivx
//
//  Dedicated Project Reels module — full-screen Instagram-style vertical
//  video experience for construction updates, drone footage, and progress
//  videos. Opened on demand from the Reels icon on the home tab, never
//  auto-loaded on the main investor-first page.
//

import SwiftUI
import AVFoundation
import AVKit

struct ProjectReelsView: View {
    @State private var model = ProjectReelsViewModel()
    @State private var activeIndex: Int = 0
    @State private var isMuted = true
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if model.isLoading && model.videos.isEmpty {
                ProgressView()
                    .tint(.ivxGold)
                    .scaleEffect(1.2)
            } else if let error = model.errorMessage, model.videos.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.largeTitle)
                        .foregroundStyle(Color.ivxGold)
                    Text("Could not load reels")
                        .font(.headline)
                        .foregroundStyle(.white)
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.6))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }
            } else if model.videos.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "film")
                        .font(.largeTitle)
                        .foregroundStyle(Color.ivxGold)
                    Text("No reels yet")
                        .font(.headline)
                        .foregroundStyle(.white)
                    Text("New construction & progress reels will appear here.")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.6))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }
            } else {
                TabView(selection: $activeIndex) {
                    ForEach(Array(model.videos.enumerated()), id: \.element.id) { idx, video in
                        ReelSlide(video: video, isActive: idx == activeIndex, isMuted: isMuted)
                            .tag(idx)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .ignoresSafeArea()
            }

            VStack {
                header
                Spacer()
            }
        }
        .background(Color.black.ignoresSafeArea())
        .task { await model.load() }
        .refreshable { await model.load() }
        .overlay(alignment: .bottomTrailing) {
            Button {
                isMuted.toggle()
            } label: {
                Image(systemName: isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                    .font(.title3)
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(.black.opacity(0.55))
                    .clipShape(Circle())
                    .padding(.trailing, 16)
                    .padding(.bottom, 40)
            }
            .accessibilityLabel(isMuted ? "Unmute" : "Mute")
        }
    }

    private var header: some View {
        HStack {
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.title3)
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(.black.opacity(0.5))
                    .clipShape(Circle())
            }
            .accessibilityLabel("Close Project Reels")

            Text("Project Reels")
                .font(.headline)
                .fontWeight(.bold)
                .foregroundStyle(.white)

            Spacer()

            Image(systemName: "circle.grid.2x2.fill")
                .font(.title3)
                .foregroundStyle(Color.ivxGold)
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }
}

private struct ReelSlide: View {
    let video: FeedVideo
    let isActive: Bool
    let isMuted: Bool

    var body: some View {
        ZStack {
            Color.black

            if isActive, let url = video.bestPlaybackURL {
                LoopingVideoView(url: url, isMuted: isMuted)
                    .ignoresSafeArea()
            } else if let poster = video.posterURL {
                AsyncImage(url: poster) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().aspectRatio(contentMode: .fill)
                    default:
                        Color.ivxSurface
                    }
                }
                .ignoresSafeArea()
            } else {
                Color.ivxSurface.ignoresSafeArea()
            }

            VStack {
                Spacer()
                HStack(alignment: .bottom) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(video.title ?? "IVX Project Reel")
                            .font(.headline)
                            .fontWeight(.bold)
                            .foregroundStyle(.white)
                            .lineLimit(2)
                        if let deal = video.deal, let title = deal.title {
                            Text(title)
                                .font(.subheadline)
                                .foregroundStyle(Color.ivxGold)
                                .lineLimit(1)
                        }
                        Text("ivxholding.com")
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.6))
                    }
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 90)
            }
        }
    }
}

#Preview {
    ProjectReelsView()
}
