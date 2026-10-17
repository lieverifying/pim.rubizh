'use strict';
// Rehearsal tooling only (not shipped): a memory-light DOMParser for XML price feeds in Node. linkedom builds a full DOM
// that needs several GB for a 30 MB YML; htmlparser2 (xmlMode) + this thin wrapper offers exactly the DOM surface
// parseYml() uses (getElementsByTagName, documentElement, tagName, getAttribute, children, textContent). Other content
// types go to linkedom unchanged. audit/rehearsal-5-2.cjs checks byte-identical parseYml output against linkedom.
const appRequire=require('node:module').createRequire(require('node:path').resolve(__dirname,'../app/package.json'));
const {parseDocument,DomUtils}=appRequire('htmlparser2'),{DOMParser:LinkedomParser}=appRequire('linkedom');
function wrap(){
 const cache=new WeakMap();
 const el=n=>{if(!n)return null;let w=cache.get(n);if(w)return w;
  w={get tagName(){return n.name;},get nodeName(){return n.name;},getAttribute:a=>Object.hasOwn(n.attribs||{},a)?n.attribs[a]:null,hasAttribute:a=>Object.hasOwn(n.attribs||{},a),
   get textContent(){return DomUtils.textContent(n);},get children(){return n.children.filter(c=>c.type==='tag').map(el);},
   getElementsByTagName:t=>DomUtils.getElementsByTagName(t,n.children,true).map(el)};
  cache.set(n,w);return w;};
 return el;
}
class LightDOMParser{
 parseFromString(text,type){
  if(type!=='application/xml'&&type!=='text/xml')return new LinkedomParser().parseFromString(text,type);
  const doc=parseDocument(text,{xmlMode:true}),el=wrap(),root=doc.children.find(c=>c.type==='tag')||null;
  return {get documentElement(){return el(root);},getElementsByTagName:t=>DomUtils.getElementsByTagName(t,doc.children,true).map(el)};
 }
}
module.exports={LightDOMParser};
