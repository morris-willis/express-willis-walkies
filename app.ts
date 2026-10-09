import express from "express";
import cookieParser from "cookie-parser";
import type { NextFunction, Request, Response } from "express";
import authRouter from "./modules/auth/auth.routes.js";
import ownerRouter from "./modules/owner/owner.routes.js";



const app = express();

app.use(express.json());
app.use(cookieParser());

// handles login, registration, and logout routes
app.use("/auth", authRouter);

//handles owner profile and dog routes
app.use("/owner", ownerRouter);

// Move your existing GET /users/:id route here too, if keeping it.

app.use(
  (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  },
);

export default app;