import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Download, X, Check, Store, Users, Calendar as CalendarIcon, TrendingUp,
  ChevronRight, ChevronLeft, AlertCircle, Search, ArrowUpDown, ArrowUp, ArrowDown,
  MapPin, Clock, Minus, Pencil, History,
} from 'lucide-react';
import * as XLSX from 'xlsx';

// ============================================================
// 상수
// ============================================================
// 위치확인 raw data API가 아직 없어서 응답 데이터는 시드 기반 더미. 직원 ID 안정적이라 같은 직원이면 늘 같은 응답.
const TIMES = ['09:00', '12:00', '14:00', '18:00'];
const DAYS_IN_MONTH = 30;
const MONTH_LABEL = '2026년 4월';
const CURRENT_MONTH = '2026-04'; // YYYY-MM, TO 적용 기준
// TO 데이터가 한 번도 입력되지 않은 매장의 default. 고객사가 직접 입력하기 시작하면 사라짐.
const DEFAULT_TO = 4;

// ============================================================
// TO 조회: workplaceId + month(YYYY-MM) → 적용 TO
// ============================================================
// toHistory: { [workplaceId]: [{ effectiveMonth, to, updatedAt }, ...] }
// 해당 month 이하의 effectiveMonth 중 가장 최근(updatedAt 우선, 동률이면 effectiveMonth) entry 적용.
function getToForStoreMonth(toHistory, workplaceId, month) {
  const list = toHistory?.[workplaceId];
  if (!list || list.length === 0) return DEFAULT_TO;
  const applicable = list.filter((h) => h.effectiveMonth <= month);
  if (applicable.length === 0) return DEFAULT_TO;
  // effectiveMonth 같은 게 여러 개면 updatedAt이 최신인 걸 사용
  const sorted = [...applicable].sort((a, b) => {
    if (a.effectiveMonth !== b.effectiveMonth) return a.effectiveMonth.localeCompare(b.effectiveMonth);
    return (a.updatedAt || '').localeCompare(b.updatedAt || '');
  });
  return sorted[sorted.length - 1].to;
}

// ============================================================
// 더미 응답 생성 (직원 ID 시드 기반)
// ============================================================
function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

function generateResponses(employees) {
  const responses = {};
  employees.forEach((emp) => {
    const empSeed = hashStr(String(emp.id));
    for (let day = 1; day <= DAYS_IN_MONTH; day++) {
      const attended = seededRandom(empSeed + day * 7) > 0.15;
      TIMES.forEach((time, ti) => {
        const key = `${emp.id}|${day}|${time}`;
        if (!attended) {
          responses[key] = '무응답';
          return;
        }
        const r = seededRandom(empSeed + day * 100 + ti * 10000);
        if (r < 0.92) responses[key] = '배정 근무지';
        else if (r < 0.96) responses[key] = '근무지 아님';
        else if (r < 0.98) responses[key] = '거절';
        else responses[key] = '무응답';
      });
    }
  });
  return responses;
}

// ============================================================
// 집계 헬퍼
// ============================================================
function getTimeSlotResponseCount(storeName, day, time, employees, responses) {
  return employees.filter(
    (emp) => emp.storeName === storeName && responses[`${emp.id}|${day}|${time}`] === '배정 근무지'
  ).length;
}

function isStoreFulfilled(storeName, day, employees, responses, requiredTO) {
  return TIMES.every((time) => getTimeSlotResponseCount(storeName, day, time, employees, responses) >= requiredTO);
}

function getStoreFulfilledCount(storeName, employees, responses, requiredTO) {
  let count = 0;
  for (let day = 1; day <= DAYS_IN_MONTH; day++) {
    if (isStoreFulfilled(storeName, day, employees, responses, requiredTO)) count++;
  }
  return count;
}

function getEmployeeDayResult(emp, day, responses) {
  const results = TIMES.map((time) => responses[`${emp.id}|${day}|${time}`]);
  const ok = results.filter((r) => r === '배정 근무지').length;
  return { ok, total: TIMES.length, details: results };
}

function getDayOfWeek(day) {
  // 2026년 4월 1일 = 수요일
  const days = ['수', '목', '금', '토', '일', '월', '화'];
  return days[(day - 1) % 7];
}

// 요일에 따른 색 클래스 — 날짜와 요일을 동일 색으로 통일
function getDayColorClass(day) {
  const dow = getDayOfWeek(day);
  if (dow === '일') return 'text-red-500';
  if (dow === '토') return 'text-blue-500';
  return 'text-neutral-700';
}

