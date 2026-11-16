
import {api,client} from './account-catalog.js';

const b=window.sobiBridge;

let user=null;
let revision=0;
let ready=false;
let epoch=0;
let profile=null;

let dirty=false;
let saving=false;
let saveTimer=null;
let halted=false;
let changeVersion=0;
let activeSave=null;
let currentStatus='';

const DRAFT_PREFIX='sobi-autosave-pending-v2:';

const esc=s=>String(s??'').replace(
  /[&<>"']/g,
  c=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[c])
);

const draftKey=id=>DRAFT_PREFIX+id;

function readDraft(id){
  try{
    return JSON.parse(
      localStorage.getItem(draftKey(id))||'null'
    );
  }catch{
    return null;
  }
}

function writeDraft(){
  if(!user||!ready)return false;

  try{
    localStorage.setItem(
      draftKey(user.id),
      JSON.stringify({
        revision,
        data:b.snapshot(),
        time:Date.now()
      })
    );
    return true;
  }catch(e){
    setStatus(
      '기기 임시 저장에 실패했어요: '+e.message,
      true
    );
    return false;
  }
}

function clearDraft(id){
  if(!id)return;
  try{
    localStorage.removeItem(draftKey(id));
  }catch{}
}

function setStatus(text,error=false){
  currentStatus=text;

  const el=root.querySelector('#sa-message');
  if(el){
    el.textContent=text;
    el.classList.toggle('sa-error',error);
  }
}

function queueSave(){
  if(!user||!ready||halted)return;

  changeVersion++;
  dirty=true;
  writeDraft();

  setStatus('변경 내용 저장 대기 중…');

  clearTimeout(saveTimer);
  saveTimer=setTimeout(
    ()=>void flushSave(),
    1500
  );
}

async function flushSave(){
  if(!user||!ready||halted||saving||!dirty){
    return;
  }

  clearTimeout(saveTimer);

  const owner=user.id;
  const generation=epoch;
  const version=changeVersion;
  const snapshot=b.snapshot();
  const expected=revision;

  dirty=false;
  saving=true;

  setStatus('서버에 저장 중…');

  const task=(async()=>{
    try{
      const next=await api.save(snapshot,expected);

      if(
        generation!==epoch||
        user?.id!==owner
      )return;

      revision=next;

      if(
        dirty||
        changeVersion!==version
      ){
        dirty=true;
        writeDraft();
        setStatus('추가 변경 내용 저장 대기 중…');
      }else{
        clearDraft(owner);
        setStatus('자동 저장 완료');
      }

    }catch(e){
      if(
        generation!==epoch||
        user?.id!==owner
      )return;

      dirty=true;
      writeDraft();

      const message=e?.message||String(e);

      if(
        /revision|conflict|stale|version|409|40001/i
          .test(message)
      ){
        halted=true;

        setStatus(
          '서버 기록 충돌이 발생했어요. '+
          '자동 저장을 중단했어요: '+message,
          true
        );
      }else{
        setStatus(
          '자동 저장 실패 · 기기에 임시 보관 중: '+
          message,
          true
        );
      }
    }finally{
      saving=false;

      if(
        generation===epoch&&
        user?.id===owner&&
        dirty&&
        !halted&&
        navigator.onLine
      ){
        clearTimeout(saveTimer);
        saveTimer=setTimeout(
          ()=>void flushSave(),
          5000
        );
      }
    }
  })();

  activeSave=task;

  try{
    await task;
  }finally{
    if(activeSave===task){
      activeSave=null;
    }
  }
}

window.addEventListener(
  'sobi:account-changed',
  queueSave
);

window.addEventListener('online',()=>{
  if(dirty&&!halted){
    void flushSave();
  }
});

document.addEventListener(
  'visibilitychange',
  ()=>{
    if(document.visibilityState==='hidden'){
      if(dirty)writeDraft();
    }else if(dirty&&!halted){
      void flushSave();
    }
  }
);

const css=document.createElement('style');

