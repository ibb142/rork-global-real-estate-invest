//
//  OwnerLoginView.swift
//  Ivx
//
//  Manual owner sign-in screen. The owner types their email and password
//  by hand and taps "Sign In". There is no automatic, silent, or end-to-end
//  sign-in anywhere — every session is the result of an explicit owner tap.
//  On success, the owner sees their live Supabase session proof (user id,
//  email, expiry) and a Sign Out button.
//

import SwiftUI

struct OwnerLoginView: View {
    @State private var viewModel = OwnerLoginViewModel()
    @State private var showPassword: Bool = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    headerSection

                    if viewModel.isSignedIn {
                        signedInCard
                    } else {
                        signInForm
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 24)
            }
            .background(Color.ivxBackground)
            .navigationTitle("Owner Sign In")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(Color.ivxGold)
                }
            }
        }
    }

    // MARK: Header

    private var headerSection: some View {
        VStack(spacing: 12) {
            Image(systemName: "person.badge.key.fill")
                .font(.system(size: 48))
                .foregroundStyle(Color.ivxGold)
            Text("IVX HOLDINGS")
                .font(.title3)
                .fontWeight(.heavy)
                .foregroundStyle(.white)
            Text("Owner access is restricted. Sign in with your owner email and password.")
                .font(.subheadline)
                .foregroundStyle(Color.ivxTextSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
    }

    // MARK: Sign-in form (manual entry)

    private var signInForm: some View {
        VStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 8) {
                Text("EMAIL")
                    .font(.caption)
                    .fontWeight(.bold)
                    .foregroundStyle(Color.ivxTextTertiary)
                TextField("owner@example.com", text: $viewModel.email)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .foregroundStyle(.white)
                    .padding(14)
                    .background(Color.ivxSurface)
                    .clipShape(.rect(cornerRadius: 10))
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(Color.ivxBorder, lineWidth: 1)
                    )
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("PASSWORD")
                    .font(.caption)
                    .fontWeight(.bold)
                    .foregroundStyle(Color.ivxTextTertiary)
                HStack(spacing: 10) {
                    Group {
                        if showPassword {
                            TextField("Password", text: $viewModel.password)
                        } else {
                            SecureField("Password", text: $viewModel.password)
                        }
                    }
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .textContentType(.password)
                    .foregroundStyle(.white)

                    Button {
                        showPassword.toggle()
                    } label: {
                        Image(systemName: showPassword ? "eye.slash.fill" : "eye.fill")
                            .font(.body)
                            .foregroundStyle(Color.ivxTextSecondary)
                    }
                    .buttonStyle(.plain)
                }
                .padding(14)
                .background(Color.ivxSurface)
                .clipShape(.rect(cornerRadius: 10))
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(Color.ivxBorder, lineWidth: 1)
                )
            }

            if let error = viewModel.errorMessage {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(Color.ivxRed)
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(Color.ivxRed)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(Color.ivxRed.opacity(0.12))
                .clipShape(.rect(cornerRadius: 10))
            }

            Button {
                Task { await viewModel.signIn() }
            } label: {
                HStack {
                    if viewModel.isLoading {
                        ProgressView()
                            .tint(.black)
                    }
                    Text(viewModel.isLoading ? "Signing in…" : "Sign In")
                        .fontWeight(.bold)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 15)
                .background(viewModel.canSubmit ? Color.ivxGold : Color.ivxGold.opacity(0.4))
                .foregroundStyle(.black)
                .clipShape(.rect(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            .disabled(!viewModel.canSubmit)

            Text("No automatic sign-in. Your password is never stored — re-enter it each time you sign in.")
                .font(.caption2)
                .foregroundStyle(Color.ivxTextTertiary)
                .multilineTextAlignment(.center)
                .padding(.top, 4)
        }
    }

    // MARK: Signed-in proof

    private var signedInCard: some View {
        VStack(spacing: 16) {
            HStack(spacing: 10) {
                Image(systemName: "checkmark.seal.fill")
                    .font(.title2)
                    .foregroundStyle(Color.ivxGreen)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Signed in")
                        .font(.headline)
                        .foregroundStyle(.white)
                    Text("Live Supabase session active")
                        .font(.caption)
                        .foregroundStyle(Color.ivxTextSecondary)
                }
                Spacer()
            }

            Divider().background(Color.ivxBorder)

            proofRow(label: "Email", value: viewModel.session?.email ?? "—")
            proofRow(label: "User ID", value: viewModel.session?.userId ?? "—")
            proofRow(label: "Expires", value: viewModel.session?.expiresAtIso ?? "—")
            proofRow(label: "Session", value: "Active (manual sign-in)", highlight: true)

            Button {
                viewModel.signOut()
            } label: {
                Text("Sign Out")
                    .fontWeight(.semibold)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
                    .background(Color.ivxSurface)
                    .foregroundStyle(Color.ivxRed)
                    .clipShape(.rect(cornerRadius: 10))
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(Color.ivxRed.opacity(0.5), lineWidth: 1)
                    )
            }
            .buttonStyle(.plain)
        }
        .padding(18)
        .background(Color.ivxCard)
        .clipShape(.rect(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(Color.ivxBorder, lineWidth: 1)
        )
    }

    private func proofRow(label: String, value: String, highlight: Bool = false) -> some View {
        HStack {
            Text(label)
                .font(.caption)
                .foregroundStyle(Color.ivxTextTertiary)
            Spacer()
            Text(value)
                .font(.footnote)
                .fontWeight(.medium)
                .foregroundStyle(highlight ? Color.ivxGreen : .white)
                .lineLimit(1)
                .truncationMode(.middle)
        }
    }
}

#Preview {
    OwnerLoginView()
}
