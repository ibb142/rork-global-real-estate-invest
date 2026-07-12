//
//  ProjectReelsView.swift
//  Ivx
//
//  Full-screen IVX Reels matching ivxholding.com (ivx-reels.js).
//  Same feed, same filters, same engagement rail, same deal CTAs.
//

import SwiftUI
import AVKit

struct ProjectReelsView: View {
    @State private var model = ProjectReelsViewModel()
    @State private var activeIndex: Int = 0
    @State private var isMuted = true
    @State private var selectedDeal: JVDeal?
    @State private var channel: ReelChannel = .all
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            content
            VStack(spacing: 0) {
                header
                filterStrip
                Spacer()
            }
        }
        .background(Color.black.ignoresSafeArea())
        .task { await model.load() }
        .refreshable { await model.load() }
        .navigationDestination(item: $selectedDeal) { deal in
            JVDealDetailView(deal: deal)
        }
    }

    @ViewBuilder
    private var content: some View {
        if model.isLoading && model.videos.isEmpty {
            VStack(spacing: 12) {
                ProgressView()
                    .tint(Color.ivxGold)
                    .scaleEffect(1.2)
                Text("Loading reels…")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.7))
            }
        } else if let error = model.errorMessage, model.videos.isEmpty {
            errorView(error)
        } else if filteredVideos.isEmpty {
            emptyView
        } else {
            TabView(selection: $activeIndex) {
                ForEach(Array(filteredVideos.enumerated()), id: \.element.id) { idx, video in
                    ReelSlide(
                        video: video,
                        isActive: idx == activeIndex,
                        isMuted: isMuted,
                        onViewDeal: { openDeal(video) },
                        onInvestNow: { openDeal(video) }
                    )
                    .tag(idx)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .ignoresSafeArea()
        }
    }

    private var filteredVideos: [FeedVideo] {
        switch channel {
        case .all: return model.videos
        case .investment: return model.videos.filter { $0.deal != nil && $0.videoType != "reel" }
        case .buyer: return model.videos.filter { ($0.deal?.dealType ?? "").lowercased().contains("buy") || ($0.title ?? "").lowercased().contains("buy") }
        case .seller: return model.videos.filter { ($0.deal?.dealType ?? "").lowercased().contains("sell") || ($0.title ?? "").lowercased().contains("sell") }
        }
    }

    private var counts: (all: Int, investment: Int, buyer: Int, seller: Int) {
        let all = model.videos.count
        let investment = model.videos.filter { $0.deal != nil && $0.videoType != "reel" }.count
        let buyer = model.videos.filter { ($0.deal?.dealType ?? "").lowercased().contains("buy") || ($0.title ?? "").lowercased().contains("buy") }.count
        let seller = model.videos.filter { ($0.deal?.dealType ?? "").lowercased().contains("sell") || ($0.title ?? "").lowercased().contains("sell") }.count
        return (all, investment, buyer, seller)
    }

    private func openDeal(_ video: FeedVideo) {
        guard let dealId = video.deal?.id else { return }
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        Task {
            do {
                let deals = try await JVDealsService.fetchPublishedDeals()
                if let deal = deals.first(where: { $0.id == dealId }) {
                    await MainActor.run { selectedDeal = deal }
                }
            } catch {}
        }
    }

    private var header: some View {
        HStack {
            Text("IVX Reels")
                .font(.system(size: 22, weight: .heavy))
                .foregroundStyle(.white)
                .shadow(color: .black.opacity(0.7), radius: 3, x: 0, y: 1)

            Spacer()

            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(.black.opacity(0.5))
                    .clipShape(Circle())
            }
            .accessibilityLabel("Close")
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    private var filterStrip: some View {
        let chips: [(ReelChannel, String, Int)] = [
            (.all, "All", counts.all),
            (.investment, "Investments", counts.investment),
            (.buyer, "Buyers", counts.buyer),
            (.seller, "Sellers", counts.seller),
        ]
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(chips, id: \.0) { ch, label, count in
                    Button {
                        channel = ch
                    } label: {
                        Text("\(label) \(count)")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(channel == ch ? .black : .white)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 7)
                            .background(channel == ch ? Color.ivxGold : Color.white.opacity(0.14))
                            .clipShape(Capsule())
                    }
                }
            }
            .padding(.horizontal, 12)
        }
        .padding(.top, 8)
    }

    private func errorView(_ error: String) -> some View {
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
    }

    private var emptyView: some View {
        VStack(spacing: 12) {
            Image(systemName: "film")
                .font(.largeTitle)
                .foregroundStyle(Color.ivxGold)
            Text("No reels in this channel")
                .font(.headline)
                .foregroundStyle(.white)
            Text("Try another filter or upload new videos from the admin panel.")
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.6))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
        }
    }
}

private enum ReelChannel: String, CaseIterable, Identifiable {
    case all, investment, buyer, seller
    var id: String { rawValue }
}

