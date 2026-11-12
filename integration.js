
import {api,client,recommend} from './account-catalog.js';
const b=window.sobiBridge;const x=window.sobiIntegration;let generation=0,me=null,profile=null,products=[],choices=new Set();let rewardQueue=Promise.resolve();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link=s=>{try{return new URL(s).protocol==='https:'?s:null;}catch{return null;}};
const money=n=>Number(n).toLocaleString('ko-KR')+'원';
async function syncProfile(){const g=generation;const p=await api.profile();if(g!==generation)return;profile=p;x.profile(p);}
function detail(p){const evidence=(p.evidence||[]).filter(e=>e.verified&&link(e.source));return `<h2>${esc(p.name)}</h2><p>${esc(p.brand)} · ${money(p.price)}</p><p>용도: ${esc(p.usages.join(', '))}</p><p>배송비: ${p.shipping===null?'미확인 · 총액 예산 충족 여부 미확인':money(p.shipping)}</p><p>가격 확인: ${esc(p.checked_at)}</p>${evidence.map(e=>`<p>${esc(e.description)} <a href="${esc(e.source)}" target="_blank" rel="noopener noreferrer">근거 출처</a></p>`).join('')}<p>소재 함량·보증·수리 세부 정보: 근거에 명시되지 않은 항목은 확인되지 않음</p>${link(p.purchase_url)?`<a href="${esc(p.purchase_url)}" target="_blank" rel="noopener noreferrer">실제 상품 페이지로 이동</a>`:'구매 링크 확인 필요'}`;}
async function showResults(){const g=generation;const target=x.target();target.innerHTML='<section class="card" role="status">검증 상품을 불러오는 중…</section>';try{const rows=await api.products();if(g!==generation||!x.onResults())return;products=recommend(rows,b.conditions());choices.clear();drawResults(rows.length);}catch(e){if(g===generation&&x.onResults())target.innerHTML=`<section class="card"><h2>상품 조회에 실패했어요.</h2><p>${esc(e.message)}</p><p>서버 연결·추가 SQL 적용 여부를 확인하세요. 상품 없음으로 처리하지 않았습니다.</p><button onclick="go('input')">입력 수정</button></section>`;}}

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
    description: '기증 물품 재사용과 가까운 매장 정보를 살펴보세요.',
    types: ['home', 'fashion', 'general']
  },
  {
    name: '동구밭',
    url: 'https://donggubat.com/',
    description: '생활용품 대안을 살펴보고 제품별 환경 근거를 확인하세요.',
    types: ['home', 'care']
  }
];

function sobiType(name, usage) {
  const t = `${name || ''} ${usage || ''}`.toLowerCase();

  if (/책|도서|교재|문제집|참고서|소설|독서/.test(t))
    return 'books';

  if (/가방|백팩|의류|옷|신발|운동화|패션|자켓|코트/.test(t))
    return 'fashion';

  if (/노트북|휴대폰|핸드폰|태블릿|이어폰|컴퓨터|전자/.test(t))
    return 'electronics';

  if (/비누|샴푸|세제|화장품|세안|치약/.test(t))
    return 'care';

  if (/가구|책상|의자|주방|컵|텀블러|생활|수납/.test(t))
    return 'home';

  return 'general';
}

