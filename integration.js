
import { api, client } from './account-catalog.js';

const b = window.sobiBridge;
const x = window.sobiIntegration;

let generation = 0;
let me = null;
let profile = null;
let rewardQueue = Promise.resolve();

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[c]));

const money = n => Number(n || 0).toLocaleString('ko-KR') + '원';

function friendAvatar(userId){
  if(!userId)return '';

  const url=api.avatarUrl(userId);

  return `<img
    src="${esc(url)}"
    alt=""
    loading="lazy"
    style="
      width:38px;
      height:38px;
      border-radius:50%;
      object-fit:cover;
      flex-shrink:0;
      background:#e8f1e9;
    "
    onerror="this.style.display='none'"
  >`;
}

async function syncProfile() {
  const g = generation;
  const p = await api.profile();
  if (g !== generation) return;
  profile = p;
  x.profile(p);
}

// 기존 상품 상세 기능과의 호환성 유지
function detail(p) {
  const safeUrl = s => {
    try {
      const u = new URL(s);
      return u.protocol === 'https:' ? u.href : null;
    } catch {
      return null;
    }
  };

  const evidence = (p.evidence || []).filter(
    e => e.verified && safeUrl(e.source)
  );

  return `
    <h2>${esc(p.name)}</h2>
    <p>${esc(p.brand)} · ${money(p.price)}</p>
    <p>용도: ${esc((p.usages || []).join(', '))}</p>
    <p>배송비: ${
      p.shipping == null ? '미확인' : money(p.shipping)
    }</p>
    ${evidence.map(e => `
      <p>
        ${esc(e.description)}
        <a href="${esc(safeUrl(e.source))}"
           target="_blank"
           rel="noopener noreferrer">근거 출처</a>
      </p>
    `).join('')}
    ${
      safeUrl(p.purchase_url)
        ? `<a href="${esc(safeUrl(p.purchase_url))}"
             target="_blank"
             rel="noopener noreferrer">상품 페이지</a>`
        : '<p>구매 링크 확인 필요</p>'
    }
  `;
}

// 추천 플랫폼
const sobiPlaces = [
  {
    name: '당근',
    url: 'https://www.daangn.com/kr/buy-sell/',
    description: '가까운 지역에서 중고 물건을 찾아보세요.',
    types: ['general', 'fashion', 'home', 'electronics', 'books']
  },
  {
    name: '번개장터',
    url: 'https://m.bunjang.co.kr/',
    description: '가방·의류·전자기기 등 중고 상품을 비교해 보세요.',
    types: ['general', 'fashion', 'electronics']
  },
  {
    name: '알라딘',
    url: 'https://www.aladin.co.kr/',
    description: '책을 새로 구매하기 전에 중고 도서를 확인해 보세요.',
    types: ['books']
  },
  {
    name: '아름다운가게',
    url: 'https://www.beautifulstore.org/',
    description: '기증 물품 재사용과 매장 정보를 살펴보세요.',
    types: ['home', 'fashion', 'general']
  },
  {
    name: '동구밭',
    url: 'https://www.donggubat.co.kr/',
    description: '생활용품 대안을 살펴보고 제품별 환경 근거를 확인하세요.',
    types: ['home', 'care']
  }
];

// 물건 종류 분류
function sobiType(name, usage) {
  const t = `${name || ''} ${usage || ''}`.toLowerCase();

  if (/책|도서|교재|문제집|참고서|소설|독서/.test(t)) {
    return 'books';
  }

  if (/가방|백팩|의류|옷|신발|운동화|패션|자켓|코트/.test(t)) {
    return 'fashion';
  }

  if (/노트북|휴대폰|핸드폰|태블릿|이어폰|컴퓨터|전자/.test(t)) {
    return 'electronics';
  }

  if (/비누|샴푸|세제|화장품|세안|치약/.test(t)) {
    return 'care';
  }

  if (/가구|책상|의자|주방|컵|텀블러|생활|수납/.test(t)) {
    return 'home';
  }

  return 'general';
}

