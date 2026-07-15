//
//  AdminReelsView.swift
//  Ivx
//
//  Owner admin panel for managing project reels — add unlimited videos by URL,
//  toggle visibility, set type (reel/deal), feature, reorder, and delete.
//  No developer required: the owner opens this screen, pastes a video URL,
//  taps Add, and the reel goes live across iOS, Android, and web instantly.
//

import SwiftUI
import AVKit

struct AdminReelsView: View {
    @State private var model = AdminReelsViewModel()
    @State private var showAddSheet = false
    @State private var newVideoUrl = ""
    @State private var newTitle = ""
    @State private var newType = "reel"
    @State private var newPosterUrl = ""
    @State private var isAdding = false
    @State private var addResult: String?
    @State private var addError: String?
    @State private var filterType = "all"

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                statsHeader

                filterBar

                videoList
            }
            .padding(.horizontal)
            .padding(.bottom, 40)
        }
        .background(Color.ivxBackground)
        .navigationTitle("Manage Reels")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showAddSheet = true
                } label: {
                    Image(systemName: "plus.circle.fill")
                        .font(.title2)
                        .foregroundStyle(Color.ivxGold)
                }
                .accessibilityLabel("Add new reel")
            }
        }
        .task { await model.load() }
        .refreshable { await model.load() }
        .sheet(isPresented: $showAddSheet) {
            addReelSheet
        }
    }

    // MARK: - Stats Header

    private var statsHeader: some View {
        HStack(spacing: 12) {
            statCard(label: "Total", value: "\(model.videos.count)", tint: .ivxGold)
            statCard(label: "Reels", value: "\(model.reelsCount)", tint: .ivxBlue)
            statCard(label: "Deals", value: "\(model.dealsCount)", tint: .ivxGreen)
            statCard(label: "Hidden", value: "\(model.hiddenCount)", tint: Color.ivxTextTertiary)
        }
    }

    private func statCard(label: String, value: String, tint: Color) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.title2)
                .fontWeight(.heavy)
                .foregroundStyle(tint)
            Text(label)
                .font(.caption2)
                .fontWeight(.semibold)
                .foregroundStyle(Color.ivxTextSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(Color.ivxCard)
        .clipShape(.rect(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.ivxBorder, lineWidth: 1))
    }

    // MARK: - Filter Bar

    private var filterBar: some View {
        HStack(spacing: 8) {
            filterChip("All", value: "all")
            filterChip("Reels", value: "reel")
            filterChip("Deals", value: "deal")
            filterChip("Hidden", value: "hidden")
        }
    }

    private func filterChip(_ label: String, value: String) -> some View {
        Button {
            filterType = value
            Task { await model.load(type: value == "all" || value == "hidden" ? nil : value) }
        } label: {
            Text(label)
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundStyle(filterType == value ? .black : .white)
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(filterType == value ? Color.ivxGold : Color.ivxSurface)
                .clipShape(Capsule())
                .overlay(Capsule().stroke(filterType == value ? Color.ivxGold : Color.ivxBorder, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Video List

    @ViewBuilder
    private var videoList: some View {
        if model.isLoading && model.videos.isEmpty {
            ProgressView()
                .tint(.ivxGold)
                .scaleEffect(1.2)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 60)
        } else if let error = model.errorMessage, model.videos.isEmpty {
            errorView(error)
        } else if model.videos.isEmpty {
            emptyView
        } else {
            LazyVStack(spacing: 12) {
                ForEach(filteredVideos) { video in
                    AdminVideoRow(
                        video: video,
                        onToggleHidden: { Task { await model.toggleHidden(video) } },
                        onToggleType: { Task { await model.toggleType(video) } },
                        onToggleFeatured: { Task { await model.toggleFeatured(video) } },
                        onDelete: { Task { await model.delete(video) } }
                    )
                }
            }
        }
    }

    private var filteredVideos: [AdminVideo] {
        switch filterType {
        case "hidden": return model.videos.filter { $0.isHidden == true }
        case "reel": return model.videos.filter { $0.isReel }
        case "deal": return model.videos.filter { !$0.isReel }
        default: return model.videos
        }
    }

    private func errorView(_ error: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .font(.largeTitle)
                .foregroundStyle(Color.ivxGold)
            Text("Could not load videos")
                .font(.headline)
                .foregroundStyle(.white)
            Text(error)
                .font(.caption)
                .foregroundStyle(Color.ivxTextSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 60)
    }

    private var emptyView: some View {
        VStack(spacing: 12) {
            Image(systemName: "film.stack")
                .font(.largeTitle)
                .foregroundStyle(Color.ivxGold)
            Text("No videos yet")
                .font(.headline)
                .foregroundStyle(.white)
            Text("Tap + to add your first reel. Add unlimited videos — no developer needed.")
                .font(.subheadline)
                .foregroundStyle(Color.ivxTextSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 60)
    }

    // MARK: - Add Reel Sheet

    private var addReelSheet: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    headerBanner

                    addForm
                }
                .padding(.horizontal)
                .padding(.bottom, 40)
            }
            .background(Color.ivxBackground)
            .navigationTitle("Add New Reel")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { showAddSheet = false }
                        .foregroundStyle(Color.ivxTextSecondary)
                }
            }
        }
    }

    private var headerBanner: some View {
        VStack(spacing: 8) {
            Image(systemName: "plus.app.fill")
                .font(.system(size: 40))
                .foregroundStyle(Color.ivxGold)
            Text("Add Unlimited Videos")
                .font(.headline)
                .fontWeight(.bold)
                .foregroundStyle(.white)
            Text("Paste a video URL, add a title, and it goes live instantly across iOS, Android, and web.")
                .font(.caption)
                .foregroundStyle(Color.ivxTextSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 20)
        .background(Color.ivxCard)
        .clipShape(.rect(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.ivxBorder, lineWidth: 1))
    }

    private var addForm: some View {
        VStack(spacing: 16) {
            inputField(
                title: "Video URL *",
                placeholder: "https://example.com/video.mp4",
                text: $newVideoUrl,
                icon: "link"
            )

            inputField(
                title: "Title",
                placeholder: "Casa Rosario — Drone Tour",
                text: $newTitle,
                icon: "textformat"
            )

            VStack(alignment: .leading, spacing: 8) {
                Text("Video Type")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.ivxTextSecondary)
                HStack(spacing: 10) {
                    typeButton("Reel", value: "reel", icon: "film")
                    typeButton("Deal", value: "deal", icon: "chart.line.uptrend.xyaxis")
                }
            }

            inputField(
                title: "Poster Image URL (optional)",
                placeholder: "https://example.com/poster.jpg",
                text: $newPosterUrl,
                icon: "photo"
            )

            if let addError {
                Text(addError)
                    .font(.caption)
                    .foregroundStyle(Color.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            if let addResult {
                Label(addResult, systemImage: "checkmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(Color.ivxGreen)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            Button {
                Task { await submitAdd() }
            } label: {
                HStack {
                    if isAdding {
                        ProgressView()
                            .tint(.black)
                            .scaleEffect(0.9)
                    } else {
                        Image(systemName: "plus.circle.fill")
                    }
                    Text(isAdding ? "Adding..." : "Add Reel & Go Live")
                        .fontWeight(.bold)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(isAdding ? Color.ivxGold.opacity(0.5) : Color.ivxGold)
                .foregroundStyle(.black)
                .clipShape(.rect(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            .disabled(isAdding || newVideoUrl.isEmpty)
        }
        .padding(16)
        .background(Color.ivxCard)
        .clipShape(.rect(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.ivxBorder, lineWidth: 1))
    }

    private func inputField(title: String, placeholder: String, text: Binding<String>, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundStyle(Color.ivxTextSecondary)
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.body)
                    .foregroundStyle(Color.ivxGold)
                TextField(placeholder, text: text)
                    .font(.subheadline)
                    .foregroundStyle(.white)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }
            .padding(12)
            .background(Color.ivxSurface)
            .clipShape(.rect(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.ivxBorder, lineWidth: 1))
        }
    }

    private func typeButton(_ label: String, value: String, icon: String) -> some View {
        Button {
            newType = value
        } label: {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.caption)
                Text(label)
                    .font(.subheadline)
                    .fontWeight(.semibold)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(newType == value ? Color.ivxGold : Color.ivxSurface)
            .foregroundStyle(newType == value ? .black : .white)
            .clipShape(.rect(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(newType == value ? Color.ivxGold : Color.ivxBorder, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Actions

    private func submitAdd() async {
        guard !newVideoUrl.isEmpty else { return }
        isAdding = true
        addError = nil
        addResult = nil
        do {
            let result = try await AdminReelsService.addVideo(
                videoUrl: newVideoUrl,
                title: newTitle.isEmpty ? "IVX Project Reel" : newTitle,
                videoType: newType,
                projectId: nil,
                posterUrl: newPosterUrl.isEmpty ? nil : newPosterUrl,
                durationSec: nil
            )
            if result.ok {
                addResult = "Live! Video ID: \(result.videoId?.prefix(8) ?? "")"
                newVideoUrl = ""
                newTitle = ""
                newPosterUrl = ""
                await model.load()
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            } else {
                addError = result.error ?? "Unknown error"
            }
        } catch {
            addError = error.localizedDescription
        }
        isAdding = false
    }
}

// MARK: - Video Row

private struct AdminVideoRow: View {
    let video: AdminVideo
    let onToggleHidden: () -> Void
    let onToggleType: () -> Void
    let onToggleFeatured: () -> Void
    let onDelete: () -> Void

    @State private var showActions = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                // Thumbnail
                ZStack {
                    if let poster = video.posterURL {
                        AsyncImage(url: poster) { phase in
                            switch phase {
                            case .success(let image):
                                image.resizable().aspectRatio(contentMode: .fill)
                            default:
                                Color.ivxSurface
                                    .overlay {
                                        Image(systemName: "video.fill")
                                            .font(.title2)
                                            .foregroundStyle(Color.ivxTextTertiary)
                                    }
                            }
                        }
                    } else {
                        Color.ivxSurface
                            .overlay {
                                Image(systemName: "video.fill")
                                    .font(.title2)
                                    .foregroundStyle(Color.ivxTextTertiary)
                            }
                    }
                }
                .frame(width: 72, height: 72)
                .clipShape(.rect(cornerRadius: 10))
                .overlay(
                    RoundedRectangle(cornerRadius: 10).stroke(Color.ivxBorder, lineWidth: 1)
                )

                // Info
                VStack(alignment: .leading, spacing: 4) {
                    Text(video.title ?? "Untitled")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundStyle(.white)
                        .lineLimit(2)
                    HStack(spacing: 6) {
                        typeBadge
                        if video.isFeatured == true {
                            Label("Featured", systemImage: "star.fill")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundStyle(Color.ivxGold)
                        }
                        if video.isHidden == true {
                            Label("Hidden", systemImage: "eye.slash.fill")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundStyle(Color.red)
                        }
                    }
                    Text(video.id.prefix(12) + "...")
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundStyle(Color.ivxTextTertiary)
                }

                Spacer()

                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        showActions.toggle()
                    }
                } label: {
                    Image(systemName: showActions ? "chevron.up" : "chevron.down")
                        .font(.caption)
                        .foregroundStyle(Color.ivxTextSecondary)
                        .frame(width: 32, height: 32)
                }
                .buttonStyle(.plain)
            }

            if showActions {
                Divider().background(Color.ivxBorder)

                VStack(spacing: 8) {
                    actionRow(
                        icon: video.isHidden == true ? "eye.fill" : "eye.slash.fill",
                        label: video.isHidden == true ? "Show on Feed" : "Hide from Feed",
                        tint: video.isHidden == true ? .ivxGreen : .ivxTextSecondary,
                        action: onToggleHidden
                    )
                    actionRow(
                        icon: "arrow.triangle.2.circlepath",
                        label: video.isReel ? "Set as Deal Video" : "Set as Reel",
                        tint: .ivxBlue,
                        action: onToggleType
                    )
                    actionRow(
                        icon: "star\(video.isFeatured == true ? ".fill" : "")",
                        label: video.isFeatured == true ? "Unfeature" : "Feature on Feed",
                        tint: .ivxGold,
                        action: onToggleFeatured
                    )
                    actionRow(
                        icon: "trash.fill",
                        label: "Delete Video",
                        tint: .red,
                        action: onDelete
                    )
                }
                .padding(.top, 4)
            }
        }
        .padding(12)
        .background(Color.ivxCard)
        .clipShape(.rect(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.ivxBorder, lineWidth: 1))
    }

    private var typeBadge: some View {
        Text(video.isReel ? "REEL" : "DEAL")
            .font(.system(size: 9, weight: .bold))
            .foregroundStyle(.black)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(video.isReel ? Color.ivxBlue : Color.ivxGreen)
            .clipShape(.rect(cornerRadius: 4))
    }

    private func actionRow(icon: String, label: String, tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.body)
                    .foregroundStyle(tint)
                    .frame(width: 24)
                Text(label)
                    .font(.subheadline)
                    .foregroundStyle(.white)
                Spacer()
            }
            .padding(.vertical, 6)
            .padding(.horizontal, 8)
            .background(Color.ivxSurface)
            .clipShape(.rect(cornerRadius: 8))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - View Model

@Observable
final class AdminReelsViewModel {
    var videos: [AdminVideo] = []
    var isLoading = false
    var errorMessage: String?

    var reelsCount: Int { videos.filter { $0.isReel }.count }
    var dealsCount: Int { videos.filter { !$0.isReel }.count }
    var hiddenCount: Int { videos.filter { $0.isHidden == true }.count }

    @MainActor
    func load(type: String? = nil) async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        do {
            videos = try await AdminReelsService.fetchAllVideos(type: type)
        } catch {
            errorMessage = error.localizedDescription
            print("[AdminReels] load failed: \(error.localizedDescription)")
        }
        isLoading = false
    }

    @MainActor
    func toggleHidden(_ video: AdminVideo) async {
        do {
            try await AdminReelsService.updateVideo(
                videoId: video.id,
                action: "update",
                isHidden: !(video.isHidden ?? false)
            )
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    func toggleType(_ video: AdminVideo) async {
        do {
            try await AdminReelsService.updateVideo(
                videoId: video.id,
                action: "update",
                videoType: video.isReel ? "deal" : "reel"
            )
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    func toggleFeatured(_ video: AdminVideo) async {
        do {
            try await AdminReelsService.updateVideo(
                videoId: video.id,
                action: "update",
                isFeatured: !(video.isFeatured ?? false)
            )
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    func delete(_ video: AdminVideo) async {
        do {
            try await AdminReelsService.deleteVideo(videoId: video.id)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#Preview {
    NavigationStack {
        AdminReelsView()
    }
}
