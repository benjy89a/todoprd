-- Todo 앱 DB 구조 (SQLite)

-- 외래 키(표끼리 연결) 규칙을 켠다. SQLite는 기본으로 꺼져 있어서, 앱이 DB에 연결할 때마다 실행해야 한다.
PRAGMA foreign_keys = ON;

-- 할 일
CREATE TABLE IF NOT EXISTS todos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT    NOT NULL CHECK (length(trim(title)) > 0),          -- 빈 할 일은 막는다
  is_done    INTEGER NOT NULL DEFAULT 0 CHECK (is_done IN (0, 1)),      -- 0: 아직, 1: 완료
  due_date   TEXT    CHECK (due_date IS NULL OR date(due_date) IS due_date), -- 'YYYY-MM-DD', 없어도 된다
  created_at TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 태그
CREATE TABLE IF NOT EXISTS tags (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT    NOT NULL UNIQUE CHECK (length(trim(name)) > 0)
);

-- 할 일과 태그를 잇는 표 (할 일 하나에 태그 여러 개, 태그 하나에 할 일 여러 개)
CREATE TABLE IF NOT EXISTS todo_tags (
  todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,      -- 할 일을 지우면 연결도 지워진다
  tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (todo_id, tag_id)                                         -- 같은 태그를 두 번 붙일 수 없다
);

-- 태그로 할 일을 찾을 때 빠르게
CREATE INDEX IF NOT EXISTS idx_todo_tags_tag ON todo_tags(tag_id);
