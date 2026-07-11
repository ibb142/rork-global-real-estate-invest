import SwiftUI

/// Real persisted comments for one reel, with a composer that writes through
/// the IVX backend service-role API.
struct CommentsSheetView: View {
    let reel: Reel
    let viewModel: ReelsViewModel

    @State private var comments: [ReelComment] = []
    @State private var isLoading = true
    @State private var draft = ""
    @State private var isSending = false
    @State private var sendError: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("Loading comments…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if comments.isEmpty {
                    ContentUnavailableView(
                        "No comments yet",
                        systemImage: "bubble.right",
                        description: Text("Be the first to comment on this reel.")
                    )
                } else {
                    List(comments) { comment in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(comment.authorName)
                                .font(.caption.weight(.bold))
                                .foregroundStyle(.secondary)
                            Text(comment.body)
                                .font(.subheadline)
                        }
                        .padding(.vertical, 2)
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Comments (\(comments.count))")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .safeAreaInset(edge: .bottom) {
                composer
            }
        }
        .presentationDetents([.medium, .large])
        .presentationContentInteraction(.scrolls)
        .task { await loadComments() }
    }

    private var composer: some View {
        VStack(spacing: 6) {
            if let sendError {
                Text(sendError)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            HStack(spacing: 10) {
                TextField("Add a comment…", text: $draft, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(1...3)

                Button {
                    Task { await sendComment() }
                } label: {
                    if isSending {
                        ProgressView()
                    } else {
                        Image(systemName: "paperplane.fill")
                            .font(.body.weight(.semibold))
                    }
                }
                .disabled(isSending || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.bar)
    }

    private func loadComments() async {
        isLoading = true
        do {
            comments = try await ReelsService.fetchComments(reelId: reel.id)
        } catch {
            print("[Reels] comments load failed: \(error.localizedDescription)")
        }
        isLoading = false
    }

    private func sendComment() async {
        let body = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return }
        isSending = true
        sendError = nil
        let ok = await ReelsService.sendComment(
            reelId: reel.id,
            deviceKey: viewModel.deviceKey,
            authorName: "Guest",
            body: body
        )
        if ok {
            draft = ""
            viewModel.commentCounts[reel.id, default: 0] += 1
            await loadComments()
        } else {
            sendError = "Comment could not be posted right now. It will work once the backend deploy completes."
        }
        isSending = false
    }
}