// 구매 필요성 점수 계산
function analyzeNeed(a) {
  let score = 0;

  if (a.reason === 'essential') score += 2;
  else if (a.reason === 'convenient') score += 1;

  if (a.substitute === 'no') score += 2;

  if (a.frequency === 'often') score += 2;
  else if (a.frequency === 'sometimes') score += 1;

  return {
    score,
    level: score >= 5 ? '높음' : score >= 3 ? '보통' : '낮음'
  };
}

// 구매 필요성에 따른 추천
function getAdvice(level) {
  if (level === '낮음') {
    return {
      message: '지금은 구매를 보류하고 기존 물건을 활용하거나 빌리는 방법을 우선 추천해요.',
      actions: [
        '당장 구매하지 않고 며칠 뒤 다시 판단하기',
        '이미 가진 물건 활용하기',
        '필요할 때 빌리거나 수리하기'
      ]
    };
  }

  if (level === '보통') {
    return {
      message: '구매 전 대체품 활용과 대여 가능성을 먼저 확인해 보세요. 구매한다면 중고 제품을 우선 비교해 보세요.',
      actions: [
        '기존 물건으로 대체할 수 있는지 확인하기',
        '대여 또는 수리 가능성 확인하기',
        '중고 제품의 상태와 가격 비교하기'
      ]
    };
  }

  return {
    message: '구매 필요성이 비교적 높게 나타났어요. 예산과 상태를 확인하며 중고 제품부터 비교하고, 적절한 제품이 없다면 새 제품도 검토해 보세요.',
    actions: [
      '필요한 기능과 예산 먼저 확인하기',
      '중고 제품의 상태와 거래 안전성 확인하기',
      '새 제품 구매 시 내구성과 수리 가능성 비교하기'
    ]
  };
}

