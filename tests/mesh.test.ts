import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {furnitureMesh} from '../src/furniture';
import {materialImage,surfaceMaterial} from '../src/textures';
import {makeFurniture,furnitureFront,type Kind,type Furniture,type Material} from '../src/model';
import {catalog} from '../src/furnitureCatalog';

const kinds:Kind[]=['bed','sofa','table','chair','wardrobe','kitchen','bath','toilet','plant',
  'corner','fridge','shower','vanity','washer','television','oven','microwave','dishwasher','hood',
  'workstation','bookcase','rack','bench','platform','kettlebell'];
const near=(actual:number,expected:number,message:string)=>assert.ok(Math.abs(actual-expected)<.000002,
  `${message}: got ${actual}, expected ${expected}`);
function dispose(root:THREE.Object3D){
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
  root.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);
    for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);}});
  for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();
}
function checkEnvelope(f:Furniture,root:THREE.Object3D){
  const bounds=new THREE.Box3().setFromObject(root,true),size=bounds.getSize(new THREE.Vector3());
  near(size.x,f.width,`${f.kind} width`);near(size.z,f.depth,`${f.kind} depth`);
  near(size.y,f.height,`${f.kind} height`);near(bounds.min.y,f.elevation??0,`${f.kind} base`);
  const center=bounds.getCenter(new THREE.Vector3());near(center.x,f.x,`${f.kind} centred X`);
  near(center.z,f.z,`${f.kind} centred Z`);
}

for(const kind of kinds){
  test(`${kind}: actual vertex envelope matches default and custom overall dimensions`,()=>{
    for(const override of [{},{width:1.37,depth:.73,height:1.13},{width:.37,depth:.91,height:.28},
      {width:2.7,depth:.43,height:.35}]){
      const f={...makeFurniture(kind,'living',2.3,4.1),...override},mesh=furnitureMesh(f);
      try{checkEnvelope(f,mesh);}finally{dispose(mesh);}
    }
  });
  test(`${kind}: rotation, translation and apartment scale preserve physical dimensions`,()=>{
    const f={...makeFurniture(kind,'living',2.3,4.1),width:1.37,depth:.73,height:1.13,rotation:90};
    const mesh=furnitureMesh(f);
    try{
      const size=new THREE.Box3().setFromObject(mesh,true).getSize(new THREE.Vector3());
      near(size.x,f.depth,'rotated width');near(size.z,f.width,'rotated depth');near(size.y,f.height,'rotated height');
      const parent=new THREE.Group();parent.add(mesh);
      for(const scale of [.5,1,2]){
        parent.scale.setScalar(scale);mesh.scale.setScalar(1/scale);
        const world=new THREE.Box3().setFromObject(parent,true),worldSize=world.getSize(new THREE.Vector3());
        near(worldSize.x,f.depth,'scaled rotated width');near(worldSize.z,f.width,'scaled rotated depth');
        near(worldSize.y,f.height,'scaled height');near(world.min.y,f.elevation??0,'scaled base');
        near(world.max.y,(f.elevation??0)+f.height,'scaled top');
        const center=world.getCenter(new THREE.Vector3());near(center.x,f.x*scale,'scaled position X');
        near(center.z,f.z*scale,'scaled position Z');
      }
    }finally{dispose(mesh);}
  });
}

test('corner sofa back and pillows sit behind the seats; chaise extends along the canonical front',()=>{
  for(const dimensions of [{},{width:1.37,depth:.73,height:1.13}])
    for(const rotation of [0,90,180,270]){
      const f={...makeFurniture('corner','living',2.3,4.1),...dimensions,rotation,elevation:.2};
      const mesh=furnitureMesh(f);
      try{
        mesh.updateMatrixWorld(true);
        const back=mesh.getObjectByName('corner-back')!,chaise=mesh.getObjectByName('corner-chaise')!;
        assert.ok(back&&chaise,'semantic back and chaise parts exist');
        const parts:THREE.Object3D[]=[];
        mesh.traverse(part=>{if(part.name==='corner-seat'||part.name==='corner-back-pillow')parts.push(part);});
        const seats=parts.filter(part=>part.name==='corner-seat'),pillows=parts.filter(part=>part.name==='corner-back-pillow');
        assert.equal(seats.length,3);assert.equal(pillows.length,3);
        const [fx,fz]=furnitureFront(rotation),front=new THREE.Vector3(fx,0,fz);
        const position=(part:THREE.Object3D)=>part.getWorldPosition(new THREE.Vector3());
        const backPosition=position(back),chaisePosition=position(chaise);
        for(let i=0;i<seats.length;i++){
          const seatPosition=position(seats[i]),pillowPosition=position(pillows[i]);
          assert.ok(seatPosition.clone().sub(backPosition).dot(front)>0,'seat is in front of the back');
          assert.ok(pillowPosition.clone().sub(backPosition).dot(front)>0,'pillow is in front of the back');
          assert.ok(seatPosition.clone().sub(pillowPosition).dot(front)>0,'pillow is behind the seat');
          assert.ok(chaisePosition.clone().sub(seatPosition).dot(front)>0,'chaise extends forward');
        }
        const size=new THREE.Box3().setFromObject(mesh,true).getSize(new THREE.Vector3());
        near(size.x,rotation%180===0?f.width:f.depth,'corner rotated width');
        near(size.z,rotation%180===0?f.depth:f.width,'corner rotated depth');
        near(size.y,f.height,'corner height');
        near(new THREE.Box3().setFromObject(mesh,true).min.y,.2,'corner elevation');
        near(mesh.rotation.y,-rotation*Math.PI/180,'stored rotation is applied directly');
      }finally{dispose(mesh);}
    }
});

