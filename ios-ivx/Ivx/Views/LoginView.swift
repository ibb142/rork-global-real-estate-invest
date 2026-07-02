import SwiftUI

/// Owner Login Screen
///
/// Email + password authentication through the IVX backend auth proxy.
/// Includes links to recovery and repair (V7 emergency reset) flows.
struct LoginView: View {
    @Environment(AuthViewModel.self) private var authVM
    @State private var email: String = ""
    @State private var password: String = ""
    @State private var showPassword: Bool = false
    @State private var showRecovery: Bool = false
    @State private var showRepair: Bool = false
    @State private var loginError: String?
    @FocusState private var focusedField: Field?

    private enum Field: Hashable {
        case email, password
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 28) {
                    headerSection
                    formSection
                    if let loginError {
                        errorBanner(loginError)
                    }
                    signInButton
                    recoveryLinks
                    diagnosticSection
                }
                .padding(.horizontal, 24)
                .padding(.top, 20)
            }
            .background(backgroundGradient)
            .navigationTitle("Owner Login")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(isPresented: $showRecovery) {
                RecoveryView()
            }
            .navigationDestination(isPresented: $showRepair) {
                RepairView()
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { authVM.clearError() }
                        .tint(.white.opacity(0.7))
                }
            }
        }
        .task { await authVM.fetchDiagnostic() }
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(spacing: 12) {
            Image(systemName: "lock.shield.fill")
                .font(.system(size: 52))
                .foregroundStyle(.white)
                .symbolEffect(.pulse, options: .nonRepeating)

            Text("IVX Holdings")
                .font(.title2)
                .fontWeight(.bold)
                .foregroundStyle(.white)

            Text("Institutional Real Estate Investment Platform")
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.6))
                .multilineTextAlignment(.center)
        }
        .padding(.top, 16)
    }

    // MARK: - Form

    private var formSection: some View {
        VStack(spacing: 16) {
            inputField(
                title: "Email",
                systemImage: "envelope.fill",
                text: $email,
                placeholder: "owner@ivxholding.com",
                keyboardType: .emailAddress,
                isSecure: false,
                field: .email
            )

            inputField(
                title: "Password",
                systemImage: "lock.fill",
                text: $password,
                placeholder: "••••••••",
                keyboardType: .default,
                isSecure: !showPassword,
                field: .password,
                trailing: {
                    AnyView(
                        Button {
                            showPassword.toggle()
                        } label: {
                            Image(systemName: showPassword ? "eye.slash.fill" : "eye.fill")
                                .foregroundStyle(.white.opacity(0.4))
                        }
                        .buttonStyle(.plain)
                    )
                }
            )
        }
    }

    private func inputField(
        title: String,
        systemImage: String,
        text: Binding<String>,
        placeholder: String,
        keyboardType: UIKeyboardType,
        isSecure: Bool,
        field: Field,
        trailing: @escaping () -> AnyView = { AnyView(EmptyView()) }
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.caption)
                .fontWeight(.medium)
                .foregroundStyle(.white.opacity(0.5))

            HStack(spacing: 12) {
                Image(systemName: systemImage)
                    .foregroundStyle(.white.opacity(0.3))
                    .frame(width: 20)

                if isSecure {
                    SecureField(placeholder, text: text)
                        .textContentType(.password)
                        .foregroundStyle(.white)
                        .focused($focusedField, equals: field)
                        .submitLabel(.go)
                        .onSubmit { Task { await signIn() } }
                } else {
                    TextField(placeholder, text: text)
                        .textContentType(field == .email ? .emailAddress : .none)
                        .keyboardType(keyboardType)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .foregroundStyle(.white)
                        .focused($focusedField, equals: field)
                        .submitLabel(.next)
                        .onSubmit { focusedField = .password }
                }

                trailing()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(Color.white.opacity(0.06))
            .clipShape(.rect(cornerRadius: 14))
            .overlay {
                RoundedRectangle(cornerRadius: 14)
                    .stroke(focusedField == field ? Color.white.opacity(0.3) : Color.clear, lineWidth: 1)
            }
        }
    }

    // MARK: - Sign In Button

    private var signInButton: some View {
        Button {
            Task { await signIn() }
        } label: {
            HStack(spacing: 8) {
                if authVM.isLoading {
                    ProgressView()
                        .tint(.indigo)
                } else {
                    Image(systemName: "arrow.right.circle.fill")
                }
                Text("Sign In")
                    .font(.headline)
                    .fontWeight(.semibold)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(Color.white)
            .foregroundStyle(.indigo)
            .clipShape(.rect(cornerRadius: 14))
        }
        .disabled(authVM.isLoading || email.isEmpty || password.isEmpty)
        .opacity(email.isEmpty || password.isEmpty ? 0.6 : 1)
    }

    // MARK: - Recovery Links

    private var recoveryLinks: some View {
        VStack(spacing: 12) {
            Button {
                showRecovery = true
            } label: {
                Text("Forgot password?")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.6))
            }

            Button {
                showRepair = true
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "wrench.adjustable.fill")
                    Text("Emergency Owner Recovery")
                }
                .font(.subheadline)
                .fontWeight(.medium)
                .foregroundStyle(.orange)
            }
        }
        .padding(.top, 8)
    }

    // MARK: - Diagnostic

    private var diagnosticSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Backend Status")
                .font(.caption2)
                .fontWeight(.semibold)
                .foregroundStyle(.white.opacity(0.4))

            if let diag = authVM.diagnostic, diag.ok == true {
                HStack(spacing: 6) {
                    Circle()
                        .fill(.green)
                        .frame(width: 6, height: 6)
                    Text("Auth proxy active")
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.5))
                }
                if diag.backend?.bypassesAnonKey == true {
                    Text("Using service-role bypass (anon key not configured on server)")
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.3))
                }
            } else {
                HStack(spacing: 6) {
                    Circle()
                        .fill(.gray)
                        .frame(width: 6, height: 6)
                    Text("Checking backend…")
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.4))
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 16)
    }

    // MARK: - Error Banner

    private func errorBanner(_ message: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.red)
            Text(message)
                .font(.caption)
                .foregroundStyle(.red.opacity(0.9))
                .multilineTextAlignment(.leading)
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.red.opacity(0.12))
        .clipShape(.rect(cornerRadius: 12))
    }

    // MARK: - Background

    private var backgroundGradient: some View {
        LinearGradient(
            colors: [
                Color(red: 0.09, green: 0.09, blue: 0.16),
                Color(red: 0.05, green: 0.05, blue: 0.10),
                Color(red: 0.02, green: 0.02, blue: 0.06),
            ],
            startPoint: .top,
            endPoint: .bottom
        )
        .ignoresSafeArea()
    }

    // MARK: - Actions

    private func signIn() async {
        loginError = nil
        guard !email.isEmpty && !password.isEmpty else { return }
        await authVM.login(email: email, password: password)
        if case .error(let msg) = authVM.state {
            loginError = msg
        }
    }
}

