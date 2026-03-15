import { createTRPCRouter, publicProcedure } from "../create-context";

export const landingRouter = createTRPCRouter({
  getConfig: publicProcedure.query(() => {
    const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || "").trim();
    const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "").trim();
    const apiBaseUrl = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || "").trim().replace(/\/$/, "");

    return {
      supabaseUrl,
      supabaseAnonKey,
      apiBaseUrl,
      appUrl: apiBaseUrl,
      servedAt: new Date().toISOString(),
    };
  }),

  getDeals: publicProcedure.query(async () => {
    const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || "").trim();
    const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "").trim();

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("[tRPC] landing.getDeals: Supabase not configured");
      return { deals: [], error: "Supabase not configured" };
    }

    const queries = [
      `${supabaseUrl}/rest/v1/jv_deals?select=*&published=eq.true&status=eq.active&order=created_at.desc`,
      `${supabaseUrl}/rest/v1/jv_deals?select=*&published=eq.true`,
      `${supabaseUrl}/rest/v1/jv_deals?select=*&status=eq.active`,
    ];

    const headers = {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      "Content-Type": "application/json",
    };

    for (const url of queries) {
      try {
        const response = await fetch(url, { headers });
        if (!response.ok) continue;
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          console.log("[tRPC] landing.getDeals: Found", data.length, "deals");
          return { deals: data, servedAt: new Date().toISOString() };
        }
      } catch (err) {
        console.warn("[tRPC] landing.getDeals query failed:", (err as Error).message);
      }
    }

    return { deals: [], servedAt: new Date().toISOString() };
  }),
});
