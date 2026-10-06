-- ─────────────────────────────────────────────────────────────
-- CADMS — Database Schema
-- Tables: users, child, offender, abuse_case, investigation, audit_log
-- Matching Objective i exactly, with audit_log added per Section 6.
-- ─────────────────────────────────────────────────────────────

CREATE DATABASE IF NOT EXISTS cadms
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE cadms;

-- ───── Users ─────
CREATE TABLE IF NOT EXISTS users (
  userId       INT AUTO_INCREMENT PRIMARY KEY,
  fullName     VARCHAR(100)  NOT NULL,
  username     VARCHAR(50)   NOT NULL UNIQUE,
  passwordHash VARCHAR(255)  NOT NULL,
  role         ENUM('Caseworker','Administrator') NOT NULL,
  agency       VARCHAR(100)  DEFAULT NULL,
  active       BOOLEAN       NOT NULL DEFAULT TRUE,
  createdAt    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ───── Child ─────
CREATE TABLE IF NOT EXISTS child (
  childId          INT AUTO_INCREMENT PRIMARY KEY,
  firstName        VARCHAR(60)  NOT NULL,
  lastName         VARCHAR(60)  NOT NULL,
  dateOfBirth      DATE         DEFAULT NULL,
  gender           VARCHAR(20)  DEFAULT NULL,
  guardianContact  VARCHAR(100) DEFAULT NULL,
  address          VARCHAR(255) DEFAULT NULL,
  createdBy        INT          DEFAULT NULL,
  createdAt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
  ,CONSTRAINT fk_child_creator FOREIGN KEY (createdBy) REFERENCES users(userId) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ───── Offender ─────
CREATE TABLE IF NOT EXISTS offender (
  offenderId        INT AUTO_INCREMENT PRIMARY KEY,
  fullName          VARCHAR(100) DEFAULT NULL,
  knownAliases      VARCHAR(255) DEFAULT NULL,
  lastKnownAddress  VARCHAR(255) DEFAULT NULL,
  identifyingDetails TEXT        DEFAULT NULL,
  createdBy          INT         DEFAULT NULL,
  createdAt         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
  ,CONSTRAINT fk_offender_creator FOREIGN KEY (createdBy) REFERENCES users(userId) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ───── Abuse Case ─────
CREATE TABLE IF NOT EXISTS abuse_case (
  caseId             INT AUTO_INCREMENT PRIMARY KEY,
  childId            INT          NOT NULL,
  offenderId         INT          DEFAULT NULL,
  caseType           ENUM('Physical','Sexual','Emotional','Neglect','Exploitation','Trafficking') NOT NULL,
  dateReported       DATE         NOT NULL,
  status             ENUM('Reported','UnderInvestigation','Closed') NOT NULL DEFAULT 'Reported',
  assignedCaseworker INT          DEFAULT NULL,
  notes              TEXT         DEFAULT NULL,
  createdAt          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_case_child      FOREIGN KEY (childId)            REFERENCES child(childId)    ON DELETE RESTRICT,
  CONSTRAINT fk_case_offender   FOREIGN KEY (offenderId)         REFERENCES offender(offenderId) ON DELETE SET NULL,
  CONSTRAINT fk_case_caseworker FOREIGN KEY (assignedCaseworker) REFERENCES users(userId)     ON DELETE SET NULL
) ENGINE=InnoDB;

-- ───── Investigation ─────
CREATE TABLE IF NOT EXISTS investigation (
  investigationId INT AUTO_INCREMENT PRIMARY KEY,
  caseId          INT          NOT NULL,
  investigatorId  INT          NOT NULL,
  progressNotes   TEXT         DEFAULT NULL,
  status          ENUM('Ongoing','Completed','Suspended') NOT NULL DEFAULT 'Ongoing',
  lastUpdated     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  createdAt       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_inv_case        FOREIGN KEY (caseId)         REFERENCES abuse_case(caseId) ON DELETE CASCADE,
  CONSTRAINT fk_inv_investigator FOREIGN KEY (investigatorId) REFERENCES users(userId)      ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ───── Audit Log (Section 6 addition) ─────
CREATE TABLE IF NOT EXISTS audit_log (
  logId       INT AUTO_INCREMENT PRIMARY KEY,
  userId      INT          NOT NULL,
  action      ENUM('View','Create','Update','Delete') NOT NULL,
  targetTable VARCHAR(50)  NOT NULL,
  targetId    INT          NOT NULL,
  detail      TEXT         DEFAULT NULL,
  timestamp   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_audit_user FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- InnoDB creates indexes for foreign keys. Reporting indexes are ensured
-- idempotently by db/seed.js so this schema can be applied repeatedly.
