import { useState, useMemo } from 'react';
import { Download, X, Check, Store, Users, Calendar as CalendarIcon, TrendingUp, ChevronRight, ChevronLeft, AlertCircle, Search, ArrowUpDown, ArrowUp, ArrowDown, MapPin, Clock, Minus } from 'lucide-react';
import * as XLSX from 'xlsx';

// ============================================================
// 데이터 정의
// ============================================================
// STORES: 각 매장은 toHistory 배열로 TO 변경 이력을 가짐.
// toHistory[i] = { from: 일자(1~30), to: 인원수 } - from일부터 다음 변경 전까지 적용
// ============================================================
// 데이터 정의
// ============================================================
// 각 매장: name(근무지명), code(근무지코드), staff(등록 직원 수), toHistory(TO 변경 이력)
// TO = 시간대별 최소 응답 인원 (등록 직원 수와 다름)
// staff(등록 직원)은 TO보다 큼 - 휴가/조퇴 고려
// toHistory = [{from: 시작일, to: 해당 일부터 적용될 TO}, ...]
// 마포점은 4/15부터 TO 5→6 변경 시나리오를 보여줌
const STORES = [
  { name: '강남점', code: 'TB1001', staff: 5, toHistory: [{ from: 1, to: 3 }] },
  { name: '서초점', code: 'TB1002', staff: 6, toHistory: [{ from: 1, to: 4 }] },
  { name: '송파점', code: 'TB1003', staff: 5, toHistory: [{ from: 1, to: 3 }] },
  { name: '마포점', code: 'TB1004', staff: 7, toHistory: [{ from: 1, to: 5 }, { from: 15, to: 6 }] },
  { name: '영등포점', code: 'TB1005', staff: 6, toHistory: [{ from: 1, to: 4 }] },
  { name: '강서점', code: 'TB1006', staff: 5, toHistory: [{ from: 1, to: 3 }] },
  { name: '광진점', code: 'TB1007', staff: 6, toHistory: [{ from: 1, to: 4 }] },
  { name: '노원점', code: 'TB1008', staff: 5, toHistory: [{ from: 1, to: 3 }] },
  { name: '성북점', code: 'TB1009', staff: 6, toHistory: [{ from: 1, to: 4 }] },
  { name: '은평점', code: 'TB1010', staff: 5, toHistory: [{ from: 1, to: 3 }] },
  { name: '양천점', code: 'TB1011', staff: 7, toHistory: [{ from: 1, to: 5 }] },
  { name: '동작점', code: 'TB1012', staff: 6, toHistory: [{ from: 1, to: 4 }] },
];

// 특정 일자의 TO 조회
function getToForDay(store, day) {
  let currentTo = store.toHistory[0]?.to || 0;
  for (const h of store.toHistory) {
    if (day >= h.from) currentTo = h.to;
  }
  return currentTo;
}

// TO 이력을 텍스트로 표현 (예: "5명 → 15일부터 6명")
function formatToHistory(store) {
  if (store.toHistory.length === 1) {
    return `${store.toHistory[0].to}명`;
  }
  return store.toHistory
    .map((h, i) => (i === 0 ? `${h.to}명` : `${h.from}일부터 ${h.to}명`))
    .join(' / ');
}

const TIMES = ['09:00', '12:00', '14:00', '18:00'];
const DAYS_IN_MONTH = 30;
const MONTH_LABEL = '2026년 4월';

const LAST_NAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권'];
const FIRST_NAMES = ['민수', '지현', '서연', '준호', '하은', '우진', '예린', '도윤', '수아', '시우', '지민', '윤서', '건우', '나연', '준영', '태민', '은채', '동현', '소율', '재원'];

// 시드 기반 결정적 랜덤 (재현 가능한 데이터 생성)
function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// 직원 생성 - 매장당 staff(등록 직원 수)명 생성
function generateEmployees() {
  const employees = [];
  STORES.forEach((store, sIdx) => {
    for (let i = 0; i < store.staff; i++) {
      const lastIdx = (sIdx * 7 + i * 3) % LAST_NAMES.length;
      const firstIdx = (sIdx * 11 + i * 5) % FIRST_NAMES.length;
      employees.push({
        id: `${store.name}-${i + 1}`,
        empNo: `TB${String(sIdx + 1).padStart(2, '0')}${String(i + 1).padStart(2, '0')}`,
        name: `${LAST_NAMES[lastIdx]}${FIRST_NAMES[firstIdx]}`,
        storeName: store.name,
      });
    }
  });
  return employees;
}

