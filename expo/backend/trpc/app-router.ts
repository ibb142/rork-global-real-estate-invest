import { createTRPCRouter } from "./create-context";
import { landingRouter } from "./routes/landing";
import { analyticsRouter } from "./routes/analytics";

export const appRouter = createTRPCRouter({
  landing: landingRouter,
  analytics: analyticsRouter,
});

export type AppRouter = typeof appRouter;