// MARK: - Recovery View

struct RecoveryView: View {
    @Environment(AuthViewModel.self) private var authVM
    @State private var email: String = ""
    @State private var result: AuthActionResult?
    @FocusState private var isFocused: Bool

    var body: some View {
        ScrollView {
            VStack(spacing: 28) {
                VStack(spacing: 12) {
                    Image(systemName: "envelope.badge.fill")
                        .font(.system(size: 44))
                        .foregroundStyle(.white.opacity(0.8))

                    Text("Password Recovery")
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundStyle(.white)

                    Text("Enter your owner email and we'll send a password reset link.")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.5))
                        .multilineTextAlignment(.center)
                }
                .padding(.top, 20)

                VStack(alignment: .leading, spacing: 8) {
                    Text("Email")
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundStyle(.white.opacity(0.5))

                    HStack(spacing: 12) {
                        Image(systemName: "envelope.fill")
                            .foregroundStyle(.white.opacity(0.3))
                        TextField("owner@ivxholding.com", text: $email)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .foregroundStyle(.white)
                            .focused($isFocused)
                            .submitLabel(.go)
                            .onSubmit { Task { await sendReset() } }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .background(Color.white.opacity(0.06))
                    .clipShape(.rect(cornerRadius: 14))
                }

                if let result {
                    if result.success {
                        infoBanner(
                            "Reset email sent. Check your inbox.",
                            color: .green,
                            icon: "checkmark.circle.fill"
                        )
                    } else {
                        infoBanner(result.message, color: .red, icon: "exclamationmark.triangle.fill")
                    }
                }

                Button {
                    Task { await sendReset() }
                } label: {
                    HStack(spacing: 8) {
                        if authVM.isLoading {
                            ProgressView().tint(.indigo)
                        } else {
                            Image(systemName: "paperplane.fill")
                        }
                        Text("Send Reset Email")
                            .font(.headline)
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(Color.white)
                    .foregroundStyle(.indigo)
                    .clipShape(.rect(cornerRadius: 14))
                }
                .disabled(authVM.isLoading || email.isEmpty)
                .opacity(email.isEmpty ? 0.6 : 1)
            }
            .padding(.horizontal, 24)
        }
        .background(LinearGradient(
            colors: [
                Color(red: 0.09, green: 0.09, blue: 0.16),
                Color(red: 0.04, green: 0.04, blue: 0.09),
            ],
            startPoint: .top,
            endPoint: .bottom
        ).ignoresSafeArea())
        .navigationTitle("Recovery")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarColorScheme(.dark, for: .navigationBar)
    }

