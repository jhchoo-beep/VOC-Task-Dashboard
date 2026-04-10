-- MGRV VOC Dashboard Schema
-- Supabase SQL Editor에서 실행

-- 리뷰 테이블
CREATE TABLE IF NOT EXISTS reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch      TEXT NOT NULL,
  ota_site    TEXT NOT NULL,
  rating      FLOAT NOT NULL,
  review_month TEXT NOT NULL,       -- 'YYYY-MM' 형식
  content     TEXT,
  categories  TEXT[] DEFAULT '{}',
  severity    TEXT,                 -- Critical / High / Medium / Low
  churn_triggers TEXT[] DEFAULT '{}',
  customer_segment TEXT,            -- 충성 / 만족 / 위험 / 이탈
  priority_score FLOAT DEFAULT 0,
  crs_score   FLOAT DEFAULT 0,
  status      TEXT DEFAULT '신규접수',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 수행과제 테이블
CREATE TABLE IF NOT EXISTS tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch          TEXT NOT NULL,
  task_month      TEXT NOT NULL,    -- 'YYYY-MM' 형식
  title           TEXT NOT NULL,
  churn_trigger   TEXT[] DEFAULT '{}',
  problem_definition TEXT,          -- 🔍 문제가 뭐야?
  solution        TEXT,             -- 💡 어떻게 해결할 거야?
  category        TEXT[] DEFAULT '{}',
  severity        TEXT DEFAULT 'High',
  priority_score  FLOAT DEFAULT 0,
  assignee        TEXT,
  due_date        DATE,
  status          TEXT DEFAULT '시작전',
  linked_review_ids UUID[] DEFAULT '{}',
  done_memo       TEXT,
  link_url        TEXT,             -- 참고 링크 URL
  link_label      TEXT,             -- 참고 링크 제목
  review_content  TEXT              -- 관련 리뷰 본문
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 수행과제 진행 로그 테이블
CREATE TABLE IF NOT EXISTS task_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author     TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_reviews_branch       ON reviews(branch);
CREATE INDEX IF NOT EXISTS idx_reviews_month        ON reviews(review_month);
CREATE INDEX IF NOT EXISTS idx_reviews_severity     ON reviews(severity);
CREATE INDEX IF NOT EXISTS idx_tasks_branch         ON tasks(branch);
CREATE INDEX IF NOT EXISTS idx_tasks_month          ON tasks(task_month);
CREATE INDEX IF NOT EXISTS idx_tasks_status         ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_task_logs_task_id    ON task_logs(task_id);
