-- SEKCO - database schema (MySQL 8+)
-- Safe to run repeatedly: every statement is idempotent.
--   mysql -u root -p < database.sql
-- The Node tooling (npm run db:init) executes this same file against the database named in DB_NAME,
-- ignoring the CREATE DATABASE / USE lines below.

CREATE DATABASE IF NOT EXISTS sekco_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE sekco_db;

-- Users (accounts are created by administrators; there is no self-registration)
CREATE TABLE IF NOT EXISTS users (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    email         VARCHAR(190) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role          ENUM('Admin', 'Manager', 'User') NOT NULL DEFAULT 'User',
    status        ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active',
    job_title     VARCHAR(100) NULL,
    last_login_at DATETIME NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_users_email (email),
    KEY idx_users_role (role),
    KEY idx_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Projects (progress is computed from task completion and is not stored)
CREATE TABLE IF NOT EXISTS projects (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(120) NOT NULL,
    description TEXT NULL,
    manager_id  INT UNSIGNED NULL,
    status      ENUM('Planning', 'Active', 'On hold', 'Completed') NOT NULL DEFAULT 'Planning',
    start_date  DATE NULL,
    end_date    DATE NULL,
    created_by  INT UNSIGNED NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_projects_status (status),
    KEY idx_projects_manager (manager_id),
    CONSTRAINT fk_projects_manager FOREIGN KEY (manager_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT fk_projects_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title        VARCHAR(160) NOT NULL,
    description  TEXT NULL,
    project_id   INT UNSIGNED NOT NULL,
    assignee_id  INT UNSIGNED NULL,
    created_by   INT UNSIGNED NULL,
    priority     ENUM('Low', 'Medium', 'High', 'Urgent') NOT NULL DEFAULT 'Medium',
    status       ENUM('To do', 'In progress', 'Done') NOT NULL DEFAULT 'To do',
    due_date     DATE NULL,
    completed_at DATETIME NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_tasks_project (project_id),
    KEY idx_tasks_assignee (assignee_id),
    KEY idx_tasks_status (status),
    KEY idx_tasks_due (due_date),
    CONSTRAINT fk_tasks_project  FOREIGN KEY (project_id)  REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT fk_tasks_assignee FOREIGN KEY (assignee_id) REFERENCES users (id)    ON DELETE SET NULL,
    CONSTRAINT fk_tasks_creator  FOREIGN KEY (created_by)  REFERENCES users (id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Task comments
CREATE TABLE IF NOT EXISTS comments (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    task_id    INT UNSIGNED NOT NULL,
    user_id    INT UNSIGNED NULL,
    body       TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_comments_task (task_id, created_at),
    CONSTRAINT fk_comments_task FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
    CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Activity feed (one row per notable event, newest first in the UI)
CREATE TABLE IF NOT EXISTS activity (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED NULL,
    action      VARCHAR(40) NOT NULL,
    entity_type ENUM('project', 'task', 'comment', 'user') NOT NULL,
    entity_id   INT UNSIGNED NULL,
    project_id  INT UNSIGNED NULL,
    message     VARCHAR(255) NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_activity_created (created_at),
    KEY idx_activity_project (project_id, created_at),
    CONSTRAINT fk_activity_user    FOREIGN KEY (user_id)    REFERENCES users (id)    ON DELETE SET NULL,
    CONSTRAINT fk_activity_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create the first administrator with the helper script instead of storing a password here:
--   npm run create-admin -- "Admin Name" admin@example.com "a-strong-password"
-- Or load fictional demo data (development only):
--   npm run db:seed
