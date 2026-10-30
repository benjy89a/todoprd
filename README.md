# Todo 앱

내 컴퓨터에서 도는 할 일 앱. 할 일 추가 / 목록 / 완료 / 삭제, 검색, 마감일, 태그. 무엇을 만들지는 [PRD.md](PRD.md)에 있다.

## 실행

Node.js 22.13 이상만 있으면 된다. 따로 설치할 패키지는 없다.

```bash
npm start
```

브라우저에서 http://localhost:3000 을 연다. 끌 때는 터미널에서 `Ctrl + C`.

설정을 바꾸고 싶으면 `.env.example`을 `.env`로 복사해 고친다 (`PORT`, `DB_PATH`). `.env`는 git에 올라가지 않는다.

## 파일

| 파일 | 하는 일 |
| --- | --- |
| `server.js` | 화면 파일을 보내고, `/api/...` 요청을 받아 DB를 읽고 쓴다 |
| `schema.sql` | DB 표 구조 (todos, tags, todo_tags). 서버가 켜질 때 표가 없으면 만든다 |
| `public/` | 브라우저 화면 (`index.html`, `style.css`, `app.js`) |
| `todo.db` | 데이터가 저장되는 SQLite 파일. 처음 실행할 때 생긴다 |

## API

| 요청 | 하는 일 |
| --- | --- |
| `GET /api/todos?q=검색어&tag=태그` | 목록 (둘 다 생략 가능) |
| `POST /api/todos` `{ title, due_date, tags: [] }` | 추가 |
| `PATCH /api/todos/:id` `{ is_done: true }` | 완료 / 완료 취소 |
| `DELETE /api/todos/:id` | 삭제 |
| `GET /api/tags` | 할 일에 붙어 있는 태그 목록 |
