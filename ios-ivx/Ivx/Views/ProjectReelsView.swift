//
//  ProjectReelsView.swift
//  Ivx
//
//  Dedicated Project Reels module — full-screen Instagram-style vertical
//  video experience synced with the 3 live IVX projects (Casa Rosario,
//  Perez Residence, IVX Jacksonville Prime). Each reel shows the project
//  video, investment option icons (tokenized / JV deal / buyer), and
//  opens the full professional detail view on tap.
//

import SwiftUI
import AVFoundation
import AVKit

struct ProjectReelsView: View {
    @State private var model = ProjectReelsViewModel()
    @State private var activeIndex: Int = 0
    @State private var isMuted = true
    @State private var selectedDeal: JVDeal?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            content

            VStack {
                header
                Spacer()
            }
        }
        .background(Color.black.ignoresSafeArea())
        .task { await model.load() }
        .refreshable { await model.load() }
        .navigationDestination(item: $selectedDeal) { deal in
            JVDealDetailView(deal: deal)
        }
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

    @ViewBuilder
    private var content: some View {
        if model.isLoading && model.reels.isEmpty {
            ProgressView()
                .tint(.ivxGold)
                .scaleEffect(1.2)
        } else if let error = model.errorMessage, model.reels.isEmpty {
            errorView(error)
        } else if model.reels.isEmpty {
            emptyView
        } else {
            TabView(selection: $activeIndex) {
                ForEach(Array(model.reels.enumerated()), id: \.element.id) { idx, reel in
                    ReelSlide(
                        reel: reel,
                        isActive: idx == activeIndex,
                        isMuted: isMuted,
                        onTapDetail: { openDetail(reel) }
                    )
                    .tag(idx)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .ignoresSafeArea()
        }
    }

    private func openDetail(_ reel: ProjectReel) {
        guard let deal = reel.deal else { return }
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        selectedDeal = deal
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
            Text("No reels yet")
                .font(.headline)
                .foregroundStyle(.white)
            Text("Project reels will appear here once videos are uploaded.")
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.6))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
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

            HStack(spacing: 4) {
                Image(systemName: "circle.hexagongrid.fill")
                    .font(.caption)
                    .foregroundStyle(Color.ivxGold)
                Text("\(model.reels.count)")
                    .font(.caption)
                    .fontWeight(.bold)
                    .foregroundStyle(.white)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Color.ivxGold.opacity(0.15))
            .clipShape(Capsule())
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }
}

private struct ReelSlide: View {
    let reel: ProjectReel
    let isActive: Bool
    let isMuted: Bool
    let onTapDetail: () -> Void

    var body: some View {
        ZStack {
            Color.black

            mediaLayer

            VStack {
                Spacer()
                overlayContent
            }
        }
    }

