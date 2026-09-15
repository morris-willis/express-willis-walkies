import "dotenv/config";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import sql from "mssql";

const app = express();
app.use(express.json());

const dbConfig: sql.config = {
  user: process.env.AZURE_SQL_USER,
  password: process.env.AZURE_SQL_PASSWORD,
  server: process.env.AZURE_SQL_SERVER ?? "",
  database: process.env.AZURE_SQL_DATABASE,
  port: 1433,
  options: {
    encrypt: true,
    trustServerCertificate: false,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30_000,
  },
};

const poolPromise = new sql.ConnectionPool(dbConfig)
  .connect()
  .then((pool) => {
    console.log("Connected to Azure SQL");
    return pool;
  })
  .catch((error: unknown) => {
    console.error("Azure SQL connection failed:", error);
    process.exit(1);
  });

app.get(
  "/users/:id",
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);

      if (!Number.isInteger(id)) {
        res.status(400).json({ error: "id must be an integer" });
        return;
      }

      const pool = await poolPromise;
      const result = await pool
        .request()
        .input("id", sql.Int, id)
        .query<{
          id: number;
          name: string;
          email: string;
        }>("SELECT id, name, email FROM dbo.Users WHERE id = @id");

      res.json(result.recordset[0] ?? null);
    } catch (error) {
      next(error);
    }
  },
);

app.use(
  (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  },
);

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});