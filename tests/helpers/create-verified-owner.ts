import { randomUUID } from "node:crypto";
import request from "supertest";
import app from "../../app.js";
import { poolPromise, sql } from "../../db/connection.js";

export type TestOwner = {
  email: string;
  password: string;
  sessionCookie: string;
};

export async function createVerifiedOwner(): Promise<TestOwner> {
  const email = `test-owner-${randomUUID()}@example.test`;
  const password = "a-long-test-password";

  const registerResponse = await request(app)
    .post("/auth/register")
    .send({
      name: "Test Owner",
      email,
      password,
    });

  if (registerResponse.status !== 201) {
    throw new Error(
      `Could not register test owner: ${JSON.stringify(registerResponse.body)}`,
    );
  }

  const pool = await poolPromise;

  await pool
    .request()
    .input("email", sql.NVarChar(255), email)
    .query(`
      UPDATE dbo.Users
      SET
        emailVerifiedAt = SYSUTCDATETIME(),
        emailVerificationTokenHash = NULL,
        emailVerificationExpiresAt = NULL
      WHERE email = @email;
    `);

  const loginResponse = await request(app)
    .post("/auth/login")
    .send({
      email,
      password,
    });

  if (loginResponse.status !== 200) {
    throw new Error(
      `Could not log in test owner: ${JSON.stringify(loginResponse.body)}`,
    );
  }

  const setCookies = loginResponse.headers["set-cookie"] ?? [];

  const sessionSetCookie = setCookies.find((cookie: string) =>
    cookie.startsWith("session="),
  );

  if (!sessionSetCookie) {
    throw new Error("Login did not return a session cookie");
  }

  return {
    email,
    password,
    sessionCookie: sessionSetCookie.split(";")[0],
  };
}