// 추천 결과 화면
async function showResults() {
  const c = b.conditions();
  const target = x.target();

  if (!target) return;

  const type = sobiType(c.name, c.usage);

  const questions = [
    {
      id: 'reason',
      title: '이 물건을 구매하려는 가장 큰 이유는?',
      options: [
        ['essential', '꼭 필요해서'],
        ['convenient', '있으면 편리해서'],
        ['impulse', '충동적으로 사고 싶어서']
      ]
    },
    {
      id: 'substitute',
      title: '대신 사용할 수 있는 물건이 있나요?',
      options: [
        ['yes', '있어요'],
        ['no', '없어요']
      ]
    },
    {
      id: 'frequency',
      title: '구매하면 얼마나 자주 사용할까요?',
      options: [
        ['often', '자주 사용해요'],
        ['sometimes', '가끔 사용해요'],
        ['rarely', '거의 사용하지 않아요']
      ]
    }
  ];

  target.innerHTML = `
    <section class="card">
      <h1>나에게 맞는 소비 대안</h1>
      <p>
        <strong>${esc(c.name || '물건')}</strong>
        · 예산 ${money(c.budget)}
        · 용도 ${esc(c.usage || '미입력')}
      </p>
      <button id="sobi-edit-conditions" type="button">
        조건 수정
      </button>
    </section>

    <section class="card">
      <h2>구매 필요성 알아보기</h2>
      <p>
        세 가지 질문에 답하면 구매 필요성을 분석하고
        맞춤형 소비 대안을 추천해 드려요.
      </p>

      ${questions.map(q => `
        <fieldset style="
          border:0;
          border-top:1px solid #e4ebe4;
          padding:14px 0;
          margin:0;
        ">
          <legend style="font-weight:700;padding-top:12px">
            ${esc(q.title)}
          </legend>

          ${q.options.map(o => `
            <label style="display:block;margin:10px 0">
              <input
                type="radio"
                name="sobi-${q.id}"
                value="${o[0]}"
              >
              ${esc(o[1])}
            </label>
          `).join('')}
        </fieldset>
      `).join('')}

      <button id="sobi-analyze" type="button">
        분석하고 맞춤 추천 보기
      </button>
    </section>

    <div id="sobi-analysis-output" aria-live="polite"></div>
  `;

  document.getElementById('sobi-edit-conditions').onclick = () => {
    if (typeof window.go === 'function') {
      window.go('input');
    } else {
      x.toast('입력 화면으로 돌아가서 조건을 수정해 주세요.');
    }
  };

  document.getElementById('sobi-analyze').onclick = () => {
    const answers = {};

    for (const q of questions) {
      const selected = target.querySelector(
        `input[name="sobi-${q.id}"]:checked`
      );

      if (!selected) {
        x.toast('세 가지 질문에 모두 답해 주세요.');
        return;
      }

      answers[q.id] = selected.value;
    }

    const { score, level } = analyzeNeed(answers);
    const advice = getAdvice(level);

    const sites = sobiPlaces.filter(p =>
      p.types.includes(type)
    );

    const order = level === '높음'
      ? ['당근', '알라딘', '번개장터', '아름다운가게', '동구밭']
      : ['아름다운가게', '당근', '알라딘', '번개장터', '동구밭'];

    sites.sort((a, b) =>
      order.indexOf(a.name) - order.indexOf(b.name)
    );

    const output = document.getElementById(
      'sobi-analysis-output'
    );

    if (!output) return;

    output.innerHTML = `
      <section class="card">
        <h2>구매 필요성 분석 결과</h2>
        <p style="font-size:1.2rem">
          <strong>구매 필요성: ${level}</strong>
        </p>
        <p>참고 점수: ${score} / 6점</p>
        <p>${esc(advice.message)}</p>
        <p style="font-size:.85rem;color:#65796b">
          이 결과는 입력한 답변을 바탕으로 한
          간단한 참고 판단이며, 실제 구매 필요성을
          확정하는 평가는 아니에요.
        </p>
      </section>

      <section class="card">
        <h2>소비나무가 추천하는 소비 방법</h2>

        ${advice.actions.map((a, i) => `
          <div style="
            padding:12px 0;
            border-top:1px solid #e4ebe4;
          ">
            <strong>${i + 1}. ${esc(a)}</strong>
          </div>
        `).join('')}
      </section>

      <section class="card">
        <h2>맞춤 추천 플랫폼</h2>
        <p>
          구매 필요성과 품목을 고려한 추천이에요.
          구매 보류나 대여를 권하는 경우에도
          사이트 방문은 선택 사항이에요.
        </p>

        ${sites.map(p => `
          <div style="
            padding:14px 0;
            border-top:1px solid #e4ebe4;
          ">
            <h3>${esc(p.name)}</h3>
            <p>${esc(p.description)}</p>

            <a
              href="${esc(p.url)}"
              target="_blank"
              rel="noopener noreferrer"
              style="
                display:inline-block;
                padding:10px 14px;
                border-radius:10px;
                background:#315f43;
                color:white;
                text-decoration:none;
              "
            >
              사이트 방문하기 ↗
            </a>
          </div>
        `).join('')}
      </section>

      <section class="card">
        <h2>지속가능성 확인 안내</h2>
        <p>
          외부 사이트의 개별 상품 가격·재고·환경성·
          예산 적합성은 소비나무가 검증한 것이 아니에요.
        </p>
        <p>
          중고거래 시 제품 상태와 거래 안전성을 확인하고,
          새 제품은 환경인증과 내구성에 관한
          실제 근거를 살펴보세요.
        </p>
        <p>
          선택한 행동은 기존 실천 기록 기능에서
          직접 기록해 주세요.
          사이트 방문만으로 실천이 기록되지는 않아요.
        </p>
      </section>
    `;

    output.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  };
}

// 기존 앱 기능 연결
x.install({
  results: () => void showResults(),
  detail,
  loggedIn: () => !!me,

  plant: async () => {
    try {
      await api.plant();
      await syncProfile();
    } catch (e) {
      x.toast('새 씨앗 심기 실패: ' + e.message);
    }
  },

  reward: (item, action) => {
    if (!me) return;

    const g = generation;

    rewardQueue = rewardQueue.catch(() => {}).then(async () => {
      if (g !== generation) return;

      try {
        await api.reward(item, action);
        if (g === generation) await syncProfile();
      } catch (e) {
        if (g === generation) {
          x.toast(
            '서버 성장 반영 실패: ' + e.message +
            ' · 기록 저장과 성장 반영은 별도입니다.'
          );
        }
      }
    });
  }
});

