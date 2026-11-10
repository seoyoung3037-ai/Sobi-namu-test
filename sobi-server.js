// Browser ES module. Only use the public publishable/anon key, NEVER service_role.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm';
export function createSobiAPI(url, publicKey) {
 const client=createClient(url,publicKey);
 const unwrap=({data,error})=>{if(error)throw error;return data;};
 const rpc=async(name,args={})=>unwrap(await client.rpc(name,args));
 return {
 client,
 signUp:async(email,password)=>unwrap(await client.auth.signUp({email,password})),
 signIn:async(email,password)=>unwrap(await client.auth.signInWithPassword({email,password})),
 signOut:async()=>unwrap(await client.auth.signOut()),
 profile:async()=>{const u=unwrap(await client.auth.getUser());if(!u?.user)throw Error('LOGIN_REQUIRED');return unwrap(await client.from('sobi_profiles').select('*').eq('user_id',u.user.id).maybeSingle());},
 register:nickname=>rpc('sobi_register',{p_nickname:nickname}),
 reward:(item,action)=>rpc('sobi_reward',{p_item:item,p_action:action}),
 plant:()=>rpc('sobi_plant'),
 requestFriend:code=>rpc('sobi_request_friend',{p_code:code}),
 acceptFriend:sender=>rpc('sobi_accept_friend',{p_sender:sender}),
 removeFriend:other=>rpc('sobi_remove_friend',{p_other:other}),
 friends:()=>rpc('sobi_friend_summary'),
 incoming:()=>rpc('sobi_incoming_requests'),
 ownEvents:async()=>unwrap(await client.from('sobi_events').select('*').order('created_at',{ascending:false})),
 };
}
export function treeView(profile){
 const n=profile.progress;
 return {stage:Math.min(5,1+Math.floor(n/5)),stageRecords:n===25?5:n%5,percent:n===25?100:n%5*20,complete:n===25,completedTrees:profile.completed_trees};
}
