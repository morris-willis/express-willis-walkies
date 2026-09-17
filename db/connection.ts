import "dotenv/config";
import sql from "mssql";

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
};

export const poolPromise = new sql.ConnectionPool(dbConfig).connect();
export { sql };