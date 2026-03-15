import { createTRPCRouter } from "./create-context";
import { landingRouter } from "./routes/landing";

export const appRouter = createTRPCRouter({
  landing: landingRouter,
});

export type AppRouter = typeof appRouter;