test('arbitrary rotation keeps every actual vertex inside the declared oriented footprint',()=>{
  for(const kind of kinds){
    const f={...makeFurniture(kind,'living',1.23,4.56),width:1.37,depth:.73,height:1.13,rotation:37};
    const mesh=furnitureMesh(f),a=f.rotation*Math.PI/180;
    try{
      mesh.updateMatrixWorld(true);
      mesh.traverse(object=>{if(!(object instanceof THREE.Mesh))return;
        const positions=object.geometry.getAttribute('position');
        for(let i=0;i<positions.count;i++){
          const p=new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(object.matrixWorld);
          const x=(p.x-f.x)*Math.cos(a)+(p.z-f.z)*Math.sin(a);
          const z=-(p.x-f.x)*Math.sin(a)+(p.z-f.z)*Math.cos(a);
          assert.ok(Math.abs(x)<=f.width/2+.000002,`${kind} X`);
          assert.ok(Math.abs(z)<=f.depth/2+.000002,`${kind} Z`);
          assert.ok(p.y>=(f.elevation??0)-.000002&&p.y<=(f.elevation??0)+f.height+.000002,`${kind} Y`);
        }
      });
    }finally{dispose(mesh);}
  }
});

test('appliance presets match their full envelope and contain front-facing model details',()=>{
  for(const preset of catalog.filter(p=>['television','oven','microwave','dishwasher','hood'].includes(p.kind))){
    const [width,depth,height]=preset.dims;
    const f={...makeFurniture(preset.kind,'living',0,0),width,depth,height,
      elevation:preset.elevation??0},mesh=furnitureMesh(f);
    try{
      checkEnvelope(f,mesh);
      let parts=0,frontDetails=0;
      mesh.updateMatrixWorld(true);
      mesh.traverse(object=>{if(!(object instanceof THREE.Mesh))return;
        parts++;
        const bounds=new THREE.Box3().setFromObject(object,true);
        if(bounds.min.z>0)frontDetails++;
        assert.equal(object.userData.furnitureId,f.id);
      });
      assert.ok(parts>=4,`${preset.name}: multipart model`);
      assert.ok(frontDetails>=1,`${preset.name}: readable front details`);
    }finally{dispose(mesh);}
  }
});

test('legacy furniture without elevation remains on the floor, including appliance imports',()=>{
  for(const kind of kinds){
    const f=makeFurniture(kind,'living',0,0);delete f.elevation;
    const mesh=furnitureMesh(f);
    try{checkEnvelope(f,mesh);}finally{dispose(mesh);}
  }
});

test('all furniture variants have finite geometry with a modest triangle budget',()=>{
  for(const kind of kinds){
    const mesh=furnitureMesh(makeFurniture(kind,'living',0,0));let triangles=0;
    try{mesh.traverse(object=>{if(!(object instanceof THREE.Mesh))return;
      const positions=object.geometry.getAttribute('position');
      for(let i=0;i<positions.array.length;i++)assert.ok(Number.isFinite(positions.array[i]),kind);
      triangles+=(object.geometry.index?.count??positions.count)/3;
      assert.equal(object.userData.roomId,'living');
    });assert.ok(triangles>0&&triangles<15000,`${kind}: ${triangles} triangles`);
    }finally{dispose(mesh);}
  }
});

