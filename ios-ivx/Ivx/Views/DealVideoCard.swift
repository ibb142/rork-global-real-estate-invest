//
//  DealVideoCard.swift
//  Ivx
//
//  Instagram-style property video card: header row with avatar, autoplaying
//  muted looping video, action rail (like / comment / share / save), likes
//  line, caption, and deal chips with a "View Deal" CTA.
//

import SwiftUI
import AVFoundation
import AVKit

/// UIView whose backing layer is an AVPlayerLayer (aspect-fill video).
final class PlayerContainerView: UIView {
    override static var layerClass: AnyClass { AVPlayerLayer.self }

    var playerLayer: AVPlayerLayer {
        guard let layer = layer as? AVPlayerLayer else {
            fatalError("PlayerContainerView backing layer must be AVPlayerLayer")
        }
        return layer
    }
}

/// Muted, seamlessly-looping autoplay video — the Instagram card behaviour.
struct LoopingVideoView: UIViewRepresentable {
    let url: URL
    let isMuted: Bool
    var onProgress: ((Double) -> Void)? = nil

    func makeCoordinator() -> Coordinator {
        Coordinator(onProgress: onProgress)
    }

    func makeUIView(context: Context) -> PlayerContainerView {
        let view = PlayerContainerView()
        view.backgroundColor = .black
        view.playerLayer.videoGravity = .resizeAspectFill
        context.coordinator.configure(url: url, layer: view.playerLayer)
        context.coordinator.player?.isMuted = isMuted
        return view
    }

    func updateUIView(_ uiView: PlayerContainerView, context: Context) {
        context.coordinator.player?.isMuted = isMuted
    }

    static func dismantleUIView(_ uiView: PlayerContainerView, coordinator: Coordinator) {
        coordinator.teardown()
    }

    final class Coordinator {
        var player: AVQueuePlayer?
        private var looper: AVPlayerLooper?
        private var observer: Any?
        private var onProgress: ((Double) -> Void)?

        init(onProgress: ((Double) -> Void)?) {
            self.onProgress = onProgress
        }

        func configure(url: URL, layer: AVPlayerLayer) {
            let item = AVPlayerItem(url: url)
            let queuePlayer = AVQueuePlayer()
            queuePlayer.preventsDisplaySleepDuringVideoPlayback = false
            looper = AVPlayerLooper(player: queuePlayer, templateItem: item)
            layer.player = queuePlayer
            queuePlayer.play()
            player = queuePlayer

            if onProgress != nil {
                let interval = CMTime(seconds: 0.1, preferredTimescale: CMTimeScale(NSEC_PER_SEC))
                observer = queuePlayer.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
                    guard let self, let player = self.player, let duration = player.currentItem?.duration, duration.isNumeric, duration.seconds > 0 else { return }
                    self.onProgress?(time.seconds / duration.seconds)
                }
            }
        }

        func teardown() {
            if let observer {
                player?.removeTimeObserver(observer)
            }
            player?.pause()
            looper = nil
            player = nil
        }
    }
}

/// Instagram-style card for a property video attached to a JV deal.
struct DealVideoCard: View {
    let video: FeedVideo

    @State private var isMuted = true
    @State private var liked = false

