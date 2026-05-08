import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3001;
const SHOPL_BASE_URL = 'https://dashboard.shoplworks.com';
const AUTH_KEY = process.env.SHOPL_AUTH_KEY;
// 디자인 시연용 가상 데이터 모드. Shopl API 호출 안 함.
// default true (prototype 단계에서 12개 매장 mock으로 시연하는 게 자연스러움)
// 실데이터 모드로 돌리려면 USE_MOCK_DATA=false 로 명시.
const USE_MOCK_DATA = (process.env.USE_MOCK_DATA ?? 'true').toLowerCase() !== 'false';

// TO history 영구 저장 위치. Render 기본 disk는 ephemeral이라 재배포 시 reset됨.
// 실운영 시 Persistent Disk로 옮기려면 TO_DATA_DIR env로 mount 경로 지정.
const TO_DATA_DIR = process.env.TO_DATA_DIR || path.join(__dirname, 'data');
const TO_FILE = path.join(TO_DATA_DIR, 'to-history.json');

if (USE_MOCK_DATA) {
  console.log('[server] USE_MOCK_DATA=true — /api/stores, /api/employees는 가상 데이터 반환 (Shopl API 호출 안 함)');
} else if (!AUTH_KEY) {
  console.warn('[server] WARNING: SHOPL_AUTH_KEY 환경변수가 비어 있습니다. /api/* 호출은 실패합니다.');
}

// ============================================================
// Mock 데이터 (디자인 시연용)
// ============================================================
// 12개 가상 근무지 + 매장당 5~7명 직원. 직원 ID 안정적이라 응답 더미가 결정적.
// 이전 prototype(commit d2c7089) 과 동일한 셋업.
const MOCK_STORES = [
  { name: '강남점',   code: 'TB1001', staff: 5 },
  { name: '서초점',   code: 'TB1002', staff: 6 },
  { name: '송파점',   code: 'TB1003', staff: 5 },
  { name: '마포점',   code: 'TB1004', staff: 7 },
  { name: '영등포점', code: 'TB1005', staff: 6 },
  { name: '강서점',   code: 'TB1006', staff: 5 },
  { name: '광진점',   code: 'TB1007', staff: 6 },
  { name: '노원점',   code: 'TB1008', staff: 5 },
  { name: '성북점',   code: 'TB1009', staff: 6 },
  { name: '은평점',   code: 'TB1010', staff: 5 },
  { name: '양천점',   code: 'TB1011', staff: 7 },
  { name: '동작점',   code: 'TB1012', staff: 6 },
];
const MOCK_LAST_NAMES = ['김','이','박','최','정','강','조','윤','장','임','한','오','서','신','권'];
const MOCK_FIRST_NAMES = ['민수','지현','서연','준호','하은','우진','예린','도윤','수아','시우','지민','윤서','건우','나연','준영','태민','은채','동현','소율','재원'];

function buildMockStores() {
  // workplaceId = code (mock 환경 한정. 실데이터 모드와 TO history namespace 분리됨)
  return MOCK_STORES.map((s) => ({ workplaceId: s.code, name: s.name, code: s.code }));
}
function buildMockEmployees() {
  const employees = [];
  MOCK_STORES.forEach((store, sIdx) => {
    for (let i = 0; i < store.staff; i++) {
      const lastIdx = (sIdx * 7 + i * 3) % MOCK_LAST_NAMES.length;
      const firstIdx = (sIdx * 11 + i * 5) % MOCK_FIRST_NAMES.length;
      employees.push({
        id: `${store.name}-${i + 1}`,
        empNo: `TB${String(sIdx + 1).padStart(2, '0')}${String(i + 1).padStart(2, '0')}`,
        name: `${MOCK_LAST_NAMES[lastIdx]}${MOCK_FIRST_NAMES[firstIdx]}`,
        storeName: store.name,
        storeCode: store.code,
      });
    }
  });
  return employees;
}

// Shopl API 응답이 매번 동일할 가능성 높으므로 5분 in-memory 캐시.
// 새 매장/직원 추가가 5분 내 반영되도록 함 (검증 단계 적정선).
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

