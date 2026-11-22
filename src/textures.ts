import * as THREE from 'three';
import type {Material} from './model';

// Keep generated previews bounded during repeated colour/size editing. Each
// renderer texture remains owned and disposed by the Scene that requested it.
const cache=new Map<string,string>();
export function materialImage(m:Material):string {
  if(m.image)return m.image;
  const key=`${m.pattern}:${m.color}:${m.width}:${m.height}`;
  const cached=cache.get(key);if(cached)return cached;
  const canvas=document.createElement('canvas');
  const aspect=m.width/m.height;
  canvas.width=Math.max(64,Math.round(aspect<1?512*aspect:512));
  canvas.height=Math.max(64,Math.round(aspect<1?512:512/aspect));
  const ctx=canvas.getContext('2d')!,w=canvas.width,h=canvas.height;
  ctx.fillStyle=m.color;ctx.fillRect(0,0,w,h);
  let seed=127;
  const rand=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  const edges=(jointMetres:number,color:string)=>{
    // Each border is half the joint: adjacent repeats form one physical seam.
    const x=w*jointMetres/m.width/2,y=h*jointMetres/m.height/2;
    ctx.fillStyle=color;
    ctx.fillRect(0,0,x,h);ctx.fillRect(w-x,0,x,h);
    ctx.fillRect(0,0,w,y);ctx.fillRect(0,h-y,w,y);
  };
  if(m.pattern==='wood'){
    // Long, fine fibres vary gently across a plank. Periodic curves meet at
    // both ends instead of introducing conspicuous painted oval "knots".
    for(let i=0;i<220;i++){
      const x=rand()*w,phase=rand()*Math.PI*2,amplitude=w*(.006+rand()*.02);
      ctx.strokeStyle=`rgba(${rand()>.52?'48,35,21':'255,249,237'},${.018+rand()*.052})`;
      ctx.lineWidth=.25+rand()*.55;ctx.beginPath();
      for(let j=0;j<=40;j++){
        const t=j/40,px=x+Math.sin(t*Math.PI*2+phase)*amplitude+
          Math.sin(t*Math.PI*4+phase)*amplitude*.25;
        if(j===0)ctx.moveTo(px,0);else ctx.lineTo(px,t*h);
      }
      ctx.stroke();
    }
    for(let i=0;i<1800;i++){
      ctx.fillStyle=`rgba(${i%2?'255,249,237':'48,35,21'},${rand()*.025})`;
      ctx.fillRect(rand()*w,rand()*h,.35+rand()*.55,1+rand()*4);
    }
    edges(.0007,'rgba(48,35,21,.20)');
  }else if(m.pattern==='stone'||m.pattern==='tile'){
    for(let i=0;i<3800;i++){
      ctx.fillStyle=`rgba(${i%2?'255,254,247':'77,73,64'},${rand()*(m.pattern==='tile'?.045:.065)})`;
      const size=.35+rand()*1.15;
      ctx.fillRect(rand()*w,rand()*h,size,size);
    }
    if(m.pattern==='stone'){
      for(let i=0;i<24;i++){
        const x=rand()*w,y=rand()*h;
        ctx.strokeStyle='rgba(87,80,69,.022)';ctx.lineWidth=.45+rand()*.7;
        ctx.beginPath();ctx.moveTo(x,y);
        ctx.bezierCurveTo(x+w*.08,y+h*.06,x-w*.04,y+h*.14,x+w*.13,y+h*.20);ctx.stroke();
      }
    }else{
      edges(.002,'rgba(213,210,198,.72)');
      // A slight edge shadow suggests the bevel, without a dark thick grid.
      edges(.00045,'rgba(67,65,56,.08)');
    }
  }
  const url=canvas.toDataURL();cache.set(key,url);
  if(cache.size>64)cache.delete(cache.keys().next().value!);
  return url;
}

export function surfaceMaterial(m:Material,w:number,h:number,maxAnisotropy=8,onReady?:()=>void):THREE.MeshStandardMaterial {
  let notify=onReady;
  const texture=new THREE.TextureLoader().load(materialImage(m),()=>{
    notify?.();
  });
  // A replaced scene must not wake up when one of its old photos finishes loading.
  const disposed=()=>{notify=undefined;texture.removeEventListener('dispose',disposed);};
  texture.addEventListener('dispose',disposed);
  texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.repeat.set(w/m.width,h/m.height);texture.center.set(.5,.5);
  texture.rotation=m.rotation*Math.PI/180;texture.anisotropy=Math.min(8,maxAnisotropy);
  return new THREE.MeshStandardMaterial({map:texture,roughness:m.roughness,
    color:m.pattern==='image'?m.color:'#ffffff',side:THREE.DoubleSide});
}