    private var mediaHeight: CGFloat { 230 }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            media
            actionRail
            likesLine
            caption
            if let deal = video.deal {
                dealChips(deal)
            }
        }
        .background(Color.ivxCard)
        .clipShape(.rect(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.ivxBorder, lineWidth: 1)
        )
    }

    // MARK: header — avatar, account name, location

    private var header: some View {
        HStack(spacing: 10) {
            Text("IVX")
                .font(.caption2)
                .fontWeight(.heavy)
                .foregroundStyle(.black)
                .frame(width: 34, height: 34)
                .background(Color.ivxGold)
                .clipShape(Circle())
                .overlay(Circle().stroke(Color.ivxGold.opacity(0.4), lineWidth: 2).padding(-3))

            VStack(alignment: .leading, spacing: 1) {
                Text("ivxholdings")
                    .font(.subheadline)
                    .fontWeight(.bold)
                    .foregroundStyle(.white)
                Text(video.deal?.title ?? video.title ?? "IVX Holdings")
                    .font(.caption)
                    .foregroundStyle(Color.ivxTextSecondary)
                    .lineLimit(1)
            }
            Spacer()
            Image(systemName: "ellipsis")
                .font(.subheadline)
                .foregroundStyle(Color.ivxTextSecondary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }

    // MARK: media — autoplay muted loop, tap toggles sound

    private var media: some View {
        Color.black
            .frame(height: mediaHeight)
            .overlay {
                mediaContent
                    .allowsHitTesting(false)
            }
            .clipped()
            .overlay(alignment: .bottomTrailing) {
                Button {
                    isMuted.toggle()
                } label: {
                    Image(systemName: isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                        .font(.caption)
                        .foregroundStyle(.white)
                        .frame(width: 30, height: 30)
                        .background(.black.opacity(0.6))
                        .clipShape(Circle())
                }
                .padding(10)
            }
            .contentShape(Rectangle())
            .onTapGesture {
                isMuted.toggle()
            }
    }

    @ViewBuilder
    private var mediaContent: some View {
        if let playbackURL = video.bestPlaybackURL {
            LoopingVideoView(url: playbackURL, isMuted: isMuted)
        } else if let posterURL = video.posterURL {
            AsyncImage(url: posterURL) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().aspectRatio(contentMode: .fill)
                default:
                    Color.ivxSurface
                }
            }
        } else {
            Color.ivxSurface
        }
    }

    // MARK: action rail — like / comment / share / save

    private var actionRail: some View {
        HStack(spacing: 18) {
            Button {
                liked.toggle()
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            } label: {
                Image(systemName: liked ? "heart.fill" : "heart")
                    .font(.title3)
                    .foregroundStyle(liked ? Color(red: 1, green: 0.23, blue: 0.36) : .white)
            }
            Image(systemName: "bubble.right")
                .font(.title3)
                .foregroundStyle(.white)
            if let shareURL = dealURL {
                ShareLink(item: shareURL) {
                    Image(systemName: "paperplane")
                        .font(.title3)
                        .foregroundStyle(.white)
                }
            }
            Spacer()
            Image(systemName: "bookmark")
                .font(.title3)
                .foregroundStyle(.white)
        }
        .padding(.horizontal, 12)
        .padding(.top, 10)
    }

    private var likesLine: some View {
        let base = video.likeCount ?? 0
        let total = base + (liked ? 1 : 0)
        return Text("\(total) like\(total == 1 ? "" : "s")")
            .font(.footnote)
            .fontWeight(.bold)
            .foregroundStyle(.white)
            .padding(.horizontal, 12)
            .padding(.top, 8)
    }

    private var caption: some View {
        (Text("ivxholdings ").fontWeight(.bold) + Text(video.title ?? "Property tour"))
            .font(.footnote)
            .foregroundStyle(.white)
            .lineLimit(2)
            .padding(.horizontal, 12)
            .padding(.top, 3)
    }

    // MARK: deal chips + CTA

    private func dealChips(_ deal: FeedVideoDeal) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                if let roi = deal.expectedRoi, !roi.isEmpty {
                    chip(label: "ROI", value: "\(roi)%", tint: .ivxGreen)
                }
                if let price = deal.price, price > 0 {
                    chip(label: "Value", value: compactCurrency(price), tint: .ivxGold)
                }
                if let min = deal.minInvestment, min > 0 {
                    chip(label: "Min", value: compactCurrency(min), tint: .white)
                }
                Spacer()
            }
            if let url = dealURL {
                Link(destination: url) {
                    Text("View Deal")
                        .font(.subheadline)
                        .fontWeight(.bold)
                        .foregroundStyle(.black)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(Color.ivxGold)
                        .clipShape(.rect(cornerRadius: 10))
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, 10)
        .padding(.bottom, 12)
    }

    private func chip(label: String, value: String, tint: Color) -> some View {
        HStack(spacing: 4) {
            Text(label)
                .font(.caption2)
                .foregroundStyle(Color.ivxTextTertiary)
            Text(value)
                .font(.caption)
                .fontWeight(.bold)
                .foregroundStyle(tint)
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 5)
        .background(Color.ivxSurface)
        .clipShape(Capsule())
        .overlay(Capsule().stroke(Color.ivxBorder, lineWidth: 1))
    }

    private var dealURL: URL? {
        guard let raw = video.deal?.url else { return nil }
        return URL(string: raw)
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