test('office assemblies have recognizable parts, physical workstation proportions and the full bar envelope',()=>{
  const expected={workstation:['desk-top','monitor-body','laptop-open-lid','small-computer'],
    bookcase:['bookcase-side','bookcase-shelf','book'],rack:['rack-upright','barbell','weight-plate'],
    bench:['bench-foot','bench-pad'],platform:['platform-wood','platform-mat'],
    kettlebell:['kettlebell-body','kettlebell-handle']};
  for(const kind of Object.keys(expected) as (keyof typeof expected)[]){
    const f=makeFurniture(kind,'bed3',0,0),mesh=furnitureMesh(f);
    try{
      checkEnvelope(f,mesh);
      for(const part of expected[kind])assert.ok(mesh.getObjectByName(part),`${kind}: ${part}`);
      const size=(name:string)=>new THREE.Box3().setFromObject(mesh.getObjectByName(name)!,true).getSize(new THREE.Vector3());
      if(kind==='workstation'){
        near(new THREE.Box3().setFromObject(mesh.getObjectByName('desk-top')!,true).max.y,.75,'desk top');
        near(size('monitor-body').x,.61,'monitor width');near(size('monitor-body').y,.36,'monitor height');
        near(size('laptop-base').x,.35,'laptop width');near(size('laptop-base').z,.24,'laptop depth');
        near(size('small-computer').x,.13,'small computer width');near(size('small-computer').y,.05,'small computer height');
      }
      if(kind==='rack'){
        near(size('barbell').x,2,'entire bar length');near(size('rack-crossbar').x,1.28,'frame width');
      }
      let triangles=0;
      mesh.traverse(o=>{if(o instanceof THREE.Mesh)triangles+=(o.geometry.index?.count??o.geometry.getAttribute('position').count)/3;});
      assert.ok(triangles<2000,`${kind}: ${triangles} triangles`);
    }finally{dispose(mesh);}
  }
});

test('bath and vanity contain open basins, and sofa/bed upholstery has rounded edges',()=>{
  for(const kind of ['bath','vanity']as const){
    const mesh=furnitureMesh(makeFurniture(kind,'living',0,0));let holes=0;
    try{mesh.traverse(object=>{if(object instanceof THREE.Mesh&&object.geometry instanceof THREE.ExtrudeGeometry){
      const shape=object.geometry.parameters.shapes;
      holes+=(Array.isArray(shape)?shape:[shape]).reduce((sum,s)=>sum+s.holes.length,0);
    }});assert.ok(holes>0,kind);}finally{dispose(mesh);}
  }
  for(const kind of ['bed','sofa']as const){
    const mesh=furnitureMesh(makeFurniture(kind,'living',0,0));let rounded=0;
    try{mesh.traverse(object=>{if(object instanceof THREE.Mesh&&object.geometry.type==='RoundedBoxGeometry')rounded++;});
      assert.ok(rounded>=5,kind);}finally{dispose(mesh);}
  }
});

test('tile joints follow physical repeat dimensions; custom photos and texture transforms are preserved',()=>{
  const originalDocument=globalThis.document;
  const fills:{x:number;y:number;w:number;h:number;color:string}[]=[];
  let serial=0;
  const context={fillStyle:'',strokeStyle:'',lineWidth:1,
    fillRect(x:number,y:number,w:number,h:number){fills.push({x,y,w,h,color:this.fillStyle});},
    beginPath(){},moveTo(){},lineTo(){},bezierCurveTo(){},stroke(){}};
  globalThis.document={createElement(){return{width:0,height:0,getContext(){return context;},
    toDataURL(){return`data:image/png;base64,fixture-${++serial}`;}};}}as unknown as Document;
  const tile:Material={id:'test-tile',name:'Test',color:'#adbcce',pattern:'tile',width:.6,height:1.2,
    rotation:27,roughness:.4};
  try{
    const first=materialImage(tile);
    const seams=fills.filter(fill=>fill.color==='rgba(213,210,198,.72)');
    assert.equal(seams.length,4);
    near(seams[0].w/256*.6*2,.002,'vertical grout metres');
    near(seams[2].h/512*1.2*2,.002,'horizontal grout metres');
    assert.equal(materialImage({...tile,rotation:90}),first,'orientation does not regenerate pixels');
    assert.notEqual(materialImage({...tile,width:.3}),first,'physical seam width regenerates pixels');
    assert.equal(materialImage({...tile,image:'data:image/jpeg;base64,original'}),'data:image/jpeg;base64,original');
    const originalLoad=THREE.TextureLoader.prototype.load;
    THREE.TextureLoader.prototype.load=function(){return new THREE.Texture();};
    try{
      const material=surfaceMaterial(tile,3.6,2.4),texture=material.map!;
      near(texture.repeat.x,6,'horizontal repeats');near(texture.repeat.y,2,'vertical repeats');
      near(texture.rotation,27*Math.PI/180,'rotation');assert.equal(texture.colorSpace,THREE.SRGBColorSpace);
      assert.equal(texture.wrapS,THREE.RepeatWrapping);assert.equal(texture.wrapT,THREE.RepeatWrapping);
      texture.dispose();material.dispose();
      const photo=surfaceMaterial({...tile,pattern:'image',image:'data:image/jpeg;base64,original',color:'#aabbcc'},3.6,2.4);
      assert.equal(photo.color.getHexString(),'aabbcc');photo.map!.dispose();photo.dispose();
    }finally{THREE.TextureLoader.prototype.load=originalLoad;}
  }finally{globalThis.document=originalDocument;}
});
