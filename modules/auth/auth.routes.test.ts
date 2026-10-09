import request from "supertest";
import { describe, expect, it, afterEach, afterAll } from "vitest";
import app from "../../app.js";
import { poolPromise, sql } from "../../db/connection.js";
import { randomUUID } from "node:crypto";

async function deleteTestUser(email: string) {
  const pool = await poolPromise;

  await pool
    .request()
    .input("email", sql.NVarChar(255), email)
    .query(`
      DELETE s
      FROM dbo.Sessions AS s
      INNER JOIN dbo.Users AS u ON u.id = s.userId
      WHERE u.email = @email;

      DELETE ur
      FROM dbo.UserRoles AS ur
      INNER JOIN dbo.Users AS u ON u.id = ur.userId
      WHERE u.email = @email;

      DELETE FROM dbo.Users
      WHERE email = @email;
    `);
}

afterAll(async () => {
  const pool = await poolPromise;
  await pool.close();
});

describe("authentication", () => {
  let testEmail = "";

  afterEach(async () => {
    if (testEmail) {
      await deleteTestUser(testEmail);
    }
  });

  it("allows a verified owner to log in and read their session", async () => {
    testEmail = `test-${randomUUID()}@example.test`;

    const password = "a-long-test-password";
    const registerResponse = await request(app)
      .post("/auth/register")
      .send({
        name: "Test Owner",
        email: testEmail,
        password,
      });

    expect(registerResponse.status).toBe(201);

        const pool = await poolPromise;

    await pool
      .request()
      .input("email", sql.NVarChar(255), testEmail)
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
        email: testEmail,
        password,
      });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.user.email).toBe(testEmail);
    expect(loginResponse.body.user.roles).toEqual(["owner"]);
    const setCookies = loginResponse.headers["set-cookie"] ?? [];

    const sessionSetCookie = setCookies.find((cookie: string) =>
      cookie.startsWith("session="),
    );

    expect(sessionSetCookie).toBeDefined();

    const sessionCookie = sessionSetCookie!.split(";")[0];
        const sessionResponse = await request(app)
      .get("/auth/session")
      .set("Cookie", sessionCookie);

    expect(sessionResponse.status).toBe(200);
    expect(sessionResponse.body.user).toMatchObject({
      name: "Test Owner",
      email: testEmail,
      roles: ["owner"],
    });
  });
});


describe("GET /auth/session", () => {
  it("returns 401 when no session cookie is sent", async () => {
    const response = await request(app).get("/auth/session");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: "Authentication required",
    });
  });
});