    @ViewBuilder
    private var mediaLayer: some View {
        if isActive, let video = reel.video, let url = video.bestPlaybackURL {
            LoopingVideoView(url: url, isMuted: isMuted)
                .ignoresSafeArea()
        } else if let video = reel.video, let poster = video.posterURL {
            AsyncImage(url: poster) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().aspectRatio(contentMode: .fill)
                default:
                    photoFallback
                }
            }
            .ignoresSafeArea()
        } else if let deal = reel.deal, let photo = deal.firstPhoto {
            DealPhotoView(photo: photo, height: UIScreen.main.bounds.height)
                .ignoresSafeArea()
        } else {
            photoFallback
        }
    }

    private var photoFallback: some View {
        ZStack {
            Color.ivxSurface.ignoresSafeArea()
            VStack(spacing: 10) {
                Image(systemName: "building.2")
                    .font(.system(size: 50))
                    .foregroundStyle(Color.ivxTextTertiary)
                if let deal = reel.deal {
                    Text(deal.displayName)
                        .font(.headline)
                        .foregroundStyle(.white.opacity(0.4))
                }
            }
        }
    }

    private var overlayContent: some View {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 10) {
                // Project name + location
                if let deal = reel.deal {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(deal.displayName)
                            .font(.title2)
                            .fontWeight(.heavy)
                            .foregroundStyle(.white)
                            .lineLimit(2)

                        if let location = deal.displayLocation {
                            Label(location, systemImage: "mappin.and.ellipse")
                                .font(.subheadline)
                                .foregroundStyle(Color.ivxGold)
                        }
                    }
                } else if let video = reel.video {
                    Text(video.title ?? "IVX Project Reel")
                        .font(.title2)
                        .fontWeight(.heavy)
                        .foregroundStyle(.white)
                        .lineLimit(2)
                }

                // Investment metrics chips
                if let deal = reel.deal {
                    HStack(spacing: 8) {
                        if let roi = deal.expectedRoi {
                            reelChip(label: "ROI", value: "\(roi.formatted(.number.precision(.fractionLength(0...1))))%", tint: .ivxGreen)
                        }
                        if let total = deal.totalInvestment, total > 0 {
                            reelChip(label: "Value", value: compactCurrency(total), tint: .ivxGold)
                        }
                        if let term = deal.termLabel {
                            reelChip(label: "Term", value: term, tint: .ivxBlue)
                        }
                    }
                }

                // Investment option icons — tokenized / JV / buyer
                if let deal = reel.deal {
                    HStack(spacing: 10) {
                        ForEach(deal.investmentOptions) { option in
                            reelOptionIcon(option)
                        }
                    }
                    .padding(.top, 2)
                }

                Text("ivxholding.com")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.5))
            }
            Spacer()

            // Right action rail
            actionRail
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 90)
    }

    private func reelChip(label: String, value: String, tint: Color) -> some View {
        HStack(spacing: 3) {
            Text(label)
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.6))
            Text(value)
                .font(.caption)
                .fontWeight(.bold)
                .foregroundStyle(tint)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(.black.opacity(0.55))
        .clipShape(Capsule())
        .overlay(Capsule().stroke(tint.opacity(0.3), lineWidth: 0.5))
    }

    private func reelOptionIcon(_ option: InvestmentOption) -> some View {
        VStack(spacing: 3) {
            Image(systemName: option.icon)
                .font(.body)
                .foregroundStyle(option.tint.color)
                .frame(width: 36, height: 36)
                .background(.black.opacity(0.6))
                .clipShape(Circle())
                .overlay(Circle().stroke(option.tint.color.opacity(0.4), lineWidth: 1))
            Text(option.label)
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.white.opacity(0.85))
        }
    }

    private var actionRail: some View {
        VStack(spacing: 18) {
            // View Details
            Button(action: onTapDetail) {
                VStack(spacing: 3) {
                    Image(systemName: "info.circle.fill")
                        .font(.title2)
                        .foregroundStyle(.white)
                    Text("Details")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.white)
                }
            }
            .accessibilityLabel("View deal details")

            // Invest
            if let deal = reel.deal {
                Link(destination: URL(string: "https://chat.ivxholding.com/investor")!) {
                    VStack(spacing: 3) {
                        Image(systemName: "chart.line.uptrend.xyaxis")
                            .font(.title2)
                            .foregroundStyle(Color.ivxGold)
                        Text("Invest")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(Color.ivxGold)
                    }
                }
                .accessibilityLabel("Invest in \(deal.displayName)")
            }

            // Share
            if let deal = reel.deal {
                ShareLink(item: URL(string: "https://ivxholding.com/properties")!) {
                    VStack(spacing: 3) {
                        Image(systemName: "paperplane.fill")
                            .font(.title2)
                            .foregroundStyle(.white)
                        Text("Share")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(.white)
                    }
                }
                .accessibilityLabel("Share \(deal.displayName)")
            }
        }
        .padding(.bottom, 10)
    }

    private func compactCurrency(_ value: Double) -> String {
        if value >= 1_000_000 {
            let millions = value / 1_000_000
            return "$\(millions.formatted(.number.precision(.fractionLength(0...1))))M"
        }
        if value >= 1_000 {
            let thousands = value / 1_000
            return "$\(thousands.formatted(.number.precision(.fractionLength(0...1))))K"
        }
        return "$\(value.formatted(.number.precision(.fractionLength(0))))"
    }
}

#Preview {
    ProjectReelsView()
}
