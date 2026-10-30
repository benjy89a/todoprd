// Todo 앱 서버: 화면 파일을 보내 주고, /api/... 요청을 받아 SQLite DB를 읽고 쓴다.
// 추가 설치 없이 Node.js에 들어 있는 기능(node:http, node:sqlite)만 쓴다.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT) || 3000;
const DB_PATH = process.env.DB_PATH || 'todo.db';
const DIR = dirname(fileURLToPath(import.meta.url));
const here = (file) => join(DIR, file);

// ---- DB 준비 ----
// 상대 경로는 이 폴더 기준으로 둔다 (어디서 실행해도 같은 todo.db를 쓰게)
const db = new DatabaseSync(DB_PATH === ':memory:' || isAbsolute(DB_PATH) ? DB_PATH : here(DB_PATH));
db.exec('PRAGMA foreign_keys = ON');
db.exec(readFileSync(here('schema.sql'), 'utf8'));

// 할 일 목록 + 각 할 일의 태그. 안 끝난 일 → 마감일 빠른 순(없으면 뒤) → 최근 추가 순
const listTodos = db.prepare(`
  SELECT t.id, t.title, t.is_done, t.due_date, t.created_at,
         COALESCE((SELECT json_group_array(g.name)
                   FROM todo_tags tt JOIN tags g ON g.id = tt.tag_id
                   WHERE tt.todo_id = t.id), '[]') AS tags
  FROM todos t
  WHERE (:q = '' OR instr(lower(t.title), lower(:q)) > 0)
    AND (:tag = '' OR EXISTS (SELECT 1 FROM todo_tags tt JOIN tags g ON g.id = tt.tag_id
                              WHERE tt.todo_id = t.id AND g.name = :tag))
  ORDER BY t.is_done, t.due_date IS NULL, t.due_date, t.id DESC
`);
const listUsedTags = db.prepare(`
  SELECT DISTINCT g.name FROM tags g JOIN todo_tags tt ON tt.tag_id = g.id ORDER BY g.name
`);
const insertTodo = db.prepare('INSERT INTO todos (title, due_date) VALUES (?, ?)');
const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
const findTag = db.prepare('SELECT id FROM tags WHERE name = ?');
const linkTag = db.prepare('INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?)');
const setDone = db.prepare('UPDATE todos SET is_done = ? WHERE id = ?');
const deleteTodo = db.prepare('DELETE FROM todos WHERE id = ?');

function addTodo({ title, due_date, tags }) {
  db.exec('BEGIN');
  try {
    const { lastInsertRowid: id } = insertTodo.run(title, due_date);
    for (const name of tags) {
      insertTag.run(name);
      linkTag.run(id, findTag.get(name).id);
    }
    db.exec('COMMIT');
    return Number(id);
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// ---- 입력 검사 ----
class BadRequest extends Error {}

function cleanNewTodo(body) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) throw new BadRequest('할 일 내용을 입력하세요.');
  if (title.length > 200) throw new BadRequest('할 일은 200자까지 쓸 수 있어요.');

  let due_date = body.due_date || null;
  if (due_date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
    throw new BadRequest('마감일은 YYYY-MM-DD 형식이어야 해요.');
  }

  const rawTags = Array.isArray(body.tags) ? body.tags : [];
  const tags = [...new Set(rawTags.filter((t) => typeof t === 'string').map((t) => t.trim()).filter(Boolean))];
  if (tags.length > 10) throw new BadRequest('태그는 10개까지 붙일 수 있어요.');
  if (tags.some((t) => t.length > 20)) throw new BadRequest('태그 하나는 20자까지예요.');

  return { title, due_date, tags };
}

// ---- 요청 처리 ----
const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
};

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 10_000) throw new BadRequest('요청이 너무 커요.');
  }
  try {
    return JSON.parse(body || '{}');
  } catch {
    throw new BadRequest('JSON 형식이 아니에요.');
  }
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;

  if (req.method === 'GET' && STATIC[path]) {
    const [file, type] = STATIC[path];
    res.writeHead(200, { 'Content-Type': type });
    return res.end(readFileSync(here(join('public', file))));
  }

  if (path === '/api/todos' && req.method === 'GET') {
    const rows = listTodos.all({
      q: (url.searchParams.get('q') || '').trim(),
      tag: url.searchParams.get('tag') || '',
    });
    return send(res, 200, rows.map((r) => ({ ...r, is_done: r.is_done === 1, tags: JSON.parse(r.tags) })));
  }

  if (path === '/api/todos' && req.method === 'POST') {
    const id = addTodo(cleanNewTodo(await readJson(req)));
    return send(res, 201, { id });
  }

  if (path === '/api/tags' && req.method === 'GET') {
    return send(res, 200, listUsedTags.all().map((r) => r.name));
  }

  const match = path.match(/^\/api\/todos\/(\d+)$/);
  if (match) {
    const id = Number(match[1]);
    if (req.method === 'PATCH') {
      const { is_done } = await readJson(req);
      if (typeof is_done !== 'boolean') throw new BadRequest('is_done는 true/false여야 해요.');
      const { changes } = setDone.run(is_done ? 1 : 0, id);
      return changes ? send(res, 200, { ok: true }) : send(res, 404, { error: '없는 할 일이에요.' });
    }
    if (req.method === 'DELETE') {
      const { changes } = deleteTodo.run(id);
      return changes ? send(res, 200, { ok: true }) : send(res, 404, { error: '없는 할 일이에요.' });
    }
  }

  send(res, 404, { error: '찾을 수 없어요.' });
}

createServer((req, res) => {
  handle(req, res).catch((err) => {
    if (err instanceof BadRequest) return send(res, 400, { error: err.message });
    if (err?.code === 'ERR_SQLITE_ERROR' && /CHECK constraint/.test(err.message)) {
      return send(res, 400, { error: '저장할 수 없는 값이에요. (예: 없는 날짜)' });
    }
    console.error(err);
    send(res, 500, { error: '서버 오류가 났어요.' });
  });
}).listen(PORT, () => {
  console.log(`Todo 앱: http://localhost:${PORT}  (DB: ${DB_PATH})`);
});
