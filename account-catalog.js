
 // Existing growth/friend RPCs are intentionally unchanged.
import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm';

export const client=createClient(
  'https://ydmcllobucskfpcraovv.supabase.co',
  'sb_publishable_-nGdJxSWZTSSG0HxIsdkAg_EeV7EC8j'
);

const checked=({data,error})=>{
  if(error)throw error;
  return data;
};

export const api={
  signup:async(email,password,redirect)=>
    checked(await client.auth.signUp({
      email,password,options:{emailRedirectTo:redirect}
    })),

  login:async(email,password)=>
    checked(await client.auth.signInWithPassword({email,password})),

  logout:async()=>checked(await client.auth.signOut()),

  resetPassword:async(email,redirectTo)=>
    checked(await client.auth.resetPasswordForEmail(email,{redirectTo})),

  changePassword:async password=>
    checked(await client.auth.updateUser({password})),

  profile:async()=>
    checked(await client.from('sobi_profiles').select('*').maybeSingle()),

  register:async nickname=>
    checked(await client.rpc('sobi_register',{p_nickname:nickname})),

  reward:async(item,action)=>
    checked(await client.rpc('sobi_reward',{
      p_item:item,p_action:action
    })),

  plant:async()=>
    checked(await client.rpc('sobi_plant')),

  friends:async()=>
    checked(await client.rpc('sobi_friend_summary')),

  load:async()=>
    checked(await client.from('sobi_account_data')
      .select('data,revision,updated_at').maybeSingle()),

  save:async(data,revision)=>
    checked(await client.rpc('sobi_save_account',{
      p_data:data,p_revision:revision
    })),

  // 프로필 사진 업로드
  uploadAvatar:async(file)=>{
    const {data:{user},error}=await client.auth.getUser();
    if(error)throw error;
    if(!user)throw Error('로그인이 필요해요.');

    if(!['image/jpeg','image/png','image/webp'].includes(file.type))
      throw Error('JPG, PNG, WebP 파일만 가능해요.');

    if(file.size>2*1024*1024)
      throw Error('2MB 이하의 사진을 선택해 주세요.');

    const image=await createImageBitmap(file);
    const side=Math.min(image.width,image.height);
    const canvas=document.createElement('canvas');

    canvas.width=canvas.height=256;

    canvas.getContext('2d').drawImage(
      image,
      (image.width-side)/2,
      (image.height-side)/2,
      side,side,0,0,256,256
    );

    image.close?.();

    const blob=await new Promise((resolve,reject)=>
      canvas.toBlob(
        v=>v?resolve(v):reject(Error('사진 변환 실패')),
        'image/webp',.85
      )
    );

    checked(await client.storage.from('sobi-avatars').upload(
      `${user.id}/avatar.webp`,
      blob,
      {
        upsert:true,
        contentType:'image/webp',
        cacheControl:'60'
      }
    ));

    return client.storage.from('sobi-avatars')
      .getPublicUrl(`${user.id}/avatar.webp`).data.publicUrl;
  },

  // 프로필 사진 삭제
  removeAvatar:async()=>{
    const {data:{user},error}=await client.auth.getUser();
    if(error)throw error;
    if(!user)throw Error('로그인이 필요해요.');

    checked(await client.storage.from('sobi-avatars')
      .remove([`${user.id}/avatar.webp`]));
  },

  // 프로필 사진 주소
  avatarUrl:id=>id
    ?client.storage.from('sobi-avatars')
      .getPublicUrl(`${id}/avatar.webp`).data.publicUrl
    :'',

  products:async()=>
    checked(await client.from('sobi_verified_products')
      .select('*')
      .eq('active',true)
      .eq('review_status','approved')
      .eq('in_stock',true)
      .order('id')
      .limit(1000))
};