private struct ReelSlide: View {
    let video: FeedVideo
    let isActive: Bool
    let isMuted: Bool
    let onViewDeal: () -> Void
    let onInvestNow: () -> Void
    @State private var engagement: ReelEngagement = .default()
    @State private var showReport = false
    @State private var showComments = false
    @State private var toast: String?
    @State private var viewerId: String = "guest-anon"

    var body: some View {
        ZStack {
            Color.black
            mediaLayer
            VStack {
                Spacer()
                overlayContent
            }
            .padding(.bottom, 28)
        }
        .task {
            viewerId = await VideoPlatformViewer.id()
            engagement = ReelEngagement(
                likeCount: video.likeCount ?? 0,
                commentCount: video.commentCount ?? 0,
                shareCount: video.shareCount ?? 0,
                saveCount: video.saveCount ?? 0,
                liked: false,
                saved: false,
                following: false
            )
        }
    }

    @ViewBuilder
    private var mediaLayer: some View {
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
            Color.ivxSurface
        }
    }

    private var overlayContent: some View {
        HStack(alignment: .bottom, spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                badgeRow
                titleBlock
                metricsRow
                investmentOptions
                ctaRow
                Text("ivxholding.com")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.white.opacity(0.5))
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            actionRail
        }
        .padding(.horizontal, 16)
    }

    private var badgeRow: some View {
        HStack(spacing: 6) {
            if video.isPinned == true {
                Text("FEATURED")
                    .reelBadge(background: Color.ivxGold, foreground: .black)
            }
            if video.videoType == "reel" {
                Text("PROJECT REEL")
                    .reelBadge(background: Color.white.opacity(0.22), foreground: .white)
            }
            if video.deal != nil {
                Text("INVESTMENT")
                    .reelBadge(background: Color.ivxGold, foreground: .black)
            }
        }
    }

    private var titleBlock: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(video.title ?? "IVX Property Video")
                .font(.system(size: 18, weight: .heavy))
                .foregroundStyle(.white)
                .lineLimit(2)
                .shadow(color: .black.opacity(0.7), radius: 4, x: 0, y: 1)
            if let deal = video.deal, let title = deal.title, !title.isEmpty {
                Text(title)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.white.opacity(0.9))
                    .lineLimit(1)
                    .shadow(color: .black.opacity(0.7), radius: 4, x: 0, y: 1)
            }
        }
    }

    private var metricsRow: some View {
        HStack(spacing: 16) {
            if let roi = video.deal?.expectedRoi, !roi.isEmpty {
                metric(label: "ROI", value: "\(roi)%", tint: .ivxGreen)
            }
            if let min = video.deal?.minInvestment, min > 0 {
                metric(label: "MIN INVEST", value: compactCurrency(min), tint: .ivxGold)
            }
            if let price = video.deal?.price, price > 0, let min = video.deal?.minInvestment, min > 0 {
                let ownership = (min / price) * 100
                metric(label: "MIN OWNERSHIP", value: String(format: "%.4f%%", ownership), tint: .ivxGold)
            }
        }
    }

    private func metric(label: String, value: String, tint: Color) -> some View {
        VStack(alignment: .center, spacing: 2) {
            Text(value)
                .font(.system(size: 18, weight: .heavy))
                .foregroundStyle(tint)
                .shadow(color: .black.opacity(0.7), radius: 3, x: 0, y: 1)
            Text(label)
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.white.opacity(0.9))
                .shadow(color: .black.opacity(0.7), radius: 3, x: 0, y: 1)
        }
    }

    private var investmentOptions: some View {
        HStack(spacing: 16) {
            ForEach(InvestmentOption.for(video.deal?.dealType)) { option in
                VStack(spacing: 3) {
                    Image(systemName: option.icon)
                        .font(.system(size: 18, weight: .medium))
                        .foregroundStyle(option.tint.color)
                        .frame(width: 42, height: 42)
                        .background(.black.opacity(0.55))
                        .clipShape(Circle())
                        .overlay(Circle().stroke(option.tint.color.opacity(0.4), lineWidth: 1))
                    Text(option.label)
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.85))
                }
            }
        }
        .padding(.top, 4)
    }

    private var ctaRow: some View {
        HStack(spacing: 10) {
            if video.deal?.url != nil || video.deal?.id != nil {
                Button(action: onViewDeal) {
                    Text("View Deal")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(Color.ivxGold)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .overlay(Capsule().stroke(Color.ivxGold, lineWidth: 1))
                }
                Button(action: onInvestNow) {
                    Text("Invest Now")
                        .font(.system(size: 14, weight: .heavy))
                        .foregroundStyle(.black)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color.ivxGold)
                        .clipShape(Capsule())
                }
            }
        }
        .padding(.top, 8)
    }

    private var actionRail: some View {
        VStack(spacing: 16) {
            railButton(icon: engagement.liked ? "heart.fill" : "heart", label: formatCount(engagement.likeCount), color: engagement.liked ? .ivxRed : .white) {
                Task { await toggleLike() }
            }
            railButton(icon: "message", label: formatCount(engagement.commentCount), color: .white) {
                showComments = true
            }
            railButton(icon: engagement.saved ? "bookmark.fill" : "bookmark", label: formatCount(engagement.saveCount), color: engagement.saved ? .ivxGold : .white) {
                Task { await toggleSave() }
            }
            railButton(icon: "paperplane.fill", label: formatCount(engagement.shareCount), color: .white) {
                share()
            }
            Button {
                Task { await toggleFollow() }
            } label: {
                Text(engagement.following ? "Following" : "Follow")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(engagement.following ? .white : .black)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(engagement.following ? Color.white.opacity(0.2) : Color.ivxGold)
                    .clipShape(Capsule())
            }
            railButton(icon: "ellipsis", label: "", color: .white) {
                showReport = true
            }
            Button {
                // Mute toggled by parent; this button is a no-op visual
            } label: {
                Image(systemName: isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                    .font(.system(size: 18))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(.black.opacity(0.5))
                    .clipShape(Circle())
            }
            .disabled(true)
        }
    }

    private func railButton(icon: String, label: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 26))
                    .foregroundStyle(color)
                if !label.isEmpty {
                    Text(label)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.white)
                }
            }
        }
    }

    private func toggleLike() async {
        do {
            let result = try await VideoEngagementService.toggleLike(videoId: video.id, viewerId: viewerId)
            await MainActor.run {
                engagement.liked = result.liked ?? !engagement.liked
                engagement.likeCount = result.likeCount ?? engagement.likeCount + (engagement.liked ? 1 : -1)
            }
        } catch {}
    }

    private func toggleSave() async {
        do {
            let result = try await VideoEngagementService.toggleSave(videoId: video.id, viewerId: viewerId)
            await MainActor.run {
                engagement.saved = result.saved ?? !engagement.saved
                engagement.saveCount = result.saveCount ?? engagement.saveCount + (engagement.saved ? 1 : -1)
            }
        } catch {}
    }

    private func toggleFollow() async {
        do {
            let result = try await VideoEngagementService.toggleFollow(creatorId: video.creatorId ?? "ivx-owner", viewerId: viewerId)
            await MainActor.run {
                engagement.following = result.following ?? !engagement.following
            }
        } catch {}
    }

    private func share() {
        let url = URL(string: "https://ivxholding.com/?video=\(video.id)")!
        let activity = UIActivityViewController(activityItems: [video.title ?? "IVX Property Video", url], applicationActivities: nil)
        if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
           let root = windowScene.keyWindow?.rootViewController {
            root.present(activity, animated: true)
        }
        Task {
            do {
                _ = try await VideoEngagementService.trackShare(videoId: video.id, viewerId: viewerId, type: "social")
            } catch {}
        }
    }

    private func formatCount(_ n: Int) -> String {
        if n >= 1_000_000 { return String(format: "%.1fM", Double(n) / 1_000_000) }
        if n >= 1_000 { return String(format: "%.1fK", Double(n) / 1_000) }
        return String(n)
    }

    private func compactCurrency(_ value: Double) -> String {
        if value >= 1_000_000 {
            return String(format: "$%.1fM", value / 1_000_000)
        }
        if value >= 1_000 {
            return String(format: "$%.1fK", value / 1_000)
        }
        return String(format: "$%.0f", value)
    }
}

