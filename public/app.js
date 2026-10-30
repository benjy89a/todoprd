// 화면 동작: 서버(/api/...)에 요청해서 할 일을 추가·보기·완료·삭제·검색한다.
const $ = (id) => document.getElementById(id);
let activeTag = '';

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json' },
    body: options.body && JSON.stringify(options.body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '요청에 실패했어요.');
  return data;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function renderTodo(todo) {
  const check = el('input', { type: 'checkbox', checked: todo.is_done, ariaLabel: '완료' });
  check.addEventListener('change', async () => {
    await api(`/api/todos/${todo.id}`, { method: 'PATCH', body: { is_done: check.checked } });
    refresh();
  });

  const meta = el('div', { className: 'meta' });
  if (todo.due_date) {
    const overdue = !todo.is_done && todo.due_date < today();
    const label = todo.due_date === today() ? '오늘 마감' : `마감 ${todo.due_date}`;
    meta.append(el('span', { className: 'due' + (overdue ? ' overdue' : ''), textContent: overdue ? `${label} (지남)` : label }));
  }
  for (const name of todo.tags) meta.append(el('span', { className: 'chip', textContent: name }));

  const del = el('button', { className: 'delete', textContent: '삭제', type: 'button' });
  del.addEventListener('click', async () => {
    if (!confirm(`"${todo.title}"을(를) 삭제할까요?`)) return;
    await api(`/api/todos/${todo.id}`, { method: 'DELETE' });
    refresh();
  });

  return el('li', { className: 'todo' + (todo.is_done ? ' done' : '') }, [
    check,
    el('div', { className: 'body' }, [el('span', { className: 'title', textContent: todo.title }), meta]),
    del,
  ]);
}

function renderTagFilter(tags) {
  const box = $('tag-filter');
  box.replaceChildren();
  if (!tags.length) return;
  for (const name of ['', ...tags]) {
    const chip = el('button', {
      type: 'button',
      className: 'chip' + (name === activeTag ? ' active' : ''),
      textContent: name || '전체',
    });
    chip.addEventListener('click', () => { activeTag = name; refresh(); });
    box.append(chip);
  }
}

// 요청이 겹치면 늦게 도착한 옛 응답이 화면을 덮어쓰지 않도록, 마지막 요청의 결과만 그린다
let refreshId = 0;
async function refresh() {
  const id = ++refreshId;
  const params = new URLSearchParams({ q: $('search').value, tag: activeTag });
  const [tags, todos] = await Promise.all([api('/api/tags'), api(`/api/todos?${params}`)]);
  if (id !== refreshId) return;
  if (activeTag && !tags.includes(activeTag)) {
    // 고른 태그가 붙은 할 일이 모두 지워졌으면 전체 보기로 돌아간다
    activeTag = '';
    return refresh();
  }
  renderTagFilter(tags);
  $('list').replaceChildren(...todos.map(renderTodo));
  $('empty').hidden = todos.length > 0;
  $('empty').textContent = $('search').value || activeTag ? '찾는 할 일이 없어요.' : '할 일이 없어요.';
}

$('add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('error').textContent = '';
  const title = $('title').value.trim();
  if (!title) {
    $('error').textContent = '할 일 내용을 입력하세요.';
    $('title').focus();
    return;
  }
  try {
    await api('/api/todos', {
      method: 'POST',
      body: {
        title,
        due_date: $('due').value || null,
        tags: $('tags').value.split(','),
      },
    });
    e.target.reset();
    $('title').focus();
    refresh();
  } catch (err) {
    $('error').textContent = err.message;
  }
});
$('title').addEventListener('input', () => { $('error').textContent = ''; });

let searchTimer;
$('search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(refresh, 200);
});

refresh();
