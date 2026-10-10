import { Router } from "express";
import { poolPromise, sql } from "../../db/connection.js";
import { authenticate } from "../../middleware/authenticate.js";
import {
  createDogSchema,
  createOwnerProfileSchema,
  updateDogSchema,
  updateOwnerProfileSchema,
} from "./owner.schema.js";

const router = Router();

function requireOwner(_req: unknown, res: any, next: () => void) {
  const roles = res.locals.user?.roles;

  if (!Array.isArray(roles) || !roles.includes("owner")) {
    return res.status(403).json({ error: "Owners only" });
  }

  next();
}
router.post("/profile", authenticate, requireOwner, async (req, res, next) => {
  try {
    const profile = createOwnerProfileSchema.parse(req.body);
    const userId = res.locals.user.id;

    const pool = await poolPromise;

    const existingProfile = await pool
      .request()
      .input("userId", sql.Int, userId)
      .query(`
        SELECT id
        FROM dbo.OwnerProfiles
        WHERE userId = @userId;
      `);

    if (existingProfile.recordset.length > 0) {
      return res.status(409).json({
        error: "Owner profile already exists",
      });
    }

    const result = await pool
      .request()
      .input("userId", sql.Int, userId)
      .input("phoneNumber", sql.NVarChar(30), profile.phoneNumber)
      .input("addressLine1", sql.NVarChar(100), profile.addressLine1)
      .input("addressLine2", sql.NVarChar(100), profile.addressLine2 ?? null)
      .input("city", sql.NVarChar(100), profile.city)
      .input("postcode", sql.NVarChar(20), profile.postcode)
      .query(`
        INSERT INTO dbo.OwnerProfiles (
          userId,
          phoneNumber,
          addressLine1,
          addressLine2,
          city,
          postcode
        )
        OUTPUT
          INSERTED.id,
          INSERTED.phoneNumber,
          INSERTED.addressLine1,
          INSERTED.addressLine2,
          INSERTED.city,
          INSERTED.postcode
        VALUES (
          @userId,
          @phoneNumber,
          @addressLine1,
          @addressLine2,
          @city,
          @postcode
        );
      `);

    return res.status(201).json({
      profile: result.recordset[0],
    });
  } catch (error) {
    next(error);
  }
});

router.post("/dogs", authenticate, requireOwner, async (req, res, next) => {
  try {
    const dog = createDogSchema.parse(req.body);
    const userId = res.locals.user.id;

    const pool = await poolPromise;

    const profileResult = await pool
      .request()
      .input("userId", sql.Int, userId)
      .query<{ id: number }>(`
        SELECT id
        FROM dbo.OwnerProfiles
        WHERE userId = @userId;
      `);

    const ownerProfile = profileResult.recordset[0];

    if (!ownerProfile) {
      return res.status(409).json({
        error: "Create an owner profile before adding dogs",
      });
    }

    const result = await pool
      .request()
      .input("ownerProfileId", sql.Int, ownerProfile.id)
      .input("name", sql.NVarChar(100), dog.name)
      .input("breed", sql.NVarChar(100), dog.breed ?? null)
      .input("dateOfBirth", sql.Date, dog.dateOfBirth ?? null)
      .input("notes", sql.NVarChar(1000), dog.notes ?? null)
      .query(`
        INSERT INTO dbo.Dogs (
          ownerProfileId,
          name,
          breed,
          dateOfBirth,
          notes
        )
        OUTPUT
          INSERTED.id,
          INSERTED.name,
          INSERTED.breed,
          INSERTED.dateOfBirth,
          INSERTED.notes
        VALUES (
          @ownerProfileId,
          @name,
          @breed,
          @dateOfBirth,
          @notes
        );
      `);

    return res.status(201).json({
      dog: result.recordset[0],
    });
  } catch (error) {
    next(error);
  }
});

