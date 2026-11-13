
import {api,client} from './account-catalog.js';

const b=window.sobiBridge;
let user=null,revision=0,ready=false,epoch=0,profile=null;

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;',
  '<':'&lt;',
  '>':'&gt;',
  '"':'&quot;',
  "'":'&#39;'
}[c]));

const css=document.createElement('style');
css.textContent=`
.sa-wrap{margin:18px 0}
.sa-card{background:var(--card,#fff);color:inherit;border:1px solid #b7c9bb55;border-radius:19px;padding:20px;margin:12px 0;box-shadow:0 4px 18px #183c2610}
.sa-top{display:flex;align-items:center;gap:13px}
.sa-avatar{height:66px;width:66px;border-radius:50%;object-fit:cover;background:#e6efe8;border:2px solid #d2e2d6}
.sa-avatar-empty{height:66px;width:66px;border-radius:50%;background:#e6efe8;display:flex;align-items:center;justify-content:center;font-size:30px;color:#426a4e}
.sa-grow{flex:1;min-width:0}
.sa-grow h3{margin:0 0 5px;font-size:1.12rem}
.sa-muted{opacity:.7;font-size:.84rem;margin:5px 0}
.sa-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:13px}
.sa-actions button,.sa-form button{border-radius:11px;padding:10px 14px}
.sa-form{display:grid;gap:10px}
.sa-form label{display:grid;gap:5px;font-size:.87rem}
.sa-form input{padding:12px;border-radius:10px;border:1px solid #aabdae;background:var(--card,#fff);color:inherit;width:100%;box-sizing:border-box}
.sa-status{font-size:.83rem;min-height:1.2em;margin:12px 0 0}
.sa-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}
.sa-stat{padding:15px;border-radius:14px;background:#d7e8da35}
.sa-stat strong{font-size:1.45rem;display:block}
.sa-friend{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 0;border-top:1px solid #aabdae55}
.sa-modal{border:0;border-radius:22px;padding:22px;max-width:min(420px,calc(100vw - 32px));width:100%;background:var(--card,#fff);color:inherit;box-shadow:0 18px 60px #0004}
.sa-modal::backdrop{background:#081b1388}
.sa-modal h2{margin-top:0}
.sa-photo{width:94px;height:94px;object-fit:cover;border-radius:50%;display:block;margin:12px auto;background:#e6efe8}
.sa-modal input[type=file]{max-width:100%}
.sa-modal input[type=text]{width:100%;padding:11px;box-sizing:border-box;border:1px solid #aabdae;border-radius:10px}
.sa-modal button{border-radius:10px;padding:10px 13px}
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

function msg(text,error=false){
  const e=root.querySelector('#sa-message');
  if(e){
    e.textContent=text;
    e.classList.toggle('sa-error',error);
  }
}

const avatar=(id,v='')=>
  api.avatarUrl(id)+(v?'?v='+v:'');

function avatarMarkup(id){
  return id
    ?`<img class="sa-avatar"
       src="${esc(avatar(id,Date.now()))}"
       alt="프로필 사진"
       onerror="this.outerHTML='<div class=\\'sa-avatar-empty\\'>🌱</div>'">`
    :'<div class="sa-avatar-empty">🌱</div>';
}

function mount(){
  const app=document.getElementById('app');
  if(!app)return;

  const settings=!!document.querySelector(
    '#nav .nav.active'
  )?.textContent?.includes('마이페이지');

  if(settings){
    if(root.parentElement!==app)app.prepend(root);
  }else{
    root.remove();
  }
}

function draw(){
  root.innerHTML=user
    ?`
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
      <p id="sa-message" class="sa-status" role="status">
        ${ready?'계정 기록을 불러왔어요.':'계정 기록을 불러오는 중…'}
      </p>
    </section>

    <section class="sa-card">
      <h3>나의 성장 현황</h3>
      <div class="sa-stats">
        <div class="sa-stat">
          <span>완성한 나무</span>
          <strong>${Number(profile?.completed_trees||0)}그루</strong>
        </div>
        <div class="sa-stat">
          <span>나무 성장</span>
          <strong>${Math.min(
            5,
            1+Math.floor(Number(profile?.progress||0)/5)
          )}단계</strong>
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
        현재는 자동 서버 저장이 아니에요.
        변경한 기록은 아래 버튼으로 저장해 주세요.
      </p>
      <div class="sa-actions">
        <button id="sa-save" ${ready?'':'disabled'}>
          계정에 저장
        </button>
        <button id="sa-reload">
          서버 기록 불러오기
        </button>
      </div>
      <details style="margin-top:12px">
        <summary>고급 기록 관리</summary>
        <p class="sa-muted">
          기기 기록으로 계정 기록을 교체할 수 있어요.
          기존 기록이 사라질 수 있으니 주의해 주세요.
        </p>
        <button id="sa-import">
          로그인 전 기기 기록 가져오기
        </button>
      </details>
    </section>`
    :`
    <section class="sa-card">
      <h2>소비나무 계정</h2>
      <p class="sa-muted">
        로그인하면 나무 성장과 친구 기능을 이용할 수 있어요.
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
            autocomplete="current-password" placeholder="비밀번호">
        </label>
        <div class="sa-actions">
          <button id="sa-login">로그인</button>
          <button id="sa-signup">회원가입</button>
          <button id="sa-reset">비밀번호 재설정</button>
        </div>
      </div>
      <p id="sa-message" class="sa-status" role="status"></p>
    </section>`;

  const on=(id,fn)=>{
    const el=root.querySelector('#'+id);
    if(el){
      el.onclick=async()=>{
        try{
          await fn();
        }catch(e){
          msg(friendly(e),true);
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
    msg('로그인했어요.');
  });

  on('sa-signup',async()=>{
    const r=await api.signup(
      ...credentials(),
      location.origin+location.pathname
    );
    msg(r.session
      ?'가입했어요.'
      :'가입 신청 완료! 이메일 인증 메일을 확인해 주세요.');
  });

  on('sa-reset',async()=>{
    const email=credentials()[0];
    if(!email)throw Error('이메일을 먼저 입력해 주세요.');
    await api.resetPassword(
      email,
      location.origin+location.pathname
    );
    msg('비밀번호 재설정 메일을 요청했어요.');
  });

  on('sa-logout',async()=>{
    await api.logout();
  });

  on('sa-edit',()=>openEditor());
  on('sa-friends-refresh',()=>refreshFriends());

  on('sa-save',async()=>{
    if(!ready)throw Error(
      '계정 기록을 아직 불러오지 못했어요.'
    );
    const g=epoch;
    const next=await api.save(b.snapshot(),revision);
    if(g!==epoch)return;
    revision=next;
    msg('계정 기록을 저장했어요.');
  });

  on('sa-reload',async()=>{
    if(!confirm(
      '저장하지 않은 변경 사항이 사라질 수 있어요. 계속할까요?'
    ))return;
    await load(user);
  });

  on('sa-import',async()=>{
    if(!ready)throw Error(
      '계정 기록을 먼저 불러와 주세요.'
    );
    if(!confirm(
      '기기 기록으로 계정 기록을 교체할까요? 성장·랭킹 기록은 가져오지 않습니다.'
    ))return;

    const g=epoch;
    const next=b.guest();
    const n=await api.save(next,revision);
    if(g!==epoch)return;
    revision=n;
    b.apply(next);
    msg('기기 기록을 계정에 저장했어요.');
  });

  mount();
  if(user)void refreshFriends();
}

function friendly(e){
  const m=e?.message||String(e);
  return m.includes('INVALID_NICKNAME')
    ?'닉네임 형식을 확인해 주세요.'
    :m.includes('row-level security')
      ?'저장 권한을 확인해 주세요. Supabase 설정이 필요할 수 있어요.'
      :m;
}

async function refreshFriends(){
  if(!user)return;
  const g=epoch;
  const el=root.querySelector('#sa-friends');
  if(!el)return;

  try{
    const friends=await api.friends();
    if(g!==epoch||!el.isConnected)return;

    el.innerHTML=
      `<h4>함께하는 친구 ${friends?.length||0}명</h4>`+
      ((friends||[]).map(f=>`
        <div class="sa-friend">
          <span>${esc(f.nickname||'친구')}</span>
          <span>
            ${Number(f.completed_trees||0)}그루 ·
            ${Number(f.stage||1)}단계
          </span>
        </div>
      `).join('')||
      '<p class="sa-muted">아직 등록된 친구가 없어요.</p>');

  }catch(e){
    if(g===epoch&&el.isConnected){
      el.textContent=
        '친구 현황을 불러오지 못했어요: '+friendly(e);
    }
  }
}

function openEditor(){
  if(!user)return;

  dialog.innerHTML=`
    <h2>프로필 수정</h2>
    <img class="sa-photo"
      src="${esc(avatar(user.id,Date.now()))}"
      alt="프로필 사진 미리보기"
      onerror="this.style.opacity='.3'">

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

  file.onchange=()=>{
    if(file.files[0]){
      dialog.querySelector('.sa-photo').src=
        URL.createObjectURL(file.files[0]);
    }
  };

  dialog.querySelector('#sa-cancel').onclick=()=>{
    dialog.close();
  };

  dialog.querySelector('#sa-photo-delete').onclick=async()=>{
    if(!confirm('프로필 사진을 삭제할까요?'))return;

    try{
      await api.removeAvatar();
      dialog.querySelector('.sa-photo').removeAttribute('src');
      dialog.querySelector('#sa-edit-status').textContent=
        '사진을 삭제했어요.';
      draw();
    }catch(e){
      dialog.querySelector('#sa-edit-status').textContent=
        friendly(e);
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
  const g=++epoch;
  user=next;
  ready=false;
  revision=0;
  profile=null;

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
    b.apply(row?.data??{});
    profile=p;
    ready=true;
    draw();

  }catch(e){
    if(g===epoch){
      msg(
        '계정 기록을 불러오지 못했어요: '+friendly(e),
        true
      );
    }
  }
}

client.auth.onAuthStateChange((event,session)=>{
  if(event==='PASSWORD_RECOVERY'){
    setTimeout(async()=>{
      const password=prompt('새 비밀번호를 입력해 주세요.');
      if(password){
        try{
          await api.changePassword(password);
          msg('비밀번호를 변경했어요.');
        }catch(e){
          msg(friendly(e),true);
        }
      }
    },0);
  }

  if(session?.user?.id===user?.id&&
     event==='TOKEN_REFRESHED')return;

  setTimeout(()=>{
    void load(session?.user??null);
  },0);
});

const observer=new MutationObserver(()=>mount());

observer.observe(
  document.getElementById('app'),
  {childList:true}
);

observer.observe(
  document.getElementById('nav'),
  {childList:true}
);

draw();
