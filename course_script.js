document.addEventListener('DOMContentLoaded', () => {
    const startDateInput = document.getElementById('startDate');
    const dailyHoursInput = document.getElementById('dailyHours');
    const totalHoursInput = document.getElementById('totalHours');
    const calculateBtn = document.getElementById('calculateBtn');
    const courseNameInput = document.getElementById('courseName');
    const unitPriceInput = document.getElementById('unitPrice');
    const capacityInput = document.getElementById('capacity');
    const saveScheduleBtn = document.getElementById('saveScheduleBtn');
    const refreshSummaryIcon = document.getElementById('refreshSummary');

    const summaryStartDate = document.getElementById('summaryStartDate');
    const summaryEndDate = document.getElementById('summaryEndDate');
    const summaryTotalDays = document.getElementById('summaryTotalDays');
    const summaryClassDays = document.getElementById('summaryClassDays');
    const summaryWeekendDays = document.getElementById('summaryWeekendDays');
    const summaryHolidayDays = document.getElementById('summaryHolidayDays');
    const summaryHolidayNames = document.getElementById('summaryHolidayNames');
    const summaryActualHours = document.getElementById('summaryActualHours');
    const summaryUnitPrice = document.getElementById('summaryUnitPrice');
    const summaryCapacity = document.getElementById('summaryCapacity');
    const summaryTotalFee = document.getElementById('summaryTotalFee');
    const unitPeriodTableBody = document.getElementById('unitPeriodTableBody');

    const calendarsContainer = document.getElementById('calendarsContainer');

    const summaryTrainingDays = document.getElementById('summaryTrainingDays');

    const addHolidayDateInput = document.getElementById('addHolidayDate');
    const addHolidayNameInput = document.getElementById('addHolidayName');
    const addHolidayBtn = document.getElementById('addHolidayBtn');
    const customHolidaysList = document.getElementById('customHolidaysList');
    const savedSchedulesList = document.getElementById('savedSchedulesList');

    // 휴일 교육 / 과정 휴일 (과정 정보에 종속)
    const addTrainingDateInput = document.getElementById('addTrainingDate');
    const addTrainingBtn = document.getElementById('addTrainingBtn');
    const trainingList = document.getElementById('trainingList');
    const addCourseHolidayDateInput = document.getElementById('addCourseHolidayDate');
    const addCourseHolidayNameInput = document.getElementById('addCourseHolidayName');
    const addCourseHolidayBtn = document.getElementById('addCourseHolidayBtn');
    const courseHolidayList = document.getElementById('courseHolidayList');

    let currentCalendarDate = new Date();
    let customHolidays = [];        // 절대 휴일 (모든 과정 공통, Airtable 저장): [{id, date, name}, ...]
    let courseHolidayTraining = []; // 휴일 교육일 (과정 종속): ['YYYY-MM-DD', ...]
    let courseHolidays = [];        // 과정 휴일 (과정 종속): [{date, name}, ...]
    let savedSchedules = [];
    let currentScheduleData = null; // 현재 계산된 일정 데이터 저장
    let editingHolidayIndex = -1;   // 추가 휴일 수정 중인 인덱스 (-1: 추가 모드)
    let editingCourseHolidayIndex = -1; // 과정 휴일 수정 중인 인덱스

    // API 설정 — 키는 브라우저에 없음. Cloudflare Worker 프록시가 Airtable 키를 보관.
    // ★ 프록시 배포 후 proxyUrl 을 본인 Worker 주소로 교체하세요. (예: https://course-cal-proxy.xxxx.workers.dev)
    const API_CONFIG = {
        proxyUrl: 'https://course-cal-proxy.itcampus00.workers.dev',
        scheduleTable: 'curri_schedule_db',
        holidayTable: 'custom_holidays_db'
    };

    // 프록시 경유 URL 빌더 (테이블/레코드만 전달, 키/baseId는 서버가 주입)
    function apiUrl(table, recordId) {
        const base = `${API_CONFIG.proxyUrl}/${table}`;
        return recordId ? `${base}/${recordId}` : base;
    }

    // Airtable API 함수들 (프록시 경유)
    function buildScheduleFields(scheduleData) {
        return {
            'Course Name': scheduleData.courseName,
            'Start Date': scheduleData.startDate,
            'End Date': scheduleData.endDate,
            'Daily Hours': scheduleData.dailyHours,
            'Total Hours': scheduleData.totalHours,
            'Class Days': scheduleData.classDaysCount,
            'Total Days': scheduleData.totalDays,
            'Weekend Days': scheduleData.weekendDaysCount,
            'Holiday Days': scheduleData.holidayDaysCount,
            'Holiday Names': scheduleData.holidayNames,
            'Unit Price': scheduleData.unitPrice,
            'Capacity': scheduleData.capacity,
            'Total Fee': scheduleData.totalFee,
            'Custom Holidays': JSON.stringify(scheduleData.customHolidays),
            'Holiday Training': JSON.stringify(scheduleData.courseHolidayTraining || []),
            'Course Holidays': JSON.stringify(scheduleData.courseHolidays || []),
            'Created At': new Date().toISOString()
        };
    }

    async function saveToAirtable(scheduleData) {
        try {
            const response = await fetch(apiUrl(API_CONFIG.scheduleTable), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fields: buildScheduleFields(scheduleData) })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`API Error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
            }

            const result = await response.json();
            return result;
        } catch (error) {
            console.error('저장 오류:', error);
            throw error;
        }
    }

    // 같은 과정명으로 다시 저장 시 기존 레코드를 덮어쓰기 (수정)
    async function updateInAirtable(recordId, scheduleData) {
        try {
            const response = await fetch(apiUrl(API_CONFIG.scheduleTable, recordId), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fields: buildScheduleFields(scheduleData) })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`API Error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
            }

            const result = await response.json();
            return result;
        } catch (error) {
            console.error('수정 오류:', error);
            throw error;
        }
    }

    async function loadFromAirtable() {
        try {
            const response = await fetch(apiUrl(API_CONFIG.scheduleTable));

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }

            const result = await response.json();
            return result.records.map(record => ({
                id: record.id,
                courseName: record.fields['Course Name'],
                startDate: record.fields['Start Date'],
                endDate: record.fields['End Date'],
                dailyHours: record.fields['Daily Hours'],
                totalHours: record.fields['Total Hours'],
                classDaysCount: record.fields['Class Days'],
                totalDays: record.fields['Total Days'],
                weekendDaysCount: record.fields['Weekend Days'],
                holidayDaysCount: record.fields['Holiday Days'],
                holidayNames: record.fields['Holiday Names'],
                unitPrice: record.fields['Unit Price'],
                capacity: record.fields['Capacity'],
                totalFee: record.fields['Total Fee'],
                customHolidays: record.fields['Custom Holidays'] ? JSON.parse(record.fields['Custom Holidays']) : [],
                courseHolidayTraining: record.fields['Holiday Training'] ? JSON.parse(record.fields['Holiday Training']) : [],
                courseHolidays: record.fields['Course Holidays'] ? JSON.parse(record.fields['Course Holidays']) : [],
                createdAt: record.fields['Created At']
            }));
        } catch (error) {
            console.error('로드 오류:', error);
            return [];
        }
    }

    async function deleteFromAirtable(recordId) {
        try {
            const response = await fetch(apiUrl(API_CONFIG.scheduleTable, recordId), {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }

            return true;
        } catch (error) {
            console.error('삭제 오류:', error);
            throw error;
        }
    }

    // ===== 추가(절대) 휴일 CRUD (프록시 경유) =====
    async function loadCustomHolidaysFromAirtable() {
        const response = await fetch(apiUrl(API_CONFIG.holidayTable));
        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }
        const result = await response.json();
        return result.records.map(record => ({
            id: record.id,
            date: record.fields['Date'],
            name: record.fields['Name']
        }));
    }

    async function saveCustomHolidayToAirtable(holiday) {
        const response = await fetch(apiUrl(API_CONFIG.holidayTable), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: { 'Date': holiday.date, 'Name': holiday.name } })
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`API Error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
        }
        return response.json();
    }

    async function updateCustomHolidayInAirtable(recordId, holiday) {
        const response = await fetch(apiUrl(API_CONFIG.holidayTable, recordId), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: { 'Date': holiday.date, 'Name': holiday.name } })
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`API Error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
        }
        return response.json();
    }

    async function deleteCustomHolidayFromAirtable(recordId) {
        const response = await fetch(apiUrl(API_CONFIG.holidayTable, recordId), {
            method: 'DELETE'
        });
        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }
        return true;
    }

    // 초기화 함수
    async function init() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        startDateInput.value = `${year}-${month}-${day}`;
        addHolidayDateInput.value = `${year}-${month}-${day}`;

        // Airtable에서 추가(절대) 휴일 로드
        try {
            customHolidays = await loadCustomHolidaysFromAirtable();
        } catch (error) {
            console.warn('추가 휴일 로드 실패:', error);
            customHolidays = [];
        }

        // Airtable에서 저장된 일정 로드
        try {
            savedSchedules = await loadFromAirtable();
        } catch (error) {
            console.warn('Airtable에서 데이터 로드 실패, 로컬 데이터 사용:', error);
            savedSchedules = loadSavedSchedules();
        }

        renderCustomHolidays();
        renderTrainingDays();
        renderCourseHolidays();
        renderSavedSchedules();
        renderAllCalendars();
    }

    // 숫자 천단위 콤마 포맷
    function formatNumber(num) {
        return Math.round(num).toLocaleString('ko-KR');
    }

    // 날짜 헬퍼 함수들
    function formatDate(date) {
        if (!date) return '';
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function parseDate(dateString) {
        if (!dateString) return null;
        const [year, month, day] = dateString.split('-').map(Number);
        return new Date(year, month - 1, day);
    }

    function isSameDay(date1, date2) {
        if (!date1 || !date2) return false;
        return date1.getFullYear() === date2.getFullYear() &&
               date1.getMonth() === date2.getMonth() &&
               date1.getDate() === date2.getDate();
    }

    function isWeekend(date) {
        const day = date.getDay();
        return day === 0 || day === 6;
    }

    // 휴일 정보 + 출처 반환 (course: 과정 휴일, custom: 추가(절대) 휴일, official: 공휴일)
    function getHolidayInfo(date) {
        const dateString = formatDate(date);
        const courseH = courseHolidays.find(h => h.date === dateString);
        if (courseH) return { name: courseH.name, source: 'course' };
        const customH = customHolidays.find(h => h.date === dateString);
        if (customH) return { name: customH.name, source: 'custom' };
        if (officialHolidays[dateString]) return { name: officialHolidays[dateString], source: 'official' };
        return null;
    }

    function getHolidayName(date) {
        return getHolidayInfo(date)?.name || null;
    }

    function isHoliday(date) {
        return getHolidayName(date) !== null;
    }

    // 휴일 교육일 여부 (과정 종속): 휴일/주말이어도 교육하는 날
    function isHolidayTrainingDay(date) {
        return courseHolidayTraining.includes(formatDate(date));
    }

    function getKoreanDayName(date) {
        if (!date) return '';
        const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
        return dayNames[date.getDay()];
    }

    function loadSavedSchedules() {
        return savedSchedules || [];
    }

    function saveSavedSchedules() {
        // 메모리에만 저장 (브라우저 스토리지 API 사용 불가)
    }

    // 커스텀 휴일 렌더링
    function renderCustomHolidays() {
        customHolidaysList.innerHTML = '';
        customHolidays.sort((a, b) => new Date(a.date) - new Date(b.date));
        customHolidays.forEach((holiday, index) => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span>${holiday.date} (${holiday.name})</span>
                <span class="holiday-actions">
                    <button class="edit-btn" data-index="${index}" title="수정">&#9998;</button>
                    <button class="delete-btn" data-index="${index}" title="삭제">&times;</button>
                </span>
            `;
            customHolidaysList.appendChild(li);
        });

        document.querySelectorAll('#customHolidaysList .delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const index = parseInt(e.currentTarget.dataset.index);
                const holiday = customHolidays[index];
                if (!holiday) return;
                if (!confirm('이 추가 휴일을 삭제하시겠습니까?')) return;

                const target = e.currentTarget;
                target.disabled = true;
                try {
                    if (holiday.id) {
                        await deleteCustomHolidayFromAirtable(holiday.id);
                    }
                    customHolidays.splice(index, 1);
                    if (editingHolidayIndex === index) resetHolidayInputRow();
                    renderCustomHolidays();
                    if (currentScheduleData) {
                        calculateSchedule();
                    }
                } catch (error) {
                    target.disabled = false;
                    alert('삭제 중 오류가 발생했습니다: ' + error.message);
                }
            });
        });

        document.querySelectorAll('#customHolidaysList .edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.dataset.index);
                editCustomHoliday(index);
            });
        });
    }

    // 추가 휴일 수정 모드 진입: 같은 라인의 입력창으로 값을 불러옴
    function editCustomHoliday(index) {
        const holiday = customHolidays[index];
        if (!holiday) return;

        editingHolidayIndex = index;
        addHolidayDateInput.value = holiday.date;
        addHolidayNameInput.value = holiday.name;
        addHolidayBtn.textContent = '수정 완료';
        addHolidayBtn.classList.add('editing');
        addHolidayNameInput.focus();
    }

    // 추가 휴일 입력창 초기화 (추가 모드로 복귀)
    function resetHolidayInputRow() {
        editingHolidayIndex = -1;
        addHolidayNameInput.value = '';
        addHolidayBtn.textContent = '휴일 추가';
        addHolidayBtn.classList.remove('editing');
    }

    // 같은 라인의 입력창 값으로 추가 또는 수정 처리 (Airtable 연동)
    async function submitHoliday() {
        const date = addHolidayDateInput.value;
        const name = addHolidayNameInput.value.trim();

        if (!date) {
            alert('휴일 날짜를 선택해주세요.');
            return;
        }
        if (!name) {
            alert('휴일 명을 입력해주세요.');
            addHolidayNameInput.focus();
            return;
        }
        // 다른 항목과 날짜 중복 체크 (수정 중인 자기 자신은 제외)
        if (customHolidays.some((h, i) => i !== editingHolidayIndex && h.date === date)) {
            alert('이미 추가된 휴일 날짜입니다.');
            return;
        }

        const wasEditing = editingHolidayIndex >= 0;
        const prevText = addHolidayBtn.textContent;
        addHolidayBtn.disabled = true;
        addHolidayBtn.textContent = wasEditing ? '수정 중...' : '저장 중...';

        try {
            if (wasEditing) {
                const existing = customHolidays[editingHolidayIndex];
                await updateCustomHolidayInAirtable(existing.id, { date, name });
                customHolidays[editingHolidayIndex] = { ...existing, date, name };
            } else {
                const result = await saveCustomHolidayToAirtable({ date, name });
                customHolidays.push({ id: result.id, date, name });
            }
            resetHolidayInputRow();
            renderCustomHolidays();
            if (currentScheduleData) {
                calculateSchedule();
            }
        } catch (error) {
            alert('저장 중 오류가 발생했습니다: ' + error.message);
            addHolidayBtn.textContent = prevText;
        } finally {
            addHolidayBtn.disabled = false;
        }
    }

    // ===== 휴일 교육 (과정 종속) =====
    function renderTrainingDays() {
        trainingList.innerHTML = '';
        courseHolidayTraining.sort((a, b) => new Date(a) - new Date(b));
        courseHolidayTraining.forEach((date, index) => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span>${date} (${getKoreanDayName(parseDate(date))})</span>
                <span class="holiday-actions">
                    <button class="delete-btn" data-index="${index}" title="삭제">&times;</button>
                </span>
            `;
            trainingList.appendChild(li);
        });

        trainingList.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.dataset.index);
                courseHolidayTraining.splice(index, 1);
                renderTrainingDays();
                if (currentScheduleData) calculateSchedule();
            });
        });
    }

    function addTrainingDay() {
        const date = addTrainingDateInput.value;
        if (!date) {
            alert('휴일 교육 날짜를 선택해주세요.');
            return;
        }
        if (courseHolidayTraining.includes(date)) {
            alert('이미 추가된 휴일 교육일입니다.');
            return;
        }
        courseHolidayTraining.push(date);
        renderTrainingDays();
        if (currentScheduleData) calculateSchedule();
    }

    // ===== 과정 휴일 (과정 종속) =====
    function resetCourseHolidayInputRow() {
        editingCourseHolidayIndex = -1;
        addCourseHolidayNameInput.value = '';
        addCourseHolidayBtn.textContent = '과정 휴일 추가';
        addCourseHolidayBtn.classList.remove('editing');
    }

    function renderCourseHolidays() {
        courseHolidayList.innerHTML = '';
        courseHolidays.sort((a, b) => new Date(a.date) - new Date(b.date));
        courseHolidays.forEach((holiday, index) => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span>${holiday.date} (${holiday.name})</span>
                <span class="holiday-actions">
                    <button class="edit-btn" data-index="${index}" title="수정">&#9998;</button>
                    <button class="delete-btn" data-index="${index}" title="삭제">&times;</button>
                </span>
            `;
            courseHolidayList.appendChild(li);
        });

        courseHolidayList.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.dataset.index);
                courseHolidays.splice(index, 1);
                resetCourseHolidayInputRow();
                renderCourseHolidays();
                if (currentScheduleData) calculateSchedule();
            });
        });

        courseHolidayList.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.dataset.index);
                const holiday = courseHolidays[index];
                if (!holiday) return;
                editingCourseHolidayIndex = index;
                addCourseHolidayDateInput.value = holiday.date;
                addCourseHolidayNameInput.value = holiday.name;
                addCourseHolidayBtn.textContent = '수정 완료';
                addCourseHolidayBtn.classList.add('editing');
                addCourseHolidayNameInput.focus();
            });
        });
    }

    function submitCourseHoliday() {
        const date = addCourseHolidayDateInput.value;
        const name = addCourseHolidayNameInput.value.trim();
        if (!date) {
            alert('과정 휴일 날짜를 선택해주세요.');
            return;
        }
        if (!name) {
            alert('과정 휴일 명을 입력해주세요.');
            addCourseHolidayNameInput.focus();
            return;
        }
        if (courseHolidays.some((h, i) => i !== editingCourseHolidayIndex && h.date === date)) {
            alert('이미 추가된 과정 휴일 날짜입니다.');
            return;
        }

        if (editingCourseHolidayIndex >= 0) {
            courseHolidays[editingCourseHolidayIndex] = { date, name };
        } else {
            courseHolidays.push({ date, name });
        }
        resetCourseHolidayInputRow();
        renderCourseHolidays();
        if (currentScheduleData) calculateSchedule();
    }

    // 저장된 일정 렌더링
    function renderSavedSchedules() {
        savedSchedulesList.innerHTML = '';
        
        if (savedSchedules.length === 0) {
            const li = document.createElement('li');
            li.innerHTML = '<span style="color: #888;">저장된 일정이 없습니다.</span>';
            savedSchedulesList.appendChild(li);
            return;
        }

        savedSchedules.forEach((schedule, index) => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span data-index="${index}" data-id="${schedule.id || ''}">${schedule.courseName}</span>
                <button class="delete-btn" data-index="${index}" data-id="${schedule.id || ''}">&times;</button>
            `;
            savedSchedulesList.appendChild(li);
        });

        document.querySelectorAll('#savedSchedulesList span').forEach(span => {
            span.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                loadSchedule(savedSchedules[index]);
            });
        });

        document.querySelectorAll('#savedSchedulesList .delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const index = parseInt(e.target.dataset.index);
                const recordId = e.target.dataset.id;
                
                if (confirm('정말로 이 일정을 삭제하시겠습니까?')) {
                    try {
                        // Airtable에서 삭제
                        if (recordId) {
                            await deleteFromAirtable(recordId);
                        }
                        
                        // 로컬에서 삭제
                        savedSchedules.splice(index, 1);
                        renderSavedSchedules();
                        alert('일정이 삭제되었습니다.');
                    } catch (error) {
                        alert('삭제 중 오류가 발생했습니다: ' + error.message);
                    }
                }
            });
        });
    }

    function loadSchedule(schedule) {
        // 저장값이 비어있거나 누락된 경우 현재 입력값/기본값으로 보정 (불러오기 시 검증 오류 방지)
        const safeDailyHours = parseFloat(schedule.dailyHours) || parseFloat(dailyHoursInput.value) || 8;
        const safeTotalHours = parseFloat(schedule.totalHours) || parseFloat(totalHoursInput.value) || 100;

        if (schedule.startDate) {
            startDateInput.value = schedule.startDate;
        }
        dailyHoursInput.value = safeDailyHours;
        totalHoursInput.value = safeTotalHours;
        courseNameInput.value = schedule.courseName || '';
        if (schedule.unitPrice) {
            unitPriceInput.value = schedule.unitPrice;
        }
        if (schedule.capacity) {
            capacityInput.value = schedule.capacity;
        }

        // 추가 휴일(절대 휴일)은 전역 값이므로 과정 불러오기 시 덮어쓰지 않음
        // 과정 종속 데이터(휴일 교육 / 과정 휴일)만 복원
        courseHolidayTraining = Array.isArray(schedule.courseHolidayTraining) ? [...schedule.courseHolidayTraining] : [];
        courseHolidays = Array.isArray(schedule.courseHolidays) ? [...schedule.courseHolidays] : [];

        resetHolidayInputRow();
        resetCourseHolidayInputRow();
        renderCustomHolidays();
        renderTrainingDays();
        renderCourseHolidays();

        // 시작일이 없으면 계산을 건너뛰어 불필요한 오류 메시지를 막음
        if (startDateInput.value) {
            calculateSchedule();
        }
    }

    // 수업 일정 계산
    function calculateSchedule() {
        const startDate = parseDate(startDateInput.value);
        const dailyHours = parseFloat(dailyHoursInput.value);
        const totalHours = parseFloat(totalHoursInput.value);

        if (!startDate || isNaN(dailyHours) || dailyHours <= 0 || isNaN(totalHours) || totalHours <= 0) {
            alert('시작 날짜, 1일 수업시간, 총 수업시간을 정확히 입력해주세요.');
            return;
        }

        let currentHours = 0;
        let currentDate = new Date(startDate);
        let classDaysCount = 0;
        let trainingDaysCount = 0;      // 휴일 교육일(휴일/주말이지만 교육한 날) 수
        let weekendDaysCount = 0;
        let holidayDaysCount = 0;
        let excludedHolidayNames = new Set();
        let classDates = [];
        let dayCounter = 0;
        const maxDays = 365 * 2; // 무한루프 방지

        while (currentHours < totalHours && dayCounter < maxDays) {
            dayCounter++;

            const isWknd = isWeekend(currentDate);
            const holidayName = getHolidayName(currentDate);
            const isTraining = isHolidayTrainingDay(currentDate);

            if (isTraining && (isWknd || holidayName)) {
                // 휴일 교육: 휴일/주말이어도 수업일로 산정
                classDaysCount++;
                trainingDaysCount++;
                currentHours += dailyHours;
                classDates.push(new Date(currentDate));
                if (currentHours >= totalHours) break;
            } else if (isWknd) {
                weekendDaysCount++;
            } else if (holidayName) {
                holidayDaysCount++;
                excludedHolidayNames.add(holidayName);
            } else {
                // 일반 수업일
                classDaysCount++;
                currentHours += dailyHours;
                classDates.push(new Date(currentDate));
                if (currentHours >= totalHours) break;
            }

            currentDate.setDate(currentDate.getDate() + 1);
        }

        if (dayCounter >= maxDays) {
            alert('계산 기간이 너무 깁니다. 입력값을 확인해주세요.');
            return;
        }

        const endDate = classDates[classDates.length - 1];

        // 정확한 전체 기간 계산
        const totalDays = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

        // 단가, 정원 읽기
        const unitPrice = parseFloat(unitPriceInput.value);
        const capacity = parseInt(capacityInput.value);

        // 단위기간별 훈련비/훈련시간 계산
        const unitPeriods = calculateUnitPeriods(startDate, endDate, classDates, dailyHours, unitPrice, capacity);
        const totalFee = unitPeriods.reduce((sum, p) => sum + p.fee, 0);

        // 현재 일정 데이터 저장
        currentScheduleData = {
            startDate,
            endDate,
            classDates,
            totalDays,
            classDaysCount,
            trainingDaysCount,
            weekendDaysCount,
            holidayDaysCount,
            excludedHolidayNames,
            unitPrice,
            capacity,
            unitPeriods,
            totalFee
        };

        // 결과 요약 업데이트
        summaryStartDate.textContent = `${formatDate(startDate)} (${getKoreanDayName(startDate)})`;
        summaryEndDate.textContent = `${formatDate(endDate)} (${getKoreanDayName(endDate)})`;
        summaryTotalDays.textContent = totalDays;
        summaryClassDays.textContent = classDaysCount;
        summaryTrainingDays.textContent = trainingDaysCount;
        summaryWeekendDays.textContent = weekendDaysCount;
        summaryHolidayDays.textContent = holidayDaysCount;
        summaryHolidayNames.textContent = Array.from(excludedHolidayNames).join(', ') || '없음';
        summaryActualHours.textContent = totalHours;

        // 훈련비 요약 업데이트
        summaryUnitPrice.textContent = isNaN(unitPrice) ? '-' : `${formatNumber(unitPrice)}원`;
        summaryCapacity.textContent = isNaN(capacity) ? '-' : `${capacity}명`;
        summaryTotalFee.textContent = (isNaN(unitPrice) || isNaN(capacity)) ? '-' : `${formatNumber(totalFee)}원`;
        renderUnitPeriods(unitPeriods, isNaN(unitPrice) || isNaN(capacity));

        // 달력 업데이트
        renderAllCalendars();
    }

    // 단위기간별 훈련비 계산
    // 단위기간: 교육 시작일로부터 만 한달이 되는 기간 (예: 6/4 시작 → 7/3까지가 한 단위기간)
    function calculateUnitPeriods(startDate, endDate, classDates, dailyHours, unitPrice, capacity) {
        const periods = [];
        let periodIndex = 0;

        while (true) {
            // periodStart = 시작일 + periodIndex 개월
            const periodStart = new Date(startDate.getFullYear(), startDate.getMonth() + periodIndex, startDate.getDate());
            if (periodStart > endDate) break;

            // periodEnd = 시작일 + (periodIndex+1) 개월 - 1일 (만 한달)
            const periodEnd = new Date(startDate.getFullYear(), startDate.getMonth() + periodIndex + 1, startDate.getDate() - 1);

            // 해당 단위기간 내 실 수업일 수
            const classDaysInPeriod = classDates.filter(d => d >= periodStart && d <= periodEnd).length;
            const periodHours = classDaysInPeriod * dailyHours;
            const fee = periodHours * unitPrice * capacity;

            periods.push({
                index: periodIndex + 1,
                start: new Date(periodStart),
                end: new Date(periodEnd),
                classDays: classDaysInPeriod,
                hours: periodHours,
                fee: isNaN(fee) ? 0 : fee
            });

            periodIndex++;
        }

        return periods;
    }

    // 단위기간별 훈련비 테이블 렌더링
    function renderUnitPeriods(unitPeriods, feeUnavailable) {
        unitPeriodTableBody.innerHTML = '';
        unitPeriods.forEach(p => {
            const tr = document.createElement('tr');
            const feeText = feeUnavailable ? '-' : `${formatNumber(p.fee)}원`;
            tr.innerHTML = `
                <td>${p.index}차</td>
                <td>${formatDate(p.start)} ~ ${formatDate(p.end)}</td>
                <td>${p.hours}시간</td>
                <td>${feeText}</td>
            `;
            unitPeriodTableBody.appendChild(tr);
        });
    }

    // 전체 달력 렌더링 (일정에 포함된 모든 달을 한 페이지에 나열)
    function renderAllCalendars() {
        calendarsContainer.innerHTML = '';

        const classDates = currentScheduleData?.classDates || [];

        // 표시할 시작/종료 월 결정
        let firstMonth, lastMonth;
        if (currentScheduleData) {
            firstMonth = new Date(currentScheduleData.startDate.getFullYear(), currentScheduleData.startDate.getMonth(), 1);
            lastMonth = new Date(currentScheduleData.endDate.getFullYear(), currentScheduleData.endDate.getMonth(), 1);
        } else {
            // 일정이 없으면 현재 달만 표시
            firstMonth = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), 1);
            lastMonth = new Date(firstMonth);
        }

        const cursor = new Date(firstMonth);
        while (cursor <= lastMonth) {
            calendarsContainer.appendChild(renderMonthCalendar(cursor.getFullYear(), cursor.getMonth(), classDates));
            cursor.setMonth(cursor.getMonth() + 1);
        }
    }

    // 한 달 달력 블록 생성
    function renderMonthCalendar(year, month, classDates) {
        const wrapper = document.createElement('div');
        wrapper.classList.add('calendar-month');

        const title = document.createElement('h3');
        title.classList.add('calendar-month-title');
        title.textContent = `${year}년 ${month + 1}월`;
        wrapper.appendChild(title);

        const grid = document.createElement('div');
        grid.classList.add('calendar-grid');

        // 요일 헤더 추가
        const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
        dayNames.forEach(dayName => {
            const div = document.createElement('div');
            div.classList.add('day-header');
            div.textContent = dayName;
            grid.appendChild(div);
        });

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDay = firstDay.getDay();

        // 이전 달의 빈 칸 채우기
        for (let i = 0; i < startDay; i++) {
            const emptyDiv = document.createElement('div');
            emptyDiv.classList.add('calendar-day', 'empty');
            grid.appendChild(emptyDiv);
        }

        // 이번 달의 날짜들 채우기
        for (let day = 1; day <= lastDay.getDate(); day++) {
            const currentDateObj = new Date(year, month, day);
            const div = document.createElement('div');
            div.classList.add('calendar-day');

            const dateNum = document.createElement('div');
            dateNum.classList.add('date-num');
            dateNum.textContent = day;
            div.appendChild(dateNum);

            // 주말 체크
            const isWknd = isWeekend(currentDateObj);
            if (isWknd) {
                div.classList.add('weekend');
                div.classList.add(currentDateObj.getDay() === 6 ? 'saturday' : 'sunday');
            }

            const holidayInfo = getHolidayInfo(currentDateObj);
            const isTraining = isHolidayTrainingDay(currentDateObj);
            const isClassDate = classDates.some(classDate => isSameDay(classDate, currentDateObj));

            if (isTraining && (isWknd || holidayInfo)) {
                // 휴일 교육: 휴일/주말이지만 수업하는 날 → 별도 스타일
                div.classList.add('class-day', 'holiday-training');
                const tag = document.createElement('div');
                tag.classList.add('holiday-name');
                tag.textContent = '교육' + (holidayInfo ? `(${holidayInfo.name})` : '');
                div.appendChild(tag);
            } else {
                // 휴일 체크 (과정 휴일 / 추가 휴일 / 공휴일)
                if (holidayInfo) {
                    if (holidayInfo.source === 'course') {
                        div.classList.add('course-holiday');
                    } else if (holidayInfo.source === 'custom') {
                        div.classList.add('custom-holiday');
                    } else {
                        div.classList.add('holiday');
                    }

                    const holidayDiv = document.createElement('div');
                    holidayDiv.classList.add('holiday-name');
                    holidayDiv.textContent = holidayInfo.name;
                    div.appendChild(holidayDiv);
                }

                // 수업일 체크
                if (isClassDate) {
                    div.classList.add('class-day');
                }
            }

            // 시작일/종료일 체크
            if (currentScheduleData) {
                if (isSameDay(currentDateObj, currentScheduleData.startDate) ||
                    isSameDay(currentDateObj, currentScheduleData.endDate)) {
                    div.classList.add('start-end-day');
                }
            }

            grid.appendChild(div);
        }

        wrapper.appendChild(grid);
        return wrapper;
    }

    // 일정 저장 기능 (Airtable 연동)
    async function saveCurrentSchedule() {
        if (!currentScheduleData) {
            alert('먼저 일정을 계산해주세요.');
            return;
        }

        const courseName = courseNameInput.value.trim();
        if (!courseName) {
            alert('과정명을 입력해주세요.');
            return;
        }

        const schedule = {
            courseName: courseName,
            startDate: formatDate(currentScheduleData.startDate),
            endDate: formatDate(currentScheduleData.endDate),
            dailyHours: parseFloat(dailyHoursInput.value),
            totalHours: parseFloat(totalHoursInput.value),
            classDaysCount: currentScheduleData.classDaysCount,
            totalDays: currentScheduleData.totalDays,
            weekendDaysCount: currentScheduleData.weekendDaysCount,
            holidayDaysCount: currentScheduleData.holidayDaysCount,
            holidayNames: Array.from(currentScheduleData.excludedHolidayNames).join(', ') || '없음',
            unitPrice: currentScheduleData.unitPrice,
            capacity: currentScheduleData.capacity,
            totalFee: currentScheduleData.totalFee,
            customHolidays: [...customHolidays],
            courseHolidayTraining: [...courseHolidayTraining],
            courseHolidays: [...courseHolidays],
            savedAt: new Date().toISOString()
        };

        // 같은 과정명이 이미 저장되어 있으면 덮어쓰기 (수정)
        const existingIndex = savedSchedules.findIndex(s => s.courseName === courseName);
        const existing = existingIndex >= 0 ? savedSchedules[existingIndex] : null;
        const isOverwrite = !!existing;

        // 로딩 표시
        saveScheduleBtn.textContent = isOverwrite ? '수정 중...' : '저장 중...';
        saveScheduleBtn.disabled = true;

        try {
            if (isOverwrite && existing.id) {
                // 기존 레코드 덮어쓰기
                await updateInAirtable(existing.id, schedule);
                schedule.id = existing.id;
                savedSchedules[existingIndex] = schedule;
                renderSavedSchedules();
                alert(`'${courseName}' 과정이 덮어쓰기(수정) 되었습니다.`);
            } else {
                // 신규 저장
                const result = await saveToAirtable(schedule);
                schedule.id = result.id;
                if (isOverwrite) {
                    // 로컬에만 있던 항목이면 교체, 아니면 추가
                    savedSchedules[existingIndex] = schedule;
                } else {
                    savedSchedules.push(schedule);
                }
                renderSavedSchedules();
                alert('일정이 성공적으로 저장되었습니다.');
            }
        } catch (error) {
            alert('저장 중 오류가 발생했습니다: ' + error.message);
            console.error('저장 오류:', error);
        } finally {
            // 로딩 표시 해제
            saveScheduleBtn.textContent = '현재 일정 저장';
            saveScheduleBtn.disabled = false;
        }
    }

    // 이벤트 리스너 등록
    calculateBtn.addEventListener('click', calculateSchedule);
    refreshSummaryIcon.addEventListener('click', calculateSchedule);
    saveScheduleBtn.addEventListener('click', saveCurrentSchedule);

    // 휴일 추가 / 수정 완료
    addHolidayBtn.addEventListener('click', submitHoliday);

    // 휴일 명 입력창에서 Enter 시 추가/수정
    addHolidayNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            submitHoliday();
        }
    });

    // 휴일 교육 추가 (과정 종속)
    addTrainingBtn.addEventListener('click', addTrainingDay);

    // 과정 휴일 추가 / 수정 완료 (과정 종속)
    addCourseHolidayBtn.addEventListener('click', submitCourseHoliday);
    addCourseHolidayNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            submitCourseHoliday();
        }
    });

    // 접기/펼치기 기능 초기화
    function initCollapsibles() {
        document.querySelectorAll('.collapsible').forEach(section => {
            const header = section.querySelector(':scope > .card-header, :scope > .sub-header');
            if (!header) return;

            const collapsed = section.dataset.collapsed === 'true';
            section.classList.toggle('collapsed', collapsed);
            header.setAttribute('role', 'button');
            header.setAttribute('tabindex', '0');
            header.setAttribute('aria-expanded', String(!collapsed));

            const toggle = (e) => {
                // 새로고침 아이콘 클릭은 접기 토글에서 제외
                if (e.target.closest('.refresh-icon')) return;
                const nowCollapsed = section.classList.toggle('collapsed');
                header.setAttribute('aria-expanded', String(!nowCollapsed));
            };

            header.addEventListener('click', toggle);
            header.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggle(e);
                }
            });
        });
    }
    initCollapsibles();

    // 초기화 실행
    init();
});
