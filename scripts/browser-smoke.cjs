// Offline Chromium only. All application requests are intercepted; never calls real Auth/DB/SOOP/YouTube.
const {chromium}=require('playwright-core');const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
async function run(){
 const browser=await chromium.launch({executablePath:process.env.VIRHANG_BROWSER_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-crash-reporter']});
 const checks=[],errors=[];let blocked=0;
 try{
  const context=await browser.newContext({viewport:{width:1365,height:900},serviceWorkers:'block'});
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin==='https://virhang.invalid'){
    const target=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
    if(target.startsWith(root+path.sep)&&fs.existsSync(target)&&fs.statSync(target).isFile()&&/\.(html|js|css)$/.test(target))return route.fulfill({body:fs.readFileSync(target),contentType:target.endsWith('.js')?'application/javascript':target.endsWith('.css')?'text/css':'text/html'});
    return route.fulfill({status:404,body:''});
   }
   if(url.hostname==='cdn.jsdelivr.net')return route.fulfill({contentType:'application/javascript',body:'window.__clientCreated=0;window.supabase={createClient(){window.__clientCreated++;throw new Error("No real client allowed in offline test")}};'});
   blocked++;return route.abort();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://virhang.invalid/',{waitUntil:'load'});
  assert.equal(await page.locator('#songs .song-card').count(),4);checks.push('home renders four cards');
  await page.click('#siteSidebar [data-nav="songs"]');assert.equal(await page.locator('#songs .song-card').count(),8);checks.push('song navigation keeps eight samples');
  await page.fill('#search','별빛');await page.click('#searchForm button');assert.equal(await page.locator('#searchCount').textContent(),'1');checks.push('search returns expected sample');
  await page.click('#siteSidebar [data-nav="rank"]');assert.equal(await page.locator('[data-rank-mode]').count(),8);await page.click('[data-rank-mode="likes"]');assert.match(await page.locator('#rankCategoryTitle').textContent(),/좋아요/);checks.push('ranking modes and empty state work');
  await page.click('#accountEntry');await page.click('#virGoSignup');await page.click('#virPreviewOtp');assert.equal(await page.locator('#virPreviewNotice').isVisible(),true);await page.click('#virBack');await page.click('#virBackToLogin');await page.click('#accountClose');checks.push('signup and OTP preview navigation works without sending mail');
  assert.equal(await page.locator('#virAdminOpen').isVisible(),false);assert.equal(await page.locator('#add').isVisible(),false);checks.push('guest management controls remain hidden (UI only)');
  await page.click('#siteSidebar [data-nav="home"]');
  await page.evaluate(()=>{
   window.__artworkExecuted=0;
   window.virhangSetSharedTracks([{id:'offline-test',title:'별빛 검증',singer:'검증 가수',genre:'K-POP',details:[],type:'커버곡',views:0,likes:0,artwork:'https://image.invalid/x"><img src=x onerror="window.__artworkExecuted=1">'}]);
  });
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>window.__artworkExecuted),0);assert.equal(await page.locator('#songs img').count(),0);assert.match(await page.locator('#songs .art-image-layer').first().evaluate(el=>el.style.backgroundImage),/data:image\/svg\+xml/);checks.push('malicious artwork creates no injected element and uses safe SVG');
  assert.equal(await page.evaluate(()=>window.__clientCreated),0);checks.push('no Supabase client or live credentials used');
  assert.deepEqual(errors,[]);
  return {scope:'offline real Chromium; routes intercepted, public-key placeholder, no real login/media',browser:await browser.version(),passed:checks.length,failed:0,checks,blockedExternalRequests:blocked,pageErrors:errors,notVerified:['Supabase JWT/PostgREST','live login/SMTP/MFA','YouTube/SOOP playback','deployed site']};
 }finally{await browser.close();}
}
if(require.main===module)run().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={run};
