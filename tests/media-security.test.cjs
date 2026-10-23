const {test,describe}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
const ctx={window:{},URL};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../virhang-media.js'),'utf8'),ctx);
describe('media URL client-side regression',()=>{
 for(const url of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ','https://youtu.be/dQw4w9WgXcQ','https://www.youtube.com/shorts/dQw4w9WgXcQ','https://vod.sooplive.com/player/123/playlist/456','https://clip.sooplive.com/player/123'])test('valid source '+url,()=>assert.ok(ctx.window.virhangMedia.parse(url)));
 for(const url of ['https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ','https://www.youtube.com:8080/watch?v=dQw4w9WgXcQ','https://youtube.com.evil.invalid/watch?v=dQw4w9WgXcQ','https://vod.sooplive.com.evil.invalid/player/123','javascript:alert(1)','http://youtu.be/dQw4w9WgXcQ','https://www.youtube.com/watch?v=dQw4w9WgXcQ&x="<script>'])test('invalid source '+url,()=>assert.equal(ctx.window.virhangMedia.parse(url),null));
});
