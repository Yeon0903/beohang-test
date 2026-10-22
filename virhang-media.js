/* Supported source URLs are parsed, not embedded as arbitrary HTML. */
window.virhangMedia=(()=>{
 function parse(value){
  try{
   const u=new URL(String(value).trim());if(u.protocol!=="https:")return null;
   const host=u.hostname.toLowerCase().replace(/^www\./,"");let id="";
   if(host==="youtu.be")id=u.pathname.split("/")[1];
   else if(["youtube.com","m.youtube.com","music.youtube.com"].includes(host))id=u.pathname==="/watch"?u.searchParams.get("v"):u.pathname.match(/^\/(?:shorts|live|embed)\/([^/]+)/)?.[1];
   if(id&&/^[a-zA-Z0-9_-]{11}$/.test(id))return {platform:"youtube",video:id,url:"https://www.youtube.com/watch?v="+encodeURIComponent(id)};
   // Official SOOP clip, Catch and VOD-player URLs. A VOD playlist path is retained
   // so the original selection is not lost. Never accept lookalike/third-party hosts.
   const soopHosts=["sooplive.com","afreecatv.com"];
   if(soopHosts.some(d=>host===d||host.endsWith("."+d)) && !u.username && !u.password && !u.port){
    const vodHost=["vod.sooplive.com","vod.afreecatv.com"].includes(host);
    const vodPath=/^\/player\/([0-9]+)(?:\/playlist\/([0-9]+))?\/?$/.exec(u.pathname);
    if(vodHost && vodPath){
     return {platform:"soop",kind:"vod",video:u.toString(),url:u.toString()};
    }
    if(/(?:clip|catch)/i.test(host+u.pathname) && u.pathname.length>1){
     return {platform:"soop",kind:"clip",video:u.toString(),url:u.toString()};
    }
   }
  }catch(_){ }
  return null;
 }
 return {parse};
})();
