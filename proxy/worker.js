/**
 * Cloudflare Worker — Airtable 프록시 (course_cal)
 *
 * 목적: Airtable API 키를 브라우저로 내려보내지 않고 서버(Worker)에만 보관한다.
 *  - 브라우저는 이 Worker 주소(/{table} 또는 /{table}/{recordId})만 호출
 *  - Worker가 Authorization 헤더(키)를 주입해 Airtable로 forward
 *
 * 보관 비밀/변수 (Cloudflare 대시보드 또는 wrangler로 설정):
 *  - AIRTABLE_TOKEN   : Airtable Personal Access Token  (Secret)
 *  - AIRTABLE_BASE_ID : Airtable Base ID                 (Variable)
 *  - ALLOWED_ORIGINS  : 허용 도메인 콤마구분 (선택)        (Variable)
 *                       예: "https://USERNAME.github.io"
 */

const AIRTABLE_API = 'https://api.airtable.com/v0';

// 오픈 프록시 방지를 위한 허용 테이블 목록
const ALLOWED_TABLES = ['curri_schedule_db', 'custom_holidays_db'];

const ALLOWED_METHODS = ['GET', 'POST', 'PATCH', 'DELETE'];

export default {
    async fetch(request, env) {
        const origin = request.headers.get('Origin') || '';
        const cors = buildCors(origin, env);

        // CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: cors });
        }

        // 허용 Origin 검사
        if (!isAllowedOrigin(origin, env)) {
            return json({ error: { message: 'Forbidden origin' } }, 403, cors);
        }

        if (!ALLOWED_METHODS.includes(request.method)) {
            return json({ error: { message: 'Method not allowed' } }, 405, cors);
        }

        const url = new URL(request.url);
        const parts = url.pathname.split('/').filter(Boolean); // /{table}/{recordId?}
        const table = parts[0];
        const recordId = parts[1];

        if (!table || !ALLOWED_TABLES.includes(table)) {
            return json({ error: { message: 'Unknown table' } }, 400, cors);
        }

        let target = `${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(table)}`;
        if (recordId) target += `/${encodeURIComponent(recordId)}`;
        if (url.search) target += url.search;

        const init = {
            method: request.method,
            headers: {
                'Authorization': `Bearer ${env.AIRTABLE_TOKEN}`,
                'Content-Type': 'application/json'
            }
        };
        if (request.method === 'POST' || request.method === 'PATCH') {
            init.body = await request.text();
        }

        const resp = await fetch(target, init);
        const body = await resp.text();

        return new Response(body, {
            status: resp.status,
            headers: { ...cors, 'Content-Type': 'application/json' }
        });
    }
};

function getAllowedOrigins(env) {
    return (env.ALLOWED_ORIGINS || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
}

function isAllowedOrigin(origin, env) {
    const allowed = getAllowedOrigins(env);
    if (allowed.length === 0) return true; // 미설정 시 전체 허용(개발용). 운영에선 설정 권장.
    return allowed.includes(origin);
}

function buildCors(origin, env) {
    const allowed = getAllowedOrigins(env);
    const allowOrigin = allowed.length === 0
        ? '*'
        : (allowed.includes(origin) ? origin : allowed[0]);
    return {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin'
    };
}

function json(obj, status, headers) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { ...headers, 'Content-Type': 'application/json' }
    });
}
