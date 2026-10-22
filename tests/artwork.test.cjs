const {test,after,describe}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
// No resources option: external scripts, images, OAuth and Supabase never load.
const dom=new JSDOM(readFileSync(path.join(root,'index.html'),'utf8'),{
 url:'https://virhang.invalid/',runScripts:'outside-only',pretendToBeVisual:true
});
const w=dom.window;
w.HTMLElement.prototype.scrollIntoView=function(){};
const runtimeErrors=[];w.addEventListener('error',e=>runtimeErrors.push(e.message));
w.eval(readFileSync(path.join(root,'virhang-media.js'),'utf8'));
w.eval(readFileSync(path.join(root,'app.js'),'utf8'));
describe('artwork DOM regression',()=>{
after(()=>{w.close();assert.deepEqual(runtimeErrors,[]);});
const normal={id:'security-test',title:'살별',singer:'체비, 아이네, 비챤',genre:'K-POP',details:[],type:'커버곡',bg:'linear-gradient(135deg,#b3eceb,#dfcef9)',views:0,likes:0};
const render=track=>{const host=w.document.createElement('div');host.innerHTML=w.artLayer({...normal,...track});return host;};
function assertNoMarkupInjection(host){
 assert.equal(host.children.length,2);
 assert.equal(host.querySelectorAll('script,img,iframe,svg,a').length,0);
 for(const el of host.querySelectorAll('*'))for(const attr of el.attributes)assert.ok(!/^on/i.test(attr.name),attr.name);
}
test('existing home, search and ranking tab render without remote services',()=>{
 assert.equal(w.document.querySelectorAll('#songs .song-card').length,4);
 w.document.querySelector('#search').value='별빛';
 w.document.querySelector('#searchForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 assert.equal(w.document.querySelector('#searchCount').textContent,'1');
 w.renderFullRanking();
 assert.equal(w.document.querySelectorAll('[data-rank-mode]').length,8);
});
test('ordinary HTTPS artwork and Unicode titles keep their image and gradient',()=>{
 const host=render({artwork:'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'});
 assertNoMarkupInjection(host);
 assert.match(host.firstElementChild.style.backgroundImage,/https:\/\/i\.ytimg\.com/);
 assert.equal(w.artBg(normal),'background:'+normal.bg);
});
const payloads=[
 'https://example.invalid/x"><img src=x onerror="globalThis.attacked=1">',
 "https://example.invalid/x');color:red;/*",
 'https://example.invalid/x\\"><svg onload=alert(1)>',
 'javascript:alert(1)','data:image/svg+xml,<svg onload=alert(1)>',
 'http://example.invalid/image.png','https://user:password@example.invalid/image.png',
 'https://example.invalid/\nimage.png'
];
for(const payload of payloads)test('untrusted artwork is rejected: '+payload.slice(0,55),()=>{
 assert.equal(w.safeImage(payload),'');
 const host=render({artwork:payload});assertNoMarkupInjection(host);
 assert.match(host.firstElementChild.style.backgroundImage,/data:image\/svg\+xml/);
});
test('CSS parentheses, encoded quotes and ampersands stay inside the image URL',()=>{
 const host=render({artwork:'https://example.invalid/cover(test)%22.png?a=1&b=2'});
 assertNoMarkupInjection(host);
 assert.match(host.firstElementChild.style.backgroundImage,/example\.invalid/);
 assert.equal(host.firstElementChild.attributes.length,2);
});
test('legacy raster data URLs survive; externally supplied SVG falls back',()=>{
 const raster='data:image/png;base64,iVBORw0KGgo=';
 assert.equal(w.safeImage(raster),raster);
 assert.match(render({artwork:raster}).firstElementChild.style.backgroundImage,/data:image\/png/);
 assert.equal(w.safeImage(w.svgPlaceholder('🐠',normal.bg,'제목')),'');
});
test('generated SVG escapes title and symbol as XML text',()=>{
 const uri=w.svgPlaceholder('<>',normal.bg,'<script>&"\'');
 const xml=decodeURIComponent(uri.split(',').slice(1).join(','));
 const svg=new w.DOMParser().parseFromString(xml,'image/svg+xml');
 assert.equal(svg.querySelector('parsererror'),null);
 assert.equal(svg.querySelector('script'),null);
 assert.equal(svg.querySelector('text').textContent,'<>');
 assert.equal(svg.querySelectorAll('text')[1].textContent,'<script>&"\'');
});
test('malicious legacy backgrounds/symbols cannot inject library or artwork markup',()=>{
 const track={...normal,bg:'red"><img src=x onerror=alert(1)>',symbol:'<img src=x onerror=alert(1)>'};
 const host=w.document.createElement('div');host.innerHTML=w.songRow(track,0);
 assert.equal(host.querySelector('img'),null);
 assert.match(w.artBg(track),/^background:linear-gradient/);
 const target=w.document.createElement('div');w.applyArtwork(target,track);assertNoMarkupInjection(target);
});
test('shared track ingestion renders malicious artwork as a safe placeholder',()=>{
 w.virhangSetSharedTracks([{...normal,artwork:payloads[0]}]);
 assert.equal(w.document.querySelector('#songs img'),null);
 assert.equal(w.document.querySelector('#rank img'),null);
});

});
