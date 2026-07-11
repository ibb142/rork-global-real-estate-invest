import SwiftUI

/// IVX Reels — vertical full-screen paging feed over the canonical
/// `jv_deal_reels` source with category chips and real social counts.
struct ReelsFeedView: View {
    @State private var viewModel = ReelsViewModel()
    @State private var currentReelID: String?
    @State private var commentsReel: Reel?

    private static let gold = Color(red: 0.96, green: 0.77, blue: 0.09)

    var body: some View {
        ZStack(alignment: .top) {
            Color.black.ignoresSafeArea()

            if viewModel.isLoading && viewModel.reels.isEmpty {
                loadingState
            } else if let error = viewModel.errorMessage, viewModel.reels.isEmpty {
                errorState(error)
            } else if viewModel.filteredReels.isEmpty {
                emptyState
            } else {
                feed
            }

            header
        }
        .task { await viewModel.load() }
        .sheet(item: $commentsReel) { reel in
            CommentsSheetView(reel: reel, viewModel: viewModel)
        }
        .preferredColorScheme(.dark)
    }

    private var feed: some View {
        ScrollView(.vertical) {
            LazyVStack(spacing: 0) {
                ForEach(viewModel.filteredReels) { reel in
                    ReelCardView(
                        reel: reel,
                        deal: viewModel.deal(for: reel),
                        isActive: isActive(reel),
                        viewModel: viewModel,
                        onComments: { commentsReel = reel }
                    )
                    .containerRelativeFrame([.horizontal, .vertical])
                    .id(reel.id)
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
        .scrollPosition(id: $currentReelID)
        .scrollIndicators(.hidden)
        .ignoresSafeArea()
    }

    private func isActive(_ reel: Reel) -> Bool {
        if let currentReelID { return currentReelID == reel.id }
        return viewModel.filteredReels.first?.id == reel.id
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Text("IVX")
                    .font(.title3.weight(.black))
                    .foregroundStyle(Self.gold)
                Text("Reels")
                    .font(.title3.weight(.black))
                    .foregroundStyle(.white)
                Spacer()
                if viewModel.isLoading && !viewModel.reels.isEmpty {
                    ProgressView().tint(.white)
                }
            }
            .padding(.horizontal, 16)

            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    ForEach(ReelCategory.allCases) { category in
                        chip(category)
                    }
                }
            }
            .contentMargins(.horizontal, 16)
            .scrollIndicators(.hidden)
        }
        .padding(.top, 6)
        .background(
            LinearGradient(colors: [.black.opacity(0.72), .clear], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea(edges: .top)
                .allowsHitTesting(false)
        )
    }

    private func chip(_ category: ReelCategory) -> some View {
        let isSelected = viewModel.selectedCategory == category
        let count = viewModel.categoryCount(category)
        return Button {
            withAnimation(.snappy) {
                viewModel.selectedCategory = category
                currentReelID = viewModel.filteredReels.first?.id
            }
        } label: {
            HStack(spacing: 5) {
                Text(category.rawValue)
                    .font(.footnote.weight(isSelected ? .bold : .semibold))
                if count > 0 {
                    Text("\(count)")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(isSelected ? .black.opacity(0.65) : .white.opacity(0.55))
                }
            }
            .foregroundStyle(isSelected ? .black : .white)
            .padding(.horizontal, 13)
            .padding(.vertical, 7)
            .background(isSelected ? Self.gold : .white.opacity(0.14), in: .capsule)
            .overlay(Capsule().strokeBorder(.white.opacity(isSelected ? 0 : 0.2), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private var loadingState: some View {
        VStack(spacing: 14) {
            ProgressView().tint(Self.gold).scaleEffect(1.4)
            Text("Loading IVX Reels…")
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.7))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func errorState(_ message: String) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 40))
                .foregroundStyle(Self.gold)
            Text("Couldn't load reels")
                .font(.headline)
                .foregroundStyle(.white)
            Text(message)
                .font(.caption)
                .foregroundStyle(.white.opacity(0.6))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Button("Retry") {
                Task { await viewModel.load() }
            }
            .font(.subheadline.weight(.bold))
            .foregroundStyle(.black)
            .padding(.horizontal, 24)
            .padding(.vertical, 10)
            .background(Self.gold, in: .capsule)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: viewModel.selectedCategory == .saved ? "bookmark" : "video.slash")
                .font(.system(size: 40))
                .foregroundStyle(.white.opacity(0.4))
            Text(viewModel.selectedCategory == .saved ? "No saved reels yet" : "No reels in \(viewModel.selectedCategory.rawValue)")
                .font(.headline)
                .foregroundStyle(.white)
            Text(viewModel.selectedCategory == .saved
                 ? "Tap the bookmark on any reel to save it here."
                 : "New reels appear here as soon as they're published.")
                .font(.caption)
                .foregroundStyle(.white.opacity(0.6))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.top, 60)
    }
}

#Preview {
    ReelsFeedView()
}
