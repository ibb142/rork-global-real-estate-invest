import * as z from "zod";
import { createTRPCRouter, publicProcedure, adminProcedure } from "../create-context";
import { store } from "../../store/index";

export const waitlistRouter = createTRPCRouter({
  join: publicProcedure
    .input(z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional(),
      country: z.string().optional(),
      investmentInterest: z.enum(["under_1k", "1k_10k", "10k_50k", "50k_plus"]).optional(),
      source: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      console.log("[Waitlist] New registration:", input.email);

      const existing = store.waitlistEntries.find(e => e.email === input.email);
      if (existing) {
        console.log("[Waitlist] Already registered:", input.email);
        return { success: true, alreadyRegistered: true, position: store.waitlistEntries.indexOf(existing) + 1 };
      }

      const entry = {
        id: store.genId("wl"),
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone || "",
        country: input.country || "",
        investmentInterest: input.investmentInterest || "under_1k",
        source: input.source || "landing_page",
        joinedAt: new Date().toISOString(),
      };

      store.waitlistEntries.push(entry);
      console.log("[Waitlist] Total registrations:", store.waitlistEntries.length);

      return { success: true, alreadyRegistered: false, position: store.waitlistEntries.length };
    }),

  getStats: publicProcedure
    .query(async () => {
      return {
        total: store.waitlistEntries.length,
      };
    }),

  listAll: adminProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(200).default(50),
    }))
    .query(async ({ input }) => {
      const result = store.paginate(store.waitlistEntries, input.page, input.limit);
      return { entries: result.items, total: result.total, page: result.page, limit: result.limit };
    }),

  export: adminProcedure
    .query(async () => {
      return { entries: store.waitlistEntries };
    }),
});
