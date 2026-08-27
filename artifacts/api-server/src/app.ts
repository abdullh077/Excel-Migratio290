import express from "express";
import helmet from "helmet";
import cors from "cors";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger.js";
import { sessionMiddleware } from "./lib/session.js";
import { apiLimiter } from "./lib/rateLimit.js";
import { auditMutations } from "./lib/auditMiddleware.js";
import router from "./routes/index.js";

const app = express();

const isProduction = process.env.NODE_ENV === "production";
if (isProduction) {
  app.set("trust proxy", 1);
}

// Security headers. CSP/COEP/CORP are disabled: this API only ever serves
// JSON to the same-origin frontend (no HTML/assets), so those directives
// would add no protection here and risk breaking the artifact proxy.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
  })
);

// Explicit CORS policy. The frontend always calls this API same-origin
// (relative /api/... paths through the artifact proxy), so browser requests
// with no Origin header — same-origin fetches, curl, mobile clients — are
// always allowed. Cross-origin browser requests are rejected unless their
// exact origin is listed in ALLOWED_ORIGINS (comma-separated env var, unset
// by default). This makes the "no cross-origin access" posture an explicit,
// auditable policy instead of an accidental side effect of omitting `cors`.
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);

// Coarse IP-based throttle on every /api request, in addition to the
// tighter per-route limiter applied to /api/auth/login.
app.use("/api", apiLimiter);

// Basic audit trail for data mutations and sensitive downloads. Mounted
// before the routers so it can hook `res.on("finish")` for every request;
// login/logout are audited explicitly in routes/auth.ts instead (they need
// finer-grained outcomes than method+path gives us).
app.use("/api", auditMutations);

// All routes are under /api
app.use("/api", router);

// Final error handler: never let Express's default HTML/stack-trace page
// reach a client (it leaks file paths and internals, as seen from a
// rejected-CORS request or any other thrown error). Log the real error
// server-side, return a generic JSON message to the caller.
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err, path: req.path }, "unhandled request error");
  if (res.headersSent) return;
  const isCors = err instanceof Error && err.message === "Not allowed by CORS";
  res.status(isCors ? 403 : 500).json({ error: isCors ? "Origin not allowed" : "Server error" });
});

export default app;
