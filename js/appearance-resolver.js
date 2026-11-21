/* Pure appearance table resolver. Inspired by inspected part/action tables;
 * not a claim to reproduce the undocumented original TIÊU TỬ BÁ ĐẠO renderer.
 * Direction and order are explicit; do not infer legacy Dir IDs or SPR indexing.
 */
(function(root){
 'use strict';
 const slots=['head','hair','shoulder','body','lefthand','righthand','leftweapon','rightweapon'];
 function resolve(pack, action, direction, frame){
   if(!Number.isInteger(frame)||frame<0) throw Error('Invalid frame');
   const order=pack.order?.[action]?.[direction] || pack.order?.default?.[direction];
   if(!Array.isArray(order)||new Set(order).size!==order.length) throw Error('Missing or duplicate layer order');
   const result=[];
   for(const part of order){
     if(!slots.includes(part)) throw Error('Unknown part '+part);
     const resource=pack.parts?.[part]?.[action]?.[direction];
     if(!resource) throw Error('Missing resource '+part+'/'+action+'/'+direction);
     if(!Number.isInteger(resource.frames)||frame>=resource.frames) throw Error('Frame mismatch '+part);
     if(!Number.isFinite(resource.originX)||!Number.isFinite(resource.originY)) throw Error('Missing anchor '+part);
     result.push({part,texture:resource.texture,frame:resource.frameMap?resource.frameMap[frame]:frame,
       originX:resource.originX,originY:resource.originY,scale:resource.scale||1});
   }
   return result;
 }
 const api={slots,resolve}; if(typeof module!=='undefined') module.exports=api; else root.AppearanceResolver=api;
})(typeof window!=='undefined'?window:globalThis);
