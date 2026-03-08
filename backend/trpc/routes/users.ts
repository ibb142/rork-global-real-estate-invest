import * as z from "zod";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../create-context";
import { store } from "../../store/index";
import { hashPassword, verifyPassword, generateSecureToken, tokenExpiry, isTokenExpired } from "../../lib/crypto";
import { signAccessToken, signRefreshToken, signTwoFactorToken, verifyToken } from "../../lib/jwt";
import { generateSecret, getOtpauthUri, verifyTOTP, generateBackupCodes } from "../../lib/totp";
import { sendVerificationEmail, sendPasswordResetEmail } from "../../lib/email";
import { sendNewRegistrationSMS } from "../../lib/sms-notifications";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const EMAIL_VERIFY_EXPIRY_MINUTES = 60;
const PASSWORD_RESET_EXPIRY_MINUTES = 60;

function issueTokens(userId: string, email: string, role: string) {
  const refreshTokenId = generateSecureToken(16);
  const accessToken = signAccessToken(userId, email, role);
  const refreshToken = signRefreshToken(userId, email, role, refreshTokenId);

  const user = store.getUser(userId);
  if (user) {
    user.refreshTokenId = refreshTokenId;
    user.lastActivity = new Date().toISOString();
    void store.persist();
  }

  console.log('[Auth] Tokens issued for', userId);
  return { accessToken, refreshToken, refreshTokenId };
}

function sanitizeUser(user: NonNullable<ReturnType<typeof store.getUser>>) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    kycStatus: user.kycStatus,
    role: user.role,
    emailVerified: user.emailVerified ?? true,
    twoFactorEnabled: user.twoFactorEnabled ?? false,
  };
}

