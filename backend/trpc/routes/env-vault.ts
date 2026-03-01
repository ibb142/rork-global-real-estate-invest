import { createTRPCRouter, publicProcedure } from "../create-context";

export const envVaultRouter = createTRPCRouter({
  getAll: publicProcedure.query(async () => {
    console.log(`[EnvVault] Fetching all env vars`);

    return {
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? '',
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ?? '',
      AWS_REGION: process.env.AWS_REGION ?? '',
      EXPO_PUBLIC_RORK_DB_ENDPOINT: process.env.EXPO_PUBLIC_RORK_DB_ENDPOINT ?? '',
      EXPO_PUBLIC_RORK_DB_NAMESPACE: process.env.EXPO_PUBLIC_RORK_DB_NAMESPACE ?? '',
      EXPO_PUBLIC_RORK_DB_TOKEN: process.env.EXPO_PUBLIC_RORK_DB_TOKEN ?? '',
      EXPO_PUBLIC_RORK_API_BASE_URL: process.env.EXPO_PUBLIC_RORK_API_BASE_URL ?? '',
      EXPO_PUBLIC_TOOLKIT_URL: process.env.EXPO_PUBLIC_TOOLKIT_URL ?? '',
      EXPO_PUBLIC_PROJECT_ID: process.env.EXPO_PUBLIC_PROJECT_ID ?? '',
      EXPO_PUBLIC_TEAM_ID: process.env.EXPO_PUBLIC_TEAM_ID ?? '',
    };
  }),
});