// A failed request always rejects. There is no local-success fallback.
export function createAccountStore(onState){
  let data=null,revision=0,owner=null,generation=0,loading=true;

  const emit=error=>onState({
    data,revision,owner,loading,error
  });

  async function switchUser(user){
    const g=++generation;
    owner=user?.id||null;
    data=null;
    revision=0;
    loading=true;
    emit(null);

    if(!owner){
      loading=false;
      emit(null);
      return;
    }

    try{
      const row=await api.load();
      if(g!==generation)return;
      data=row?.data??{};
      revision=row?.revision??0;
      loading=false;
      emit(null);
    }catch(e){
      if(g!==generation)return;
      loading=false;
      emit(e);
    }
  }

  const {data:subscription}=client.auth.onAuthStateChange(
    (_event,session)=>{
      void switchUser(session?.user);
    }
  );

  return {
    async save(next){
      if(!owner||loading||data===null)
        throw Error('ACCOUNT_NOT_READY');

      const g=generation;
      const expected=revision;
      const result=await api.save(next,expected);

      if(g!==generation)return;

      revision=result;
      data=structuredClone(next);
      emit(null);
    },

    async importGuest(guest,confirmed){
      if(!confirmed)return;
      await this.save(guest);
    },

    dispose(){
      ++generation;
      subscription.subscription.unsubscribe();
      data=null;
      owner=null;
    }
  };
}

const norm=s=>String(s??'')
  .normalize('NFKC').trim().toLocaleLowerCase();

const evidenceTypes=new Set([
  'reuse','recycled','upcycled','certification','repairability'
]);

const https=s=>{
  try{
    return new URL(s).protocol==='https:';
  }catch{
    return false;
  }
};

export function recommend(rows,{
  name,budget,usage,count=5,priority='usage'
}){
  if(!norm(name)||!norm(usage)||
     !Number.isFinite(+budget)||+budget<0)
    throw Error('INVALID_INPUT');

  const selected=rows.filter(p=>
    p.active&&
    p.review_status==='approved'&&
    p.in_stock&&
    https(p.purchase_url)&&
    Number.isInteger(p.price)&&
    p.price>=0&&
    p.price<=+budget&&
    (
      p.shipping===null||
      (
        Number.isInteger(p.shipping)&&
        p.shipping>=0&&
        p.price+p.shipping<=+budget
      )
    )&&
    [p.name,p.category,...(p.keywords||[])]
      .some(s=>norm(s).includes(norm(name)))&&
    (p.usages||[]).some(s=>norm(s)===norm(usage))&&
    Array.isArray(p.evidence)&&
    p.evidence.some(e=>
      evidenceTypes.has(e.type)&&
      e.verified===true&&
      norm(e.description)&&
      https(e.source)
    )
  );

  const cost=p=>p.price+(p.shipping??0);

  const rank=p=>Math.max(
    0,
    ...p.evidence
      .filter(e=>e.verified===true)
      .map(e=>({
        independently_verified:3,
        official_document:2,
        seller_statement:1
      }[e.verification_level]||0))
  );

  const fit=p=>
    (norm(p.name)===norm(name)?2:0)+
    (p.usages.some(u=>norm(u)===norm(usage))?1:0);

  selected.sort((a,b)=>
    priority==='price'
      ?cost(a)-cost(b)
      :priority==='evidence'
        ?rank(b)-rank(a)||cost(a)-cost(b)
        :fit(b)-fit(a)||cost(a)-cost(b)
  );

  const seen=new Set();

  return selected
    .filter(p=>{
      if(seen.has(p.model_key))return false;
      seen.add(p.model_key);
      return true;
    })
    .slice(0,Math.max(
      1,Math.min(10,Math.trunc(+count)||1)
    ))
    .map(p=>({
      ...p,
      total:p.shipping===null?null:cost(p),
      shippingNotice:p.shipping===null
        ?'배송비 미확인 · 총 결제금액 예산 충족 여부 미확인'
        :'확인 배송비 포함'
    }));
}
