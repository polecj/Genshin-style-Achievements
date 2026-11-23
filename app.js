'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const KEY = 'genshin-achievement-studio-v2';
  const presets={original:'原版',jiaoda:'交大',gemini:'Gemini',claude:'Claude',deepseek:'DeepSeek',doubao:'豆包',gpt:'GPT',qwen:'千问'};
  const segmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'});
  function firstEmoji(value) {
    return [...segmenter.segment(value)].map(part=>part.segment).find(part=>
      /\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]\uFE0F?\u20E3/u.test(part)) || '';
  }
  const defaults = {
    title: '捕风的异乡人', icon: 'original', emoji:'⭐', autoFit: true, textWidth: 2260,
    titleStyle: {x:1195,y:493,size:216,color:'#303039'}
  };
  const clone = value => JSON.parse(JSON.stringify(value));
  let state = clone(defaults), ready = false, frame = 0;
  let canSave = true;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && typeof saved === 'object') {
      if (typeof saved.title === 'string') state.title = saved.title.slice(0,300);
      if ([...Object.keys(presets),'emoji'].includes(saved.icon)) state.icon=saved.icon;
      if(typeof saved.emoji==='string') state.emoji=firstEmoji(saved.emoji)||defaults.emoji;
      if (typeof saved.autoFit === 'boolean') state.autoFit = saved.autoFit;
      if (Number.isFinite(saved.textWidth)) state.textWidth = Math.max(100,Math.min(2400,saved.textWidth));
      for (const key of ['titleStyle']) {
        const s = saved[key];
        if (!s || typeof s !== 'object') continue;
        for (const p of ['x','y','size']) if (Number.isFinite(s[p])) state[key][p] = Math.max(p === 'size' ? 12 : 0,Math.min(p === 'size' ? 400 : p === 'x' ? 3872 : 1120,s[p]));
        if (/^#[0-9a-f]{6}$/i.test(s.color)) state[key].color = s.color;
      }
    }
  } catch { canSave = false; }
  const canvas = document.createElement('canvas');canvas.width=3872;canvas.height=1120;
  const ctx = canvas.getContext('2d');
  const outputCanvas = document.createElement('canvas');
  const previewImage = $('previewImage');
  let viewer;
  const image = new Image(), frameImage = new Image();
  const icons = Object.fromEntries(Object.keys(presets).map(key=>[key,new Image()]));
  const emojiCanvas=document.createElement('canvas');emojiCanvas.width=emojiCanvas.height=768;
  let emojiCache='',emojiPreviewURL='';
  // Rebuild the candidate cards from the preset registry.
  $('iconMenu').replaceChildren();
  for(const [key,name] of [...Object.entries(presets),['emoji','Emoji']]) {
    const button=document.createElement('button');button.type='button';button.dataset.icon=key;
    button.setAttribute('aria-pressed',String(key===state.icon));
    const thumbnail=document.createElement('img');thumbnail.alt=name;thumbnail.width=thumbnail.height=76;
    const label=document.createElement('span');label.textContent=name;
    button.append(thumbnail,label);$('iconMenu').append(button);
  }
  function makeEmoji() {
    if(emojiCache===state.emoji) return emojiCanvas;
    emojiCache=state.emoji;
    const c=emojiCanvas.getContext('2d',{willReadFrequently:true}),s=768;
    c.clearRect(0,0,s,s);c.font='600px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
    c.textAlign='center';c.textBaseline='middle';c.fillStyle='#000';c.fillText(state.emoji,s/2,s/2);
    // Keep only the glyph alpha silhouette, never its original RGB colors.
    const pixels=c.getImageData(0,0,s,s);let left=s,top=s,right=0,bottom=0;
    for(let y=0;y<s;y++) for(let x=0;x<s;x++) if(pixels.data[(y*s+x)*4+3]>8){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    const mask=document.createElement('canvas');mask.width=mask.height=s;
    if(right>left && bottom>top) {
      const width=right-left+1,height=bottom-top+1,fit=Math.min(700/width,700/height);
      mask.getContext('2d').drawImage(emojiCanvas,left,top,width,height,(s-width*fit)/2,(s-height*fit)/2,width*fit,height*fit);
    }
    c.clearRect(0,0,s,s);c.drawImage(mask,0,0);c.globalCompositeOperation='source-in';
    const gradient=c.createLinearGradient(0,34,0,734);
    gradient.addColorStop(0,'#ffe692');gradient.addColorStop(.45,'#efc65c');gradient.addColorStop(1,'#a76a1c');
    c.fillStyle=gradient;c.fillRect(0,0,s,s);c.globalCompositeOperation='source-over';
    emojiPreviewURL=emojiCanvas.toDataURL('image/png');
    return emojiCanvas;
  }
  // Independent icon slot; new presets only need an asset and a selector option.
  const iconSlot = {x:400,y:210,width:665,height:735};
  const fields = ['title','icon','autoFit','textWidth'];
  const groups = [['titleStyle','成就标题']];
  for (const [key,label] of groups) {
    const group = document.createElement('div'); group.className='style-group';
    const grid = document.createElement('div'); grid.className='style-grid'; group.append(grid);
    for (const [property,name,min,max] of [['size','字号',12,400],['color','颜色'],['x','X 坐标',0,3872],['y','Y 坐标',0,1120]]) {
      const labelEl=document.createElement('label'); labelEl.textContent=name;
      const input=document.createElement('input'); input.id=key+'-'+property; input.type=property==='color'?'color':'number';
      input.value=state[key][property];
      if (property!=='color') {input.min=min;input.max=max;input.step=1;}
      input.addEventListener('input',()=>{
        if (property==='color') state[key][property]=input.value;
        else if (input.value!=='' && input.validity.valid) state[key][property]=Number(input.value);
        save(); schedule();
      });
      labelEl.append(input); grid.append(labelEl);
    }
    $('styleControls').append(group);
  }
  function sync() {
    for(const key of fields) {if(key==='autoFit') $(key).checked=state[key]; else $(key).value=state[key];}
    for(const [key] of groups) for(const property of ['x','y','size','color']) $(key+'-'+property).value=state[key][property];
  }
  function save() {
    try {localStorage.setItem(KEY,JSON.stringify(state));} catch {canSave=false;}
    if(!canSave) $('saveStatus').textContent='当前浏览器不允许本地保存；仍可编辑和导出。';
  }
  function schedule() {cancelAnimationFrame(frame);frame=requestAnimationFrame(render);}
  function effectiveTitle() {return state.title.trim()?state.title:defaults.title;}
  function setFont(size) {ctx.font=`${size}px Achievement`;ctx.textBaseline='top';ctx.textAlign='left';}
  function render() {
    cancelAnimationFrame(frame);
    if(!ready) return;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if(state.icon==='original') ctx.drawImage(image,0,0);
    else {
      ctx.drawImage(frameImage,0,0);
      const icon=state.icon==='emoji'?makeEmoji():icons[state.icon];
      const iw=icon.naturalWidth||icon.width,ih=icon.naturalHeight||icon.height;
      const fit=Math.min(iconSlot.width/iw,iconSlot.height/ih);
      const w=iw*fit,h=ih*fit;
      ctx.drawImage(icon,iconSlot.x+(iconSlot.width-w)/2,iconSlot.y+(iconSlot.height-h)/2,w,h);
    }
    // Fixed label: not part of editable or persisted state.
    setFont(166);ctx.fillStyle='#896226';ctx.fillText('成就达成',1195,280);
    document.querySelectorAll('[data-icon]').forEach(button=>{
      button.setAttribute('aria-pressed',String(button.dataset.icon===state.icon));
      const thumbnail=button.querySelector('img');
      if(button.dataset.icon==='emoji') makeEmoji();
      const src=button.dataset.icon==='emoji'?emojiPreviewURL:icons[button.dataset.icon].src;
      if(thumbnail.src!==src) thumbnail.src=src;
    });
    const style=state.titleStyle, text=effectiveTitle();
    let size=style.size;setFont(size);
    const width=Math.max(1,Math.min(state.textWidth,3520-style.x));
    const measured=ctx.measureText(text).width;
    if(state.autoFit && measured>width) {size=Math.max(12,size*width/measured);setFont(size);}
    ctx.fillStyle=style.color;ctx.fillText(text,style.x,style.y);
    $('warning').textContent=text && (style.y+size>960 || style.x<1100 || ctx.measureText(text).width>width+1)
      ? '标题超出区域，请调整字号或位置' : '';
    updatePreview();
  }
  function updatePreview() {
    const scale=Number($('scale').value);
    outputCanvas.width=Math.round(canvas.width*scale);outputCanvas.height=Math.round(canvas.height*scale);
    const output=outputCanvas.getContext('2d');output.imageSmoothingQuality='high';
    output.drawImage(canvas,0,0,outputCanvas.width,outputCanvas.height);
    const previewSource=$('hdPreview').checked?canvas:outputCanvas;
    previewImage.src=previewSource.toDataURL('image/png');
    previewImage.width=previewSource.width;previewImage.height=previewSource.height;
    previewImage.alt=`${effectiveTitle()} · ${previewSource.width} × ${previewSource.height}`;
    $('previewSize').textContent=`${outputCanvas.width} × ${outputCanvas.height} px`;
    if(viewer) viewer.update();
  }
  $('scale').addEventListener('change',()=>{if(ready) render();});
  $('hdPreview').addEventListener('change',()=>{if(ready) updatePreview();});
  $('openPreview').addEventListener('click',()=>{if(ready && viewer) viewer.show();});
  for(const key of fields) $(key).addEventListener('input',()=>{
    if(key==='autoFit') state[key]=$(key).checked;
    else if(key==='textWidth') {if(!$(key).value || !$(key).validity.valid)return;state[key]=Number($(key).value);}
    else state[key]=$(key).value;
    save();schedule();
  });
  document.querySelectorAll('[data-icon]').forEach(button=>button.addEventListener('click',()=>{
    $('icon').value=button.dataset.icon;
    $('icon').dispatchEvent(new Event('input'));
  }));
  $('emoji').value=state.emoji;
  function applyEmoji(inserted='') {
    const value=$('emoji').value;
    const candidates=[...segmenter.segment(inserted||value)].map(part=>part.segment).filter(part=>firstEmoji(part));
    const emoji=candidates.at(-1)||'';
    if(!emoji) {$('emojiStatus').textContent=value?'请输入 Emoji':'';return;}
    $('emojiStatus').textContent='';$('emoji').value=emoji;state.emoji=emoji;
    state.icon='emoji';$('icon').value='emoji';save();schedule();
  }
  let composing=false;
  $('emoji').addEventListener('compositionstart',()=>{composing=true;});
  $('emoji').addEventListener('compositionend',event=>{composing=false;applyEmoji(event.data||'');});
  $('emoji').addEventListener('input',event=>{if(!composing) applyEmoji(event.data||'');});
  $('emoji').addEventListener('paste',event=>{
    const pasted=event.clipboardData?.getData('text')||'';
    if(firstEmoji(pasted)){event.preventDefault();applyEmoji(pasted);}
  });
  $('emoji').addEventListener('blur',()=>{if(!firstEmoji($('emoji').value)) $('emoji').value=state.emoji;});
  $('reset').addEventListener('click',()=>{
    for(const [key] of groups) state[key]=clone(defaults[key]);
    state.textWidth=defaults.textWidth;state.autoFit=true;sync();save();schedule();
  });
  document.querySelectorAll('[data-theme]').forEach(button=>button.addEventListener('click',()=>{
    $('stage').classList.remove('grid','dark','light');
    $('stage').classList.add(button.dataset.theme);
    document.querySelectorAll('[data-theme]').forEach(b=>b.classList.toggle('active',b===button));
  }));
  $('download').addEventListener('click',async()=>{
    if(!ready) return;
    const button=$('download');button.disabled=true;
    try {
      render();
      const blob=await new Promise(resolve=>outputCanvas.toBlob(resolve,'image/png'));
      if(!blob) throw new Error('PNG 编码失败');
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download=effectiveTitle().trim().replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,80)+'.png';
      document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
    } catch(error) {$('warning').textContent='导出失败：'+error.message;} finally {button.disabled=false;}
  });
  sync();
  async function init() {
    try {
      const assets=window.ACHIEVEMENT_ASSETS;
      if(!assets) throw new Error('缺少 assets.js，请保持项目文件完整');
      const font=new FontFace('Achievement',`url(${assets.font})`);
      function loadImage(target,src) {return new Promise((resolve,reject)=>{target.onload=resolve;target.onerror=()=>reject(new Error('素材加载失败'));target.src=src;});}
      const imageReady=Promise.all([
        loadImage(image,assets.background),loadImage(frameImage,assets.frame),
        ...Object.entries(icons).map(([key,target])=>loadImage(target,assets.icons[key]))
      ]);
      const [loadedFont]=await Promise.all([font.load(),imageReady]);document.fonts.add(loadedFont);await document.fonts.ready;
      if(typeof Viewer!=='function') throw new Error('大图查看器加载失败');
      viewer=new Viewer(previewImage,{
        navbar:false,transition:false,title:true,
        toolbar:{zoomIn:1,zoomOut:1,oneToOne:1,reset:1},
        tooltip:true,rotatable:false,scalable:false,
        toggleOnDblclick:true,zoomRatio:0.15,
        maxZoomRatio:8,minZoomRatio:0.05
      });
      ready=true;render();$('loading').hidden=true;$('download').disabled=false;$('openPreview').disabled=false;
      document.documentElement.dataset.ready='true';
      // A small browser-test surface; no network or upload API.
      window.achievementStudio={render,getState:()=>clone(state),canvas,outputCanvas,getViewer:()=>viewer};
    } catch(error) {$('loading').textContent='加载失败：'+error.message;document.documentElement.dataset.ready='error';}
  }
  init();
})();