css.textContent=`
.sa-wrap{margin:18px 0}
.sa-card{
  background:var(--card,#fff);
  color:inherit;
  border:1px solid #b7c9bb55;
  border-radius:19px;
  padding:20px;
  margin:12px 0;
  box-shadow:0 4px 18px #183c2610
}
.sa-top{
  display:flex;
  align-items:center;
  gap:13px
}
.sa-avatar{
  height:66px;
  width:66px;
  border-radius:50%;
  object-fit:cover;
  background:#e6efe8;
  border:2px solid #d2e2d6
}
.sa-avatar-empty{
  height:66px;
  width:66px;
  border-radius:50%;
  background:#e6efe8;
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:30px;
  color:#426a4e
}
.sa-grow{flex:1;min-width:0}
.sa-grow h3{margin:0 0 5px;font-size:1.12rem}
.sa-muted{opacity:.7;font-size:.84rem;margin:5px 0}
.sa-actions{
  display:flex;
  gap:9px;
  flex-wrap:wrap;
  margin-top:13px
}
.sa-actions button,.sa-form button{
  border-radius:11px;
  padding:10px 14px
}
.sa-form{display:grid;gap:10px}
.sa-form label{
  display:grid;
  gap:5px;
  font-size:.87rem
}
.sa-form input{
  padding:12px;
  border-radius:10px;
  border:1px solid #aabdae;
  background:var(--card,#fff);
  color:inherit;
  width:100%;
  box-sizing:border-box
}
.sa-status{
  font-size:.83rem;
  min-height:1.2em;
  margin:12px 0 0
}
.sa-stats{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:10px;
  margin:12px 0
}
.sa-stat{
  padding:15px;
  border-radius:14px;
  background:#d7e8da35
}
.sa-stat strong{
  font-size:1.45rem;
  display:block
}
.sa-friend{
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:10px;
  padding:12px 0;
  border-top:1px solid #aabdae55
}
.sa-modal{
  border:0;
  border-radius:22px;
  padding:22px;
  max-width:min(420px,calc(100vw - 32px));
  width:100%;
  background:var(--card,#fff);
  color:inherit;
  box-shadow:0 18px 60px #0004
}
.sa-modal::backdrop{background:#081b1388}
.sa-modal h2{margin-top:0}
.sa-photo{
  width:94px;
  height:94px;
  object-fit:cover;
  border-radius:50%;
  display:block;
  margin:12px auto;
  background:#e6efe8
}
.sa-modal input[type=file]{max-width:100%}
.sa-modal input[type=text]{
  width:100%;
  padding:11px;
  box-sizing:border-box;
  border:1px solid #aabdae;
  border-radius:10px
}
.sa-modal button{
  border-radius:10px;
  padding:10px 13px
}
.sa-error{color:#b04444}
`;

document.head.append(css);

const root=document.createElement('div');
root.className='sa-wrap';
root.id='sobi-account-panel';

const dialog=document.createElement('dialog');
dialog.className='sa-modal';
dialog.id='sobi-profile-editor';
document.body.append(dialog);

const avatar=(id,v='')=>
  api.avatarUrl(id)+(v?'?v='+v:'');

function avatarMarkup(id){
  if(!id){
    return '<div class="sa-avatar-empty">🌱</div>';
  }

  return `
    <img class="sa-avatar"
      src="${esc(avatar(id,Date.now()))}"
      alt="프로필 사진">
  `;
}

function mount(){
  const app=document.getElementById('app');
  if(!app)return;

  const settings=!!document.querySelector(
    '#nav .nav.active'
  )?.textContent?.includes('마이페이지');

  if(settings){
    if(root.parentElement!==app){
      app.prepend(root);
    }
  }else{
    root.remove();
  }
}

function friendly(e){
  const m=e?.message||String(e);

  if(m.includes('INVALID_NICKNAME')){
    return '닉네임 형식을 확인해 주세요.';
  }

  if(m.includes('row-level security')){
    return '저장 권한을 확인해 주세요: '+m;
  }

  return m;
}