// 로그인 상태 관리
client.auth.onAuthStateChange((_event, session) => {
  if (me?.id === session?.user?.id) return;

  me = session?.user ?? null;
  generation++;
  profile = null;

  x.profile(null);

  if (me) {
    setTimeout(() => {
      syncProfile().catch(e =>
        x.toast('성장 불러오기 실패: ' + e.message)
      );
    }, 0);
  }
});

// 친구·랭킹 버튼
const friendButton = document.createElement('button');
friendButton.textContent = '친구 · 랭킹';
friendButton.onclick = () =>
  friends().catch(e => x.toast(e.message));

const headerRight = document.querySelector('.header-right');
if (headerRight) headerRight.append(friendButton);

// 친구 및 랭킹 기능
async function friends() {
  if (!me) {
    return x.toast('로그인이 필요해요.');
  }

  const g = generation;

  const [summary, requests, own] = await Promise.all([
    api.friends(),
    client.rpc('sobi_incoming_requests').then(check),
    api.profile()
  ]);

  if (g !== generation) return;

  const myRow = own ? {
    user_id: me.id,
    nickname: own.nickname || '나',
    completed_trees: own.completed_trees ?? 0,
    stage: Math.min(
      5,
      1 + Math.floor((own.progress ?? 0) / 5)
    )
  } : null;

  const all = [
    ...(summary || []),
    ...(myRow ? [myRow] : [])
  ].sort((a, b) =>
    (Number(b.completed_trees) || 0) -
    (Number(a.completed_trees) || 0)
  );

  let previous = null;
  let rank = 0;

  const ranked = all.map((p, i) => {
    const count = Number(p.completed_trees) || 0;

    if (count !== previous) {
      rank = i + 1;
      previous = count;
    }

    return { ...p, rank, count };
  });

  const friendCount = all.filter(
    p => p.user_id !== me.id
  ).length;

  const myTrees = Number(own?.completed_trees) || 0;
  const code = String(own?.friend_code || '');

  const shortCode = code
    ? `${code.slice(0, 8)}…${code.slice(-8)}`
    : '프로필을 먼저 등록하세요';

  const css = `
    <style>
      .sf {
        color:#244a36;
        font-family:inherit;
        max-width:680px;
        margin:0 auto;
        padding:4px 0 12px;
      }
      .sf * { box-sizing:border-box; }
      .sf-head {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        margin:4px 0 18px;
      }
      .sf-head h2 {
        font-size:1.45rem;
        margin:0 0 5px;
        color:#234a37;
      }
      .sf-head p {
        font-size:.86rem;
        color:#708778;
        margin:0;
      }
      .sf-symbol {
        background:#e1eee4;
        color:#38674a;
        border-radius:18px;
        padding:14px;
        font-size:1.5rem;
      }
      .sf-stats {
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:10px;
        margin-bottom:14px;
      }
      .sf-stat {
        border-radius:17px;
        background:#f1f7f2;
        padding:16px;
      }
      .sf-stat small {
        display:block;
        color:#718a78;
        font-size:.8rem;
        margin-bottom:6px;
      }
      .sf-stat strong {
        font-size:1.7rem;
        color:#28553b;
      }
      .sf-stat em {
        font-style:normal;
        color:#718a78;
        font-size:.8rem;
        margin-left:4px;
      }
      .sf-panel {
        border:1px solid #e2ebe4;
        background:#fff;
        border-radius:18px;
        padding:17px;
        margin-bottom:13px;
        box-shadow:0 3px 15px #173b2110;
      }
      .sf-panel h3 {
        font-size:1.05rem;
        color:#2d523c;
        margin:0;
      }
      .sf-panel-head {
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:10px;
        margin-bottom:14px;
      }
      .sf-hint {
        font-size:.76rem;
        color:#829689;
      }
      .sf-person {
        display:flex;
        align-items:center;
        gap:11px;
        padding:12px 0;
        border-bottom:1px solid #eef2ed;
      }
      .sf-person:last-child {
        border-bottom:0;
        padding-bottom:2px;
      }
      .sf-rank {
        width:40px;
        height:40px;
        flex:none;
        border-radius:13px;
        display:flex;
        align-items:center;
        justify-content:center;
        background:#e8f1e9;
        color:#486950;
        font-weight:700;
      }
      .sf-rank.first {
        background:#f7eccb;
        color:#a47c22;
      }
      .sf-person-name {
        flex:1;
        min-width:0;
      }
      .sf-person-name strong {
        display:block;
        font-size:.94rem;
        overflow-wrap:anywhere;
      }
      .sf-person-name small {
        color:#829588;
        font-size:.77rem;
      }
      .sf-tree {
        text-align:right;
        white-space:nowrap;
      }
      .sf-tree strong { color:#2a6041; }
      .sf-tree small {
        display:block;
        color:#8b9c90;
        font-size:.73rem;
      }
      .sf-self {
        font-size:.7rem;
        background:#e8f3e9;
        color:#39754a;
        border-radius:8px;
        padding:2px 6px;
        margin-left:4px;
      }
      .sf-muted {
        font-size:.82rem;
        color:#718879;
        margin:8px 0;
      }
      .sf-code {
        background:#f3f7f3;
        border-radius:12px;
        padding:12px;
        margin:0 0 12px;
      }
      .sf-code small {
        display:block;
        color:#7d9082;
        margin-bottom:5px;
      }
      .sf-code-row {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:8px;
      }
      .sf-code-row span {
        font-size:.84rem;
        overflow-wrap:anywhere;
      }
      .sf-btn {
        border:0!important;
        border-radius:11px!important;
        background:#315f43!important;
        color:white!important;
        padding:10px 13px!important;
        cursor:pointer;
        font:inherit!important;
        font-size:.85rem!important;
        white-space:nowrap;
      }
      .sf-btn.alt {
        background:#e8f0e9!important;
        color:#315d41!important;
      }
      .sf-btn.danger {
        background:#f9eeee!important;
        color:#a24c4c!important;
      }
      .sf-input {
        display:block;
        width:100%;
        border:1px solid #dbe6dd!important;
        border-radius:11px!important;
        padding:12px!important;
        font:inherit!important;
        margin:0 0 9px!important;
        background:#fff!important;
        color:#254a37!important;
      }
      .sf-actions {
        display:flex;
        gap:7px;
        align-items:center;
        flex-wrap:wrap;
      }
      .sf-note {
        font-size:.76rem;
        color:#819385;
        margin:10px 0 0;
      }
      .sf-request {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        padding:9px 0;
      }
      .sf-request-name {
        min-width:0;
        overflow-wrap:anywhere;
        font-weight:600;
      }
      .sf-bottom {
        display:flex;
        justify-content:flex-end;
      }
      @media(max-width:480px) {
        .sf-panel { padding:13px; }
        .sf-head h2 { font-size:1.25rem; }
        .sf-symbol { padding:10px; }
        .sf-person { gap:8px; }
        .sf-rank { width:34px;height:34px; }
        .sf-btn {
          padding:9px 10px!important;
          font-size:.8rem!important;
        }
      }
    </style>
  `;

  const ranking = ranked.length
    ? ranked.map(p => `
      <div class="sf-person">
        <div class="sf-rank ${p.rank === 1 ? 'first' : ''}">
          ${p.rank === 1 ? '🏆' : p.rank}
        </div>
        ${friendAvatar(p.user_id)}
        <div class="sf-person-name">
          <strong>
            ${esc(p.nickname || '친구')}
            ${p.user_id === me.id
              ? '<span class="sf-self">나</span>'
              : ''}
          </strong>
          <small>성장 ${Number(p.stage) || 1}단계</small>
        </div>
        <div class="sf-tree">
          <strong>${p.count.toLocaleString('ko-KR')}그루</strong>
          <small>완성 나무</small>
        </div>
      </div>
    `).join('')
    : '<p class="sf-muted">아직 표시할 기록이 없어요.</p>';

  const requestList = (requests || []).map(p => `
    <div class="sf-request">
      <span class="sf-request-name">
        ${esc(p.nickname || '친구')}
      </span>
      <div class="sf-actions">
        <button class="sf-btn" data-accept="${esc(p.sender)}">
          수락
        </button>
        <button class="sf-btn danger" data-reject="${esc(p.sender)}">
          거절
        </button>
      </div>
    </div>
  `).join('') ||
  '<p class="sf-muted">대기 중인 요청이 없어요.</p>';

  const friendList = (summary || []).map(p => `
    <div class="sf-request">
      <span class="sf-request-name">
        ${esc(p.nickname || '친구')}
      </span>
      <button class="sf-btn danger"
              data-remove="${esc(p.user_id)}">
        친구 해제
      </button>
    </div>
  `).join('') ||
  '<p class="sf-muted">아직 추가한 친구가 없어요.</p>';

  x.modal(css + `
    <div class="sf">
      <div class="sf-head">
        <div>
          <h2>함께 자라는 숲</h2>
          <p>친구들과 소비 습관을 가꿔요</p>
        </div>
        <div class="sf-symbol">🌳</div>
      </div>

      <div class="sf-stats">
        <div class="sf-stat">
          <small>내 완성 나무</small>
          <strong>${myTrees.toLocaleString('ko-KR')}</strong>
          <em>그루</em>
        </div>
        <div class="sf-stat">
          <small>함께하는 친구</small>
          <strong>${friendCount.toLocaleString('ko-KR')}</strong>
          <em>명</em>
        </div>
      </div>

      <section class="sf-panel">
        <div class="sf-panel-head">
          <h3>우리 숲 랭킹</h3>
          <span class="sf-hint">완성 나무 기준</span>
        </div>
        ${ranking}
        <p class="sf-note">
          나와 친구만 표시해요.
          완성 나무 수가 같으면 같은 순위예요.
        </p>
      </section>

      <section class="sf-panel">
        <div class="sf-panel-head">
          <h3>친구 추가</h3>
        </div>
        <div class="sf-code">
          <small>내 친구 코드</small>
          <div class="sf-code-row">
            <span>${esc(shortCode)}</span>
            <button class="sf-btn alt"
                    id="sf-copy"
                    ${code ? '' : 'disabled'}>
              코드 복사
            </button>
          </div>
        </div>

        <label for="friend-code" class="sf-hint">
          친구의 코드를 입력해 주세요
        </label>
        <input class="sf-input"
               id="friend-code"
               placeholder="친구 코드 입력"
               autocomplete="off">
        <button class="sf-btn" id="friend-request">
          친구 요청 보내기
        </button>
      </section>

      <section class="sf-panel">
        <div class="sf-panel-head">
          <h3>받은 요청</h3>
        </div>
        ${requestList}
      </section>

      <section class="sf-panel">
        <div class="sf-panel-head">
          <h3>친구 관리</h3>
        </div>
        ${friendList}
      </section>

      <div class="sf-bottom">
        <button class="sf-btn alt" id="friend-refresh">
          ↻ 새로고침
        </button>
      </div>
    </div>
  `);

  const run = async (name, args) => {
    try {
      await client.rpc(name, args).then(check);
      if (g === generation) await friends();
    } catch (e) {
      x.toast('친구 처리 실패: ' + e.message);
    }
  };

  const copyButton = document.getElementById('sf-copy');

  if (copyButton) {
    copyButton.onclick = async () => {
      try {
        await navigator.clipboard.writeText(code);
        x.toast('친구 코드를 복사했어요.');
      } catch (e) {
        x.toast('복사에 실패했어요.');
      }
    };
  }

  document.getElementById('friend-request').onclick = () => {
    const value = document.getElementById(
      'friend-code'
    ).value.trim();

    if (!value) {
      return x.toast('친구 코드를 입력해 주세요.');
    }

    void run('sobi_request_friend', {
      p_code: value
    });
  };

  document.querySelectorAll('[data-accept]').forEach(el => {
    el.onclick = () => void run('sobi_accept_friend', {
      p_sender: el.dataset.accept
    });
  });

  for (const [attr, key] of [
    ['remove', 'p_other'],
    ['reject', 'p_other']
  ]) {
    document.querySelectorAll('[data-' + attr + ']').forEach(el => {
      el.onclick = () => {
        const message = attr === 'remove'
          ? '친구를 해제할까요?'
          : '친구 요청을 거절할까요?';

        if (confirm(message)) {
          void run('sobi_remove_friend', {
            [key]: el.dataset[attr]
          });
        }
      };
    });
  }

  document.getElementById('friend-refresh').onclick = () =>
    friends().catch(e => x.toast(e.message));
}

function check(r) {
  if (r.error) throw r.error;
  return r.data;
}
