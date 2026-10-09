import express from "express";
import cookieParser from "cookie-parser";
import type { NextFunction, Request, Response } from "express";
import authRouter from "./modules/auth/auth.routes.js";
import ownerRouter from "./modules/owner/owner.routes.js";
import { ZodError } from "zod";


const isUniqueConstraintError = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const databaseError = error as { number?: unknown };

  // SQL Server:
  // 2601 = duplicate key in a unique index
  // 2627 = violation of a UNIQUE or PRIMARY KEY constraint
  return (
    databaseError.number === 2601 ||
    databaseError.number === 2627
  );
}
const app = express();

app.use(express.json());
app.use(cookieParser());

// handles login, registration, and logout routes
app.use("/auth", authRouter);

//handles owner profile and dog routes
app.use("/owner", ownerRouter);

// Move your existing GET /users/:id route here too, if keeping it.

// Runs only when no route above matched.
app.use((_req: Request, res: Response) => {
  return res.status(404).json({
    error: "Route not found",
  });
});

app.use(
  (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: "Invalid request",
        details: error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    if (isUniqueConstraintError(error)) {
      return res.status(409).json({
        error: "A record with those details already exists",
      });
    }
    
    return res.status(500).json({ error: "Internal server error" });
  },
);

export default app;