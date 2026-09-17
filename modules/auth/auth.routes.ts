import { Router } from "express";
import bcrypt from "bcrypt";
import { poolPromise, sql } from "../../db/connection.js";
import { registerSchema } from "./auth.schema.js";
const router = Router();


router.post("/register", async (req, res, next) => {
  try {
    const { name, email, password } = registerSchema.parse(req.body);

    const normalizedEmail = email.trim().toLowerCase();
    const pool = await poolPromise;
    const existingUser = await pool
      .request()
      .input("email", sql.NVarChar(255), normalizedEmail)
      .query(`
        SELECT id
        FROM dbo.Users
        WHERE email = @email;
      `);

    if (existingUser.recordset.length > 0) {
      return res.status(409).json({
        error: "Unable to create account",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

   const result = await pool
    .request()
      .input("name", sql.NVarChar(100), name.trim())
      .input("email", sql.NVarChar(255), normalizedEmail)
      .input("passwordHash", sql.NVarChar(255), passwordHash)
      .input("role", sql.NVarChar(20), "user")
      .query(`
        INSERT INTO dbo.Users (name, email, passwordHash, role)
        OUTPUT
          INSERTED.id,
          INSERTED.name,
          INSERTED.email,
          INSERTED.role,
          INSERTED.createdAt
        VALUES (@name, @email, @passwordHash, @role);
      `);

  const user = result.recordset[0];
  // Replace with your session creation function.
  // const sessionToken = await createSession(user.id);

  //   res.cookie("session", sessionToken, {
  //     httpOnly: true,
  //     secure: process.env.NODE_ENV === "production",
  //     sameSite: "lax",
  //     path: "/",
  //     maxAge: 1000 * 60 * 60 * 24 * 7,
  //   });

    return res.status(201).json({ user });
  } catch (error) {
    next(error);
  }
});

export default router;  