function draw(){
  root.innerHTML=user?`
    <section class="sa-card">
      <div class="sa-top">
        ${avatarMarkup(user.id)}

        <div class="sa-grow">
          <h3>${esc(profile?.nickname||'나의 프로필')}</h3>
          <p class="sa-muted">
            로그인됨 · ${esc(user.email||'')}
          </p>
        </div>
      </div>

      <div class="sa-actions">
        <button id="sa-edit">프로필 수정</button>
        <button id="sa-logout">로그아웃</button>
      </div>

      <p id="sa-message" class="sa-status"
         role="status">
        ${esc(currentStatus||(
          ready
            ?'자동 저장 준비 완료'
            :'계정 기록을 불러오는 중…'
        ))}
      </p>
    </section>

    <section class="sa-card">
      <h3>나의 성장 현황</h3>

      <div class="sa-stats">
        <div class="sa-stat">
          <span>완성한 나무</span>
          <strong>
            ${Number(profile?.completed_trees||0)}그루
          </strong>
        </div>

        <div class="sa-stat">
          <span>나무 성장</span>
          <strong>
            ${Math.min(
              5,
              1+Math.floor(Number(profile?.progress||0)/5)
            )}단계
          </strong>
        </div>
      </div>

      <div id="sa-friends">
        <p class="sa-muted">친구 현황을 불러오는 중…</p>
      </div>

      <div class="sa-actions">
        <button id="sa-friends-refresh">
          친구 현황 새로고침
        </button>
      </div>
    </section>

    <section class="sa-card">
      <h3>계정 기록</h3>

      <p class="sa-muted">
        소비 기록을 변경하면 약 1.5초 뒤 자동으로
        서버에 저장해요. 저장에 실패하면
        기기에 임시 보관하고 재시도해요.
      </p>

      <div class="sa-actions">
        <button id="sa-save" ${ready?'':'disabled'}>
          지금 저장
        </button>

        <button id="sa-reload">
          서버 기록 불러오기
        </button>
      </div>

      <details style="margin-top:12px">
        <summary>고급 기록 관리</summary>

        <p class="sa-muted">
          로그인 전 기기 기록으로 계정 기록을
          교체할 수 있어요. 기존 기록이 사라질 수
          있으니 주의해 주세요.
        </p>

        <button id="sa-import">
          로그인 전 기기 기록 가져오기
        </button>
      </details>
    </section>
  `:`
    <section class="sa-card">
      <h2>소비나무 계정</h2>

      <p class="sa-muted">
        로그인하면 나무 성장과 친구 기능을
        이용할 수 있어요.
      </p>

      <div class="sa-form">
        <label>
          이메일
          <input id="sa-email" type="email"
            autocomplete="email" placeholder="이메일">
        </label>

        <label>
          비밀번호
          <input id="sa-password" type="password"
            autocomplete="current-password"
            placeholder="비밀번호">
        </label>

        <div class="sa-actions">
          <button id="sa-login">로그인</button>
          <button id="sa-signup">회원가입</button>
          <button id="sa-reset">비밀번호 재설정</button>
        </div>
      </div>

      <p id="sa-message" class="sa-status"
         role="status"></p>
    </section>
  `;

  const on=(id,fn)=>{
    const el=root.querySelector('#'+id);

    if(el){
      el.onclick=async()=>{
        try{
          await fn();
        }catch(e){
          setStatus(friendly(e),true);
        }
      };
    }
  };

  const credentials=()=>[
    root.querySelector('#sa-email')?.value.trim(),
    root.querySelector('#sa-password')?.value
  ];

  on('sa-login',async()=>{
    await api.login(...credentials());
    setStatus('로그인했어요.');
  });

  on('sa-signup',async()=>{
    const r=await api.signup(
      ...credentials(),
      location.origin+location.pathname
    );

    setStatus(
      r.session
        ?'가입했어요.'
        :'가입 신청 완료! 이메일 인증 메일을 확인해 주세요.'
    );
  });

  on('sa-reset',async()=>{
    const email=credentials()[0];

    if(!email){
      throw Error('이메일을 먼저 입력해 주세요.');
    }

    await api.resetPassword(
      email,
      location.origin+location.pathname
    );

    setStatus('비밀번호 재설정 메일을 요청했어요.');
  });

  on('sa-logout',async()=>{
    if(dirty){
      writeDraft();
    }
    await api.logout();
  });

  on('sa-edit',()=>openEditor());

  on('sa-friends-refresh',()=>refreshFriends());

  on('sa-save',async()=>{
    if(!ready){
      throw Error('계정 기록을 아직 불러오지 못했어요.');
    }

    if(halted){
      throw Error(
        '기록 충돌이 발생했어요. '+
        '서버 기록과 임시 기록을 먼저 확인해 주세요.'
      );
    }

    queueSave();

    clearTimeout(saveTimer);

    if(saving){
      await activeSave;
    }

    await flushSave();
  });

  on('sa-reload',async()=>{
    if(saving){
      await activeSave;
    }

    if(dirty||readDraft(user.id)){
      if(!confirm(
        '저장되지 않은 변경 내용이 있어요. '+
        '서버 기록으로 교체하면 사라질 수 있어요. '+
        '계속할까요?'
      ))return;
    }else if(!confirm(
      '서버 기록을 다시 불러올까요?'
    )){
      return;
    }

    clearDraft(user.id);
    dirty=false;
    halted=false;

    await load(user);
  });

  on('sa-import',async()=>{
    if(!ready){
      throw Error('계정 기록을 먼저 불러와 주세요.');
    }

    if(halted||dirty||saving){
      throw Error(
        '미저장 기록이나 저장 충돌이 있어요. '+
        '먼저 기록을 확인해 주세요.'
      );
    }

    if(!confirm(
      '기기 기록으로 계정 기록을 교체할까요? '+
      '성장·랭킹 기록은 가져오지 않습니다.'
    ))return;

    const g=epoch;
    const next=b.guest();
    const n=await api.save(next,revision);

    if(g!==epoch)return;

    revision=n;
    b.apply(next);

    clearDraft(user.id);
    dirty=false;

    setStatus('기기 기록을 계정에 저장했어요.');
  });

  mount();

  if(user){
    void refreshFriends();
  }
}

