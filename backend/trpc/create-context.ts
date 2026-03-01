import { initTRPC, TRPCError } from "@trpc/server";
import { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import superjson from "superjson";
import { verifyToken } from "../lib/jwt";

export const createContext = async (opts: FetchCreateContextFnOptions) => {
  const authHeader = opts.req.headers.get("authorization");
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  let userId: string | null = null;
  let userRole: string | null = null;
  let isAuthenticated = false;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const payload = verifyToken(token);
    if (payload && payload.type === "access") {
      userId = payload.sub;
      userRole = payload.role;
      isAuthenticated = true;
      console.log(`[Context] ${requestId} JWT auth: ${userId} (${userRole})`);
    } else {
      console.log(`[Context] ${requestId} Invalid/expired JWT`);
    }
  }


  return {
    req: opts.req,
    userId,
    userRole,
    requestId,
    isAuthenticated,
    isCeo: userRole === "ceo",
    isAdmin: userRole === "owner" || userRole === "ceo" || userRole === "staff" || userRole === "manager" || userRole === "analyst",
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error, ctx }) {
    console.error(`[tRPC Error] ${ctx?.requestId || 'unknown'}:`, error.message);
    return {
      ...shape,
      data: {
        ...shape.data,
        requestId: ctx?.requestId,
      },
    };
  },
});

const loggerMiddleware = t.middleware(async ({ path, type, ctx, next }) => {
  const start = Date.now();
  const result = await next();
  const duration = Date.now() - start;

  if (duration > 1000) {
    console.warn(`[SLOW] ${ctx.requestId} ${type} ${path} took ${duration}ms`);
  } else {
    console.log(`[tRPC] ${ctx.requestId} ${type} ${path} ${duration}ms`);
  }

  return result;
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure.use(loggerMiddleware);

export const protectedProcedure = t.procedure
  .use(loggerMiddleware)
  .use(async ({ ctx, next }) => {
    if (!ctx.isAuthenticated || !ctx.userId) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "You must be logged in to perform this action",
      });
    }
    return next({
      ctx: {
        ...ctx,
        userId: ctx.userId,
        userRole: ctx.userRole ?? 'investor',
      },
    });
  });

export const adminProcedure = t.procedure
  .use(loggerMiddleware)
  .use(async ({ ctx, next }) => {
    if (!ctx.isAuthenticated || !ctx.userId || !ctx.isAdmin) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Admin access required",
      });
    }
    return next({
      ctx: {
        ...ctx,
        userId: ctx.userId,
        userRole: ctx.userRole ?? 'owner',
      },
    });
  });

export const ceoProcedure = t.procedure
  .use(loggerMiddleware)
  .use(async ({ ctx, next }) => {
    if (!ctx.isAuthenticated || !ctx.userId || !ctx.isCeo) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "CEO access required for this action",
      });
    }
    return next({
      ctx: {
        ...ctx,
        userId: ctx.userId,
        userRole: ctx.userRole ?? 'ceo',
      },
    });
  });