function getResponseTime(empId, day, time) {
  let h = 0;
  const str = `${empId}|${day}|${time}|t`;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  const minutesAfter = Math.floor(Math.abs(seededRandom(Math.abs(h))) * 30);
  const [hh, mm] = time.split(':').map(Number);
  const total = hh * 60 + mm + minutesAfter;
  const newH = Math.floor(total / 60);
  const newM = total % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

function formatMonthLabel(yyyymm) {
  if (!yyyymm) return '';
  const [y, m] = yyyymm.split('-');
  return `${y}년 ${parseInt(m, 10)}월`;
}

function formatUpdatedAt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function nextMonth(yyyymm) {
  const [y, m] = yyyymm.split('-').map(Number);
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  return `${nextY}-${String(nextM).padStart(2, '0')}`;
}

// ============================================================
// 메인 컴포넌트
// ============================================================
export default function Dashboard() {
  const [stores, setStores] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [toHistory, setToHistory] = useState({}); // { workplaceId: [{effectiveMonth, to, updatedAt}, ...] }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchToHistory = useCallback(async () => {
    const res = await fetch('/api/to');
    if (!res.ok) throw new Error(`/api/to ${res.status}`);
    const json = await res.json();
    setToHistory(json.toHistory || {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [stRes, emRes, toRes] = await Promise.all([
          fetch('/api/stores'),
          fetch('/api/employees'),
          fetch('/api/to'),
        ]);
        if (!stRes.ok) throw new Error(`/api/stores ${stRes.status}`);
        if (!emRes.ok) throw new Error(`/api/employees ${emRes.status}`);
        if (!toRes.ok) throw new Error(`/api/to ${toRes.status}`);
        const stJson = await stRes.json();
        const emJson = await emRes.json();
        const toJson = await toRes.json();
        if (cancelled) return;
        setStores(stJson.stores || []);
        setEmployees(emJson.employees || []);
        setToHistory(toJson.toHistory || {});
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const responses = useMemo(() => generateResponses(employees), [employees]);

  const [selectedStore, setSelectedStore] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedCell, setSelectedCell] = useState(null);
  const [editTOStore, setEditTOStore] = useState(null);
  const [filterMode, setFilterMode] = useState('all');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [searchQuery, setSearchQuery] = useState('');
  // 매트릭스 일자 컬럼 hover highlight (row hover와 동일 효과의 세로 버전)
  const [hoveredDay, setHoveredDay] = useState(null);

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const storeStats = useMemo(() => {
    return stores.map((store) => {
      const currentTO = getToForStoreMonth(toHistory, store.workplaceId, CURRENT_MONTH);
      const fulfilledCount = getStoreFulfilledCount(store.name, employees, responses, currentTO);
      const empCount = employees.filter((e) => e.storeName === store.name).length;
      const hasHistory = (toHistory[store.workplaceId] || []).length > 0;
      return {
        ...store,
        currentTO,
        staff: empCount,
        fulfilledCount,
        unfulfilledCount: DAYS_IN_MONTH - fulfilledCount,
        hasHistory,
      };
    });
  }, [stores, employees, responses, toHistory]);

  const totalStats = useMemo(() => {
    const totalDays = stores.length * DAYS_IN_MONTH;
    const totalFulfilled = storeStats.reduce((sum, s) => sum + s.fulfilledCount, 0);
    const unfulfilledStores = storeStats.filter((s) => s.unfulfilledCount > 0).length;
    return {
      totalStores: stores.length,
      totalEmployees: employees.length,
      avgFulfillment: totalDays > 0 ? ((totalFulfilled / totalDays) * 100).toFixed(1) : '0.0',
      unfulfilledStores,
      totalFulfilled,
      totalDays,
    };
  }, [storeStats, stores, employees]);

  const displayStores = useMemo(() => {
    let result = storeStats;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)
      );
    }
    if (filterMode === 'unfulfilled') {
      result = result.filter((s) => s.unfulfilledCount > 0);
    }
    if (sortConfig.key) {
      result = [...result].sort((a, b) => {
        let valA, valB;
        if (sortConfig.key === 'name') { valA = a.name; valB = b.name; }
        else if (sortConfig.key === 'to') { valA = a.currentTO; valB = b.currentTO; }
        else if (sortConfig.key === 'rate') { valA = a.fulfilledCount; valB = b.fulfilledCount; }
        if (typeof valA === 'string') {
          return sortConfig.direction === 'asc' ? valA.localeCompare(valB, 'ko') : valB.localeCompare(valA, 'ko');
        }
        return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
      });
    }
    return result;
  }, [storeStats, filterMode, searchQuery, sortConfig]);

  const handleDownloadExcel = () => {
    const wb = XLSX.utils.book_new();
    const summaryHeader = ['근무지명', '근무지코드', '등록직원', 'TO', '달성률', '달성/전체'];
    for (let day = 1; day <= DAYS_IN_MONTH; day++) summaryHeader.push(`4/${day}`);
    const summaryData = [summaryHeader];
    storeStats.forEach((store) => {
      const rate = ((store.fulfilledCount / DAYS_IN_MONTH) * 100).toFixed(1);
      const row = [store.name, store.code, store.staff, `${store.currentTO}명`, `${rate}%`, `${store.fulfilledCount}/${DAYS_IN_MONTH}`];
      for (let day = 1; day <= DAYS_IN_MONTH; day++) {
        row.push(isStoreFulfilled(store.name, day, employees, responses, store.currentTO) ? 'O' : '-');
      }
      summaryData.push(row);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), '요약');

    const detailHeader = ['날짜', '근무지명', '근무지코드', '직원명', '사번', '요청시각', '응답시각', '응답내용'];
    const detailData = [detailHeader];
    employees.forEach((emp) => {
      const store = stores.find((s) => s.name === emp.storeName);
      for (let day = 1; day <= DAYS_IN_MONTH; day++) {
        TIMES.forEach((time) => {
          const result = responses[`${emp.id}|${day}|${time}`];
          const responseTime = result === '무응답' ? '' : getResponseTime(emp.id, day, time);
          detailData.push([
            `2026-04-${String(day).padStart(2, '0')}`,
            emp.storeName,
            store?.code || emp.storeCode || '',
            emp.name,
            emp.empNo,
            time,
            responseTime,
            result,
          ]);
        });
      }
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detailData), '상세');
    XLSX.writeFile(wb, `타이어뱅크_위치확인_${MONTH_LABEL.replace(/[^0-9]/g, '_')}.xlsx`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-body1 text-neutral-500 mb-2">샤플 API에서 매장/직원 정보 불러오는 중...</div>
          <div className="text-body3 text-neutral-400">최초 로딩은 수 초 걸릴 수 있습니다.</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="card p-6 max-w-md">
          <div className="flex items-center gap-2 text-red-600 font-bold mb-2">
            <AlertCircle className="w-5 h-5" /> 데이터 불러오기 실패
          </div>
          <div className="text-body1 text-neutral-600 mb-3 break-all">{error}</div>
          <div className="text-body3 text-neutral-500">서버에 SHOPL_AUTH_KEY 환경변수가 설정되어 있는지, Shopl API가 정상인지 확인하세요.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <TopHeader />

      <header className="bg-white border-b border-neutral-200">
        <div className="max-w-none mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-heading2 font-bold text-neutral-700 tracking-tight">근무지별 근무 달성 현황</h1>
              <div className="text-body2 text-neutral-500 mt-1">근무지별 시간대 응답을 일자 단위로 모니터링합니다.</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-white rounded-shopl-08 p-1 border border-neutral-200">
                <button className="p-2 hover:bg-neutral-100 rounded-shopl-06 text-neutral-600 transition-colors" aria-label="이전 달">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="px-4 min-w-[140px] text-center">
                  <div className="text-body1 font-bold text-neutral-700 leading-none">{MONTH_LABEL}</div>
                </div>
                <button className="p-2 hover:bg-neutral-100 rounded-shopl-06 text-neutral-600 transition-colors" aria-label="다음 달">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <button onClick={handleDownloadExcel} className="btn-primary">
                <Download className="w-4 h-4" />엑셀 다운로드
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-none mx-auto px-8 py-8">
        <div className="grid grid-cols-4 gap-3 mb-6">
          <StatCard icon={<Store className="w-4 h-4" />} label="전체 근무지" value={totalStats.totalStores} unit="개" />
          <StatCard icon={<Users className="w-4 h-4" />} label="등록 직원" value={totalStats.totalEmployees} unit="명" />
          <StatCard icon={<AlertCircle className="w-4 h-4" />} label="미달성 발생 근무지" value={totalStats.unfulfilledStores} unit={`/ ${totalStats.totalStores}개`} />
          <StatCard icon={<TrendingUp className="w-4 h-4" />} label="평균 달성률" value={totalStats.avgFulfillment} unit="%" highlight />
        </div>

        <div className="flex items-center justify-between mb-3 gap-3">
          <div className="flex items-center gap-3 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="근무지명 또는 코드로 검색"
                className="input pl-9"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-neutral-150 rounded">
                  <X className="w-3.5 h-3.5 text-neutral-500" />
                </button>
              )}
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-body1 text-neutral-600 select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={filterMode === 'unfulfilled'}
                onChange={(e) => setFilterMode(e.target.checked ? 'unfulfilled' : 'all')}
                className="w-4 h-4 accent-brand cursor-pointer"
              />
              <span className="font-semibold">미달성 근무지만 보기</span>
            </label>
            {(searchQuery || filterMode === 'unfulfilled' || sortConfig.key) && (
              <span className="text-body3 text-neutral-500">{displayStores.length}개 근무지 표시</span>
            )}
          </div>
          <div className="flex items-center gap-4 text-body1 text-neutral-600">
            <div className="flex items-center gap-1.5"><div className="w-3.5 h-3.5 bg-brand rounded-sm" /><span>달성</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3.5 h-3.5 bg-neutral-150 rounded-sm" /><span>미달성</span></div>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-body1 border-collapse table-fixed">
              <colgroup>
                <col style={{ width: '260px' }} />
                <col style={{ width: '90px' }} />
                <col style={{ width: '110px' }} />
                {Array.from({ length: DAYS_IN_MONTH }, (_, i) => <col key={i} />)}
              </colgroup>
              <thead>
                <tr className="bg-neutral-100 border-b border-neutral-200">
                  <th className="sticky left-0 bg-neutral-100 z-10 px-4 py-3 text-left text-body1 font-bold text-neutral-700 border-r border-neutral-200">
                    <button onClick={() => handleSort('name')} className="flex items-center gap-1 hover:text-brand transition-colors">
                      근무지명<SortIcon active={sortConfig.key === 'name'} direction={sortConfig.direction} />
                    </button>
                  </th>
                  <th className="px-3 py-3 text-center text-body1 font-bold text-neutral-700 border-r border-neutral-200">
                    <button onClick={() => handleSort('to')} className="flex items-center justify-center gap-1 mx-auto hover:text-brand transition-colors">
                      TO<SortIcon active={sortConfig.key === 'to'} direction={sortConfig.direction} />
                    </button>
                  </th>
                  <th className="px-3 py-3 text-center text-body1 font-bold text-neutral-700 border-r border-neutral-200">
                    <button onClick={() => handleSort('rate')} className="flex items-center justify-center gap-1 mx-auto hover:text-brand transition-colors">
                      달성률<SortIcon active={sortConfig.key === 'rate'} direction={sortConfig.direction} />
                    </button>
                  </th>
                  {Array.from({ length: DAYS_IN_MONTH }, (_, i) => i + 1).map((day) => {
                    const colorClass = getDayColorClass(day);
                    const isHovered = hoveredDay === day;
                    return (
                      <th
                        key={day}
                        onClick={() => setSelectedDay(day)}
                        onMouseEnter={() => setHoveredDay(day)}
                        onMouseLeave={() => setHoveredDay(null)}
                        className={`px-1 py-3 text-center text-body1 font-bold border-r border-neutral-200 last:border-r-0 cursor-pointer transition-colors ${colorClass} ${isHovered ? 'bg-shopl-100' : ''}`}
                      >
                        <div>{day}</div>
                        <div className={`text-body3 mt-0.5 font-bold ${colorClass}`}>
                          {getDayOfWeek(day)}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {displayStores.map((store) => {
                  const fulfillRate = ((store.fulfilledCount / DAYS_IN_MONTH) * 100).toFixed(0);
                  return (
                    <tr key={store.code} className="group/row border-b border-neutral-150 last:border-b-0 hover:bg-shopl-100/60 transition-colors">
                      <td onClick={() => setSelectedStore(store.name)} className="sticky left-0 bg-white group-hover/row:bg-shopl-100/60 z-10 px-4 py-3 border-r border-neutral-200 cursor-pointer group">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <span className="font-bold text-neutral-700 group-hover:text-brand transition-colors">{store.name}</span>
                          <span className="text-body3 text-neutral-400 font-medium tabular-nums">{store.code}</span>
                          <ChevronRight className="w-3 h-3 text-neutral-400 group-hover:text-brand transition-colors ml-auto flex-shrink-0" />
                        </div>
                      </td>
                      <td
                        onClick={(e) => { e.stopPropagation(); setEditTOStore(store); }}
                        className="px-3 py-3 text-center border-r border-neutral-200 cursor-pointer group/to"
                        title="클릭하여 TO 변경"
                      >
                        <span className="inline-block min-w-[36px] px-2 py-1 rounded-shopl-06 text-body1 font-bold text-neutral-700 group-hover/to:bg-white group-hover/to:text-brand transition-colors">
                          {store.currentTO}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center border-r border-neutral-200">
                        <div className="flex flex-col items-center leading-tight">
                          <span className={`text-title2 font-bold ${store.unfulfilledCount === 0 ? 'text-neutral-700' : 'text-neutral-600'}`}>{fulfillRate}%</span>
                          <span className="text-body3 text-neutral-500 font-medium">{store.fulfilledCount}/{DAYS_IN_MONTH}일</span>
                        </div>
                      </td>
                      {Array.from({ length: DAYS_IN_MONTH }, (_, i) => i + 1).map((day) => {
                        const fulfilled = isStoreFulfilled(store.name, day, employees, responses, store.currentTO);
                        const isHovered = hoveredDay === day;
                        return (
                          <td
                            key={day}
                            onClick={(e) => { e.stopPropagation(); setSelectedCell({ storeName: store.name, day }); }}
                            onMouseEnter={() => setHoveredDay(day)}
                            onMouseLeave={() => setHoveredDay(null)}
                            className={`px-1 py-2 cursor-pointer transition-colors ${isHovered ? 'bg-shopl-100' : ''}`}
                          >
                            <div
                              title={`${store.name} · 4월 ${day}일 · ${fulfilled ? '달성' : '미달성'} (클릭 시 상세)`}
                              className={`mx-auto w-1/2 h-5 rounded-shopl-04 transition-transform hover:scale-125 ${fulfilled ? 'bg-brand' : 'bg-neutral-150'}`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 p-4 bg-shopl-100/60 border border-shopl-200/60 rounded-card">
          <div className="text-body2 font-bold text-shopl-400 mb-1">사용 안내</div>
          <ul className="text-body3 text-neutral-600 space-y-0.5 list-disc list-inside">
            <li><strong>달성 기준</strong>: 매 시간대(09/12/14/18시)마다 응답한 직원 수가 근무지의 TO(목표 인원) 이상이면 그 시간대 통과, 4시간대 모두 통과 시 그날 달성입니다.</li>
            <li><strong>TO 변경</strong>: 매장의 TO 셀을 클릭하면 적용 월(Effective Month)을 지정해 변경할 수 있습니다. 해당 월부터 새 TO가 적용되고, 그 이전 월은 영향받지 않습니다.</li>
            <li>현재 매장/직원 정보는 샤플 실데이터, 시간대 응답 데이터는 디자인용 더미입니다 (위치확인 raw API 연동 후 교체 예정).</li>
            <li>근무지명 클릭 → 직원별 일자 상세 / 매트릭스 셀 클릭 → 시간대별 직원 응답 상세 / 날짜 클릭 → 근무지별 시간대 현황</li>
          </ul>
        </div>
      </main>

      {selectedStore && (
        <StoreDetailModal
          storeName={selectedStore}
          stores={stores}
          employees={employees.filter((e) => e.storeName === selectedStore)}
          responses={responses}
          toHistory={toHistory}
          onClose={() => setSelectedStore(null)}
        />
      )}
      {selectedDay && (
        <DateDetailModal
          day={selectedDay}
          stores={stores}
          employees={employees}
          responses={responses}
          toHistory={toHistory}
          onClose={() => setSelectedDay(null)}
        />
      )}
      {selectedCell && (
        <StoreDayDetailModal
          storeName={selectedCell.storeName}
          day={selectedCell.day}
          stores={stores}
          employees={employees.filter((e) => e.storeName === selectedCell.storeName)}
          responses={responses}
          toHistory={toHistory}
          onClose={() => setSelectedCell(null)}
        />
      )}
      {editTOStore && (
        <EditTOModal
          store={editTOStore}
          history={toHistory[editTOStore.workplaceId] || []}
          onClose={() => setEditTOStore(null)}
          onSaved={async () => {
            await fetchToHistory();
            setEditTOStore(null);
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Top Header (검은 글로벌 바)
// ============================================================
function TopHeader() {
  return (
    <div className="bg-neutral-700 text-white h-14 flex items-center px-8">
      <div className="flex items-center gap-3">
        <span className="text-title2 font-bold tracking-tight">타이어뱅크</span>
        <span className="text-neutral-400">·</span>
        <span className="text-body1 font-medium text-neutral-300">위치 확인 모니터링</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <span className="text-body3 text-neutral-400">powered by</span>
        <span className="text-body1 font-bold text-white">Shopl</span>
      </div>
    </div>
  );
}

// ============================================================
// Sort 아이콘
// ============================================================
function SortIcon({ active, direction }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-neutral-400" />;
  return direction === 'asc'
    ? <ArrowUp className="w-3 h-3 text-neutral-700" />
    : <ArrowDown className="w-3 h-3 text-neutral-700" />;
}

// ============================================================
// Stat Card
// ============================================================
function StatCard({ icon, label, value, unit, highlight }) {
  if (highlight) {
    return (
      <div className="stat-card-hero">
        <div className="flex items-center gap-2 text-body2 font-semibold mb-3 text-shopl-100">
          {icon}<span>{label}</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-heading1 font-bold tracking-tight text-white">{value}</span>
          <span className="text-body1 font-semibold text-shopl-100">{unit}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="stat-card">
      <div className="flex items-center gap-2 text-body2 font-semibold mb-3 text-neutral-500">
        {icon}<span>{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-heading1 font-bold tracking-tight text-neutral-700">{value}</span>
        <span className="text-body1 font-semibold text-neutral-500">{unit}</span>
      </div>
    </div>
  );
}

// ============================================================
// 매장 드릴다운 모달
// ============================================================
function StoreDetailModal({ storeName, stores, employees, responses, toHistory, onClose }) {
  const store = stores.find((s) => s.name === storeName);
  const currentTO = store ? getToForStoreMonth(toHistory, store.workplaceId, CURRENT_MONTH) : DEFAULT_TO;
  const fulfilledCount = useMemo(
    () => getStoreFulfilledCount(storeName, employees, responses, currentTO),
    [storeName, employees, responses, currentTO]
  );

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} className="modal-overlay">
      <div className="modal-panel max-w-[2400px] max-h-[92vh] w-[95vw]">
        <div className="modal-header">
          <div>
            <div className="flex items-center gap-2 text-body3 text-neutral-500 mb-1"><Store className="w-3.5 h-3.5" /><span>근무지 상세</span></div>
            <h2 className="text-heading3 font-bold text-neutral-700 flex items-center gap-2">
              {storeName}<span className="text-body2 text-neutral-400 font-medium tabular-nums">{store?.code}</span>
            </h2>
            <div className="flex items-center gap-3 mt-2 text-body3 text-neutral-500 flex-wrap">
              <span>등록 직원 {employees.length}명</span>
              <span className="text-neutral-300">|</span>
              <span>TO {currentTO}명</span>
              <span className="text-neutral-300">|</span>
              <span>달성률 {((fulfilledCount / DAYS_IN_MONTH) * 100).toFixed(0)}% ({fulfilledCount}/{DAYS_IN_MONTH}일)</span>
              <span className="text-neutral-300">|</span>
              <span>{MONTH_LABEL}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-neutral-150 rounded-shopl-08 transition-colors"><X className="w-5 h-5 text-neutral-500" /></button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="text-body3 text-neutral-500 mb-3">
            각 셀은 해당 일자에 직원이 응답한 횟수입니다 (4회 중). 근무지 달성은 시간대별 응답 인원이 TO 이상인지로 판정되며, 셀을 클릭하면 그 일자의 시간대별 상세를 볼 수 있습니다.
          </div>
          <table className="w-full text-body1 border-collapse table-fixed">
            <colgroup>
              <col style={{ width: '120px' }} />
              <col style={{ width: '100px' }} />
              {Array.from({ length: DAYS_IN_MONTH }, (_, i) => <col key={i} />)}
            </colgroup>
            <thead>
              <tr className="bg-neutral-100 border-b border-neutral-200">
                <th className="sticky left-0 bg-neutral-100 z-10 px-3 py-2 text-left text-body1 font-bold text-neutral-700 border-r border-neutral-200">직원명</th>
                <th className="px-3 py-2 text-center text-body1 font-bold text-neutral-700 border-r border-neutral-200">사번</th>
                {Array.from({ length: DAYS_IN_MONTH }, (_, i) => i + 1).map((day) => {
                  const colorClass = getDayColorClass(day);
                  return (
                    <th key={day} className={`px-1 py-2 text-center text-body1 font-bold border-r border-neutral-200 last:border-r-0 ${colorClass}`}>
                      <div>{day}</div>
                      <div className={`text-body3 mt-0.5 font-bold ${colorClass}`}>{getDayOfWeek(day)}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id} className="border-b border-neutral-150 last:border-b-0">
                  <td className="sticky left-0 bg-white z-10 px-3 py-3.5 font-bold text-neutral-700 border-r border-neutral-200">{emp.name}</td>
                  <td className="px-3 py-3.5 text-center text-neutral-500 text-body3 tabular-nums border-r border-neutral-200">{emp.empNo}</td>
                  {Array.from({ length: DAYS_IN_MONTH }, (_, i) => i + 1).map((day) => {
                    const { ok, total } = getEmployeeDayResult(emp, day, responses);
                    const allOk = ok === total;
                    return (
                      <td key={day} className="px-1 py-2.5 border-r border-neutral-150 last:border-r-0">
                        <div className={`mx-auto w-full py-2 rounded-shopl-04 text-[10px] font-bold text-center ${allOk ? 'bg-brand text-white' : 'bg-neutral-100 text-neutral-500 border border-neutral-200'}`}>
                          {ok}/{total}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 일자 드릴다운 모달
// ============================================================
function DateDetailModal({ day, stores, employees, responses, toHistory, onClose }) {
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} className="modal-overlay">
      <div className="modal-panel max-w-[2000px] max-h-[92vh] w-[80vw]">
        <div className="modal-header">
          <div>
            <div className="flex items-center gap-2 text-body3 text-neutral-500 mb-1"><CalendarIcon className="w-3.5 h-3.5" /><span>일자 상세</span></div>
            <h2 className="text-heading3 font-bold text-neutral-700">2026년 4월 {day}일 ({getDayOfWeek(day)})</h2>
            <div className="text-body3 text-neutral-500 mt-1">근무지별 시간대 응답 현황</div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-neutral-150 rounded-shopl-08 transition-colors"><X className="w-5 h-5 text-neutral-500" /></button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="text-body3 text-neutral-500 mb-3">셀의 숫자는 해당 시간대에 근무지 직원이 응답한 인원/TO입니다.</div>
          <table className="w-full text-body1 border-collapse">
            <thead>
              <tr className="bg-neutral-100 border-b border-neutral-200">
                <th className="px-3 py-2 text-left text-body3 font-bold text-neutral-600 border-r border-neutral-200">근무지명</th>
                <th className="px-3 py-2 text-center text-body3 font-bold text-neutral-600 border-r border-neutral-200">TO</th>
                {TIMES.map((time) => (
                  <th key={time} className="px-3 py-2 text-center text-body3 font-bold text-neutral-600 border-r border-neutral-200 last:border-r-0">{time}</th>
                ))}
                <th className="px-3 py-2 text-center text-body3 font-bold text-neutral-600">결과</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((store) => {
                const requiredTO = getToForStoreMonth(toHistory, store.workplaceId, CURRENT_MONTH);
                const timeResults = TIMES.map((time) => {
                  const ok = employees.filter((emp) => emp.storeName === store.name && responses[`${emp.id}|${day}|${time}`] === '배정 근무지').length;
                  return { ok, required: requiredTO };
                });
                const fulfilled = timeResults.every((r) => r.ok >= r.required);
                return (
                  <tr key={store.code} className="border-b border-neutral-150 last:border-b-0">
                    <td className="px-3 py-2 font-bold text-neutral-700 border-r border-neutral-200">
                      <div className="flex items-center gap-1.5">
                        <span>{store.name}</span>
                        <span className="text-[10px] text-neutral-400 font-medium tabular-nums">{store.code}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center text-neutral-600 border-r border-neutral-200">{requiredTO}</td>
                    {timeResults.map((r, idx) => (
                      <td key={idx} className="px-3 py-1.5 text-center border-r border-neutral-200 last:border-r-0">
                        <span className={`inline-block px-2 py-0.5 rounded-shopl-04 text-body3 font-bold ${r.ok >= r.required ? 'bg-shopl-100 text-shopl-400' : 'bg-neutral-100 text-neutral-500 border border-neutral-200'}`}>
                          {r.ok}/{r.required}
                        </span>
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-shopl-04 ${fulfilled ? 'bg-brand' : 'bg-neutral-100 border border-neutral-200'}`}>
                        {fulfilled ? <Check className="w-3 h-3 text-white" strokeWidth={3} /> : <Minus className="w-3 h-3 text-neutral-400" strokeWidth={2.5} />}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 매장 + 일자 셀 드릴다운 모달
// ============================================================
function StoreDayDetailModal({ storeName, day, stores, employees, responses, toHistory, onClose }) {
  const store = stores.find((s) => s.name === storeName);
  const requiredTO = store ? getToForStoreMonth(toHistory, store.workplaceId, CURRENT_MONTH) : DEFAULT_TO;

  const empData = employees.map((emp) => {
    const timeResults = TIMES.map((time) => {
      const status = responses[`${emp.id}|${day}|${time}`];
      const responseTime = status === '무응답' ? null : getResponseTime(emp.id, day, time);
      return { time, status, responseTime };
    });
    const respondedCount = timeResults.filter((t) => t.status === '배정 근무지').length;
    return { emp, timeResults, respondedCount };
  });

  const timeSlotCounts = TIMES.map((time) => empData.filter(({ timeResults }) => timeResults.find((t) => t.time === time)?.status === '배정 근무지').length);
  const isFulfilled = timeSlotCounts.every((c) => c >= requiredTO);

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} className="modal-overlay">
      <div className="modal-panel max-w-[1100px] max-h-[92vh] w-[55vw]">
        <div className="modal-header">
          <div>
            <div className="flex items-center gap-2 text-body3 text-neutral-500 mb-1"><MapPin className="w-3.5 h-3.5" /><span>근무지 + 일자 상세</span></div>
            <h2 className="text-heading3 font-bold text-neutral-700 flex items-center gap-2">
              {storeName}
              <span className="text-body2 text-neutral-400 font-medium tabular-nums">{store?.code}</span>
              <span className="text-neutral-300 mx-1">·</span>
              <span>2026년 4월 {day}일 ({getDayOfWeek(day)})</span>
            </h2>
            <div className="flex items-center gap-3 mt-2">
              <span className={`badge ${isFulfilled ? 'bg-shopl-100 border-shopl-200 text-shopl-400' : 'bg-white border-neutral-300 text-neutral-600'}`}>
                {isFulfilled ? <><Check className="w-3 h-3" strokeWidth={3} />달성</> : <><Minus className="w-3 h-3" strokeWidth={2.5} />미달성</>}
              </span>
              <span className="text-body3 text-neutral-500">TO {requiredTO}명 · 등록 {employees.length}명</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-neutral-150 rounded-shopl-08 transition-colors"><X className="w-5 h-5 text-neutral-500" /></button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="text-body3 text-neutral-500 mb-3">각 셀은 직원의 시간대별 응답 시각과 결과입니다. 마지막 행은 시간대별 응답 인원과 TO 비교입니다.</div>
          <table className="w-full text-body1 border-collapse">
            <thead>
              <tr className="bg-neutral-100 border-b border-neutral-200">
                <th className="px-3 py-2 text-left text-body3 font-bold text-neutral-600 border-r border-neutral-200 min-w-[100px]">직원명</th>
                <th className="px-3 py-2 text-center text-body3 font-bold text-neutral-600 border-r border-neutral-200 min-w-[100px]">사번</th>
                {TIMES.map((time) => (
                  <th key={time} className="px-3 py-2 text-center text-body3 font-bold text-neutral-600 border-r border-neutral-200 min-w-[140px]">
                    <div className="flex items-center justify-center gap-1"><Clock className="w-3 h-3 text-neutral-400" /><span>{time}</span></div>
                  </th>
                ))}
                <th className="px-3 py-2 text-center text-body3 font-bold text-neutral-600 min-w-[80px]">4회 응답</th>
              </tr>
            </thead>
            <tbody>
              {empData.map(({ emp, timeResults, respondedCount }) => {
                const allOk = respondedCount === TIMES.length;
                return (
                  <tr key={emp.id} className="border-b border-neutral-150 last:border-b-0">
                    <td className="px-3 py-2.5 font-bold text-neutral-700 border-r border-neutral-200">{emp.name}</td>
                    <td className="px-3 py-2.5 text-center text-neutral-500 text-body3 tabular-nums border-r border-neutral-200">{emp.empNo}</td>
                    {timeResults.map((tr, idx) => (
                      <td key={idx} className="px-3 py-2 text-center border-r border-neutral-200">
                        <ResponseChip status={tr.status} responseTime={tr.responseTime} />
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center text-body3 text-neutral-500">
                      <span className={allOk ? 'font-bold text-neutral-700' : ''}>{respondedCount}/{TIMES.length}</span>
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-neutral-100 border-t-2 border-neutral-300">
                <td colSpan={2} className="px-3 py-3 text-body3 font-bold text-neutral-600 border-r border-neutral-200 text-right">시간대별 응답인원 / TO ({requiredTO}명)</td>
                {timeSlotCounts.map((count, idx) => {
                  const ok = count >= requiredTO;
                  return (
                    <td key={idx} className="px-3 py-3 text-center border-r border-neutral-200">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-shopl-04 font-bold text-body1 ${ok ? 'bg-brand text-white' : 'bg-white text-neutral-600 border border-neutral-300'}`}>
                        {ok ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : <Minus className="w-3.5 h-3.5" strokeWidth={3} />}
                        {count}/{requiredTO}
                      </span>
                    </td>
                  );
                })}
                <td className="px-3 py-3 text-center">
                  <span className={`inline-flex items-center justify-center w-7 h-7 rounded-shopl-04 ${isFulfilled ? 'bg-brand' : 'bg-neutral-100 border border-neutral-200'}`}>
                    {isFulfilled ? <Check className="w-4 h-4 text-white" strokeWidth={3} /> : <Minus className="w-4 h-4 text-neutral-400" strokeWidth={2.5} />}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>

          <div className="mt-4 flex items-center gap-3 text-body3 text-neutral-500 flex-wrap">
            <span className="font-bold text-neutral-600">범례:</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 bg-brand rounded-full" /> 배정 근무지에서 응답</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 bg-amber-400 rounded-full" /> 근무지 아닌 곳에서 응답</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 bg-neutral-400 rounded-full" /> 거절</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 bg-neutral-200 rounded-full" /> 무응답</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TO 변경 모달 (신규)
// ============================================================
// 매장의 TO 셀 클릭 → 이 모달.
// - 현재 적용 TO (CURRENT_MONTH 기준) 표시
// - 신규 TO + Effective Month 입력 → POST /api/to → 변경 이력에 추가
// - 변경 이력 리스트 (effectiveMonth, to, updatedAt)
function EditTOModal({ store, history, onClose, onSaved }) {
  // default effective month: 현재 표시 월의 다음 달 (가장 빈번한 use case)
  const [effectiveMonth, setEffectiveMonth] = useState(nextMonth(CURRENT_MONTH));
  const [toValue, setToValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState(null);

  // 현재 적용 중인 entry — TO 값 + 언제부터 적용 시작인지(effectiveMonth)도 함께 노출
  const currentEntry = useMemo(() => {
    if (!history || history.length === 0) return null;
    const applicable = history.filter((h) => h.effectiveMonth <= CURRENT_MONTH);
    if (applicable.length === 0) return null;
    const sorted = [...applicable].sort((a, b) => {
      if (a.effectiveMonth !== b.effectiveMonth) return a.effectiveMonth.localeCompare(b.effectiveMonth);
      return (a.updatedAt || '').localeCompare(b.updatedAt || '');
    });
    return sorted[sorted.length - 1];
  }, [history]);
  const currentTO = currentEntry ? currentEntry.to : DEFAULT_TO;

  const sortedHistory = useMemo(() => {
    return [...(history || [])].sort((a, b) => {
      if (a.effectiveMonth !== b.effectiveMonth) return b.effectiveMonth.localeCompare(a.effectiveMonth);
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });
  }, [history]);

  async function handleSave() {
    setErrMsg(null);
    const num = parseInt(toValue, 10);
    if (!Number.isInteger(num) || num < 0 || num > 999) {
      setErrMsg('TO는 0 이상 999 이하의 정수여야 합니다.');
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(effectiveMonth)) {
      setErrMsg('Effective Month는 YYYY-MM 형식이어야 합니다.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/to', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workplaceId: store.workplaceId,
          effectiveMonth,
          to: num,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      await onSaved();
    } catch (e) {
      setErrMsg(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} className="modal-overlay">
      <div className="modal-panel w-[560px] max-w-full max-h-[92vh]">
        <div className="modal-header">
          <div>
            <div className="flex items-center gap-2 text-body3 text-neutral-500 mb-1">
              <Pencil className="w-3.5 h-3.5" />
              <span>TO 변경</span>
            </div>
            <h2 className="text-heading3 font-bold text-neutral-700 flex items-center gap-2">
              {store.name}
              <span className="text-body2 text-neutral-400 font-medium tabular-nums">{store.code}</span>
            </h2>
            <div className="text-body3 text-neutral-500 mt-1">
              현재 적용 TO: <span className="font-bold text-neutral-700">{currentTO}명</span>
              {currentEntry && (
                <span className="ml-1 text-neutral-400">
                  ({formatMonthLabel(currentEntry.effectiveMonth)}부터 적용 중)
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-neutral-150 rounded-shopl-08 transition-colors">
            <X className="w-5 h-5 text-neutral-500" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-6">
          {/* 신규 입력 폼 */}
          <div>
            <div className="text-body1 font-bold text-neutral-700 mb-3">새 TO 등록</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">TO 인원</label>
                <input
                  type="number"
                  min={0}
                  max={999}
                  value={toValue}
                  onChange={(e) => setToValue(e.target.value)}
                  placeholder="예: 4"
                  className="input"
                />
              </div>
              <div>
                <label className="label">Effective Month</label>
                <input
                  type="month"
                  value={effectiveMonth}
                  onChange={(e) => setEffectiveMonth(e.target.value)}
                  className="input"
                />
              </div>
            </div>
            <div className="mt-3 p-3 bg-shopl-100/60 border border-shopl-200/60 rounded-shopl-06 text-body3 text-shopl-400">
              <strong>{formatMonthLabel(effectiveMonth)}</strong>부터 새 TO가 적용됩니다.
              그 이전 월의 달성 판정은 영향받지 않습니다.
            </div>
            {errMsg && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-shopl-06 text-body3 text-red-600">
                {errMsg}
              </div>
            )}
          </div>

          {/* 변경 이력 */}
          <div>
            <div className="flex items-center gap-1.5 text-body1 font-bold text-neutral-700 mb-3">
              <History className="w-4 h-4 text-neutral-500" />
              <span>변경 이력</span>
              <span className="text-body3 text-neutral-400 font-medium">({sortedHistory.length}건)</span>
            </div>
            {sortedHistory.length === 0 ? (
              <div className="p-4 text-center text-body3 text-neutral-400 bg-neutral-100/50 rounded-shopl-06">
                아직 등록된 변경 이력이 없습니다.
              </div>
            ) : (
              <div className="border border-neutral-200 rounded-shopl-08 overflow-hidden">
                <table className="w-full text-body1 border-collapse">
                  <thead>
                    <tr className="bg-neutral-100 border-b border-neutral-200">
                      <th className="px-3 py-2 text-left text-body3 font-bold text-neutral-600">Effective Month</th>
                      <th className="px-3 py-2 text-center text-body3 font-bold text-neutral-600">TO</th>
                      <th className="px-3 py-2 text-right text-body3 font-bold text-neutral-600">변경 시각</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedHistory.map((h, idx) => (
                      <tr key={idx} className="border-b border-neutral-150 last:border-b-0">
                        <td className="px-3 py-2 text-body2 font-bold text-neutral-700">{formatMonthLabel(h.effectiveMonth)}</td>
                        <td className="px-3 py-2 text-center text-body1 font-bold text-brand">{h.to}명</td>
                        <td className="px-3 py-2 text-right text-body3 text-neutral-500 tabular-nums">{formatUpdatedAt(h.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn-secondary" disabled={submitting}>취소</button>
          <button onClick={handleSave} className="btn-primary" disabled={submitting || toValue === ''}>
            {submitting ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 응답 칩
// ============================================================
function ResponseChip({ status, responseTime }) {
  const config = {
    '배정 근무지': { bg: 'bg-brand', text: 'text-white', icon: <Check className="w-3 h-3" strokeWidth={3} />, label: responseTime },
    '근무지 아님': { bg: 'bg-amber-50 border border-amber-300', text: 'text-amber-800', icon: <MapPin className="w-3 h-3" strokeWidth={2.5} />, label: `위치 외 ${responseTime}` },
    '거절': { bg: 'bg-neutral-150 border border-neutral-300', text: 'text-neutral-500', icon: <X className="w-3 h-3" strokeWidth={2.5} />, label: `거절 ${responseTime}` },
    '무응답': { bg: 'bg-neutral-100 border border-neutral-200', text: 'text-neutral-400', icon: <Minus className="w-3 h-3" strokeWidth={2} />, label: '미응답' },
  };
  const c = config[status] || config['무응답'];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-shopl-04 text-body3 font-bold ${c.bg} ${c.text}`}>
      {c.icon}<span>{c.label}</span>
    </span>
  );
}