router.get("/dogs", authenticate, requireOwner, async (req, res, next) => {
  try {
    const userId = res.locals.user.id;
    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("userId", sql.Int, userId)
      .query<{
        id: number;
        name: string;
        breed: string | null;
        dateOfBirth: Date | null;
        notes: string | null;
      }>(`
        SELECT
          d.id,
          d.name,
          d.breed,
          d.dateOfBirth,
          d.notes
        FROM dbo.Dogs AS d
        INNER JOIN dbo.OwnerProfiles AS op
          ON op.id = d.ownerProfileId
        WHERE op.userId = @userId
        ORDER BY d.name;
      `);

    return res.json({
      dogs: result.recordset,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/profile", authenticate, requireOwner, async (req, res, next) => {
  try {
    const userId = res.locals.user.id;
    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("userId", sql.Int, userId)
      .query<{
        id: number;
        phoneNumber: string;
        addressLine1: string;
        addressLine2: string | null;
        city: string;
        postcode: string;
      }>(`
        SELECT
          id,
          phoneNumber,
          addressLine1,
          addressLine2,
          city,
          postcode
        FROM dbo.OwnerProfiles
        WHERE userId = @userId;
      `);

    const profile = result.recordset[0];

    if (!profile) {
      return res.status(404).json({
        error: "Owner profile not found",
      });
    }

    return res.json({ profile });
  } catch (error) {
    next(error);
  }
});

router.patch(
  "/profile",
  authenticate,
  requireOwner,
  async (req, res, next) => {
    try {
      const updates = updateOwnerProfileSchema.parse(req.body);
      const userId = res.locals.user.id;

      const pool = await poolPromise;

      const result = await pool
        .request()
        .input("userId", sql.Int, userId)
        .input("hasPhoneNumber", sql.Bit, updates.phoneNumber !== undefined)
        .input("phoneNumber", sql.NVarChar(30), updates.phoneNumber ?? null)
        .input("hasAddressLine1", sql.Bit, updates.addressLine1 !== undefined)
        .input("addressLine1", sql.NVarChar(100), updates.addressLine1 ?? null)
        .input("hasAddressLine2", sql.Bit, updates.addressLine2 !== undefined)
        .input("addressLine2", sql.NVarChar(100), updates.addressLine2 ?? null)
        .input("hasCity", sql.Bit, updates.city !== undefined)
        .input("city", sql.NVarChar(100), updates.city ?? null)
        .input("hasPostcode", sql.Bit, updates.postcode !== undefined)
        .input("postcode", sql.NVarChar(20), updates.postcode ?? null)
        .query(`
          UPDATE dbo.OwnerProfiles
          SET
            phoneNumber = CASE WHEN @hasPhoneNumber = 1 THEN @phoneNumber ELSE phoneNumber END,
            addressLine1 = CASE WHEN @hasAddressLine1 = 1 THEN @addressLine1 ELSE addressLine1 END,
            addressLine2 = CASE WHEN @hasAddressLine2 = 1 THEN @addressLine2 ELSE addressLine2 END,
            city = CASE WHEN @hasCity = 1 THEN @city ELSE city END,
            postcode = CASE WHEN @hasPostcode = 1 THEN @postcode ELSE postcode END,
            updatedAt = SYSUTCDATETIME()
          OUTPUT
            INSERTED.id,
            INSERTED.phoneNumber,
            INSERTED.addressLine1,
            INSERTED.addressLine2,
            INSERTED.city,
            INSERTED.postcode
          WHERE userId = @userId;
        `);

      const profile = result.recordset[0];

      if (!profile) {
        return res.status(404).json({
          error: "Owner profile not found",
        });
      }

      return res.json({ profile });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/dogs/:dogId",
  authenticate,
  requireOwner,
  async (req, res, next) => {
    try {
      const dogId = Number(req.params.dogId);

      if (!Number.isInteger(dogId) || dogId <= 0) {
        return res.status(400).json({
          error: "dogId must be a positive integer",
        });
      }

      const updates = updateDogSchema.parse(req.body);
      const userId = res.locals.user.id;

      const pool = await poolPromise;

      const result = await pool
        .request()
        .input("dogId", sql.Int, dogId)
        .input("userId", sql.Int, userId)
        .input("hasName", sql.Bit, updates.name !== undefined)
        .input("name", sql.NVarChar(100), updates.name ?? null)
        .input("hasBreed", sql.Bit, updates.breed !== undefined)
        .input("breed", sql.NVarChar(100), updates.breed ?? null)
        .input("hasDateOfBirth", sql.Bit, updates.dateOfBirth !== undefined)
        .input("dateOfBirth", sql.Date, updates.dateOfBirth ?? null)
        .input("hasNotes", sql.Bit, updates.notes !== undefined)
        .input("notes", sql.NVarChar(1000), updates.notes ?? null)
        .query(`
          UPDATE d
          SET
            name = CASE WHEN @hasName = 1 THEN @name ELSE d.name END,
            breed = CASE WHEN @hasBreed = 1 THEN @breed ELSE d.breed END,
            dateOfBirth = CASE WHEN @hasDateOfBirth = 1 THEN @dateOfBirth ELSE d.dateOfBirth END,
            notes = CASE WHEN @hasNotes = 1 THEN @notes ELSE d.notes END
          OUTPUT
            INSERTED.id,
            INSERTED.name,
            INSERTED.breed,
            INSERTED.dateOfBirth,
            INSERTED.notes
          FROM dbo.Dogs AS d
          INNER JOIN dbo.OwnerProfiles AS op
            ON op.id = d.ownerProfileId
          WHERE
            d.id = @dogId
            AND op.userId = @userId;
        `);

      const dog = result.recordset[0];

      if (!dog) {
        return res.status(404).json({
          error: "Dog not found",
        });
      }

      return res.json({ dog });
    } catch (error) {
      next(error);
    }
  },
);

export default router;