private struct ReelEngagement {
    var likeCount: Int
    var commentCount: Int
    var shareCount: Int
    var saveCount: Int
    var liked: Bool
    var saved: Bool
    var following: Bool

    static func `default`() -> ReelEngagement {
        ReelEngagement(likeCount: 0, commentCount: 0, shareCount: 0, saveCount: 0, liked: false, saved: false, following: false)
    }
}

private extension View {
    func reelBadge(background: Color, foreground: Color) -> some View {
        self
            .font(.system(size: 10, weight: .heavy))
            .foregroundStyle(foreground)
            .textCase(.uppercase)
            .padding(.horizontal, 7)
            .padding(.vertical, 2)
            .background(background)
            .clipShape(RoundedRectangle(cornerRadius: 5))
    }
}

private extension InvestmentOption {
    static func for(_ dealType: String?) -> [InvestmentOption] {
        switch (dealType ?? "").lowercased() {
        case "jv", "equity_split", "hybrid":
            return [.tokenized, .jvDeals, .buyers]
        case "development", "new_construction", "rehab_construction":
            return [.jvDeals, .tokenized, .buyers]
        case "profit_sharing":
            return [.tokenized, .buyers, .jvDeals]
        default:
            return [.tokenized, .jvDeals, .buyers]
        }
    }
}

private extension Color {
    static var ivxRed: Color {
        Color(red: 1.0, green: 0.24, blue: 0.36)
    }
}

#Preview {
    ProjectReelsView()
}
