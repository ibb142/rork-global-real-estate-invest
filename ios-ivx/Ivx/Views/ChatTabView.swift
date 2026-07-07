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
        }
    }

    /// Mirrors Android's "IVX Owner AI room" card with the Open room action.
    /// The web room opens at the latest conversation (no welcome/loading delay).
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
                Text("Open room — latest first")
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
