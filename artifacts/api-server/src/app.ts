import express from "express";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger.js";
import { sessionMiddleware } from "./lib/session.js";
import router from "./routes/index.js";

const app = express();

const isProduction = process.env.NODE_ENV === "production";
if (isProduction) {
  app.set("trust proxy", 1);
}

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

// All routes are under /api
app.use("/api", router);

export default app;