async function showResults() {
  const c = b.conditions();
  const type = sobiType(c.name, c.usage);

  const sites = sobiPlaces.filter(p =>
    p.types.includes(type)
  );

  const alternatives = [
    {
      title: '이미 가진 물건 활용',
      body: '비슷한 물건을 가지고 있다면 먼저 다시 사용할 수 있는지 확인해 보세요.'
    },
    {
      title: '수리·대여 검토',
      body: '고장 난 물건은 수리 가능 여부를, 가끔 사용하는 물건은 대여 가능 여부를 살펴보세요.'
    },
    {
      title: '중고 구매 우선 비교',
      body: '중고 제품의 상태·가격·거래 안전성을 확인해 보세요.'
    }
  ];

  const target = x.target();
  if (!target) return;

  target.innerHTML = `
    <section class="card">
      <h1>나에게 맞는 소비 대안</h1>

      <p>
        <strong>${esc(c.name || '물건')}</strong>
        · 예산 ${money(c.budget || 0)}
        · 용도 ${esc(c.usage || '미입력')}
      </p>

      <p>
        구매 필요성은 입력된 정보만으로 확정할 수 없어요.
        아래 선택지를 확인한 뒤 필요한 만큼 소비해 보세요.
      </p>

      <button id="sobi-edit-conditions" type="button">
        조건 수정
      </button>
    </section>

    <section class="card">
      <h2>구매 전 먼저 확인해요</h2>

      ${alternatives.map((a, i) => `
        <div style="
          padding:12px 0;
          ${i ? 'border-top:1px solid #e4ebe4;' : ''}
        ">
          <strong>${i + 1}. ${esc(a.title)}</strong>
          <p style="margin:6px 0 0">
            ${esc(a.body)}
          </p>
        </div>
      `).join('')}

      <p style="font-size:.85rem;color:#65796b">
        안전·위생·필수 학습용품 등은
        새 제품이 더 적절할 수 있어요.
      </p>
    </section>

    <section class="card">
      <h2>추천 플랫폼</h2>

      <p>
        품목에 맞는 외부 사이트를 연결해 드려요.
        개별 상품의 가격·재고·환경성은
        소비나무가 검증한 것이 아니에요.
      </p>

      ${sites.map(p => `
        <div style="
          padding:14px 0;
          border-top:1px solid #e4ebe4
        ">
          <strong>${esc(p.name)}</strong>

          <p style="margin:6px 0">
            ${esc(p.description)}
          </p>

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
        중고 구매는 제품 재사용을 돕지만,
        거래·배송 상황에 따라 환경 효과는
        달라질 수 있어요.
      </p>

      <p>
        새 제품은 환경인증·수리 가능성·내구성의
        실제 근거를 확인해 주세요.
      </p>

      <p>
        구매를 보류하거나 재사용·수리·구매를
        선택했다면 기존 실천 기록 기능에
        결과를 남겨 보세요.
      </p>
    </section>
  `;

  const edit = document.getElementById(
    'sobi-edit-conditions'
  );

  if (edit) {
    edit.onclick = () => {
      if (typeof window.go === 'function') {
        window.go('input');
      } else {
        x.toast(
          '입력 화면으로 돌아가서 조건을 수정해 주세요.'
        );
      }
    };
  }
}

x.install({results:()=>void showResults(),detail,loggedIn:()=>!!me,plant:async()=>{try{await api.plant();await syncProfile();}catch(e){x.toast('새 씨앗 심기 실패: '+e.message);}},reward:(item,action)=>{if(!me)return;const g=generation;rewardQueue=rewardQueue.catch(()=>{}).then(async()=>{if(g!==generation)return;try{await api.reward(item,action);if(g===generation)await syncProfile();}catch(e){if(g===generation)x.toast('서버 성장 반영 실패: '+e.message+' · 기록 저장과 성장 반영은 별도입니다.');}});}});
client.auth.onAuthStateChange((_event,session)=>{if(me?.id===session?.user?.id)return;me=session?.user??null;generation++;profile=null;products=[];choices.clear();x.profile(null);if(me)setTimeout(()=>syncProfile().catch(e=>x.toast('성장 불러오기 실패: '+e.message)),0);});
const friendButton=document.createElement('button');friendButton.textContent='친구 · 랭킹';friendButton.onclick=()=>friends().catch(e=>x.toast(e.message));document.querySelector('.header-right').append(friendButton);
async function friends(){
 if(!me)return x.toast('로그인이 필요해요.');
 const g=generation;
 const [summary,requests,own]=await Promise.all([api.friends(),client.rpc('sobi_incoming_requests').then(check),api.profile()]);
 if(g!==generation)return;
 const myRow=own?{user_id:me.id,nickname:own.nickname||'나',completed_trees:own.completed_trees??0,stage:Math.min(5,1+Math.floor((own.progress??0)/5))}:null;
 const all=[...(summary||[]),...(myRow?[myRow]:[])].sort((a,b)=>(Number(b.completed_trees)||0)-(Number(a.completed_trees)||0));
 let previous=null,rank=0;
 const ranked=all.map((p,i)=>{const count=Number(p.completed_trees)||0;if(count!==previous){rank=i+1;previous=count;}return {...p,rank,count};});
 const friendCount=all.filter(p=>p.user_id!==me.id).length;
 const myTrees=Number(own?.completed_trees)||0;
 const code=String(own?.friend_code||'');
 const shortCode=code?`${code.slice(0,8)}…${code.slice(-8)}`:'프로필을 먼저 등록하세요';
 const css=`<style>
 .sf{color:#244a36;font-family:inherit;max-width:680px;margin:0 auto;padding:4px 0 12px}
 .sf *{box-sizing:border-box}.sf-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:4px 0 18px}.sf-head h2{font-size:1.45rem;margin:0 0 5px;color:#234a37}.sf-head p{font-size:.86rem;color:#708778;margin:0}.sf-symbol{background:#e1eee4;color:#38674a;border-radius:18px;padding:14px;font-size:1.5rem}
 .sf-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:14px}.sf-stat{border-radius:17px;background:#f1f7f2;padding:16px}.sf-stat small{display:block;color:#718a78;font-size:.8rem;margin-bottom:6px}.sf-stat strong{font-size:1.7rem;color:#28553b}.sf-stat em{font-style:normal;color:#718a78;font-size:.8rem;margin-left:4px}
 .sf-panel{border:1px solid #e2ebe4;background:#fff;border-radius:18px;padding:17px;margin-bottom:13px;box-shadow:0 3px 15px #173b2110}.sf-panel h3{font-size:1.05rem;color:#2d523c;margin:0}.sf-panel-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:14px}.sf-hint{font-size:.76rem;color:#829689}.sf-person{display:flex;align-items:center;gap:11px;padding:12px 0;border-bottom:1px solid #eef2ed}.sf-person:last-child{border-bottom:0;padding-bottom:2px}.sf-rank{width:40px;height:40px;flex:none;border-radius:13px;display:flex;align-items:center;justify-content:center;background:#e8f1e9;color:#486950;font-weight:700}.sf-rank.first{background:#f7eccb;color:#a47c22}.sf-person-name{flex:1;min-width:0}.sf-person-name strong{display:block;font-size:.94rem;overflow-wrap:anywhere}.sf-person-name small{color:#829588;font-size:.77rem}.sf-tree{text-align:right;white-space:nowrap}.sf-tree strong{color:#2a6041}.sf-tree small{display:block;color:#8b9c90;font-size:.73rem}.sf-self{font-size:.7rem;background:#e8f3e9;color:#39754a;border-radius:8px;padding:2px 6px;margin-left:4px}.sf-muted{font-size:.82rem;color:#718879;margin:8px 0}.sf-code{background:#f3f7f3;border-radius:12px;padding:12px;margin:0 0 12px}.sf-code small{display:block;color:#7d9082;margin-bottom:5px}.sf-code-row{display:flex;align-items:center;justify-content:space-between;gap:8px}.sf-code-row span{font-size:.84rem;overflow-wrap:anywhere}.sf-btn{border:0!important;border-radius:11px!important;background:#315f43!important;color:white!important;padding:10px 13px!important;cursor:pointer;font:inherit!important;font-size:.85rem!important;white-space:nowrap}.sf-btn.alt{background:#e8f0e9!important;color:#315d41!important}.sf-btn.danger{background:#f9eeee!important;color:#a24c4c!important}.sf-input{display:block;width:100%;border:1px solid #dbe6dd!important;border-radius:11px!important;padding:12px!important;font:inherit!important;margin:0 0 9px!important;background:#fff!important;color:#254a37!important}.sf-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.sf-note{font-size:.76rem;color:#819385;margin:10px 0 0}.sf-request{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0}.sf-request-name{min-width:0;overflow-wrap:anywhere;font-weight:600}.sf-bottom{display:flex;justify-content:flex-end}
 @media(max-width:480px){.sf-panel{padding:13px}.sf-head h2{font-size:1.25rem}.sf-symbol{padding:10px}.sf-person{gap:8px}.sf-rank{width:34px;height:34px}.sf-btn{padding:9px 10px!important;font-size:.8rem!important}}
 </style>`;
 const ranking=ranked.length?ranked.map(p=>`<div class="sf-person"><div class="sf-rank ${p.rank===1?'first':''}" aria-label="${p.rank}위">${p.rank===1?'🏆':p.rank}</div><div class="sf-person-name"><strong>${esc(p.nickname||'친구')}${p.user_id===me.id?'<span class="sf-self">나</span>':''}</strong><small>성장 ${Number(p.stage)||1}단계</small></div><div class="sf-tree"><strong>${p.count.toLocaleString('ko-KR')}그루</strong><small>완성 나무</small></div></div>`).join(''):'<p class="sf-muted">아직 표시할 기록이 없어요.</p>';
 const requestList=(requests||[]).map(p=>`<div class="sf-request"><span class="sf-request-name">${esc(p.nickname||'친구')}</span><div class="sf-actions"><button class="sf-btn" data-accept="${esc(p.sender)}">수락</button><button class="sf-btn danger" data-reject="${esc(p.sender)}">거절</button></div></div>`).join('')||'<p class="sf-muted">대기 중인 요청이 없어요.</p>';
 const friendList=(summary||[]).map(p=>`<div class="sf-request"><span class="sf-request-name">${esc(p.nickname||'친구')}</span><button class="sf-btn danger" data-remove="${esc(p.user_id)}">친구 해제</button></div>`).join('')||'<p class="sf-muted">아직 추가한 친구가 없어요.</p>';
 x.modal(css+`<div class="sf"><div class="sf-head"><div><h2>함께 자라는 숲</h2><p>친구들과 소비 습관을 가꿔요</p></div><div class="sf-symbol" aria-hidden="true">🌳</div></div><div class="sf-stats"><div class="sf-stat"><small>내 완성 나무</small><strong>${myTrees.toLocaleString('ko-KR')}</strong><em>그루</em></div><div class="sf-stat"><small>함께하는 친구</small><strong>${friendCount.toLocaleString('ko-KR')}</strong><em>명</em></div></div><section class="sf-panel"><div class="sf-panel-head"><h3>우리 숲 랭킹</h3><span class="sf-hint">완성 나무 기준</span></div>${ranking}<p class="sf-note">나와 친구만 표시해요. 완성 나무 수가 같으면 같은 순위예요.</p></section><section class="sf-panel"><div class="sf-panel-head"><h3>친구 추가</h3><span aria-hidden="true">＋</span></div><div class="sf-code"><small>내 친구 코드</small><div class="sf-code-row"><span>${esc(shortCode)}</span><button class="sf-btn alt" id="sf-copy" ${code?'':'disabled'}>코드 복사</button></div></div><label for="friend-code" class="sf-hint">친구의 코드를 입력해 주세요</label><input class="sf-input" id="friend-code" placeholder="친구 코드 입력" autocomplete="off"><button class="sf-btn" id="friend-request">친구 요청 보내기</button></section><section class="sf-panel"><div class="sf-panel-head"><h3>받은 요청</h3></div>${requestList}</section><section class="sf-panel"><div class="sf-panel-head"><h3>친구 관리</h3></div>${friendList}</section><div class="sf-bottom"><button class="sf-btn alt" id="friend-refresh">↻ 새로고침</button></div></div>`);
 const run=async(name,args)=>{try{await client.rpc(name,args).then(check);if(g===generation)await friends();}catch(e){x.toast('친구 처리 실패: '+e.message);}};
 document.getElementById('sf-copy').onclick=async()=>{try{await navigator.clipboard.writeText(code);x.toast('친구 코드를 복사했어요.');}catch(e){x.toast('복사에 실패했어요. 코드를 직접 선택해 주세요.');}};
 document.getElementById('friend-request').onclick=()=>{const value=document.getElementById('friend-code').value.trim();if(!value)return x.toast('친구 코드를 입력해 주세요.');void run('sobi_request_friend',{p_code:value});};
 document.querySelectorAll('[data-accept]').forEach(el=>el.onclick=()=>void run('sobi_accept_friend',{p_sender:el.dataset.accept}));
 for(const [attr,key] of [['remove','p_other'],['reject','p_other']])document.querySelectorAll('[data-'+attr+']').forEach(el=>el.onclick=()=>{if(confirm(attr==='remove'?'친구를 해제할까요?':'친구 요청을 거절할까요?'))void run('sobi_remove_friend',{[key]:el.dataset[attr]});});
 document.getElementById('friend-refresh').onclick=()=>friends().catch(e=>x.toast(e.message));
}
function check(r){if(r.error)throw r.error;return r.data;}
