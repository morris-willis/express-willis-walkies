import { afterEach, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../app.js";
import { poolPromise, sql } from "../../db/connection.js";
import {
  createVerifiedOwner,
  type TestOwner,
} from "../../tests/helpers/create-verified-owner.js";

async function deleteTestUser(email: string) {
  const pool = await poolPromise;

  await pool
    .request()
    .input("email", sql.NVarChar(255), email)
    .query(`
      DELETE d
      FROM dbo.Dogs AS d
      INNER JOIN dbo.OwnerProfiles AS op ON op.id = d.ownerProfileId
      INNER JOIN dbo.Users AS u ON u.id = op.userId
      WHERE u.email = @email;

      DELETE s
      FROM dbo.Sessions AS s
      INNER JOIN dbo.Users AS u ON u.id = s.userId
      WHERE u.email = @email;

      DELETE ur
      FROM dbo.UserRoles AS ur
      INNER JOIN dbo.Users AS u ON u.id = ur.userId
      WHERE u.email = @email;

      DELETE op
      FROM dbo.OwnerProfiles AS op
      INNER JOIN dbo.Users AS u ON u.id = op.userId
      WHERE u.email = @email;

      DELETE FROM dbo.Users
      WHERE email = @email;
    `);
}

describe("Owner Profile Routes", () => {
  let owner: TestOwner | undefined;

  afterEach(async () => {
    if (owner) {
      await deleteTestUser(owner.email);
    }
  });

  it("allows a logged-in owner to create their profile", async () => {
    // Arrange: create a unique, verified, logged-in owner.
    owner = await createVerifiedOwner();

    // Act: the owner sends their profile information.
    const response = await request(app)
      .post("/owner/profile")
      .set("Cookie", owner.sessionCookie)
      .send({
        phoneNumber: "07123456789",
        addressLine1: "1 Test Street",
        city: "London",
        postcode: "SW1A 1AA",
      });

    // Assert: Express confirms profile creation.
    expect(response.status).toBe(201);

    expect(response.body.profile).toMatchObject({
      phoneNumber: "07123456789",
      addressLine1: "1 Test Street",
      city: "London",
      postcode: "SW1A 1AA",
    });

    expect(response.body.profile.id).toEqual(expect.any(Number));
  });

  it("allows an owner with a profile to add a dog", async () => {
  // Arrange: create and log in a unique owner.
  owner = await createVerifiedOwner();

  // A dog must belong to an existing owner profile.
  const profileResponse = await request(app)
    .post("/owner/profile")
    .set("Cookie", owner.sessionCookie)
    .send({
      phoneNumber: "07123456789",
      addressLine1: "1 Test Street",
      city: "London",
      postcode: "SW1A 1AA",
    });

    expect(profileResponse.status).toBe(201);

    // Act: add a dog as that logged-in owner.
    const dogResponse = await request(app)
      .post("/owner/dogs")
      .set("Cookie", owner.sessionCookie)
      .send({
        name: "Willis",
        breed: "Labrador",
        dateOfBirth: "2022-04-15",
        notes: "Friendly with other dogs",
      });

    // Assert: the dog was created and returned.
    expect(dogResponse.status).toBe(201);

    expect(dogResponse.body.dog).toMatchObject({
      name: "Willis",
      breed: "Labrador",
      notes: "Friendly with other dogs",
    });

    expect(dogResponse.body.dog.id).toEqual(expect.any(Number));
  });

  it("allows an owner to update their own profile", async () => {
    owner = await createVerifiedOwner();

    await request(app)
      .post("/owner/profile")
      .set("Cookie", owner.sessionCookie)
      .send({
        phoneNumber: "07123456789",
        addressLine1: "1 Test Street",
        city: "London",
        postcode: "SW1A 1AA",
      });

    const response = await request(app)
      .patch("/owner/profile")
      .set("Cookie", owner.sessionCookie)
      .send({
        phoneNumber: "07999999999",
        city: "Manchester",
      });

    expect(response.status).toBe(200);

    expect(response.body.profile).toMatchObject({
      phoneNumber: "07999999999",
      city: "Manchester",
      addressLine1: "1 Test Street",
      postcode: "SW1A 1AA",
    });
  });

  it("allows an owner to update their own dog", async () => {
    owner = await createVerifiedOwner();

    await request(app)
      .post("/owner/profile")
      .set("Cookie", owner.sessionCookie)
      .send({
        phoneNumber: "07123456789",
        addressLine1: "1 Test Street",
        city: "London",
        postcode: "SW1A 1AA",
      });

    const createDogResponse = await request(app)
      .post("/owner/dogs")
      .set("Cookie", owner.sessionCookie)
      .send({
        name: "Willis",
        breed: "Labrador",
        notes: "Friendly with other dogs",
      });

    expect(createDogResponse.status).toBe(201);

    const dogId = createDogResponse.body.dog.id;

    const updateDogResponse = await request(app)
      .patch(`/owner/dogs/${dogId}`)
      .set("Cookie", owner.sessionCookie)
      .send({
        name: "Willis Junior",
        notes: "Needs a lead near roads",
      });

    expect(updateDogResponse.status).toBe(200);

    expect(updateDogResponse.body.dog).toMatchObject({
      id: dogId,
      name: "Willis Junior",
      breed: "Labrador",
      notes: "Needs a lead near roads",
    });
  });

  it("does not allow one owner to update another owner's dog", async () => {
    let ownerA: TestOwner | undefined;
    let ownerB: TestOwner | undefined;

    try {
      ownerA = await createVerifiedOwner();
      ownerB = await createVerifiedOwner();

      const ownerAProfileResponse = await request(app)
        .post("/owner/profile")
        .set("Cookie", ownerA.sessionCookie)
        .send({
          phoneNumber: "07123456789",
          addressLine1: "1 Owner A Street",
          city: "London",
          postcode: "SW1A 1AA",
        });

      expect(ownerAProfileResponse.status).toBe(201);

      const ownerBProfileResponse = await request(app)
        .post("/owner/profile")
        .set("Cookie", ownerB.sessionCookie)
        .send({
          phoneNumber: "07999999999",
          addressLine1: "2 Owner B Street",
          city: "Manchester",
          postcode: "M1 1AE",
        });

      expect(ownerBProfileResponse.status).toBe(201);

      const createDogResponse = await request(app)
        .post("/owner/dogs")
        .set("Cookie", ownerA.sessionCookie)
        .send({
          name: "Willis",
          breed: "Labrador",
          notes: "Friendly with other dogs",
        });

      expect(createDogResponse.status).toBe(201);

      const dogId = createDogResponse.body.dog.id;

      const attackResponse = await request(app)
        .patch(`/owner/dogs/${dogId}`)
        .set("Cookie", ownerB.sessionCookie)
        .send({
          name: "Stolen Dog",
        });

      expect(attackResponse.status).toBe(404);
      expect(attackResponse.body).toEqual({
        error: "Dog not found",
      });

      const pool = await poolPromise;

      const dogResult = await pool
        .request()
        .input("dogId", sql.Int, dogId)
        .query<{
          name: string;
          notes: string | null;
        }>(`
          SELECT name, notes
          FROM dbo.Dogs
          WHERE id = @dogId;
        `);

      expect(dogResult.recordset[0]).toMatchObject({
        name: "Willis",
        notes: "Friendly with other dogs",
      });
    } finally {
      if (ownerA) {
        await deleteTestUser(ownerA.email);
      }

      if (ownerB) {
        await deleteTestUser(ownerB.email);
      }
    }
  });

  it("creates a dog for the logged-in owner, not a supplied ownerProfileId", async () => {
    let ownerA: TestOwner | undefined;
    let ownerB: TestOwner | undefined;

    try {
      ownerA = await createVerifiedOwner();
      ownerB = await createVerifiedOwner();

      const ownerAProfileResponse = await request(app)
        .post("/owner/profile")
        .set("Cookie", ownerA.sessionCookie)
        .send({
          phoneNumber: "07123456789",
          addressLine1: "1 Owner A Street",
          city: "London",
          postcode: "SW1A 1AA",
        });

      const ownerBProfileResponse = await request(app)
        .post("/owner/profile")
        .set("Cookie", ownerB.sessionCookie)
        .send({
          phoneNumber: "07999999999",
          addressLine1: "2 Owner B Street",
          city: "Manchester",
          postcode: "M1 1AE",
        });

      const ownerAProfileId = ownerAProfileResponse.body.profile.id;
      const ownerBProfileId = ownerBProfileResponse.body.profile.id;

      const createDogResponse = await request(app)
        .post("/owner/dogs")
        .set("Cookie", ownerB.sessionCookie)
        .send({
          name: "Willis",
          breed: "Labrador",

          // A malicious frontend could try this.
          ownerProfileId: ownerAProfileId,
        });

      expect(createDogResponse.status).toBe(201);

      const dogId = createDogResponse.body.dog.id;

      const pool = await poolPromise;

      const dogResult = await pool
        .request()
        .input("dogId", sql.Int, dogId)
        .query<{ ownerProfileId: number }>(`
          SELECT ownerProfileId
          FROM dbo.Dogs
          WHERE id = @dogId;
        `);

      expect(dogResult.recordset[0].ownerProfileId).toBe(ownerBProfileId);
      expect(dogResult.recordset[0].ownerProfileId).not.toBe(ownerAProfileId);
    } finally {
      if (ownerA) await deleteTestUser(ownerA.email);
      if (ownerB) await deleteTestUser(ownerB.email);
    }
  });

  it("does not return one owner's dogs to another owner", async () => {
    let ownerA: TestOwner | undefined;
    let ownerB: TestOwner | undefined;

    try {
      ownerA = await createVerifiedOwner();
      ownerB = await createVerifiedOwner();

      await request(app)
        .post("/owner/profile")
        .set("Cookie", ownerA.sessionCookie)
        .send({
          phoneNumber: "07123456789",
          addressLine1: "1 Owner A Street",
          city: "London",
          postcode: "SW1A 1AA",
        });

      await request(app)
        .post("/owner/profile")
        .set("Cookie", ownerB.sessionCookie)
        .send({
          phoneNumber: "07999999999",
          addressLine1: "2 Owner B Street",
          city: "Manchester",
          postcode: "M1 1AE",
        });

      const createDogResponse = await request(app)
        .post("/owner/dogs")
        .set("Cookie", ownerA.sessionCookie)
        .send({
          name: "Willis",
          breed: "Labrador",
        });

      expect(createDogResponse.status).toBe(201);

      const ownerBDogsResponse = await request(app)
        .get("/owner/dogs")
        .set("Cookie", ownerB.sessionCookie);

      expect(ownerBDogsResponse.status).toBe(200);
      expect(ownerBDogsResponse.body.dogs).toEqual([]);
    } finally {
      if (ownerA) await deleteTestUser(ownerA.email);
      if (ownerB) await deleteTestUser(ownerB.email);
    }
  });
});