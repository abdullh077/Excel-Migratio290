import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger.js";
import { sessionMiddleware } from "./lib/session.js";
import { apiLimiter } from "./lib/rateLimit.js";
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

// All routes are under /api
app.use("/api", router);

export default app;
