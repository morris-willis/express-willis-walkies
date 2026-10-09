SET XACT_ABORT ON;

BEGIN TRANSACTION;

CREATE TABLE dbo.SchemaMigrations (
  id INT NOT NULL
    CONSTRAINT PK_SchemaMigrations PRIMARY KEY,

  name NVARCHAR(255) NOT NULL,

  appliedAt DATETIME2 NOT NULL
    CONSTRAINT DF_SchemaMigrations_AppliedAt
    DEFAULT (SYSUTCDATETIME())
);

CREATE TABLE dbo.Users (
  id INT IDENTITY(1,1) NOT NULL
    CONSTRAINT PK_Users PRIMARY KEY,

  name NVARCHAR(100) NOT NULL,

  email NVARCHAR(255) NOT NULL
    CONSTRAINT UQ_Users_Email UNIQUE,

  passwordHash NVARCHAR(255) NOT NULL,

  emailVerifiedAt DATETIME2 NULL,
  emailVerificationTokenHash CHAR(64) NULL,
  emailVerificationExpiresAt DATETIME2 NULL,

  createdAt DATETIME2 NOT NULL
    CONSTRAINT DF_Users_CreatedAt DEFAULT (SYSUTCDATETIME())
);

CREATE TABLE dbo.Roles (
  id INT IDENTITY(1,1) NOT NULL
    CONSTRAINT PK_Roles PRIMARY KEY,

  name NVARCHAR(30) NOT NULL
    CONSTRAINT UQ_Roles_Name UNIQUE
);

CREATE TABLE dbo.UserRoles (
  userId INT NOT NULL,
  roleId INT NOT NULL,

  createdAt DATETIME2 NOT NULL
    CONSTRAINT DF_UserRoles_CreatedAt DEFAULT (SYSUTCDATETIME()),

  CONSTRAINT PK_UserRoles PRIMARY KEY (userId, roleId),

  CONSTRAINT FK_UserRoles_Users
    FOREIGN KEY (userId)
    REFERENCES dbo.Users(id)
    ON DELETE CASCADE,

  CONSTRAINT FK_UserRoles_Roles
    FOREIGN KEY (roleId)
    REFERENCES dbo.Roles(id)
);

CREATE TABLE dbo.Sessions (
  id INT IDENTITY(1,1) NOT NULL
    CONSTRAINT PK_Sessions PRIMARY KEY,

  userId INT NOT NULL,

  tokenHash CHAR(64) NOT NULL
    CONSTRAINT UQ_Sessions_TokenHash UNIQUE,

  expiresAt DATETIME2 NOT NULL,

  createdAt DATETIME2 NOT NULL
    CONSTRAINT DF_Sessions_CreatedAt DEFAULT (SYSUTCDATETIME()),

  CONSTRAINT FK_Sessions_Users
    FOREIGN KEY (userId)
    REFERENCES dbo.Users(id)
    ON DELETE CASCADE
);

CREATE INDEX IX_Sessions_ExpiresAt
ON dbo.Sessions (expiresAt);

INSERT INTO dbo.Roles (name)
VALUES
  ('owner'),
  ('walker');

INSERT INTO dbo.SchemaMigrations (id, name)
VALUES (1, 'initial_auth_schema');

COMMIT TRANSACTION;