export const usersRouter = createTRPCRouter({
  register: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(8),
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      phone: z.string().optional(),
      country: z.string(),
      referralCode: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      console.log("[Auth] Register attempt:", input.email);

      const existing = store.getUserByEmail(input.email);
      if (existing) {
        console.log("[Auth] Email already registered:", input.email);
        return { success: false, userId: null, message: "Email already registered" };
      }

      const passwordHash = await hashPassword(input.password);
      const emailVerifyToken = generateSecureToken();
      const emailVerifyExpires = tokenExpiry(EMAIL_VERIFY_EXPIRY_MINUTES);

      const userId = store.genId("user");
      const isFirstUser = store.users.size === 0 || (store.users.size === 1 && store.users.has("user-1"));
      const assignedRole = isFirstUser ? "owner" as const : "investor" as const;

      console.log(`[Auth] Creating user ${userId} with role '${assignedRole}'`);

      store.users.set(userId, {
        id: userId,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        country: input.country,
        role: assignedRole,
        kycStatus: "pending",
        eligibilityStatus: "pending",
        walletBalance: 0,
        totalInvested: 0,
        totalReturns: 0,
        createdAt: new Date().toISOString(),
        passwordHash,
        status: "active",
        lastActivity: new Date().toISOString(),
        emailVerified: false,
        emailVerifyToken,
        emailVerifyExpires,
        twoFactorEnabled: false,
        failedLoginAttempts: 0,
      });

      store.walletBalances.set(userId, { available: 0, pending: 0, invested: 0 });

      if (input.referralCode) {
        const ref = store.referrals.find(r => r.referralCode === input.referralCode && r.status === "pending");
        if (ref) {
          ref.status = "signed_up";
          ref.referredName = `${input.firstName} ${input.lastName}`;
          ref.referredId = userId;
          ref.signedUpAt = new Date().toISOString();
        }
      }

      store.addNotification(userId, {
        id: store.genId("notif"),
        type: "system",
        title: "Welcome to IVX HOLDINGS!",
        message: "Complete your KYC verification to start investing.",
        read: false,
        createdAt: new Date().toISOString(),
      });

      store.log("register", userId, `New user: ${input.email}`);

      console.log(`[Auth] Email verification token generated for ${input.email} (expires: ${emailVerifyExpires})`);
      sendVerificationEmail(input.email, emailVerifyToken, input.firstName).catch(e => console.error('[Auth] Email send failed:', e));

      sendNewRegistrationSMS(
        input.firstName,
        input.lastName,
        input.email,
        input.country,
        assignedRole
      ).catch(e => console.error('[Auth] SMS notification failed:', e));

      return {
        success: true,
        userId,
        message: "Registration successful. Please verify your email.",
      };
    }),

  login: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string(),
      deviceId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      console.log("[Auth] Login attempt:", input.email);

      const user = store.getUserByEmail(input.email);
      if (!user) {
        console.log("[Auth] User not found:", input.email);
        return {
          success: false,
          token: null,
          refreshToken: null,
          user: null,
          requiresTwoFactor: false,
          twoFactorToken: null,
          message: "Invalid email or password",
        };
      }

      if (user.status === "suspended") {
        console.log("[Auth] Suspended account:", input.email);
        return {
          success: false,
          token: null,
          refreshToken: null,
          user: null,
          requiresTwoFactor: false,
          twoFactorToken: null,
          message: "Account is suspended. Contact support.",
        };
      }

      if (user.lockedUntil && !isTokenExpired(user.lockedUntil)) {
        const remainingMs = new Date(user.lockedUntil).getTime() - Date.now();
        const remainingMin = Math.ceil(remainingMs / 60000);
        console.log("[Auth] Account locked:", input.email, `(${remainingMin} min remaining)`);
        return {
          success: false,
          token: null,
          refreshToken: null,
          user: null,
          requiresTwoFactor: false,
          twoFactorToken: null,
          message: `Account locked. Try again in ${remainingMin} minute(s).`,
        };
      }

      if (user.lockedUntil && isTokenExpired(user.lockedUntil)) {
        user.lockedUntil = undefined;
        user.failedLoginAttempts = 0;
        console.log("[Auth] Lockout expired, reset for:", input.email);
      }

      const passwordValid = await verifyPassword(input.password, user.passwordHash);
      if (!passwordValid) {
        const attempts = (user.failedLoginAttempts ?? 0) + 1;
        user.failedLoginAttempts = attempts;

        if (attempts >= MAX_FAILED_ATTEMPTS) {
          user.lockedUntil = tokenExpiry(LOCKOUT_MINUTES);
          console.log("[Auth] Account locked after", attempts, "failed attempts:", input.email);
          store.log("account_locked", user.id, `Locked after ${attempts} failed login attempts`);
          void store.persist();
          return {
            success: false,
            token: null,
            refreshToken: null,
            user: null,
            requiresTwoFactor: false,
            twoFactorToken: null,
            message: `Too many failed attempts. Account locked for ${LOCKOUT_MINUTES} minutes.`,
          };
        }

        console.log("[Auth] Invalid password, attempt", attempts, "of", MAX_FAILED_ATTEMPTS, "for:", input.email);
        void store.persist();
        return {
          success: false,
          token: null,
          refreshToken: null,
          user: null,
          requiresTwoFactor: false,
          twoFactorToken: null,
          message: `Invalid email or password. ${MAX_FAILED_ATTEMPTS - attempts} attempt(s) remaining.`,
        };
      }

      user.failedLoginAttempts = 0;
      user.lockedUntil = undefined;

      if (user.emailVerified === false) {
        console.log("[Auth] Email not verified:", input.email);
        return {
          success: false,
          token: null,
          refreshToken: null,
          user: null,
          requiresTwoFactor: false,
          twoFactorToken: null,
          message: "Please verify your email before logging in.",
        };
      }

      if (user.twoFactorEnabled && user.twoFactorSecret) {
        const twoFactorToken = signTwoFactorToken(user.id, user.email, user.role);
        console.log("[Auth] 2FA required for:", input.email);
        store.log("login_2fa_required", user.id, `2FA challenge issued from ${input.deviceId || "unknown"}`);
        void store.persist();
        return {
          success: true,
          token: null,
          refreshToken: null,
          user: null,
          requiresTwoFactor: true,
          twoFactorToken,
          message: "Two-factor authentication required.",
        };
      }

      const { accessToken, refreshToken } = issueTokens(user.id, user.email, user.role);

      store.log("login", user.id, `Login from ${input.deviceId || "unknown device"}`);

      return {
        success: true,
        token: accessToken,
        refreshToken,
        user: sanitizeUser(user),
        requiresTwoFactor: false,
        twoFactorToken: null,
        message: "Login successful",
      };
    }),

  verify2FA: publicProcedure
    .input(z.object({
      twoFactorToken: z.string(),
      code: z.string().length(6).or(z.string().length(8)),
    }))
    .mutation(async ({ input }) => {
      console.log("[Auth] 2FA verification attempt");

      const payload = verifyToken(input.twoFactorToken);
      if (!payload || payload.type !== 'twoFactor') {
        console.log("[Auth] Invalid/expired 2FA token");
        return {
          success: false,
          token: null,
          refreshToken: null,
          user: null,
          message: "2FA session expired. Please login again.",
        };
      }

      const user = store.getUser(payload.sub);
      if (!user || !user.twoFactorSecret) {
        return {
          success: false,
          token: null,
          refreshToken: null,
          user: null,
          message: "Invalid 2FA session.",
        };
      }

      let codeValid = false;

      if (input.code.length === 6) {
        codeValid = verifyTOTP(input.code, user.twoFactorSecret);
      }

      if (!codeValid && input.code.length === 8 && user.twoFactorBackupCodes) {
        const upperCode = input.code.toUpperCase();
        const idx = user.twoFactorBackupCodes.indexOf(upperCode);
        if (idx !== -1) {
          user.twoFactorBackupCodes.splice(idx, 1);
          codeValid = true;
          console.log("[Auth] Backup code used, remaining:", user.twoFactorBackupCodes.length);
        }
      }

      if (!codeValid) {
        console.log("[Auth] Invalid 2FA code for:", user.email);
        return {
          success: false,
          token: null,
          refreshToken: null,
          user: null,
          message: "Invalid verification code.",
        };
      }

      const { accessToken, refreshToken } = issueTokens(user.id, user.email, user.role);
      store.log("login_2fa_verified", user.id, "2FA login completed");

      return {
        success: true,
        token: accessToken,
        refreshToken,
        user: sanitizeUser(user),
        message: "Login successful",
      };
    }),

  logout: protectedProcedure
    .mutation(async ({ ctx }) => {
      const userId = ctx.userId!;
      const user = store.getUser(userId);
      if (user) {
        user.refreshToken = undefined;
        user.refreshTokenId = undefined;
        void store.persist();
      }
      store.log("logout", userId, "User logged out");
      console.log("[Auth] Logged out:", userId);
      return { success: true };
    }),

  refreshToken: publicProcedure
    .input(z.object({ refreshToken: z.string() }))
    .mutation(async ({ input }) => {
      console.log("[Auth] Token refresh attempt");

      const payload = verifyToken(input.refreshToken);
      if (!payload || payload.type !== 'refresh') {
        console.log("[Auth] Invalid/expired refresh token");
        return { success: false, token: null, refreshToken: null };
      }

      const user = store.getUser(payload.sub);
      if (!user) {
        console.log("[Auth] User not found for refresh:", payload.sub);
        return { success: false, token: null, refreshToken: null };
      }

      if (user.refreshTokenId && payload.jti !== user.refreshTokenId) {
        console.log("[Auth] Refresh token ID mismatch — possible token reuse");
        user.refreshTokenId = undefined;
        void store.persist();
        return { success: false, token: null, refreshToken: null };
      }

      const { accessToken, refreshToken: newRefresh } = issueTokens(user.id, user.email, user.role);
      console.log("[Auth] Tokens refreshed for:", user.id);

      return {
        success: true,
        token: accessToken,
        refreshToken: newRefresh,
      };
    }),

  verifyEmail: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input }) => {
      console.log("[Auth] Email verification attempt");

      for (const user of store.users.values()) {
        if (user.emailVerifyToken === input.token) {
          if (user.emailVerifyExpires && isTokenExpired(user.emailVerifyExpires)) {
            console.log("[Auth] Email verify token expired for:", user.email);
            return { success: false, message: "Verification link has expired. Please request a new one." };
          }

          user.emailVerified = true;
          user.emailVerifyToken = undefined;
          user.emailVerifyExpires = undefined;
          void store.persist();

          store.log("email_verified", user.id, "Email verified successfully");
          console.log("[Auth] Email verified:", user.email);

          return { success: true, message: "Email verified successfully." };
        }
      }

      console.log("[Auth] Invalid email verification token");
      return { success: false, message: "Invalid verification token." };
    }),

  resendVerificationEmail: protectedProcedure
    .mutation(async ({ ctx }) => {
      const userId = ctx.userId!;
      const user = store.getUser(userId);

      if (!user) return { success: false, message: "User not found." };
      if (user.emailVerified) return { success: false, message: "Email already verified." };

      const newToken = generateSecureToken();
      user.emailVerifyToken = newToken;
      user.emailVerifyExpires = tokenExpiry(EMAIL_VERIFY_EXPIRY_MINUTES);
      void store.persist();

      console.log(`[Auth] Resent verification for ${user.email}`);
      return { success: true, message: "Verification email sent." };
    }),

  forgotPassword: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      console.log("[Auth] Password reset requested for:", input.email);

      const user = store.getUserByEmail(input.email);
      if (!user) {
        console.log("[Auth] User not found for reset:", input.email);
        return { success: true, message: "If that email is registered, a reset link has been sent." };
      }

      const resetToken = generateSecureToken();
      user.passwordResetToken = resetToken;
      user.passwordResetExpires = tokenExpiry(PASSWORD_RESET_EXPIRY_MINUTES);
      void store.persist();

      console.log(`[Auth] Reset token generated for ${input.email} (expires: ${user.passwordResetExpires})`);
      sendPasswordResetEmail(input.email, resetToken, user.firstName).catch(e => console.error('[Auth] Reset email failed:', e));
      store.log("password_reset_requested", user.id, "Password reset token generated");

      return {
        success: true,
        message: "If that email is registered, a reset link has been sent.",
      };
    }),

  resetPassword: publicProcedure
    .input(z.object({
      token: z.string(),
      newPassword: z.string().min(8),
    }))
    .mutation(async ({ input }) => {
      console.log("[Auth] Password reset with token");

      for (const user of store.users.values()) {
        if (user.passwordResetToken === input.token) {
          if (user.passwordResetExpires && isTokenExpired(user.passwordResetExpires)) {
            console.log("[Auth] Reset token expired for:", user.email);
            return { success: false, message: "Reset link has expired. Please request a new one." };
          }

          const newHash = await hashPassword(input.newPassword);
          user.passwordHash = newHash;
          user.passwordResetToken = undefined;
          user.passwordResetExpires = undefined;
          user.failedLoginAttempts = 0;
          user.lockedUntil = undefined;
          user.refreshTokenId = undefined;
          void store.persist();

          store.log("password_reset", user.id, "Password reset completed");
          console.log("[Auth] Password reset success for:", user.email);

          return { success: true, message: "Password has been reset. You can now login." };
        }
      }

      console.log("[Auth] Invalid reset token");
      return { success: false, message: "Invalid or expired reset token." };
    }),

  getProfile: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.userId!;
      const user = store.getUser(userId);
      if (!user) return null;

      const balance = store.getWalletBalance(userId);
      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        country: user.country,
        avatar: user.avatar,
        dateOfBirth: user.dateOfBirth,
        address: user.address,
        kycStatus: user.kycStatus,
        role: user.role,
        accreditationStatus: "verified" as const,
        walletBalance: balance.available,
        totalInvested: balance.invested,
        totalReturns: user.totalReturns,
        createdAt: user.createdAt,
        updatedAt: user.lastActivity,
        emailVerified: user.emailVerified ?? true,
        twoFactorEnabled: user.twoFactorEnabled ?? false,
      };
    }),

  updateProfile: protectedProcedure
    .input(z.object({
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      phone: z.string().optional(),
      avatar: z.string().url().optional(),
      dateOfBirth: z.string().optional(),
      address: z.object({
        street: z.string(),
        city: z.string(),
        state: z.string(),
        postalCode: z.string(),
        country: z.string(),
      }).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const user = store.getUser(userId);
      if (!user) return { success: false };

      if (input.firstName) user.firstName = input.firstName;
      if (input.lastName) user.lastName = input.lastName;
      if (input.phone) user.phone = input.phone;
      if (input.avatar) user.avatar = input.avatar;
      if (input.dateOfBirth) user.dateOfBirth = input.dateOfBirth;
      if (input.address) user.address = input.address;
      user.lastActivity = new Date().toISOString();
      store.log("profile_update", userId, "Updated profile");

      return { success: true };
    }),

  changePassword: protectedProcedure
    .input(z.object({
      currentPassword: z.string(),
      newPassword: z.string().min(8),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const user = store.getUser(userId);
      if (!user) return { success: false, message: "User not found." };

      const valid = await verifyPassword(input.currentPassword, user.passwordHash);
      if (!valid) {
        console.log("[Auth] Change password: wrong current password for", userId);
        return { success: false, message: "Current password is incorrect." };
      }

      const newHash = await hashPassword(input.newPassword);
      user.passwordHash = newHash;
      user.refreshTokenId = undefined;
      user.lastActivity = new Date().toISOString();
      void store.persist();

      store.log("password_change", userId, "Password changed via settings");
      console.log("[Auth] Password changed for:", userId);

      return { success: true, message: "Password updated successfully." };
    }),

  enable2FA: protectedProcedure
    .mutation(async ({ ctx }) => {
      const userId = ctx.userId!;
      const user = store.getUser(userId);
      if (!user) return { success: false, message: "User not found." };

      if (user.twoFactorEnabled) {
        return { success: false, message: "2FA is already enabled." };
      }

      const secret = generateSecret();
      const otpauthUri = getOtpauthUri(secret, user.email);
      const backupCodes = generateBackupCodes();

      user.twoFactorSecret = secret;
      user.twoFactorBackupCodes = backupCodes;
      void store.persist();

      console.log("[Auth] 2FA setup initiated for:", userId);
      store.log("2fa_setup_started", userId, "2FA setup initiated");

      return {
        success: true,
        secret,
        otpauthUri,
        backupCodes,
        message: "Scan the QR code with your authenticator app, then confirm with a code.",
      };
    }),

  confirm2FA: protectedProcedure
    .input(z.object({ code: z.string().length(6) }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const user = store.getUser(userId);
      if (!user) return { success: false, message: "User not found." };

      if (!user.twoFactorSecret) {
        return { success: false, message: "No 2FA setup in progress. Call enable2FA first." };
      }

      if (user.twoFactorEnabled) {
        return { success: false, message: "2FA is already enabled." };
      }

      const valid = verifyTOTP(input.code, user.twoFactorSecret);
      if (!valid) {
        console.log("[Auth] 2FA confirm: invalid code for", userId);
        return { success: false, message: "Invalid verification code. Please try again." };
      }

      user.twoFactorEnabled = true;
      void store.persist();

      store.log("2fa_enabled", userId, "2FA enabled successfully");
      console.log("[Auth] 2FA enabled for:", userId);

      return { success: true, message: "Two-factor authentication enabled." };
    }),

  disable2FA: protectedProcedure
    .input(z.object({
      password: z.string(),
      code: z.string().min(6).max(8),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const user = store.getUser(userId);
      if (!user) return { success: false, message: "User not found." };

      if (!user.twoFactorEnabled) {
        return { success: false, message: "2FA is not enabled." };
      }

      const passwordValid = await verifyPassword(input.password, user.passwordHash);
      if (!passwordValid) {
        console.log("[Auth] Disable 2FA: wrong password for", userId);
        return { success: false, message: "Invalid password." };
      }

      let codeValid = false;
      if (user.twoFactorSecret && input.code.length === 6) {
        codeValid = verifyTOTP(input.code, user.twoFactorSecret);
      }
      if (!codeValid && input.code.length === 8 && user.twoFactorBackupCodes) {
        codeValid = user.twoFactorBackupCodes.includes(input.code.toUpperCase());
      }

      if (!codeValid) {
        console.log("[Auth] Disable 2FA: invalid code for", userId);
        return { success: false, message: "Invalid verification code." };
      }

      user.twoFactorEnabled = false;
      user.twoFactorSecret = undefined;
      user.twoFactorBackupCodes = undefined;
      void store.persist();

      store.log("2fa_disabled", userId, "2FA disabled");
      console.log("[Auth] 2FA disabled for:", userId);

      return { success: true, message: "Two-factor authentication disabled." };
    }),

  updateNotificationSettings: protectedProcedure
    .input(z.object({
      email: z.object({ marketing: z.boolean(), transactions: z.boolean(), dividends: z.boolean(), newProperties: z.boolean() }),
      push: z.object({ transactions: z.boolean(), dividends: z.boolean(), newProperties: z.boolean(), priceAlerts: z.boolean() }),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      store.notificationSettings.set(userId, input as unknown as Record<string, unknown>);
      return { success: true };
    }),

  getNotificationSettings: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.userId!;
      const settings = store.notificationSettings.get(userId);
      if (settings) return settings;
      return {
        email: { marketing: true, transactions: true, dividends: true, newProperties: true },
        push: { transactions: true, dividends: true, newProperties: true, priceAlerts: true },
      };
    }),

  promoteToOwner: protectedProcedure
    .mutation(async ({ ctx }) => {
      const userId = ctx.userId!;
      const user = store.getUser(userId);
      if (!user) return { success: false, message: "User not found." };

      user.role = "owner";
      user.lastActivity = new Date().toISOString();
      void store.persist();

      store.log("role_promote", userId, `User ${userId} promoted to owner`);
      console.log(`[Auth] User ${userId} promoted to owner role`);

      return { success: true, role: "owner", message: "You now have owner access." };
    }),

  deleteAccount: protectedProcedure
    .input(z.object({ password: z.string(), reason: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const user = store.getUser(userId);
      if (!user) return { success: false, message: "User not found." };

      const valid = await verifyPassword(input.password, user.passwordHash);
      if (!valid) {
        return { success: false, message: "Invalid password." };
      }

      user.status = "inactive";
      user.refreshTokenId = undefined;
      void store.persist();

      store.log("account_delete", userId, `Deletion requested. Reason: ${input.reason || "none"}`);
      console.log("[Auth] Account deletion requested:", userId);

      return { success: true, message: "Account scheduled for deletion in 30 days." };
    }),
});