    private func sendReset() async {
        result = await authVM.sendRecoveryEmail(email: email)
    }

    private func infoBanner(_ message: String, color: Color, icon: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon).foregroundStyle(color)
            Text(message)
                .font(.caption)
                .foregroundStyle(color.opacity(0.9))
                .multilineTextAlignment(.leading)
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(color.opacity(0.12))
        .clipShape(.rect(cornerRadius: 12))
    }
}

// MARK: - Repair View (V7 Emergency)

struct RepairView: View {
    @Environment(AuthViewModel.self) private var authVM
    @Environment(\.dismiss) private var dismiss
    @State private var email: String = ""
    @State private var newPassword: String = ""
    @State private var confirmPassword: String = ""
    @State private var showPassword: Bool = false
    @State private var result: AuthActionResult?
    @FocusState private var focusedField: Field?

    private enum Field: Hashable { case email, password, confirm }

    private var passwordsMatch: Bool {
        !newPassword.isEmpty && newPassword == confirmPassword
    }

    private var passwordValid: Bool {
        newPassword.count >= 8
        && newPassword.contains { $0.isUppercase }
        && newPassword.contains { $0.isNumber }
    }

    private var canSubmit: Bool {
        !email.isEmpty && passwordValid && passwordsMatch && !authVM.isLoading
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                VStack(spacing: 12) {
                    Image(systemName: "wrench.adjustable.fill")
                        .font(.system(size: 44))
                        .foregroundStyle(.orange)

                    Text("Emergency Owner Recovery")
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundStyle(.white)

                    Text("Reset your owner password directly through the backend. Works even when standard login is blocked.")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.5))
                        .multilineTextAlignment(.center)
                }
                .padding(.top, 20)

                VStack(spacing: 16) {
                    repairField(
                        title: "Owner Email",
                        icon: "envelope.fill",
                        text: $email,
                        placeholder: "owner@ivxholding.com",
                        isSecure: false,
                        field: .email
                    )

                    repairField(
                        title: "New Password",
                        icon: "lock.fill",
                        text: $newPassword,
                        placeholder: "Min 8 chars, 1 uppercase, 1 number",
                        isSecure: !showPassword,
                        field: .password
                    )

                    repairField(
                        title: "Confirm Password",
                        icon: "lock.shield.fill",
                        text: $confirmPassword,
                        placeholder: "Repeat new password",
                        isSecure: !showPassword,
                        field: .confirm
                    )

                    Button {
                        showPassword.toggle()
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: showPassword ? "eye.slash.fill" : "eye.fill")
                            Text(showPassword ? "Hide passwords" : "Show passwords")
                        }
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.4))
                    }
                }

                if !newPassword.isEmpty && !passwordValid {
                    passwordHints
                }

                if !confirmPassword.isEmpty && !passwordsMatch {
                    infoBanner("Passwords don't match", color: .red, icon: "xmark.circle.fill")
                }

                if let result {
                    if result.success {
                        infoBanner(result.message, color: .green, icon: "checkmark.circle.fill")
                        Button {
                            dismiss()
                        } label: {
                            Text("Done — Sign In Now")
                                .font(.headline)
                                .fontWeight(.semibold)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 16)
                                .background(Color.green.opacity(0.2))
                                .foregroundStyle(.green)
                                .clipShape(.rect(cornerRadius: 14))
                        }
                    } else {
                        infoBanner(result.message, color: .red, icon: "exclamationmark.triangle.fill")
                    }
                }

                Button {
                    Task { await performRepair() }
                } label: {
                    HStack(spacing: 8) {
                        if authVM.isLoading {
                            ProgressView().tint(.indigo)
                        } else {
                            Image(systemName: "arrow.counterclockwise.circle.fill")
                        }
                        Text("Reset Owner Password")
                            .font(.headline)
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(canSubmit ? Color.orange : Color.orange.opacity(0.4))
                    .foregroundStyle(.white)
                    .clipShape(.rect(cornerRadius: 14))
                }
                .disabled(!canSubmit)
            }
            .padding(.horizontal, 24)
        }
        .background(LinearGradient(
            colors: [
                Color(red: 0.09, green: 0.09, blue: 0.16),
                Color(red: 0.04, green: 0.04, blue: 0.09),
            ],
            startPoint: .top,
            endPoint: .bottom
        ).ignoresSafeArea())
        .navigationTitle("Emergency Recovery")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarColorScheme(.dark, for: .navigationBar)
    }

    private func repairField(
        title: String,
        icon: String,
        text: Binding<String>,
        placeholder: String,
        isSecure: Bool,
        field: Field
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.caption)
                .fontWeight(.medium)
                .foregroundStyle(.white.opacity(0.5))

            HStack(spacing: 12) {
                Image(systemName: icon)
                    .foregroundStyle(.white.opacity(0.3))
                    .frame(width: 20)

                if isSecure {
                    SecureField(placeholder, text: text)
                        .textContentType(field == .password ? .newPassword : .none)
                        .foregroundStyle(.white)
                        .focused($focusedField, equals: field)
                        .submitLabel(field == .confirm ? .go : .next)
                        .onSubmit {
                            if field != .confirm { focusedField = (field == .email ? .password : .confirm) }
                            else if canSubmit { Task { await performRepair() } }
                        }
                } else {
                    TextField(placeholder, text: text)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .foregroundStyle(.white)
                        .focused($focusedField, equals: field)
                        .submitLabel(.next)
                        .onSubmit { focusedField = .password }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(Color.white.opacity(0.06))
            .clipShape(.rect(cornerRadius: 14))
            .overlay {
                RoundedRectangle(cornerRadius: 14)
                    .stroke(focusedField == field ? Color.white.opacity(0.3) : Color.clear, lineWidth: 1)
            }
        }
    }

    private var passwordHints: some View {
        VStack(alignment: .leading, spacing: 4) {
            passwordRequirement("At least 8 characters", met: newPassword.count >= 8)
            passwordRequirement("1 uppercase letter", met: newPassword.contains { $0.isUppercase })
            passwordRequirement("1 number", met: newPassword.contains { $0.isNumber })
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func passwordRequirement(_ text: String, met: Bool) -> some View {
        HStack(spacing: 6) {
            Image(systemName: met ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(met ? .green : .white.opacity(0.2))
            Text(text)
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.4))
        }
    }

    private func infoBanner(_ message: String, color: Color, icon: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon).foregroundStyle(color)
            Text(message)
                .font(.caption)
                .foregroundStyle(color.opacity(0.9))
                .multilineTextAlignment(.leading)
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(color.opacity(0.12))
        .clipShape(.rect(cornerRadius: 12))
    }

    private func performRepair() async {
        result = await authVM.repairOwner(email: email, newPassword: newPassword)
    }
}
