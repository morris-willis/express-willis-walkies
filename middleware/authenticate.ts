import type { NextFunction, Request, Response } from "express";
import { createHash } from "node:crypto";
import { poolPromise, sql } from "../db/connection.js";

export type AuthenticatedUser = {
  id: number;
  name: string;
  email: string;
  role: string;
};

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const sessionToken = req.cookies.session;

    if (typeof sessionToken !== "string") {
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    const tokenHash = createHash("sha256")
      .update(sessionToken)
      .digest("hex");

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("tokenHash", sql.Char(64), tokenHash)
      .query<AuthenticatedUser>(`
        SELECT
          u.id,
          u.name,
          u.email,
          u.role
        FROM dbo.Sessions AS s
        INNER JOIN dbo.Users AS u ON u.id = s.userId
        WHERE
          s.tokenHash = @tokenHash
          AND s.expiresAt > SYSUTCDATETIME();
      `);

    const user = result.recordset[0];

    if (!user) {
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    res.locals.user = user;
    next();
  } catch (error) {
    next(error);
  }
}