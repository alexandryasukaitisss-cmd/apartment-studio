import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type {Furniture} from './model';

function roundedOutline(width:number,depth:number,radius:number):THREE.Shape {
  const x=-width/2,z=-depth/2,r=Math.min(radius,width/2,depth/2);
  const s=new THREE.Shape();
  s.moveTo(x+r,z);s.lineTo(x+width-r,z);s.quadraticCurveTo(x+width,z,x+width,z+r);
  s.lineTo(x+width,z+depth-r);s.quadraticCurveTo(x+width,z+depth,x+width-r,z+depth);
  s.lineTo(x+r,z+depth);s.quadraticCurveTo(x,z+depth,x,z+depth-r);
  s.lineTo(x,z+r);s.quadraticCurveTo(x,z,x+r,z);return s;
}

export function furnitureMesh(f:Furniture):THREE.Group {
  const g=new THREE.Group(),W=f.width,D=f.depth,H=f.height;
  const main=new THREE.MeshStandardMaterial({color:f.color,roughness:.86});
  const cushion=main.clone();cushion.color.offsetHSL(0,-.025,.025);cushion.roughness=.96;
  const wood=new THREE.MeshStandardMaterial({color:'#b59b78',roughness:.68});
  const cream=new THREE.MeshStandardMaterial({color:'#e9e3d6',roughness:.94});
  const dark=new THREE.MeshStandardMaterial({color:'#333a37',roughness:.32});
  const white=new THREE.MeshStandardMaterial({color:'#f4f2ec',roughness:.22});
  const basinShade=new THREE.MeshStandardMaterial({color:'#deded5',roughness:.27});
  const metal=new THREE.MeshStandardMaterial({color:'#9aa39e',metalness:.82,roughness:.22});
  const materials:THREE.Material[]=[main,cushion,wood,cream,dark,white,basinShade,metal];
  const add=(geometry:THREE.BufferGeometry,material:THREE.Material,x:number,y:number,z:number)=>{
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);
    mesh.castShadow=!material.transparent;mesh.receiveShadow=true;g.add(mesh);return mesh;
  };
  const box=(w:number,h:number,d:number,x:number,y:number,z:number,mat=main,radius=Math.min(w,h,d)*.08)=>
    add(new RoundedBoxGeometry(w,h,d,2,Math.min(radius,w/2,h/2,d/2)),mat,x,y,z);
  const soft=(w:number,h:number,d:number,x:number,y:number,z:number,mat=cushion)=>
    box(w,h,d,x,y,z,mat,Math.min(w,h,d)*.43);
  const cylinder=(radius:number,height:number,x:number,y:number,z:number,mat=metal)=>
    add(new THREE.CylinderGeometry(radius,radius,height,20),mat,x,y,z);
  const ellipsoid=(w:number,h:number,d:number,x:number,y:number,z:number,mat:THREE.Material)=>{
    const mesh=add(new THREE.SphereGeometry(1,20,12),mat,x,y,z);mesh.scale.set(w/2,h/2,d/2);return mesh;
  };
  const legs=(height:number)=>{
    for(const x of [-W*.39,W*.39])for(const z of [-D*.36,D*.36])
      cylinder(Math.min(W,D)*.038,height,x,height/2,z,wood);
  };
  const pipe=(points:THREE.Vector3[],radius:number)=>
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),16,radius,6,false),metal,0,0,0);
  const faucet=(x:number,y:number,z:number,height:number,reach:number)=>{
    const r=Math.min(W,D)*.013;
    pipe([new THREE.Vector3(x,y,z),new THREE.Vector3(x,y+height*.7,z),
      new THREE.Vector3(x,y+height,z+reach*.35),new THREE.Vector3(x,y+height*.94,z+reach)],r);
    cylinder(r*2.1,r*1.5,x,y,z,metal);
  };
  // An actual hole and inset base show a fixture's basin rather than a blue box.
  const rim=(w:number,d:number,border:number,height:number,x:number,y:number,z:number,mat=white)=>{
    const outer=roundedOutline(w,d,Math.min(w,d)*.19);
    const inner=roundedOutline(w-border*2,d-border*2,Math.min(w,d)*.15);
    outer.holes.push(new THREE.Path(inner.getPoints(8).reverse()));
    const geometry=new THREE.ExtrudeGeometry(outer,{depth:height,bevelEnabled:true,
      bevelThickness:Math.min(border*.16,height*.12),bevelSize:border*.16,bevelSegments:1,curveSegments:6});
    geometry.rotateX(-Math.PI/2);return add(geometry,mat,x,y,z);
  };
  const ring=(w:number,d:number,thickness:number,x:number,y:number,z:number,mat=white)=>{
    const geometry=new THREE.TorusGeometry(1,.075,8,32);geometry.rotateX(-Math.PI/2);
    const mesh=add(geometry,mat,x,y,z);mesh.scale.set(w/2.15,thickness/.15,d/2.15);return mesh;
  };
  // Flat panels and steel members need only twelve triangles per part.
  const panel=(name:string,w:number,h:number,d:number,x:number,y:number,z:number,mat=main)=>{
    const mesh=add(new THREE.BoxGeometry(w,h,d),mat,x,y,z);mesh.name=name;return mesh;
  };

  switch(f.kind){
    case 'workstation': {
      const deskHeight=H*.75/1.3,topThickness=H*.035/1.3;
      panel('desk-top',W,topThickness,D,0,deskHeight-topThickness/2,0);
      for(const x of [-W*.44,W*.44])for(const z of [-D*.4,D*.4])
        panel('desk-leg',W*.028,deskHeight-topThickness,D*.056,x,(deskHeight-topThickness)/2,z,metal);
      const screenX=W*.13,screenZ=-D*.28;
      panel('monitor-base',W*.18,H*.015/1.3,D*.20,screenX,deskHeight+H*.0075/1.3,screenZ,metal);
      panel('monitor-stand',W*.024,H*.21/1.3,D*.04,screenX,deskHeight+H*.105/1.3,screenZ,metal);
      panel('monitor-body',W*.61/1.5,H*.36/1.3,D*.025/.75,screenX,H*1.12/1.3,screenZ,dark);
      panel('monitor-screen',W*.58/1.5,H*.33/1.3,D*.002/.75,screenX,H*1.12/1.3,screenZ+D*.014/.75,basinShade);
      const laptopX=-W*.27,laptopZ=D*.14;
      panel('laptop-base',W*.35/1.5,H*.018/1.3,D*.24/.75,laptopX,deskHeight+H*.009/1.3,laptopZ,metal);
      panel('laptop-keyboard',W*.28/1.5,H*.002/1.3,D*.095/.75,laptopX,deskHeight+H*.019/1.3,laptopZ-D*.035/.75,dark);
      panel('laptop-trackpad',W*.11/1.5,H*.002/1.3,D*.07/.75,laptopX,deskHeight+H*.019/1.3,laptopZ+D*.058/.75,basinShade);
      const lid=panel('laptop-open-lid',W*.35/1.5,H*.22/1.3,D*.009/.75,laptopX,deskHeight+H*.125/1.3,laptopZ-D*.105/.75,metal);
      lid.rotation.x=-.15;
      const laptopScreen=panel('laptop-screen',W*.32/1.5,H*.19/1.3,D*.001/.75,laptopX,deskHeight+H*.125/1.3,laptopZ-D*.099/.75,dark);
      laptopScreen.rotation.x=-.15;
      panel('small-computer',W*.13/1.5,H*.05/1.3,D*.13/.75,W*.38,deskHeight+H*.025/1.3,-D*.20,metal);
      panel('small-computer-ports',W*.045/1.5,H*.006/1.3,D*.002/.75,W*.38,deskHeight+H*.024/1.3,-D*.20+D*.066/.75,dark);
      break;
    }
    case 'bookcase': {
      const side=W*.032,shelf=H*.013;
      for(const x of [-(W-side)/2,(W-side)/2])panel('bookcase-side',side,H,D,x,H/2,0);
      panel('bookcase-back',W,H,D*.06,0,H/2,-D*.47,wood);
      for(let row=0;row<=5;row++)panel('bookcase-shelf',W,shelf,D,0,shelf/2+(H-shelf)*row/5,0);
      for(let row=0;row<5;row++)for(let i=0;i<6;i++){
        const height=H*(.115+(i%3)*.022),base=shelf+(H-shelf)*row/5;
        const book=panel('book',W*.085,height,D*.72,-W*.34+i*W*.134,base+height/2,D*.04,[main,cream,dark,wood][(row+i)%4]);
        panel('book-spine-label',W*.06,height*.04,D*.008,book.position.x,base+height*.72,D*.404,cream);
      }
      break;
    }
    case 'rack': {
      // The narrower frame is about 1.28 m at the default 2 m bar envelope.
      const upright=W*.025,beam=H*.024;
      for(const x of [-W*.3075,W*.3075]){
        panel('rack-foot',upright,beam,D,x,beam/2,0,main);
        for(const z of [-D*.42,D*.42]){
          panel('rack-upright',upright,H,D*.045,x,H/2,z,main);
          for(const y of [.25,.4,.55,.7,.85])panel('rack-adjustment-hole',upright*.45,H*.006,D*.002,x,H*y,z+D*.023,dark);
        }
        panel('rack-side-brace',upright,beam,D*.88,x,H-beam/2,0,main);
      }
      for(const z of [-D*.42,D*.42])panel('rack-crossbar',W*.64,beam,D*.045,0,H-beam/2,z,main);
      panel('rack-low-brace',W*.64,beam,D*.045,0,H*.12,-D*.42,main);
      for(const x of [-W*.3075,W*.3075])panel('bar-support',upright,H*.035,D*.12,x,H*.59,D*.29,metal);
      const bar=add(new THREE.CylinderGeometry(W*.0075,W*.0075,W,12),metal,0,H*.60,D*.25);
      bar.name='barbell';bar.rotation.z=Math.PI/2;
      for(const x of [-W*.42,W*.42]){
        const plate=add(new THREE.CylinderGeometry(H*.105,H*.105,W*.055,20),dark,x,H*.60,D*.25);
        plate.name='weight-plate';plate.rotation.z=Math.PI/2;
        const collar=add(new THREE.CylinderGeometry(W*.026,W*.026,W*.014,12),metal,x+Math.sign(x)*W*.04,H*.60,D*.25);
        collar.name='bar-collar';collar.rotation.z=Math.PI/2;
      }
      break;
    }
    case 'bench': {
      for(const z of [-D*.35,D*.35]){
        panel('bench-foot',W,H*.09,D*.065,0,H*.045,z,main);
        panel('bench-support',W*.11,H*.70,D*.065,0,H*.44,z,metal);
      }
      panel('bench-frame',W*.16,H*.11,D*.87,0,H*.64,0,metal);
      panel('bench-pad',W*.65,H*.20,D,0,H*.90,0,dark);
      break;
    }
    case 'platform':
      panel('platform-base',W,H*.70,D,0,H*.35,0,main);
      panel('platform-wood',W*.60,H*.30,D,0,H*.85,0,wood);
      for(const x of [-W*.4,W*.4])panel('platform-mat',W*.20,H*.30,D,x,H*.85,0,dark);
      break;
    case 'kettlebell': {
      const body=ellipsoid(W,H*.62,D,0,H*.31,0,main);body.name='kettlebell-body';
      panel('kettlebell-base',W*.55,H*.04,D*.60,0,H*.02,0,dark);
      const handle=add(new THREE.TorusGeometry(1,.23,6,16),dark,0,H*.775,0);
      handle.name='kettlebell-handle';handle.scale.set(W*.72/2.46,H*.45/2.46,D*.16/.46);
      break;
    }
    case 'bed': {
      legs(H*.14);box(W,H*.18,D,0,H*.23,0,wood);
      soft(W*.97,H*.27,D*.95,0,H*.44,D*.015,cream);
      box(W,H*.77,D*.052,0,H*.60,-D*.47,main,Math.min(W,D)*.04);
      soft(W*.96,H*.085,D*.59,0,H*.60,D*.18,main);
      for(const x of [-W*.235,W*.235]){
        const pillow=soft(W*.43,H*.18,D*.20,x,H*.64,-D*.30,cream);pillow.rotation.y=x<0?-.05:.05;
      }
      // Thin duvet folds retain softness without an embossed stripe pattern.
      for(const z of [D*.02,D*.13])soft(W*.91,H*.013,D*.035,0,H*.643,z,main);
      break;
    }
    case 'sofa': {
      legs(H*.13);box(W*.95,H*.22,D*.9,0,H*.28,0,main);
      box(W*.94,H*.56,D*.16,0,H*.67,-D*.39,main,Math.min(W,H)*.07);
      for(const x of [-W*.445,W*.445])soft(W*.11,H*.46,D*.96,x,H*.51,0,main);
      const seats=W>1.75?3:2;
      for(let i=0;i<seats;i++){
        const x=(i-(seats-1)/2)*W*.76/seats;
        soft(W*.73/seats,H*.17,D*.72,x,H*.46,D*.07);
        const back=soft(W*.73/seats,H*.37,D*.16,x,H*.72,-D*.29);back.rotation.x=-.10;
      }
      break;
    }
    case 'corner': {
      // Local +Z is the front, matching the facing helper and plan marker.
      legs(H*.13);box(W*.94,H*.22,D*.46,0,H*.28,-D*.23,main);
      box(W*.36,H*.22,D*.90,-W*.29,H*.28,0,main);
      box(W*.93,H*.56,D*.10,0,H*.67,-D*.43,main,Math.min(H,D)*.07).name='corner-back';
      soft(W*.10,H*.44,D*.96,-W*.445,H*.50,0,main);
      for(const x of [-W*.28,0,W*.28]){
        soft(W*.265,H*.17,D*.35,x,H*.46,-D*.22).name='corner-seat';
        soft(W*.26,H*.37,D*.12,x,H*.73,-D*.34).name='corner-back-pillow';
      }
      soft(W*.29,H*.17,D*.40,-W*.29,H*.46,D*.15).name='corner-chaise';
      break;
    }
    case 'table':
      legs(H*.91);box(W,H*.09,D,0,H*.955,0,main,Math.min(W,D)*.025);break;
    case 'chair': {
      legs(H*.43);soft(W*.96,H*.10,D*.94,0,H*.48,0);
      const back=box(W*.95,H*.45,D*.11,0,H*.765,-D*.41,main,Math.min(W,D)*.065);back.rotation.x=-.07;
      for(const x of [-W*.36,W*.36])cylinder(W*.025,H*.44,x,H*.64,-D*.40,wood);
      break;
    }
    case 'wardrobe':
      box(W,H,D,0,H/2,0,cream);
      for(const x of [-W*.25,W*.25]){
        box(W*.484,H*.97,D*.035,x,H*.5,D*.5,main);
        box(W*.015,H*.085,D*.055,x+W*.18,H*.49,D*.54,metal);
      }
      box(W,H*.035,D,0,H*.018,0,wood);break;
    case 'kitchen': {
      const counter=H*.75;
      box(W,H*.70,D,0,H*.35,0,cream);box(W,H*.047,D,0,counter-H*.024,0,wood);
      const count=Math.max(1,Math.round(W/.6));
      for(let i=0;i<count;i++){
        const x=-W/2+(i+.5)*W/count;
        box(W/count*.96,H*.61,D*.025,x,H*.37,D*.51,main);
        box(W/count*.36,H*.014,D*.046,x,H*.59,D*.54,metal);
      }
      box(W*.38,H*.011,D*.76,-W*.26,counter,0,dark);
      for(const dx of [-W*.075,W*.075])for(const dz of [-D*.18,D*.18]){
        const burner=cylinder(Math.min(W*.055,D*.13),H*.012,-W*.26+dx,counter+H*.01,dz,dark);
        burner.material=metal;
      }
      rim(W*.32,D*.68,Math.min(W,D)*.037,H*.02,W*.26,counter,0,metal);
      box(W*.25,H*.012,D*.53,W*.26,counter-H*.02,0,dark);
      faucet(W*.26,counter,-D*.27,H*.24,D*.22);break;
    }
    case 'bath': {
      // The tub has an open interior, rounded apron, rim, drain and tap.
      rim(W,D,Math.min(W,D)*.08,H*.60,0,H*.16,0,main);
      rim(W*.99,D*.99,Math.min(W,D)*.083,H*.042,0,H*.76,0,white);
      soft(W*.82,H*.06,D*.89,0,H*.21,0,basinShade);
      cylinder(W*.027,H*.012,0,H*.246,-D*.29,metal);
      faucet(0,H*.79,-D*.43,H*.20,D*.13);break;
    }
    case 'toilet': {
      soft(W*.50,H*.41,D*.46,0,H*.235,-D*.025,white);
      const profile=[new THREE.Vector2(0,0),new THREE.Vector2(.60,.02),new THREE.Vector2(.92,.40),
        new THREE.Vector2(1,.76),new THREE.Vector2(.98,.87),new THREE.Vector2(.84,.84),
        new THREE.Vector2(.72,.45),new THREE.Vector2(.42,.15),new THREE.Vector2(0,.15)];
      const bowl=add(new THREE.LatheGeometry(profile,28),white,0,H*.33,D*.12);
      bowl.scale.set(W*.46,H*.37,D*.41);
      ring(W*.89,D*.80,H*.026,0,H*.665,D*.12,main);
      box(W*.81,H*.49,D*.27,0,H*.745,-D*.36,white,Math.min(W,D)*.065);
      box(W*.20,H*.017,D*.07,0,H*.995,-D*.36,metal);break;
    }
    case 'fridge':
      box(W,H,D,0,H/2,0,white);
      for(const [height,y]of [[H*.67,H*.655],[H*.28,H*.145]]){
        box(W*.975,height,D*.035,0,y,D*.50,main,Math.min(W,D)*.022);
        box(W*.035,height*.36,D*.065,-W*.34,y,D*.54,metal);
      }
      break;
    case 'television': {
      box(W,H,D,0,H/2,0,dark,Math.min(W,H,D)*.04);
      const screen=new THREE.MeshStandardMaterial({color:'#172936',roughness:.16,metalness:.12,
        emissive:'#17384b',emissiveIntensity:.22});materials.push(screen);
      box(W*.94,H*.91,D*.06,0,H*.515,D*.505,screen,0);
      box(W*.92,H*.012,D*.065,0,H*.982,D*.51,metal,0);
      box(W*.08,H*.013,D*.035,0,H*.028,D*.535,metal,0);
      const light=new THREE.MeshStandardMaterial({color:'#7dd6b3',emissive:'#4dba91',emissiveIntensity:.7});materials.push(light);
      box(W*.006,H*.012,D*.045,W*.43,H*.029,D*.54,light,0);
      // A rear mounting plate is part of the editable envelope, not a wall fixture.
      box(W*.25,H*.35,D*.12,0,H*.5,-D*.48,metal,0);break;
    }
    case 'oven':
    case 'microwave': {
      const microwave=f.kind==='microwave';
      box(W,H,D,0,H/2,0,metal,Math.min(W,D)*.02);
      box(W*.98,H*.96,D*.025,0,H*.5,D*.50,dark,0);
      box(W*(microwave?.71:.84),H*(microwave?.74:.65),D*.03,
        microwave?-W*.11:0,H*(microwave?.5:.42),D*.52,basinShade,0);
      box(W*(microwave?.64:.77),H*(microwave?.66:.57),D*.025,
        microwave?-W*.11:0,H*(microwave?.5:.42),D*.54,dark,0);
      if(microwave){
        box(W*.025,H*.59,D*.065,W*.24,H*.5,D*.56,metal);
        box(W*.13,H*.15,D*.025,W*.39,H*.73,D*.535,dark,0);
        for(const y of [.49,.35,.21])box(W*.08,H*.026,D*.035,W*.39,H*y,D*.55,white,0);
      }else{
        box(W*.68,H*.035,D*.075,0,H*.77,D*.55,metal);
        box(W*.22,H*.065,D*.035,0,H*.9,D*.535,dark,0);
        for(const x of [-W*.32,W*.32]){
          const knob=cylinder(Math.min(W,H)*.04,D*.04,x,H*.9,D*.55,metal);knob.rotation.x=Math.PI/2;
        }
      }
      break;
    }
    case 'dishwasher': {
      box(W,H,D,0,H/2,0,white);
      box(W*.97,H*.85,D*.035,0,H*.49,D*.505,main,0);
      box(W*.97,H*.105,D*.04,0,H*.936,D*.51,metal,0);
      box(W*.52,H*.025,D*.07,0,H*.84,D*.545,metal);
      box(W*.16,H*.04,D*.03,W*.22,H*.94,D*.545,dark,0);
      for(const x of [-W*.31,-W*.23,-W*.15])box(W*.03,H*.025,D*.03,x,H*.94,D*.545,dark,0);
      box(W*.93,H*.055,D*.035,0,H*.032,D*.50,dark,0);break;
    }
    case 'hood': {
      // Chimney, canopy, underside filter and front controls read as a hood.
      box(W*.36,H*.74,D*.40,0,H*.63,-D*.23,metal,0);
      box(W,H*.18,D,0,H*.17,0,metal,0);
      box(W*.80,H*.025,D*.77,0,H*.065,D*.02,dark,0);
      for(const x of [-W*.23,0,W*.23])box(W*.16,H*.006,D*.61,x,H*.047,D*.02,metal,0);
      for(const x of [-W*.35,W*.35])box(W*.10,H*.009,D*.12,x,H*.045,D*.33,cream,0);
      for(const x of [-W*.06,0,W*.06])box(W*.025,H*.026,D*.015,x,H*.18,D*.51,dark,0);break;
    }
    case 'washer': {
      box(W,H,D,0,H/2,0,white,Math.min(W,D)*.03);
      box(W*.94,H*.13,D*.025,0,H*.89,D*.505,main);
      const door=add(new THREE.TorusGeometry(W*.285,W*.039,8,32),metal,0,H*.45,D*.525);
      door.scale.y=Math.min(1,H/W);
      ellipsoid(W*.49,Math.min(W,H)*.49,D*.065,0,H*.45,D*.54,dark);
      box(W*.26,H*.04,D*.024,W*.18,H*.89,D*.54,dark);
      const knob=cylinder(W*.043,D*.035,-W*.29,H*.89,D*.54,metal);knob.rotation.x=Math.PI/2;break;
    }
    case 'vanity':
      legs(H*.10);box(W,H*.62,D,0,H*.39,0,main);
      for(const y of [H*.24,H*.51])box(W*.29,H*.019,D*.04,0,y,D*.53,metal);
      box(W,H*.035,D,0,H*.725,0,white);
      rim(W*.85,D*.87,Math.min(W,D)*.08,H*.085,0,H*.74,0,white);
      soft(W*.64,H*.028,D*.65,0,H*.75,0,basinShade);
      cylinder(W*.021,H*.011,0,H*.767,0,metal);
      faucet(0,H*.79,-D*.32,H*.20,D*.19);break;
    case 'shower': {
      rim(W,D,Math.min(W,D)*.06,H*.033,0,H*.025,0,white);
      box(W*.90,H*.017,D*.90,0,H*.025,0,basinShade);
      cylinder(W*.026,H*.006,0,H*.036,D*.23,metal);
      const glass=new THREE.MeshStandardMaterial({color:'#c4d4cf',transparent:true,opacity:.14,
        roughness:.10,metalness:.06,depthWrite:false,side:THREE.DoubleSide});materials.push(glass);
      const frame=Math.min(W,D)*.020;
      box(frame,H*.95,D,-W*.485,H*.51,0,glass,0);
      box(W,H*.95,frame,0,H*.51,-D*.485,glass,0);
      box(W*.43,H*.95,frame,W*.25,H*.51,D*.485,glass,0);
      for(const [x,z]of [[-W*.48,-D*.48],[-W*.48,D*.48],[W*.48,-D*.48],[W*.48,D*.48]])
        cylinder(frame*.57,H*.96,x,H*.51,z,metal);
      box(W,frame,frame,0,H*.985,-D*.48,metal);
      pipe([new THREE.Vector3(0,H*.45,-D*.44),new THREE.Vector3(0,H*.84,-D*.44),
        new THREE.Vector3(0,H*.90,-D*.28)],frame*.5);
      const head=cylinder(W*.11,H*.010,0,H*.895,-D*.25,metal);head.scale.z=D/W;
      box(W*.16,H*.025,D*.033,0,H*.45,-D*.43,metal);break;
    }
    case 'plant': {
      const pot=add(new THREE.CylinderGeometry(1,.76,1,24),main,0,H*.15,0);
      pot.scale.set(W*.36,H*.30,D*.36);
      ellipsoid(W*.63,H*.015,D*.63,0,H*.303,0,dark);
      const green=new THREE.MeshStandardMaterial({color:'#638065',roughness:.93});materials.push(green);
      for(let i=0;i<10;i++){
        const angle=i*2.4,y=H*(.43+i*.052),x=Math.cos(angle)*W*.24,z=Math.sin(angle)*D*.24;
        pipe([new THREE.Vector3(0,H*.29,0),new THREE.Vector3(x*.35,y*.80,z*.35),new THREE.Vector3(x,y,z)],Math.min(W,D)*.011).material=wood;
        const leaf=ellipsoid(W*.40,H*.025,D*.24,x,y,z,green);leaf.rotation.set(.20,angle,Math.cos(angle)*.26);
      }
      break;
    }
  }
  // Preserve the declared overall envelope even for custom proportions. All
  // geometry remains model-owned so the Scene's disposal traversal owns it.
  const bounds=new THREE.Box3().setFromObject(g,true),size=bounds.getSize(new THREE.Vector3());
  const center=bounds.getCenter(new THREE.Vector3());
  for(const child of g.children){child.position.x-=center.x;child.position.z-=center.z;child.position.y-=bounds.min.y;}
  const normalization=new THREE.Group();for(const child of [...g.children])normalization.add(child);
  normalization.scale.set(W/size.x,H/size.y,D/size.z);
  // Scene inversely scales this group under its scaled apartment root. Keeping
  // the physical elevation inside it preserves metres at every project scale.
  normalization.position.y=f.elevation??0;g.add(normalization);
  g.position.set(f.x,0,f.z);g.rotation.y=-f.rotation*Math.PI/180;
  const used=new Set<THREE.Material>();
  g.traverse(o=>{o.userData.furnitureId=f.id;o.userData.roomId=f.roomId;
    if(o instanceof THREE.Mesh)for(const material of Array.isArray(o.material)?o.material:[o.material])used.add(material);});
  for(const material of materials)if(!used.has(material))material.dispose();
  return g;
}
