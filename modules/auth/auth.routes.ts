import { Router } from "express";
import bcrypt from "bcrypt";
import { poolPromise, sql } from "../../db/connection.js";
import { registerSchema, verifyEmailSchema, loginSchema} from "./auth.schema.js";
import { createHash, randomBytes } from "node:crypto";
import { authenticate } from "../../middleware/authenticate.js";


const router = Router();


router.get("/me", authenticate, (_req, res) => {
  return res.json({
    user: res.locals.user,
  });
});

router.post("/register", async (req, res, next) => {
  try {
    const { name, email, password } = registerSchema.parse(req.body);
    const role = "owner";
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
    const verificationToken = randomBytes(32).toString("hex");

    const verificationTokenHash = createHash("sha256")
      .update(verificationToken)
      .digest("hex");

    const verificationExpiresAt = new Date(
      Date.now() + 1000 * 60 * 60 * 24,
    );
   const transaction = new sql.Transaction(pool);

  try {
  await transaction.begin();

  const result = await new sql.Request(transaction)
    .input("name", sql.NVarChar(100), name.trim())
    .input("email", sql.NVarChar(255), normalizedEmail)
    .input("passwordHash", sql.NVarChar(255), passwordHash)
    .input("verificationTokenHash", sql.Char(64), verificationTokenHash)
    .input("verificationExpiresAt", sql.DateTime2, verificationExpiresAt)
    .query<{
      id: number;
      name: string;
      email: string;
    }>(`
      INSERT INTO dbo.Users (
        name,
        email,
        passwordHash,
        emailVerificationTokenHash,
        emailVerificationExpiresAt
      )
      OUTPUT INSERTED.id, INSERTED.name, INSERTED.email
      VALUES (
        @name,
        @email,
        @passwordHash,
        @verificationTokenHash,
        @verificationExpiresAt
      );
    `);

  const user = result.recordset[0];

  const roleResult = await new sql.Request(transaction)
    .input("role", sql.NVarChar(30), role)
    .query<{ id: number }>(`
      SELECT id
      FROM dbo.Roles
      WHERE name = @role;
    `);

  const roleRecord = roleResult.recordset[0];

  if (!roleRecord) {
    throw new Error("Requested role does not exist");
  }

  await new sql.Request(transaction)
    .input("userId", sql.Int, user.id)
    .input("roleId", sql.Int, roleRecord.id)
    .query(`
      INSERT INTO dbo.UserRoles (userId, roleId)
      VALUES (@userId, @roleId);
    `);

  await transaction.commit();

  const verificationUrl =
    `http://localhost:3001/auth/verify-email?token=${verificationToken}`;

  console.log(`Verification link for ${user.email}: ${verificationUrl}`);

  return res.status(201).json({
    user: {
      ...user,
      roles: [role],
    },
  });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
} catch (error) {
  next(error);
}
});
router.get("/verify-email", async (req, res, next) => {
  try {
    const token = verifyEmailSchema.parse(req.query).token;

    const tokenHash = createHash("sha256")
      .update(token)
      .digest("hex");

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("tokenHash", sql.Char(64), tokenHash)
      .query(`
        UPDATE dbo.Users
        SET
          emailVerifiedAt = SYSUTCDATETIME(),
          emailVerificationTokenHash = NULL,
          emailVerificationExpiresAt = NULL
        WHERE
          emailVerificationTokenHash = @tokenHash
          AND emailVerificationExpiresAt > SYSUTCDATETIME()
          AND emailVerifiedAt IS NULL;
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(400).json({
        error: "Verification link is invalid or has expired",
      });
    }

    return res.json({ message: "Email verified" });
  } catch (error) {
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const normalizedEmail = email.trim().toLowerCase();

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("email", sql.NVarChar(255), normalizedEmail)
      .query<{
        id: number;
        name: string;
        email: string;
        passwordHash: string;
        role: string;
        emailVerifiedAt: Date | null;
      }>(`
        SELECT
          id,
          name,
          email,
          passwordHash,
          role,
          emailVerifiedAt
        FROM dbo.Users
        WHERE email = @email;
      `);

    const user = result.recordset[0];

    if (!user) {
      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    const passwordIsCorrect = await bcrypt.compare(
      password,
      user.passwordHash,
    );

    if (!passwordIsCorrect) {
      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    if (!user.emailVerifiedAt) {
      return res.status(403).json({
        error: "Please verify your email before signing in",
      });
    }

    const sessionToken = randomBytes(32).toString("hex");

    const sessionTokenHash = createHash("sha256")
      .update(sessionToken)
      .digest("hex");

    const sessionExpiresAt = new Date(
      Date.now() + 1000 * 60 * 60 * 24 * 7,
    );

    await pool
      .request()
      .input("userId", sql.Int, user.id)
      .input("tokenHash", sql.Char(64), sessionTokenHash)
      .input("expiresAt", sql.DateTime2, sessionExpiresAt)
      .query(`
        INSERT INTO dbo.Sessions (userId, tokenHash, expiresAt)
        VALUES (@userId, @tokenHash, @expiresAt);
      `);

    res.cookie("session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;  