async function refreshFriends(){
  if(!user)return;

  const g=epoch;
  const el=root.querySelector('#sa-friends');

  if(!el)return;

  try{
    const friends=await api.friends();

    if(g!==epoch||!el.isConnected)return;

    el.innerHTML=`
      <h4>함께하는 친구 ${friends?.length||0}명</h4>
    `+(
      (friends||[]).map(f=>`
        <div class="sa-friend">
          <span>${esc(f.nickname||'친구')}</span>
          <span>
            ${Number(f.completed_trees||0)}그루 ·
            ${Number(f.stage||1)}단계
          </span>
        </div>
      `).join('')||
      '<p class="sa-muted">아직 등록된 친구가 없어요.</p>'
    );

  }catch(e){
    if(g===epoch&&el.isConnected){
      el.textContent=
        '친구 현황을 불러오지 못했어요: '+
        friendly(e);
    }
  }
}

function openEditor(){
  if(!user)return;

  dialog.innerHTML=`
    <h2>프로필 수정</h2>

    <img class="sa-photo"
      src="${esc(avatar(user.id,Date.now()))}"
      alt="프로필 사진 미리보기">

    <p class="sa-muted" style="text-align:center">
      JPG, PNG, WebP · 최대 2MB
    </p>

    <label>
      사진 변경
      <input id="sa-photo-file" type="file"
        accept="image/jpeg,image/png,image/webp">
    </label>

    <p>
      <label>
        닉네임
        <input id="sa-nickname" type="text"
          maxlength="30"
          value="${esc(profile?.nickname||'')}">
      </label>
    </p>

    <p class="sa-muted">
      프로필 사진은 친구에게 공개돼요.
    </p>

    <p id="sa-edit-status" role="status"></p>

    <div class="sa-actions">
      <button id="sa-photo-delete">사진 삭제</button>
      <button id="sa-cancel">취소</button>
      <button id="sa-apply">저장</button>
    </div>
  `;

  dialog.showModal();

  const file=dialog.querySelector('#sa-photo-file');
  let previewUrl=null;

  file.onchange=()=>{
    if(previewUrl){
      URL.revokeObjectURL(previewUrl);
    }

    if(file.files[0]){
      previewUrl=URL.createObjectURL(file.files[0]);

      dialog.querySelector('.sa-photo').src=
        previewUrl;
    }
  };

  dialog.addEventListener('close',()=>{
    if(previewUrl){
      URL.revokeObjectURL(previewUrl);
    }
  },{once:true});

  dialog.querySelector('#sa-cancel').onclick=()=>{
    dialog.close();
  };

  dialog.querySelector('#sa-photo-delete').onclick=
    async()=>{
      if(!confirm('프로필 사진을 삭제할까요?')){
        return;
      }

      try{
        await api.removeAvatar();

        dialog.querySelector('.sa-photo')
          .removeAttribute('src');

        dialog.querySelector('#sa-edit-status')
          .textContent='사진을 삭제했어요.';

        draw();

      }catch(e){
        dialog.querySelector('#sa-edit-status')
          .textContent=friendly(e);
      }
    };

  dialog.querySelector('#sa-apply').onclick=async()=>{
    const status=dialog.querySelector('#sa-edit-status');
    const btn=dialog.querySelector('#sa-apply');

    btn.disabled=true;

    try{
      const name=dialog.querySelector(
        '#sa-nickname'
      ).value.trim();

      if(name&&name!==profile?.nickname){
        await api.register(name);
      }

      if(file.files[0]){
        await api.uploadAvatar(file.files[0]);
      }

      profile=await api.profile();

      draw();
      dialog.close();

    }catch(e){
      status.textContent=friendly(e);
    }finally{
      btn.disabled=false;
    }
  };
}

