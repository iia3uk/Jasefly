const visitorKey='jasefly_analytics_visitor'
const sessionKey='jasefly_analytics_session'
const token=(key:string,storage:Storage)=>{let value=storage.getItem(key);if(!value){value=crypto.randomUUID();storage.setItem(key,value)}return value}

export function trackAnalytics(event:string,data:Record<string,unknown>={}):void{
  if(navigator.doNotTrack==='1')return
  const payload=JSON.stringify({event,path:location.pathname,referrer:document.referrer,visitor_id:token(visitorKey,localStorage),session_id:token(sessionKey,sessionStorage),...data})
  const url=`${String(import.meta.env.VITE_API_URL||'').replace(/\/$/,'')}/api/v1/analytics/collect`
  if(navigator.sendBeacon){navigator.sendBeacon(url,new Blob([payload],{type:'application/json'}));return}
  void fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:payload,keepalive:true,credentials:'same-origin'})
}
