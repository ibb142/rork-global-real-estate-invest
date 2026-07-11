import SwiftUI
import AVFoundation

/// One full-screen reel: looping video, right action rail, caption + investment card.
struct ReelCardView: View {
    let reel: Reel
    let deal: JVDeal?
    let isActive: Bool
    let viewModel: ReelsViewModel
    let onComments: () -> Void

    @State private var player: AVQueuePlayer?
    @State private var looper: AVPlayerLooper?
    @State private var isMuted = false
    @State private var likePulse = false

    private var isLiked: Bool { viewModel.likedIds.contains(reel.id) }
    private var isSaved: Bool { viewModel.savedIds.contains(reel.id) }

    var body: some View {
        ZStack {
            Color.black

            if let player {
                ReelPlayerView(player: player)
                    .allowsHitTesting(false)
            } else if let thumb = reel.thumbnailUrl, let url = URL(string: thumb) {
                AsyncImage(url: url) { image in
                    image.resizable().aspectRatio(contentMode: .fill)
                } placeholder: {
                    ProgressView().tint(.white)
                }
                .allowsHitTesting(false)
            }

            LinearGradient(
                colors: [.black.opacity(0.35), .clear, .clear, .black.opacity(0.72)],
                startPoint: .top,
                endPoint: .bottom
            )
            .allowsHitTesting(false)

            content
        }
        .clipped()
        .contentShape(Rectangle())
        .onTapGesture {
            isMuted.toggle()
            player?.isMuted = isMuted
        }
        .onAppear { setupPlayerIfNeeded() }
        .onDisappear { teardownPlayer() }
        .onChange(of: isActive) { _, active in
            if active {
                setupPlayerIfNeeded()
                player?.seek(to: .zero)
                player?.play()
            } else {
                player?.pause()
            }
        }
        .sensoryFeedback(.impact(weight: .medium), trigger: likePulse)
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer()

            HStack(alignment: .bottom, spacing: 12) {
                VStack(alignment: .leading, spacing: 10) {
                    typeBadge

                    if let caption = reel.caption, !caption.isEmpty {
                        Text(caption)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.white)
                            .lineLimit(2)
                            .shadow(radius: 4)
                    }

                    if let deal {
                        InvestmentCardView(deal: deal)
                    } else {
                        globalCta
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                actionRail
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 26)
        }
    }

    private var typeBadge: some View {
        Text(reel.reelType.uppercased())
            .font(.caption2.weight(.heavy))
            .tracking(1.2)
            .foregroundStyle(.black)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Color(red: 0.96, green: 0.77, blue: 0.09), in: .capsule)
    }

    private var globalCta: some View {
        Link(destination: URL(string: "\(IVXBackend.landingBase)/#projects")!) {
            HStack(spacing: 8) {
                Image(systemName: "building.2.fill")
                    .font(.footnote)
                Text("Explore Investment Opportunities")
                    .font(.footnote.weight(.semibold))
                Image(systemName: "arrow.right")
                    .font(.caption2.weight(.bold))
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(.white.opacity(0.16), in: .capsule)
            .overlay(Capsule().strokeBorder(.white.opacity(0.25), lineWidth: 1))
        }
    }

    private var actionRail: some View {
        VStack(spacing: 20) {
            railButton(
                icon: isLiked ? "heart.fill" : "heart",
                tint: isLiked ? Color(red: 1.0, green: 0.27, blue: 0.35) : .white,
                count: viewModel.likeCounts[reel.id, default: 0]
            ) {
                likePulse.toggle()
                viewModel.toggleLike(reel)
            }

            railButton(
                icon: "bubble.right.fill",
                tint: .white,
                count: viewModel.commentCounts[reel.id, default: 0],
                action: onComments
            )

            railButton(
                icon: isSaved ? "bookmark.fill" : "bookmark",
                tint: isSaved ? Color(red: 0.96, green: 0.77, blue: 0.09) : .white,
                count: viewModel.saveCounts[reel.id, default: 0]
            ) {
                viewModel.toggleSave(reel)
            }

            if let url = URL(string: reel.videoUrl) {
                ShareLink(item: url) {
                    railIcon("square.and.arrow.up", tint: .white)
                }
            }

            Button {
                isMuted.toggle()
                player?.isMuted = isMuted
            } label: {
                railIcon(isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill", tint: .white)
            }
        }
    }

    private func railButton(icon: String, tint: Color, count: Int, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 3) {
                railIcon(icon, tint: tint)
                Text(count > 0 ? "\(count)" : " ")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.white)
                    .shadow(radius: 3)
            }
        }
    }

    private func railIcon(_ name: String, tint: Color) -> some View {
        Image(systemName: name)
            .font(.system(size: 24, weight: .semibold))
            .foregroundStyle(tint)
            .frame(width: 44, height: 40)
            .shadow(color: .black.opacity(0.5), radius: 5)
    }

    private func setupPlayerIfNeeded() {
        guard player == nil, let url = URL(string: reel.videoUrl) else { return }
        let item = AVPlayerItem(url: url)
        let queuePlayer = AVQueuePlayer()
        queuePlayer.isMuted = isMuted
        looper = AVPlayerLooper(player: queuePlayer, templateItem: item)
        player = queuePlayer
        if isActive {
            queuePlayer.play()
        }
    }

    private func teardownPlayer() {
        player?.pause()
        looper = nil
        player = nil
    }
}
