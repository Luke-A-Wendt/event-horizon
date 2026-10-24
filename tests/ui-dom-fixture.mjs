// A small DOM fixture for event wiring and state transitions. It deliberately
// does not emulate layout, rendering, WebGL, or accessibility-tree behavior.
const voidTags=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
const decode=text=>text.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
const camel=s=>s.replace(/-([a-z])/g,(_,v)=>v.toUpperCase());
function simpleMatch(node,selector){
 if(node.tagName==='#TEXT')return false;
 const tag=selector.match(/^[\w-]+/);if(tag&&node.tagName!==tag[0].toUpperCase())return false;
 for(const m of selector.matchAll(/#([\w-]+)/g))if(node.id!==m[1])return false;
 for(const m of selector.matchAll(/\.([\w-]+)/g))if(!node.classList.contains(m[1]))return false;
 for(const m of selector.matchAll(/\[([\w-]+)(?:=['"]?([^\]'" ]+)['"]?)?\]/g)){const value=node.getAttribute(m[1]);if(value===null||m[2]!==undefined&&value!==m[2])return false;}
 return true;
}
function matches(node,selector){
 return selector.split(',').some(part=>{const parts=part.trim().split(/\s+/);if(!simpleMatch(node,parts.pop()))return false;let parent=node.parentNode;while(parts.length){const wanted=parts.pop();while(parent&&!simpleMatch(parent,wanted))parent=parent.parentNode;if(!parent)return false;parent=parent.parentNode;}return true;});
}
class Element{
 constructor(tag,document){this.tagName=tag.toUpperCase();this.ownerDocument=document;this.children=[];this.parentNode=null;this.attrs=new Map();this.dataset={};this.events=new Map();this.style={setProperty(){}};this.hidden=false;this.open=false;this.checked=false;this.disabled=false;this.scrollTop=0;this._value=null;this._text='';this.classList={contains:v=>(this.className||'').split(/\s+/).includes(v),add:v=>{if(!this.classList.contains(v))this.className=(this.className+' '+v).trim();},remove:v=>{this.className=this.className.split(/\s+/).filter(x=>x!==v).join(' ');},toggle:(v,on)=>{const next=on??!this.classList.contains(v);next?this.classList.add(v):this.classList.remove(v);return next;}};}
 get id(){return this.attrs.get('id')||'';}set id(v){this.attrs.set('id',v);}
 get className(){return this.attrs.get('class')||'';}set className(v){this.attrs.set('class',v);}
 get value(){if(this._value!==null)return this._value;if(this.tagName==='SELECT'){const options=this.querySelectorAll('option');return (options.find(o=>o.attrs.has('selected'))||options[0])?.value||'';}return this.attrs.get('value')||'';}set value(v){this._value=String(v);}
 get type(){return this.attrs.get('type')||'';}get min(){return this.attrs.get('min')||'';}get max(){return this.attrs.get('max')||'';}set min(v){this.attrs.set('min',String(v));}
 get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}set textContent(v){this.children=[];this._text=String(v);}
 get innerHTML(){return this._html||'';}set innerHTML(v){for(const child of this.children)child.parentNode=null;this.children=[];this._text='';this._html=String(v);parse(String(v),this,this.ownerDocument);if(this.tagName==='SELECT')this._value=null;}
 setAttribute(name,value){this.attrs.set(name,String(value));if(name.startsWith('data-'))this.dataset[camel(name.slice(5))]=String(value);if(['hidden','open','checked','disabled'].includes(name))this[name]=true;}
 getAttribute(name){if(['hidden','open','checked','disabled'].includes(name))return this[name]?'':null;return this.attrs.get(name)??null;}
 removeAttribute(name){this.attrs.delete(name);if(['hidden','open','checked','disabled'].includes(name))this[name]=false;}
 append(...nodes){for(const node of nodes){node.remove();node.parentNode=this;this.children.push(node);}}
 prepend(...nodes){for(const node of [...nodes].reverse()){node.remove();node.parentNode=this;this.children.unshift(node);}}
 before(node){const parent=this.parentNode;node.remove();node.parentNode=parent;parent.children.splice(parent.children.indexOf(this),0,node);}
 after(node){const parent=this.parentNode;node.remove();node.parentNode=parent;parent.children.splice(parent.children.indexOf(this)+1,0,node);}
 remove(){if(this.parentNode){const siblings=this.parentNode.children;siblings.splice(siblings.indexOf(this),1);this.parentNode=null;}}
 replaceWith(node){this.before(node);this.remove();}
 contains(node){for(let at=node;at;at=at.parentNode)if(at===this)return true;return false;}
 querySelectorAll(selector){const found=[];function visit(node){for(const child of node.children){if(matches(child,selector))found.push(child);visit(child);}}visit(this);return found;}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 closest(selector){for(let node=this;node;node=node.parentNode)if(matches(node,selector))return node;return null;}
 addEventListener(type,handler,options={}){if(!this.events.has(type))this.events.set(type,[]);this.events.get(type).push({handler,once:options.once});}
 removeEventListener(type,handler){this.events.set(type,(this.events.get(type)||[]).filter(e=>e.handler!==handler));}
 dispatch(type,extra={}){const event={type,target:this,preventDefault(){},stopPropagation(){this.stopped=true;},...extra};for(let node=this;node;node=node.parentNode){for(const entry of [...node.events.get(type)||[]]){entry.handler(event);if(entry.once)node.removeEventListener(type,entry.handler);}if(event.stopped)break;}return event;}
 click(){if(!this.disabled)this.dispatch('click');}focus(){this.ownerDocument.activeElement=this;}scrollIntoView(){}
 showModal(){this.open=true;}close(){this.open=false;this.dispatch('close');}
 getBoundingClientRect(){return {left:0,top:0,width:900,height:650,right:900,bottom:650};}
 cloneNode(){const node=new Element(this.tagName,this.ownerDocument);for(const [key,value] of this.attrs)node.setAttribute(key,value);return node;}
}
function parse(html,parent,document){
 const stack=[parent];for(const match of html.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<\/?[\w:-]+\b[^>]*>|[^<]+/g)){
  const token=match[0];if(token.startsWith('<!'))continue;
  if(token.startsWith('</')){const tag=token.slice(2).match(/^[\w:-]+/)[0].toUpperCase();let at=stack.length-1;while(at>0&&stack[at].tagName!==tag)at--;if(at>0)stack.length=at;continue;}
  if(token[0]==='<'){const tag=token.slice(1).match(/^[\w:-]+/)[0],node=new Element(tag,document);const attrs=token.slice(tag.length+1,-1);for(const a of attrs.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))node.setAttribute(a[1],decode(a[2]??a[3]??a[4]??''));stack.at(-1).append(node);if(!voidTags.has(tag)&&!token.endsWith('/>'))stack.push(node);
  }else{const node=new Element('#TEXT',document);node.textContent=decode(token);stack.at(-1).append(node);}
 }
}
export function uiDomFixture(html){
 const document=new Element('document');document.ownerDocument=document;document.createElement=tag=>new Element(tag,document);document.getElementById=id=>document.querySelector('#'+id);document.hidden=false;document.activeElement=null;document.fullscreenElement=null;document.exitFullscreen=async()=>{};parse(html,document,document);return document;
}