// 응답 데이터 생성
// - 각 직원이 일자별 출근/휴가 여부 결정 (85% 출근, 15% 휴가)
// - 출근한 직원도 시간대별 일부 누락 가능 (조퇴/지각/근무지 외 등)
function generateResponses(employees) {
  const responses = {};
  let seed = 42;

  // 직원-일자별 출근 여부 사전 결정
  const attendance = {};
  employees.forEach((emp) => {
    for (let day = 1; day <= DAYS_IN_MONTH; day++) {
      attendance[`${emp.id}|${day}`] = seededRandom(seed++) > 0.15;
    }
  });

  employees.forEach((emp) => {
    for (let day = 1; day <= DAYS_IN_MONTH; day++) {
      const attended = attendance[`${emp.id}|${day}`];
      TIMES.forEach((time) => {
        const key = `${emp.id}|${day}|${time}`;
        if (!attended) {
          responses[key] = '무응답';
          return;
        }
        const r = seededRandom(seed++);
        if (r < 0.92) responses[key] = '배정 근무지';
        else if (r < 0.96) responses[key] = '근무지 아님';
        else if (r < 0.98) responses[key] = '거절';
        else responses[key] = '무응답';
      });
    }
  });
  return responses;
}

// 매장의 시간대별 응답 인원 (배정 근무지 응답 직원 수)
function getTimeSlotResponseCount(storeName, day, time, employees, responses) {
  const storeEmps = employees.filter((e) => e.storeName === storeName);
  return storeEmps.filter(
    (emp) => responses[`${emp.id}|${day}|${time}`] === '배정 근무지'
  ).length;
}

// 매장×일자 달성 여부
// 새 로직: 모든 시간대에 응답 인원 >= 그 일자의 TO 이면 달성
function isStoreFulfilled(storeName, day, employees, responses) {
  const store = STORES.find((s) => s.name === storeName);
  const requiredTO = getToForDay(store, day);
  return TIMES.every((time) => {
    const count = getTimeSlotResponseCount(storeName, day, time, employees, responses);
    return count >= requiredTO;
  });
}

// 매장 달성 일수 (전체 30일 중)
function getStoreFulfilledCount(storeName, employees, responses) {
  let count = 0;
  for (let day = 1; day <= DAYS_IN_MONTH; day++) {
    if (isStoreFulfilled(storeName, day, employees, responses)) count++;
  }
  return count;
}

// 직원의 특정 일자 응답 결과 (4회 중 몇 회 배정 근무지인지)
function getEmployeeDayResult(emp, day, responses) {
  const results = TIMES.map((time) => responses[`${emp.id}|${day}|${time}`]);
  const ok = results.filter((r) => r === '배정 근무지').length;
  return { ok, total: TIMES.length, details: results };
}

// 일자 요일 표기
function getDayOfWeek(day) {
  // 2026년 4월 1일 = 수요일
  const days = ['수', '목', '금', '토', '일', '월', '화'];
  return days[(day - 1) % 7];
}

// 응답 시각 계산 (시드 기반 결정적)
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

