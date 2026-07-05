//
//  ChatTabView.swift
//  Ivx
//
//  Mirrors the Android Chat tab (expo/app/(tabs)/chat.tsx):
//  IVX Owner AI room, support tickets with "Create New Ticket",
//  and the empty tickets state.
//

import SwiftUI

struct ChatTabView: View {
    @State private var showWelcomeBanner: Bool = true
    @State private var welcomeBannerOpacity: Double = 1.0

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Chat")
                            .font(.largeTitle)
                            .fontWeight(.bold)
                            .foregroundStyle(.white)
                        Text("Support & AI rooms")
                            .font(.subheadline)
                            .foregroundStyle(Color.ivxTextSecondary)
                    }
                    .padding(.horizontal)

                    if showWelcomeBanner {
                        welcomeBanner
                            .transition(.move(edge: .top).combined(with: .opacity))
                            .opacity(welcomeBannerOpacity)
                    }

                    ownerAIRoomCard

                    VStack(alignment: .leading, spacing: 12) {
                        IVXSectionHeader(title: "Support Tickets")

                        VStack(spacing: 6) {
                            Image(systemName: "ticket")
                                .font(.title2)
                                .foregroundStyle(Color.ivxTextTertiary)
                            Text("No support tickets yet")
                                .font(.subheadline)
                                .fontWeight(.semibold)
                                .foregroundStyle(.white)
                            Text("AI replies within minutes")
                                .font(.caption)
                                .foregroundStyle(Color.ivxTextSecondary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 24)
                        .background(Color.ivxCard)
                        .clipShape(.rect(cornerRadius: 12))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color.ivxBorder, lineWidth: 1)
                        )
                        .padding(.horizontal)

                        Link(destination: URL(string: "https://chat.ivxholding.com")!) {
                            Label("Create New Ticket", systemImage: "plus.circle.fill")
                                .font(.headline)
                                .foregroundStyle(.black)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(Color.ivxGold)
                                .clipShape(.rect(cornerRadius: 12))
                        }
                        .padding(.horizontal)
                    }
                }
                .padding(.vertical)
            }
            .background(Color.ivxBackground)
            .toolbar(.hidden, for: .navigationBar)
            .onAppear { startWelcomeBannerAutoDismiss() }
        }
    }

    /// Auto-dismisses the welcome banner after 7 seconds with a fade-out animation.
    private func startWelcomeBannerAutoDismiss() {
        guard showWelcomeBanner else { return }
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(5))
            withAnimation(.easeOut(duration: 2.0)) {
                welcomeBannerOpacity = 0.0
            }
            try? await Task.sleep(for: .seconds(2))
            withAnimation(.easeInOut(duration: 0.4)) {
                showWelcomeBanner = false
            }
        }
    }

    /// "Welcome to IVX" banner — shown for 5–10 seconds then auto-dismisses.
    /// Mirrors the Expo/Android chat banner so both native apps stay in sync.
    private var welcomeBanner: some View {
        HStack(spacing: 12) {
            Image(systemName: "sparkles")
                .font(.body.weight(.bold))
                .foregroundStyle(.black)
                .frame(width: 36, height: 36)
                .background(Color.ivxGold)
                .clipShape(.rect(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 2) {
                Text("Welcome to IVX")
                    .font(.headline)
                    .fontWeight(.bold)
                    .foregroundStyle(.white)
                Text("Owner AI room is live. Ask anything about your deals.")
                    .font(.caption)
                    .foregroundStyle(Color.ivxTextSecondary)
                    .lineLimit(2)
            }

            Spacer(minLength: 4)

            Button {
                withAnimation(.easeInOut(duration: 0.3)) {
                    showWelcomeBanner = false
                }
            } label: {
                Image(systemName: "xmark")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.ivxTextSecondary)
                    .frame(width: 28, height: 28)
                    .background(Color.ivxSurfaceTertiary)
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal)
        .padding(.vertical, 14)
        .background(
            LinearGradient(
                colors: [Color.ivxCard, Color.ivxCard.opacity(0.92)],
                startPoint: .leading,
                endPoint: .trailing
            )
        )
        .clipShape(.rect(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(Color.ivxGold.opacity(0.45), lineWidth: 1)
        )
        .padding(.horizontal)
    }

    /// Mirrors Android's "IVX Owner AI room" card with the Open room action.
    private var ownerAIRoomCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: "sparkles")
                    .font(.body)
                    .foregroundStyle(.black)
                    .frame(width: 34, height: 34)
                    .background(Color.ivxGold)
                    .clipShape(.rect(cornerRadius: 8))
                VStack(alignment: .leading, spacing: 1) {
                    Text("IVX Owner AI room")
                        .font(.headline)
                        .foregroundStyle(.white)
                    Text("Room sync · AI replies")
                        .font(.caption)
                        .foregroundStyle(Color.ivxTextSecondary)
                }
                Spacer()
                Text("OWNER")
                    .font(.caption2)
                    .fontWeight(.bold)
                    .foregroundStyle(Color.ivxGold)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Color.ivxGold.opacity(0.12))
                    .clipShape(Capsule())
            }
            Link(destination: URL(string: "https://chat.ivxholding.com")!) {
                Text("Open room")
                    .font(.subheadline)
                    .fontWeight(.bold)
                    .foregroundStyle(Color.ivxGold)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(Color.ivxSurfaceTertiary)
                    .clipShape(.rect(cornerRadius: 8))
            }
        }
        .padding()
        .background(Color.ivxCard)
        .clipShape(.rect(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(Color.ivxGold.opacity(0.35), lineWidth: 1)
        )
        .padding(.horizontal)
    }
}

#Preview {
    ChatTabView()
}
