import {api,client,recommend} from './account-catalog.js';
const b=window.sobiBridge;const x=window.sobiIntegration;let generation=0,me=null,profile=null,products=[],choices=new Set();let rewardQueue=Promise.resolve();let catalogRequest=0;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link=s=>{try{return new URL(s).protocol==='https:'?s:null;}catch{return null;}};
const money=n=>Number(n).toLocaleString('ko-KR')+'원';
async function syncProfile(){const g=generation;const p=await api.profile();if(g!==generation)return;profile=p;x.profile(p);}
function detail(p){const evidence=(p.evidence||[]).filter(e=>e.verified&&link(e.source));return `<h2>${esc(p.name)}</h2><p>${esc(p.brand)} · ${money(p.price)}</p><p>용도: ${esc(p.usages.join(', '))}</p><p>배송비: ${p.shipping===null?'미확인 · 총액 예산 충족 여부 미확인':money(p.shipping)}</p><p>가격 확인: ${esc(p.checked_at)}</p>${evidence.map(e=>`<p>${esc(e.description)} <a href="${esc(e.source)}" target="_blank" rel="noopener noreferrer">근거 출처</a></p>`).join('')}<p>소재 함량·보증·수리 세부 정보: 근거에 명시되지 않은 항목은 확인되지 않음</p>${link(p.purchase_url)?`<a href="${esc(p.purchase_url)}" target="_blank" rel="noopener noreferrer">실제 상품 페이지로 이동</a>`:'구매 링크 확인 필요'}`;}
async function showResults(){const g=generation;const target=x.target();target.innerHTML='<section class="card" role="status">검증 상품을 불러오는 중…</section>';try{const rows=await api.products();if(g!==generation||!x.onResults())return;products=recommend(rows,b.conditions());choices.clear();drawResults(rows.length);mountCatalog();}catch(e){if(g===generation&&x.onResults())target.innerHTML=`<section class="card"><h2>상품 조회에 실패했어요.</h2><p>${esc(e.message)}</p><p>서버 연결·추가 SQL 적용 여부를 확인하세요. 상품 없음으로 처리하지 않았습니다.</p><button onclick="go('input')">입력 수정</button></section>`;}}
function drawResults(total){const c=b.conditions();x.target().innerHTML=`<section class="card"><h1>나에게 맞는 검증 상품</h1><p>${esc(c.name)} · 최대 ${money(c.budget)} · ${esc(c.usage)} · 우선순위 ${esc(c.priority)}</p><p>${products.length}개 추천 / ${c.count}개 요청. 확인된 배송비 포함, 배송비 미확인은 총액 보장 제외.</p><p>기존 물건 활용·수리·대여가 가능한지도 함께 확인해 보세요.</p><button onclick="go('input')">조건 수정</button><button id="real-compare">선택 상품 비교 (최대 3개)</button>${!products.length?`<p>${total?'조건에 맞는 검증 상품이 없어요. 용도·예산·품목을 수정해 보세요.':'검토 완료된 판매 중 상품이 DB에 없어요. 관리자가 실제 상품과 근거를 등록해야 추천할 수 있습니다.'}</p>`:''}</section>`+products.map((p,i)=>`<article class="card"><h2>${esc(p.name)}</h2><p>${money(p.price)} · ${esc(p.shippingNotice)}</p><p>추천 이유: 품목 관련 정보·등록 용도 일치, 예산 및 검증 근거 조건 충족.</p><button data-detail="${i}">상세·구매 링크</button><button data-save="${i}">저장</button><label><input type="checkbox" data-compare="${i}">비교</label></article>`).join('');
 document.querySelectorAll('[data-detail]').forEach(el=>el.onclick=()=>x.modal(detail(products[+el.dataset.detail])));
 document.querySelectorAll('[data-save]').forEach(el=>el.onclick=()=>{x.saveProduct(products[+el.dataset.save]);});
 document.querySelectorAll('[data-compare]').forEach(el=>el.onchange=()=>{const id=+el.dataset.compare;if(el.checked&&choices.size>=3){el.checked=false;return x.toast('비교는 최대 3개까지 가능해요.');}el.checked?choices.add(id):choices.delete(id);});
 document.getElementById('real-compare').onclick=()=>{if(!choices.size)return x.toast('비교할 상품을 선택하세요.');const selected=[...choices].map(i=>products[i]);x.modal('<h2>실제 상품 비교</h2><div style="display:flex;gap:12px;overflow:auto">'+selected.map(p=>'<section style="min-width:210px;flex:1">'+detail(p)+'</section>').join('')+'</div>');};
}
// 일반 상품 카탈로그: 검증 상품 추천과 명확히 분리합니다.
function mountCatalog(){
 const target=x.target();if(!target||!x.onResults())return;
 const section=document.createElement('section');section.className='card';section.id='sobi-catalog';
 section.innerHTML='<h2>일반 상품 검색</h2><p>일반 판매 상품은 친환경 인증이 확인되지 않았어요. 판매처에서 가격과 재고를 다시 확인하세요.</p><form id="sobi-catalog-form" style="display:flex;gap:8px;flex-wrap:wrap"><input id="sobi-catalog-query" aria-label="상품 검색어" placeholder="예: 가방, 운동화, 이어폰" maxlength="80" style="flex:1;min-width:130px;padding:10px;border:1px solid #cbd5d1;border-radius:10px"><button type="submit">검색</button></form><div id="sobi-catalog-results" role="status" aria-live="polite">상품 목록을 불러오는 중…</div>';
 target.append(section);
 section.querySelector('form').onsubmit=e=>{e.preventDefault();void searchCatalog(section.querySelector('input').value);};
 void searchCatalog('');
}
async function searchCatalog(query){
 const g=generation,request=++catalogRequest,root=document.getElementById('sobi-catalog');
 if(!root||!x.onResults())return;
 const area=root.querySelector('#sobi-catalog-results');area.textContent='상품을 검색하는 중…';
 try{
  let q=client.from('sobi_product_catalog').select('id,source,name,brand,category,price,currency,image_url,purchase_url,shipping,sustainability_status,collected_at').eq('currency','KRW').order('collected_at',{ascending:false}).limit(30);
  const term=String(query||'').trim().slice(0,80);
  if(term){const safe=term.replace(/[%,().*\\]/g,' ').trim();if(safe)q=q.or(`name.ilike.%${safe}%,brand.ilike.%${safe}%,category.ilike.%${safe}%`);}
  const {data,error}=await q;
  if(error)throw error;
  if(g!==generation||request!==catalogRequest||!x.onResults()||!root.isConnected)return;
  const rows=(data||[]).filter(p=>Number.isFinite(p.price)&&p.price>=0);
  area.innerHTML=rows.length?`<p>${rows.length}개 상품 표시 · 일반 상품 / 친환경 미검증</p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px">${rows.map((p,i)=>`<article style="padding:12px;border:1px solid #dbe5df;border-radius:12px;min-width:0">${link(p.image_url)?`<img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy" referrerpolicy="no-referrer" style="width:100%;height:135px;object-fit:contain" onerror="this.remove()">`:''}<h3 style="font-size:1rem;overflow-wrap:anywhere">${esc(p.name)}</h3><p>${esc(p.brand||p.category||'브랜드 미확인')}</p><p><strong>${money(p.price)}</strong> · 배송비 ${p.shipping==null?'미확인':money(p.shipping)}</p><p>친환경 여부: 미검증</p>${link(p.purchase_url)?`<a href="${esc(p.purchase_url)}" target="_blank" rel="noopener noreferrer">판매 페이지 확인</a>`:'<span>구매 링크 미확인</span>'}</article>`).join('')}</div>`:'<p>등록된 일반 상품이 없거나 검색 결과가 없어요. 아직 국내 상품 자동 수집은 연결되지 않았습니다.</p>';
 }catch(e){if(g===generation&&request===catalogRequest&&root.isConnected)area.textContent='일반 상품 목록을 불러오지 못했어요: '+e.message;}
}
x.install({results:()=>void showResults(),detail,loggedIn:()=>!!me,plant:async()=>{try{await api.plant();await syncProfile();}catch(e){x.toast('새 씨앗 심기 실패: '+e.message);}},reward:(item,action)=>{if(!me)return;const g=generation;rewardQueue=rewardQueue.catch(()=>{}).then(async()=>{if(g!==generation)return;try{await api.reward(item,action);if(g===generation)await syncProfile();}catch(e){if(g===generation)x.toast('서버 성장 반영 실패: '+e.message+' · 기록 저장과 성장 반영은 별도입니다.');}});}});
client.auth.onAuthStateChange((_event,session)=>{if(me?.id===session?.user?.id)return;me=session?.user??null;generation++;profile=null;products=[];choices.clear();catalogRequest++;x.profile(null);if(me)setTimeout(()=>syncProfile().catch(e=>x.toast('성장 불러오기 실패: '+e.message)),0);});
const friendButton=document.createElement('button');friendButton.textContent='친구 · 랭킹';friendButton.onclick=()=>friends().catch(e=>x.toast(e.message));document.querySelector('.header-right').append(friendButton);
async function friends(){if(!me)return x.toast('로그인이 필요해요.');const g=generation;const [summary,requests,own]=await Promise.all([api.friends(),client.rpc('sobi_incoming_requests').then(check),api.profile()]);if(g!==generation)return;
 const list=[...(summary||[]),...(own?[{user_id:me.id,nickname:own.nickname,completed_trees:own.completed_trees,stage:Math.min(5,1+Math.floor(own.progress/5))}]:[])].sort((a,b)=>b.completed_trees-a.completed_trees);
 x.modal(`<h2>친구 · 완성 나무 현황</h2><p>내 친구 코드: ${esc(own?.friend_code??'프로필을 먼저 등록하세요.')}</p><input id="friend-code" placeholder="친구 코드"><button id="friend-request">요청 보내기</button><p>완성 나무 수 내림차순. 공식 동률 순위·참여 정책은 미정이며 동일 수에 서로 다른 순위를 부여하지 않습니다.</p>${list.map(p=>`<p>${esc(p.nickname)} ${p.user_id===me.id?'(나)':''} · 완성 ${p.completed_trees}그루 · ${p.stage}단계 ${p.user_id!==me.id?`<button data-remove="${esc(p.user_id)}">친구 해제</button>`:''}</p>`).join('')||'<p>친구가 없어요.</p>'}<h3>받은 요청</h3>${requests.map(p=>`<p>${esc(p.nickname)} <button data-accept="${esc(p.sender)}">수락</button><button data-reject="${esc(p.sender)}">거절</button></p>`).join('')||'<p>대기 중인 요청 없음</p>'}<button id="friend-refresh">새로고침</button>`);
 const run=async(name,args)=>{try{await client.rpc(name,args).then(check);if(g===generation)await friends();}catch(e){x.toast('친구 처리 실패: '+e.message);}};
 document.getElementById('friend-request').onclick=()=>run('sobi_request_friend',{p_code:document.getElementById('friend-code').value.trim()});
 document.querySelectorAll('[data-accept]').forEach(el=>el.onclick=()=>run('sobi_accept_friend',{p_sender:el.dataset.accept}));
 for(const [attr,key] of [['remove','p_other'],['reject','p_other']])document.querySelectorAll('[data-'+attr+']').forEach(el=>el.onclick=()=>{if(confirm(attr==='remove'?'친구를 해제할까요?':'친구 요청을 거절할까요?'))void run('sobi_remove_friend',{[key]:el.dataset[attr]});});
 document.getElementById('friend-refresh').onclick=()=>friends().catch(e=>x.toast(e.message));
}
function check(r){if(r.error)throw r.error;return r.data;}