async function load(next){
  const previousUser=user?.id;

  if(previousUser&&dirty){
    writeDraft();
  }

  clearTimeout(saveTimer);

  const g=++epoch;

  user=next;
  ready=false;
  revision=0;
  profile=null;
  dirty=false;
  halted=false;
  currentStatus='계정 기록을 불러오는 중…';

  b.clear(!!user);
  draw();

  if(!user)return;

  try{
    const [row,p]=await Promise.all([
      api.load(),
      api.profile()
    ]);

    if(g!==epoch)return;

    revision=row?.revision??0;

    const pending=readDraft(user.id);

    if(
      pending&&
      pending.revision===revision&&
      pending.data
    ){
      b.apply(pending.data);
      dirty=true;

    }else{
      b.apply(row?.data??{});

      if(pending){
        halted=true;
      }
    }

    profile=p;
    ready=true;

    draw();

    if(halted){
      setStatus(
        '서버 기록과 이 기기의 미저장 기록이 '+
        '달라요. 자동 저장을 중단했어요. '+
        '기록을 확인해 주세요.',
        true
      );

    }else if(dirty){
      setStatus(
        '미저장 기록을 복원했어요. '+
        '자동 저장을 재시도해요.'
      );

      saveTimer=setTimeout(
        ()=>void flushSave(),
        1500
      );

    }else{
      setStatus(
        '자동 저장 준비 완료 · '+
        '변경하면 자동으로 저장돼요.'
      );
    }

  }catch(e){
    if(g===epoch){
      setStatus(
        '계정 기록을 불러오지 못했어요: '+
        friendly(e),
        true
      );
    }
  }
}

client.auth.onAuthStateChange((event,session)=>{
  if(event==='PASSWORD_RECOVERY'){
    setTimeout(async()=>{
      const password=prompt(
        '새 비밀번호를 입력해 주세요.'
      );

      if(password){
        try{
          await api.changePassword(password);
          setStatus('비밀번호를 변경했어요.');
        }catch(e){
          setStatus(friendly(e),true);
        }
      }
    },0);
  }

  if(
    session?.user?.id===user?.id&&
    event!=='SIGNED_OUT'
  ){
    return;
  }

  setTimeout(()=>{
    void load(session?.user??null);
  },0);
});

const observer=new MutationObserver(()=>mount());

const app=document.getElementById('app');
const nav=document.getElementById('nav');

if(app){
  observer.observe(app,{childList:true});
}

if(nav){
  observer.observe(nav,{
    childList:true,
    attributes:true,
    subtree:true,
    attributeFilter:['class']
  });
}

draw();