// ============================================================
// 메인 컴포넌트
// ============================================================
export default function Dashboard() {
  const employees = useMemo(() => generateEmployees(), []);
  const responses = useMemo(() => generateResponses(employees), [employees]);

  const [selectedStore, setSelectedStore] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedCell, setSelectedCell] = useState(null); // { storeName, day }
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'unfulfilled'
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [searchQuery, setSearchQuery] = useState('');

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  // 매장별 통계
  const storeStats = useMemo(() => {
    return STORES.map((store) => {
      const fulfilledCount = getStoreFulfilledCount(store.name, employees, responses);
      const currentTO = getToForDay(store, DAYS_IN_MONTH);
      const hasToChange = store.toHistory.length > 1;
      return {
        ...store,
        currentTO,
        hasToChange,
        fulfilledCount,
        unfulfilledCount: DAYS_IN_MONTH - fulfilledCount,
      };
    });
  }, [employees, responses]);

  // 전체 통계
  const totalStats = useMemo(() => {
    const totalDays = STORES.length * DAYS_IN_MONTH;
    const totalFulfilled = storeStats.reduce((sum, s) => sum + s.fulfilledCount, 0);
    const unfulfilledStores = storeStats.filter((s) => s.unfulfilledCount > 0).length;
    return {
      totalStores: STORES.length,
      totalEmployees: employees.length,
      avgFulfillment: ((totalFulfilled / totalDays) * 100).toFixed(1),
      unfulfilledStores,
      totalFulfilled,
      totalDays,
    };
  }, [storeStats, employees]);

  // 표시 매장 목록 (검색 + 필터 + 정렬 적용)
  const displayStores = useMemo(() => {
    let result = storeStats;

    // 검색
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)
      );
    }

    // 미달성 필터
    if (filterMode === 'unfulfilled') {
      result = result.filter((s) => s.unfulfilledCount > 0);
    }

    // 정렬
    if (sortConfig.key) {
      result = [...result].sort((a, b) => {
        let valA, valB;
        if (sortConfig.key === 'name') {
          valA = a.name;
          valB = b.name;
        } else if (sortConfig.key === 'to') {
          valA = a.currentTO;
          valB = b.currentTO;
        } else if (sortConfig.key === 'rate') {
          valA = a.fulfilledCount;
          valB = b.fulfilledCount;
        }
        if (typeof valA === 'string') {
          return sortConfig.direction === 'asc'
            ? valA.localeCompare(valB, 'ko')
            : valB.localeCompare(valA, 'ko');
        }
        return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
      });
    }

    return result;
  }, [storeStats, filterMode, searchQuery, sortConfig]);

  // 엑셀 다운로드
  const handleDownloadExcel = () => {
    const wb = XLSX.utils.book_new();

    // 시트 1: 요약 (매장 × 일자 매트릭스)
    const summaryHeader = ['근무지명', '근무지코드', '등록직원', 'TO', '달성률', '달성/전체'];
    for (let day = 1; day <= DAYS_IN_MONTH; day++) {
      summaryHeader.push(`4/${day}`);
    }
    const summaryData = [summaryHeader];
    storeStats.forEach((store) => {
      const rate = ((store.fulfilledCount / DAYS_IN_MONTH) * 100).toFixed(1);
      const row = [
        store.name,
        store.code,
        store.staff,
        formatToHistory(store),
        `${rate}%`,
        `${store.fulfilledCount}/${DAYS_IN_MONTH}`,
      ];
      for (let day = 1; day <= DAYS_IN_MONTH; day++) {
        row.push(isStoreFulfilled(store.name, day, employees, responses) ? 'O' : '-');
      }
      summaryData.push(row);
    });
    const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, ws1, '요약');

    // 시트 2: 상세 (직원 × 일자 × 시간대)
    const detailHeader = ['날짜', '근무지명', '근무지코드', '직원명', '사번', '요청시각', '응답시각', '응답내용'];
    const detailData = [detailHeader];
    employees.forEach((emp) => {
      const store = STORES.find((s) => s.name === emp.storeName);
      for (let day = 1; day <= DAYS_IN_MONTH; day++) {
        TIMES.forEach((time) => {
          const result = responses[`${emp.id}|${day}|${time}`];
          const responseTime = result === '무응답' ? '' : getResponseTime(emp.id, day, time);
          detailData.push([
            `2026-04-${String(day).padStart(2, '0')}`,
            emp.storeName,
            store?.code || '',
            emp.name,
            emp.empNo,
            time,
            responseTime,
            result,
          ]);
        });
      }
    });
    const ws2 = XLSX.utils.aoa_to_sheet(detailData);
    XLSX.utils.book_append_sheet(wb, ws2, '상세');

    XLSX.writeFile(wb, `타이어뱅크_위치확인_${MONTH_LABEL.replace(/[^0-9]/g, '_')}.xlsx`);
  };


  return (
    <div className="min-h-screen bg-stone-50 font-[system-ui]" style={{ fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif" }}>
      {/* 헤더 */}
      <header className="bg-white border-b border-stone-200">
        <div className="max-w-none mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs text-stone-500 font-medium tracking-wide mb-1">
                <span>TIREBANK</span>
                <span>·</span>
                <span>위치 확인 모니터링</span>
              </div>
              <h1 className="text-2xl font-bold text-stone-900 tracking-tight">
                매장별 근무 달성 현황
              </h1>
            </div>
            <div className="flex items-center gap-4">
              {/* 월 네비게이션 - 크게 강조 */}
              <div className="flex items-center gap-1 bg-stone-50 rounded-xl px-1.5 py-1.5 border border-stone-300">
                <button
                  className="p-2.5 hover:bg-white rounded-lg text-stone-700 transition-colors"
                  aria-label="이전 달"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="px-5 min-w-[160px] text-center">
                  <div className="text-[10px] text-stone-500 font-medium tracking-wider uppercase mb-0.5">
                    조회 기간
                  </div>
                  <div className="text-lg font-bold text-stone-900 leading-none">
                    {MONTH_LABEL}
                  </div>
                </div>
                <button
                  className="p-2.5 hover:bg-white rounded-lg text-stone-700 transition-colors"
                  aria-label="다음 달"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
              <button
                onClick={handleDownloadExcel}
                className="flex items-center gap-2 px-4 py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                <Download className="w-4 h-4" />
                엑셀 다운로드
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-none mx-auto px-6 py-8">
        {/* 통계 카드 */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={<Store className="w-5 h-5" />}
            label="전체 매장"
            value={totalStats.totalStores}
            unit="개"
          />
          <StatCard
            icon={<Users className="w-5 h-5" />}
            label="등록 직원"
            value={totalStats.totalEmployees}
            unit="명"
          />
          <StatCard
            icon={<AlertCircle className="w-5 h-5" />}
            label="미달성 발생 매장"
            value={totalStats.unfulfilledStores}
            unit={`/ ${totalStats.totalStores}개`}
          />
          <StatCard
            icon={<TrendingUp className="w-5 h-5" />}
            label="평균 달성률"
            value={totalStats.avgFulfillment}
            unit="%"
            highlight
          />
        </div>

        {/* 검색 + 필터 */}
        <div className="flex items-center justify-between mb-4 gap-3">
          <div className="flex items-center gap-3 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="근무지명 또는 코드로 검색"
                className="w-full pl-9 pr-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:border-stone-900 focus:ring-1 focus:ring-stone-900 transition-colors bg-white"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-stone-100 rounded"
                >
                  <X className="w-3.5 h-3.5 text-stone-500" />
                </button>
              )}
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-stone-700 select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={filterMode === 'unfulfilled'}
                onChange={(e) => setFilterMode(e.target.checked ? 'unfulfilled' : 'all')}
                className="w-4 h-4 accent-stone-900 cursor-pointer"
              />
              <span className="font-medium">미달성 매장만 보기</span>
            </label>
            {(searchQuery || filterMode === 'unfulfilled' || sortConfig.key) && (
              <span className="text-xs text-stone-500">
                {displayStores.length}개 매장 표시
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs text-stone-500">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-stone-800 rounded-sm" />
              <span>달성</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-stone-100 rounded-sm" />
              <span>미달성</span>
            </div>
          </div>
        </div>

        {/* 메인 매트릭스 */}
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200">
                  <th className="sticky left-0 bg-stone-50 z-10 px-4 py-3 text-left text-xs font-semibold text-stone-600 border-r border-stone-200 min-w-[170px]">
                    <button
                      onClick={() => handleSort('name')}
                      className="flex items-center gap-1 hover:text-stone-900 transition-colors"
                    >
                      근무지명
                      <SortIcon active={sortConfig.key === 'name'} direction={sortConfig.direction} />
                    </button>
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-stone-600 border-r border-stone-200 min-w-[60px]">
                    <button
                      onClick={() => handleSort('to')}
                      className="flex items-center justify-center gap-1 mx-auto hover:text-stone-900 transition-colors"
                    >
                      TO
                      <SortIcon active={sortConfig.key === 'to'} direction={sortConfig.direction} />
                    </button>
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-stone-600 border-r border-stone-200 min-w-[100px]">
                    <button
                      onClick={() => handleSort('rate')}
                      className="flex items-center justify-center gap-1 mx-auto hover:text-stone-900 transition-colors"
                    >
                      달성률
                      <SortIcon active={sortConfig.key === 'rate'} direction={sortConfig.direction} />
                    </button>
                  </th>
                  {Array.from({ length: DAYS_IN_MONTH }, (_, i) => i + 1).map((day) => (
                    <th
                      key={day}
                      onClick={() => setSelectedDay(day)}
                      className="px-0.5 py-3 text-center text-xs font-semibold text-stone-600 border-r border-stone-200 last:border-r-0 cursor-pointer hover:bg-stone-100 transition-colors min-w-[28px]"
                    >
                      <div>{day}</div>
                      <div className={`text-[10px] mt-0.5 ${getDayOfWeek(day) === '일' ? 'text-red-500' : getDayOfWeek(day) === '토' ? 'text-blue-500' : 'text-stone-400'}`}>
                        {getDayOfWeek(day)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayStores.map((store) => {
                  const fulfillRate = ((store.fulfilledCount / DAYS_IN_MONTH) * 100).toFixed(0);
                  return (
                    <tr
                      key={store.name}
                      className="border-b border-stone-100 last:border-b-0 hover:bg-stone-50/50 transition-colors"
                    >
                      <td
                        onClick={() => setSelectedStore(store.name)}
                        className="sticky left-0 bg-white z-10 px-4 py-3 border-r border-stone-200 cursor-pointer group"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-stone-900 group-hover:text-blue-600 transition-colors">
                            {store.name}
                          </span>
                          <span className="text-xs text-stone-400 font-normal font-mono">
                            {store.code}
                          </span>
                          <ChevronRight className="w-3 h-3 text-stone-400 group-hover:text-blue-600 transition-colors ml-auto" />
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center text-stone-700 border-r border-stone-200">
                        <span>{store.currentTO}</span>
                      </td>
                      <td className="px-3 py-3 text-center border-r border-stone-200">
                        <div className="flex flex-col items-center leading-tight">
                          <span className={`text-base font-bold ${store.unfulfilledCount === 0 ? 'text-stone-900' : 'text-stone-700'}`}>
                            {fulfillRate}%
                          </span>
                          <span className="text-[11px] text-stone-500 font-normal">
                            {store.fulfilledCount}/{DAYS_IN_MONTH}일
                          </span>
                        </div>
                      </td>
                      {Array.from({ length: DAYS_IN_MONTH }, (_, i) => i + 1).map((day) => {
                        const fulfilled = isStoreFulfilled(store.name, day, employees, responses);
                        return (
                          <td
                            key={day}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCell({ storeName: store.name, day });
                            }}
                            className="px-0.5 py-1.5 cursor-pointer"
                          >
                            <div
                              title={`${store.name} · 4월 ${day}일 · ${fulfilled ? '달성' : '미달성'} (클릭 시 상세)`}
                              className={`mx-auto w-full h-4 rounded-sm transition-transform hover:scale-125 ${
                                fulfilled
                                  ? 'bg-stone-800'
                                  : 'bg-stone-100'
                              }`}
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

        {/* 안내 문구 */}
        <div className="mt-6 p-4 bg-blue-50/50 border border-blue-200 rounded-lg">
          <div className="text-xs font-semibold text-blue-900 mb-1">사용 안내</div>
          <ul className="text-xs text-blue-800/90 space-y-0.5 list-disc list-inside">
            <li><strong>달성 기준</strong>: 매 시간대(09/12/14/18시)마다 응답한 직원 수가 매장의 TO(목표 인원) 이상이면 그 시간대 통과, 4시간대 모두 통과 시 그날 달성입니다.</li>
            <li>TO는 시간대별로 매장에 최소한으로 확보되어야 하는 응답 인원으로, 등록 직원 수와 다릅니다.</li>
            <li>매장명 클릭 → 직원별 일자 상세 / 매트릭스 셀 클릭 → 시간대별 직원 응답 상세 / 날짜 클릭 → 매장별 시간대 현황</li>
            <li>컬럼 헤더(근무지명/TO/달성률)를 클릭하여 정렬할 수 있습니다.</li>
          </ul>
        </div>
      </main>

      {/* 매장 드릴다운 모달 */}
      {selectedStore && (
        <StoreDetailModal
          storeName={selectedStore}
          employees={employees.filter((e) => e.storeName === selectedStore)}
          responses={responses}
          onClose={() => setSelectedStore(null)}
        />
      )}

      {/* 일자 드릴다운 모달 */}
      {selectedDay && (
        <DateDetailModal
          day={selectedDay}
          stores={STORES}
          employees={employees}
          responses={responses}
          onClose={() => setSelectedDay(null)}
        />
      )}

      {/* 매장 + 일자 셀 드릴다운 모달 */}
      {selectedCell && (
        <StoreDayDetailModal
          storeName={selectedCell.storeName}
          day={selectedCell.day}
          employees={employees.filter((e) => e.storeName === selectedCell.storeName)}
          responses={responses}
          onClose={() => setSelectedCell(null)}
        />
      )}
    </div>
  );
}

// ============================================================
// 정렬 아이콘
// ============================================================
function SortIcon({ active, direction }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-stone-400" />;
  return direction === 'asc' ? (
    <ArrowUp className="w-3 h-3 text-stone-900" />
  ) : (
    <ArrowDown className="w-3 h-3 text-stone-900" />
  );
}

// ============================================================
// 통계 카드
// ============================================================
function StatCard({ icon, label, value, unit, highlight }) {
  return (
    <div className={`p-5 rounded-xl border ${highlight ? 'bg-stone-900 border-stone-900 text-white' : 'bg-white border-stone-200'}`}>
      <div className={`flex items-center gap-2 text-xs font-medium mb-3 ${highlight ? 'text-stone-300' : 'text-stone-500'}`}>
        {icon}
        <span>{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-3xl font-bold tracking-tight ${highlight ? 'text-white' : 'text-stone-900'}`}>
          {value}
        </span>
        <span className={`text-sm font-medium ${highlight ? 'text-stone-300' : 'text-stone-500'}`}>
          {unit}
        </span>
      </div>
    </div>
  );
}

// ============================================================
// 매장 드릴다운 모달
// ============================================================
function StoreDetailModal({ storeName, employees, responses, onClose }) {
  const store = STORES.find((s) => s.name === storeName);
  const fulfilledCount = useMemo(
    () => getStoreFulfilledCount(storeName, employees, responses),
    [storeName, employees, responses]
  );

  return (
    <div className="fixed inset-0 bg-stone-900/50 z-50 flex items-center justify-center p-6 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-[2400px] max-h-[92vh] w-[95vw] overflow-hidden flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-stone-200">
          <div>
            <div className="flex items-center gap-2 text-xs text-stone-500 mb-1">
              <Store className="w-3.5 h-3.5" />
              <span>매장 상세</span>
            </div>
            <h2 className="text-xl font-bold text-stone-900 flex items-center gap-2">
              {storeName}
              <span className="text-sm font-mono text-stone-400 font-normal">{store?.code}</span>
            </h2>
            <div className="flex items-center gap-4 mt-2 text-xs text-stone-600 flex-wrap">
              <span>등록 직원 {employees.length}명</span>
              <span className="text-stone-300">|</span>
              <span>TO {formatToHistory(store)}</span>
              <span className="text-stone-300">|</span>
              <span>달성률 {((fulfilledCount / DAYS_IN_MONTH) * 100).toFixed(0)}% ({fulfilledCount}/{DAYS_IN_MONTH}일)</span>
              <span className="text-stone-300">|</span>
              <span>{MONTH_LABEL}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-stone-600" />
          </button>
        </div>

        {/* 본문 - 직원 × 일자 매트릭스 */}
        <div className="flex-1 overflow-auto p-6">
          <div className="text-xs text-stone-500 mb-3">
            각 셀은 해당 일자에 직원이 응답한 횟수입니다 (4회 중). 매장 달성은 시간대별 응답 인원이 TO 이상인지로 판정되며, 셀을 클릭하면 그 일자의 시간대별 상세를 볼 수 있습니다.
          </div>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200">
                <th className="sticky left-0 bg-stone-50 z-10 px-3 py-2 text-left text-xs font-semibold text-stone-600 border-r border-stone-200 min-w-[120px]">
                  직원명
                </th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-stone-600 border-r border-stone-200 min-w-[100px]">
                  사번
                </th>
                {Array.from({ length: DAYS_IN_MONTH }, (_, i) => i + 1).map((day) => (
                  <th
                    key={day}
                    className="px-1 py-2 text-center text-xs font-semibold text-stone-600 border-r border-stone-200 last:border-r-0 min-w-[40px]"
                  >
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id} className="border-b border-stone-100 last:border-b-0">
                  <td className="sticky left-0 bg-white z-10 px-3 py-3.5 font-medium text-stone-900 border-r border-stone-200">
                    {emp.name}
                  </td>
                  <td className="px-3 py-3.5 text-center text-stone-600 text-xs border-r border-stone-200">
                    {emp.empNo}
                  </td>
                  {Array.from({ length: DAYS_IN_MONTH }, (_, i) => i + 1).map((day) => {
                    const { ok, total } = getEmployeeDayResult(emp, day, responses);
                    const allOk = ok === total;
                    return (
                      <td key={day} className="px-1 py-2.5 border-r border-stone-100 last:border-r-0">
                        <div
                          className={`mx-auto w-full py-2 rounded text-[10px] font-semibold text-center ${
                            allOk
                              ? 'bg-stone-800 text-white'
                              : 'bg-stone-50 text-stone-600 border border-stone-300'
                          }`}
                        >
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
function DateDetailModal({ day, stores, employees, responses, onClose }) {
  return (
    <div className="fixed inset-0 bg-stone-900/50 z-50 flex items-center justify-center p-6 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-[2000px] max-h-[92vh] w-[80vw] overflow-hidden flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-stone-200">
          <div>
            <div className="flex items-center gap-2 text-xs text-stone-500 mb-1">
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>일자 상세</span>
            </div>
            <h2 className="text-xl font-bold text-stone-900">
              2026년 4월 {day}일 ({getDayOfWeek(day)})
            </h2>
            <div className="text-xs text-stone-600 mt-1">
              매장별 시간대 응답 현황
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-stone-600" />
          </button>
        </div>

        {/* 본문 - 매장 × 시간대 매트릭스 */}
        <div className="flex-1 overflow-auto p-6">
          <div className="text-xs text-stone-500 mb-3">
            셀의 숫자는 해당 시간대에 매장 직원이 응답한 인원/전체 인원입니다.
          </div>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200">
                <th className="px-3 py-2 text-left text-xs font-semibold text-stone-600 border-r border-stone-200">
                  매장이름
                </th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-stone-600 border-r border-stone-200">
                  TO
                </th>
                {TIMES.map((time) => (
                  <th
                    key={time}
                    className="px-3 py-2 text-center text-xs font-semibold text-stone-600 border-r border-stone-200 last:border-r-0"
                  >
                    {time}
                  </th>
                ))}
                <th className="px-3 py-2 text-center text-xs font-semibold text-stone-600">
                  결과
                </th>
              </tr>
            </thead>
            <tbody>
              {stores.map((store) => {
                const storeEmps = employees.filter((e) => e.storeName === store.name);
                const requiredTO = getToForDay(store, day);
                const timeResults = TIMES.map((time) => {
                  const ok = storeEmps.filter(
                    (emp) => responses[`${emp.id}|${day}|${time}`] === '배정 근무지'
                  ).length;
                  return { ok, required: requiredTO };
                });
                const fulfilled = timeResults.every((r) => r.ok >= r.required);
                return (
                  <tr key={store.name} className="border-b border-stone-100 last:border-b-0">
                    <td className="px-3 py-2 font-medium text-stone-900 border-r border-stone-200">
                      <div className="flex items-center gap-1.5">
                        <span>{store.name}</span>
                        <span className="text-[10px] text-stone-400 font-mono font-normal">{store.code}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center text-stone-700 border-r border-stone-200">
                      {requiredTO}
                    </td>
                    {timeResults.map((r, idx) => (
                      <td key={idx} className="px-3 py-1.5 text-center border-r border-stone-200 last:border-r-0">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                            r.ok >= r.required
                              ? 'bg-stone-100 text-stone-800'
                              : 'bg-stone-50 text-stone-500 border border-stone-300'
                          }`}
                        >
                          {r.ok}/{r.required}
                        </span>
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 rounded ${
                          fulfilled
                            ? 'bg-stone-800'
                            : 'bg-stone-50 border border-stone-300'
                        }`}
                      >
                        {fulfilled ? (
                          <Check className="w-3 h-3 text-white" strokeWidth={3} />
                        ) : (
                          <Minus className="w-3 h-3 text-stone-400" strokeWidth={2.5} />
                        )}
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
function StoreDayDetailModal({ storeName, day, employees, responses, onClose }) {
  const store = STORES.find((s) => s.name === storeName);
  const requiredTO = getToForDay(store, day);

  const empData = employees.map((emp) => {
    const timeResults = TIMES.map((time) => {
      const status = responses[`${emp.id}|${day}|${time}`];
      const responseTime = status === '무응답' ? null : getResponseTime(emp.id, day, time);
      return { time, status, responseTime };
    });
    const respondedCount = timeResults.filter((t) => t.status === '배정 근무지').length;
    return { emp, timeResults, respondedCount };
  });

  // 시간대별 응답 인원 집계 (배정 근무지)
  const timeSlotCounts = TIMES.map((time) => {
    return empData.filter(
      ({ timeResults }) => timeResults.find((t) => t.time === time)?.status === '배정 근무지'
    ).length;
  });

  // 매장 단위 달성: 모든 시간대에 응답인원 >= TO
  const isFulfilled = timeSlotCounts.every((c) => c >= requiredTO);

  return (
    <div className="fixed inset-0 bg-stone-900/50 z-50 flex items-center justify-center p-6 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-[1100px] max-h-[92vh] w-[55vw] overflow-hidden flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-stone-200">
          <div>
            <div className="flex items-center gap-2 text-xs text-stone-500 mb-1">
              <MapPin className="w-3.5 h-3.5" />
              <span>매장 + 일자 상세</span>
            </div>
            <h2 className="text-xl font-bold text-stone-900 flex items-center gap-2">
              {storeName}
              <span className="text-sm font-mono text-stone-400 font-normal">{store?.code}</span>
              <span className="text-stone-300 mx-1">·</span>
              <span>2026년 4월 {day}일 ({getDayOfWeek(day)})</span>
            </h2>
            <div className="flex items-center gap-3 mt-2">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${
                  isFulfilled ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-700 border border-stone-300'
                }`}
              >
                {isFulfilled ? (
                  <><Check className="w-3 h-3" strokeWidth={3} />달성</>
                ) : (
                  <><Minus className="w-3 h-3" strokeWidth={2.5} />미달성</>
                )}
              </span>
              <span className="text-xs text-stone-600">
                TO {requiredTO}명 · 등록 {employees.length}명
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-stone-600" />
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-auto p-6">
          <div className="text-xs text-stone-500 mb-3">
            각 셀은 직원의 시간대별 응답 시각과 결과입니다. 마지막 행은 시간대별 응답 인원과 TO 비교입니다.
          </div>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200">
                <th className="px-3 py-2 text-left text-xs font-semibold text-stone-600 border-r border-stone-200 min-w-[100px]">
                  직원명
                </th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-stone-600 border-r border-stone-200 min-w-[100px]">
                  사번
                </th>
                {TIMES.map((time) => (
                  <th
                    key={time}
                    className="px-3 py-2 text-center text-xs font-semibold text-stone-600 border-r border-stone-200 min-w-[140px]"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <Clock className="w-3 h-3 text-stone-400" />
                      <span>{time}</span>
                    </div>
                  </th>
                ))}
                <th className="px-3 py-2 text-center text-xs font-semibold text-stone-600 min-w-[80px]">
                  4회 응답
                </th>
              </tr>
            </thead>
            <tbody>
              {empData.map(({ emp, timeResults, respondedCount }) => {
                const allOk = respondedCount === TIMES.length;
                return (
                  <tr key={emp.id} className="border-b border-stone-100 last:border-b-0">
                    <td className="px-3 py-2.5 font-medium text-stone-900 border-r border-stone-200">
                      {emp.name}
                    </td>
                    <td className="px-3 py-2.5 text-center text-stone-600 text-xs font-mono border-r border-stone-200">
                      {emp.empNo}
                    </td>
                    {timeResults.map((tr, idx) => (
                      <td key={idx} className="px-3 py-2 text-center border-r border-stone-200">
                        <ResponseChip status={tr.status} responseTime={tr.responseTime} />
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center text-xs text-stone-600">
                      <span className={allOk ? 'font-semibold text-stone-800' : ''}>
                        {respondedCount}/{TIMES.length}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {/* 시간대별 합계 행 (매장 달성 판정 핵심) */}
              <tr className="bg-stone-50 border-t-2 border-stone-300">
                <td colSpan={2} className="px-3 py-3 text-xs font-bold text-stone-700 border-r border-stone-200 text-right">
                  시간대별 응답인원 / TO ({requiredTO}명)
                </td>
                {timeSlotCounts.map((count, idx) => {
                  const ok = count >= requiredTO;
                  return (
                    <td key={idx} className="px-3 py-3 text-center border-r border-stone-200">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-bold text-sm ${
                          ok ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-700 border border-stone-300'
                        }`}
                      >
                        {ok ? (
                          <Check className="w-3.5 h-3.5" strokeWidth={3} />
                        ) : (
                          <Minus className="w-3.5 h-3.5" strokeWidth={3} />
                        )}
                        {count}/{requiredTO}
                      </span>
                    </td>
                  );
                })}
                <td className="px-3 py-3 text-center">
                  <span
                    className={`inline-flex items-center justify-center w-7 h-7 rounded ${
                      isFulfilled ? 'bg-stone-800' : 'bg-stone-50 border border-stone-300'
                    }`}
                  >
                    {isFulfilled ? (
                      <Check className="w-4 h-4 text-white" strokeWidth={3} />
                    ) : (
                      <Minus className="w-4 h-4 text-stone-400" strokeWidth={2.5} />
                    )}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>

          {/* 범례 */}
          <div className="mt-4 flex items-center gap-3 text-xs text-stone-500 flex-wrap">
            <span className="font-semibold text-stone-600">범례:</span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2 h-2 bg-stone-800 rounded-full" /> 배정 근무지에서 응답
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2 h-2 bg-amber-400 rounded-full" /> 근무지 아닌 곳에서 응답
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2 h-2 bg-stone-400 rounded-full" /> 거절
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2 h-2 bg-stone-200 rounded-full" /> 무응답
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 응답 칩 (시각 + 상태)
// ============================================================
function ResponseChip({ status, responseTime }) {
  const config = {
    '배정 근무지': {
      bg: 'bg-stone-800',
      text: 'text-white',
      icon: <Check className="w-3 h-3" strokeWidth={3} />,
      label: responseTime,
    },
    '근무지 아님': {
      bg: 'bg-amber-50 border border-amber-300',
      text: 'text-amber-800',
      icon: <MapPin className="w-3 h-3" strokeWidth={2.5} />,
      label: `위치 외 ${responseTime}`,
    },
    '거절': {
      bg: 'bg-stone-100 border border-stone-300',
      text: 'text-stone-600',
      icon: <X className="w-3 h-3" strokeWidth={2.5} />,
      label: `거절 ${responseTime}`,
    },
    '무응답': {
      bg: 'bg-stone-50 border border-stone-200',
      text: 'text-stone-400',
      icon: <Minus className="w-3 h-3" strokeWidth={2} />,
      label: '미응답',
    },
  };
  const c = config[status] || config['무응답'];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${c.bg} ${c.text}`}
    >
      {c.icon}
      <span>{c.label}</span>
    </span>
  );
}