async function shoplFetch(pathname, query = {}) {
  const cacheKey = `${pathname}?${new URLSearchParams(query).toString()}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  if (!AUTH_KEY) throw new Error('SHOPL_AUTH_KEY missing');

  const url = new URL(pathname, SHOPL_BASE_URL);
  url.searchParams.set('authKey', AUTH_KEY);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Shopl ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = JSON.parse(text);
  cache.set(cacheKey, { at: Date.now(), data });
  return data;
}

// ============================================================
// TO history 저장소
// ============================================================
// 구조:
// {
//   "<workplaceId>": [
//     { "effectiveMonth": "2026-04", "to": 4, "updatedAt": "2026-05-08T12:34:56Z" },
//     ...
//   ]
// }
// effectiveMonth 형식 'YYYY-MM' — 해당 월(이후) 부터 적용. 동일 월에 여러 번 변경 시 가장 마지막 entry 기준.
let toStore = {};

async function loadToStore() {
  try {
    const buf = await fs.readFile(TO_FILE, 'utf8');
    toStore = JSON.parse(buf);
    console.log(`[server] loaded TO history from ${TO_FILE} (${Object.keys(toStore).length} workplaces)`);
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.log('[server] no existing TO history file, starting empty');
      toStore = {};
    } else {
      console.error('[server] TO history load failed:', e.message);
      toStore = {};
    }
  }
}

async function saveToStore() {
  await fs.mkdir(TO_DATA_DIR, { recursive: true });
  const tmp = TO_FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(toStore, null, 2), 'utf8');
  await fs.rename(tmp, TO_FILE);
}

await loadToStore();

const app = express();
app.use(express.json());

// TO history 조회 (전체)
app.get('/api/to', (_req, res) => {
  res.json({ toHistory: toStore });
});

// TO 변경 추가
// body: { workplaceId, effectiveMonth: 'YYYY-MM', to: number }
app.post('/api/to', async (req, res) => {
  try {
    const { workplaceId, effectiveMonth, to } = req.body || {};
    if (!workplaceId) return res.status(400).json({ error: 'workplaceId required' });
    if (!/^\d{4}-\d{2}$/.test(effectiveMonth || '')) return res.status(400).json({ error: 'effectiveMonth must be YYYY-MM' });
    const toNum = Number(to);
    if (!Number.isInteger(toNum) || toNum < 0 || toNum > 999) return res.status(400).json({ error: 'to must be integer 0-999' });

    const list = toStore[workplaceId] || [];
    list.push({ effectiveMonth, to: toNum, updatedAt: new Date().toISOString() });
    toStore[workplaceId] = list;
    await saveToStore();
    res.json({ ok: true, workplaceId, history: list });
  } catch (e) {
    console.error('[/api/to POST]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// 매장(근무지) 목록
app.get('/api/stores', async (_req, res) => {
  try {
    if (USE_MOCK_DATA) {
      return res.json({ stores: buildMockStores(), fetchedAt: new Date().toISOString(), mock: true });
    }
    const json = await shoplFetch('/api/workplace/list');
    const list = json?.body?.list ?? [];
    const stores = list.map((w) => ({
      workplaceId: w.workplaceId,
      name: w.workplaceName,
      // 매장코드 없으면 workplaceId fallback (모달/매핑 키 안정성)
      code: w.workplaceCode || w.workplaceId,
    }));
    res.json({ stores, fetchedAt: new Date().toISOString() });
  } catch (e) {
    console.error('[/api/stores]', e.message);
    res.status(502).json({ error: e.message });
  }
});

// 구성원 목록 (재직자만)
app.get('/api/employees', async (_req, res) => {
  try {
    if (USE_MOCK_DATA) {
      return res.json({ employees: buildMockEmployees(), fetchedAt: new Date().toISOString(), mock: true });
    }
    const json = await shoplFetch('/api/user/list/v2', {
      includeResignedAfterDate: '2024-01-01',
    });
    const list = json?.body?.list ?? [];
    const employees = list
      .filter((u) => u.isResign !== '1' && u.workplaceName)
      .map((u) => ({
        id: u.userId,
        empNo: u.empId || u.userId,
        name: u.userName,
        storeName: u.workplaceName,
        storeCode: u.workplaceCode || '',
      }));
    res.json({ employees, fetchedAt: new Date().toISOString() });
  } catch (e) {
    console.error('[/api/employees]', e.message);
    res.status(502).json({ error: e.message });
  }
});

// 헬스체크
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, hasAuthKey: !!AUTH_KEY, mock: USE_MOCK_DATA });
});

// 정적 파일 (Vite 빌드 결과)
app.use(express.static(path.join(__dirname, 'dist')));

// SPA fallback (Express 5 와일드카드 호환 회피 위해 use)
app.use((_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
