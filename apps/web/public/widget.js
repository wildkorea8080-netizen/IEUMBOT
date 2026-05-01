"use strict";(()=>{var I=Object.defineProperty;var S=(t,e,i)=>e in t?I(t,e,{enumerable:!0,configurable:!0,writable:!0,value:i}):t[e]=i;var s=(t,e,i)=>S(t,typeof e!="symbol"?e+"":e,i);function A(t){return t.endsWith("/")?t.slice(0,-1):t}var b=class{constructor(e){s(this,"baseUrl");this.baseUrl=A(e)}async getConfig(e){let i=await fetch(`${this.baseUrl}/widget/config/${encodeURIComponent(e)}`,{method:"GET",headers:{"Content-Type":"application/json"},credentials:"omit"});if(!i.ok)throw new Error(`WIDGET_CONFIG_FAILED:${i.status}`);return await i.json()}async sendChat(e,i="/chat/messages"){let n=i.startsWith("/")?i:`/${i}`,o=await fetch(`${this.baseUrl}${n}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e),credentials:"omit"});if(!o.ok)throw new Error(`WIDGET_CHAT_FAILED:${o.status}`);return await o.json()}async streamChat(e,i,n="/chat/messages/stream"){let o=n.startsWith("/")?n:`/${n}`,r=await fetch(`${this.baseUrl}${o}`,{method:"POST",headers:{"Content-Type":"application/json",Accept:"text/event-stream"},body:JSON.stringify(e),credentials:"omit"});if(!r.ok||!r.body)throw new Error(`WIDGET_CHAT_STREAM_FAILED:${r.status}`);let l=r.body.getReader(),u=new TextDecoder("utf-8"),d="";for(;;){let{value:y,done:h}=await l.read();if(h)break;d+=u.decode(y,{stream:!0});let p=d.indexOf(`

`);for(;p!==-1;){let c=d.slice(0,p).trim();if(d=d.slice(p+2),p=d.indexOf(`

`),!c)continue;let T="message",w=[];for(let g of c.split(`
`))g.startsWith("event:")?T=g.slice(6).trim():g.startsWith("data:")&&w.push(g.slice(5).trim());if(w.length!==0)try{let g=JSON.parse(w.join(`
`));i({event:T,data:g})}catch{i({event:"error",data:{code:"STREAM_EVENT_PARSE_FAILED",message:"\uC2A4\uD2B8\uB9BC \uC774\uBCA4\uD2B8 \uD30C\uC2F1 \uC2E4\uD328"}})}}}}};var H="/widget-icons/love-chat-icons.png";function a(t,e,i){let n=t.createElement(e);return i&&(n.className=i),n}function m(t){return t==="love-chat"?`<img class="ieum-launcher-image" src="${H}" alt="" aria-hidden="true" />`:t==="heart"?`
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M19.5 12.57 12 20l-7.5-7.43a4.95 4.95 0 0 1 0-7 4.95 4.95 0 0 1 7 0L12 6l.5-.43a4.95 4.95 0 0 1 7 7Z"/>
      </svg>
    `:t==="shield"?`
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 3 5 6v6c0 5 3.5 7.7 7 9 3.5-1.3 7-4 7-9V6l-7-3Z"/>
        <path d="m9.5 12 1.7 1.7L14.8 10"/>
      </svg>
    `:t==="leaf"?`
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M11 20c5 0 9-4 9-9V4h-7c-5 0-9 4-9 9 0 4 3 7 7 7Z"/>
        <path d="M8 16c2-3 5-5 9-6"/>
      </svg>
    `:t==="spark"?`
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z"/>
        <path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/>
        <path d="m5 14 .8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Z"/>
      </svg>
    `:t==="send"?`
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M22 2 11 13"/>
        <path d="m22 2-7 20-4-9-9-4Z"/>
      </svg>
    `:t==="minimize"?`
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M5 12h14"/>
      </svg>
    `:t==="close"?`
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M18 6 6 18"/>
        <path d="m6 6 12 12"/>
      </svg>
    `:`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M7 10h10"/>
      <path d="M7 14h6"/>
      <path d="M21 12a8.96 8.96 0 0 1-2.64 6.36A9 9 0 1 1 21 12Z"/>
      <path d="m15 19 3.5 3.5"/>
    </svg>
  `}function B(t){return t&&t.trim()?t.replace(/\/$/,""):`${window.location.origin}/api`}function f(t){return typeof t=="string"?t:void 0}function D(t){return typeof t=="boolean"?t:void 0}function _(t){return Array.isArray(t)?t:[]}function N(t){return!t||t==="answered"?null:t==="insufficient_evidence"?"\uD655\uC778 \uAC00\uB2A5\uD55C \uCC38\uACE0 \uB0B4\uC6A9\uC774 \uBD80\uC871\uD574 \uC77C\uBC18 \uC548\uB0B4\uB85C \uC804\uD658\uD588\uC2B5\uB2C8\uB2E4.":t==="restricted"?"\uC9C1\uC811 \uC548\uB0B4\uAC00 \uC5B4\uB824\uC6B4 \uC9C8\uBB38\uC774\uB77C \uC548\uC804\uD55C \uBC94\uC704\uC5D0\uC11C\uB9CC \uB2F5\uBCC0\uD569\uB2C8\uB2E4.":t==="conflict"?"\uADFC\uAC70 \uD655\uC778\uC774 \uB354 \uD544\uC694\uD55C \uC9C8\uBB38\uC785\uB2C8\uB2E4.":t==="escalate"?"\uCD94\uAC00 \uD655\uC778\uC774 \uD544\uC694\uD55C \uB0B4\uC6A9\uC73C\uB85C \uC0C1\uB2F4 \uC5F0\uACB0\uC774 \uAD8C\uC7A5\uB429\uB2C8\uB2E4.":null}function $(t){let e=t.documentName??"\uCD9C\uCC98",i=t.pageNumber?`p.${t.pageNumber}`:null,n=t.sectionTitle??null,o=t.sourceUrl??null;return[e,i,n,o].filter(Boolean).join(" | ")}function C(t,e){return e.title?.trim()||t?.institutionName?.trim()||t?.chatbotName?.trim()||"\uAE30\uAD00"}function k(t,e){let i=C(t,e);return i.startsWith("AI \uCC57\uBD07")?i:`AI \uCC57\uBD07 ${i}`}function O(t,e){return e.welcomeMessage?.trim()?e.welcomeMessage.trim():t?.introMessage?.trim()?t.introMessage.trim():t?.welcomeMessage?.trim()?t.welcomeMessage.trim():`\uC548\uB155\uD558\uC138\uC694
${C(t,e)} AI \uCC57\uBD07\uC785\uB2C8\uB2E4.

\uAD81\uAE08\uD558\uC2E0 \uB0B4\uC6A9\uC744 \uC785\uB825\uD574\uC8FC\uC2DC\uBA74
\uBE60\uB974\uAC8C \uC548\uB0B4\uD574\uB4DC\uB9AC\uACA0\uC2B5\uB2C8\uB2E4.`}function M(t){return t==="forest"?"linear-gradient(135deg, #166534, #0f766e)":t==="sky"?"linear-gradient(135deg, #1d4ed8, #0284c7)":t==="civic"?"linear-gradient(135deg, #1e40af, #0f766e)":t==="sunset"?"linear-gradient(135deg, #b45309, #ea580c)":"linear-gradient(135deg, #2563EB, #22C55E)"}function q(t){let e=t?.theme?.launcherIcon;return e==="love-chat"||e==="heart"||e==="shield"||e==="leaf"||e==="spark"?e:"chat"}function R(t,e){let i=t?.launcherHoverMessage?.trim();return i||`AI\uCC57\uBD07 ${C(t,e)}\uC608\uC694. \uBB34\uC5C7\uC744 \uB3C4\uC640\uB4DC\uB9B4\uAE4C\uC694?`}function L(t){return`
:host { all: initial; }
.ieum-root, .ieum-root * {
  box-sizing: border-box;
  font-family: "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", Arial, sans-serif;
  letter-spacing: -0.01em;
}
.ieum-root {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 2147480000;
  color: #0f172a;
}
.ieum-launcher-wrap {
  position: absolute;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
}
.ieum-launcher-tip {
  width: min(340px, calc(100vw - 48px));
  border: 1px solid #dbe4f0;
  border-radius: 18px;
  background: #ffffff;
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.14);
  padding: 12px 14px 12px 16px;
  display: none;
  align-items: flex-start;
  gap: 10px;
}
.ieum-launcher-tip.visible {
  display: flex;
  animation: ieum-tooltip-in .18s ease;
}
.ieum-launcher-tip-text {
  flex: 1;
  font-size: 13px;
  line-height: 1.6;
  color: #0f172a;
  white-space: pre-wrap;
  word-break: keep-all;
}
.ieum-launcher-tip-close {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 9999px;
  background: #f1f5f9;
  color: #64748b;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex: 0 0 auto;
}
.ieum-launcher-tip-close svg {
  width: 14px;
  height: 14px;
}
.ieum-floating {
  width: 64px;
  height: 64px;
  border: none;
  border-radius: 9999px;
  background: ${t};
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 14px 30px rgba(37, 99, 235, 0.28);
  transition: transform .18s ease, box-shadow .18s ease, opacity .18s ease;
}
.ieum-floating:hover {
  transform: scale(1.05);
  box-shadow: 0 20px 36px rgba(15, 23, 42, 0.28);
}
.ieum-floating .ieum-launcher-image {
  width: 64px;
  height: 64px;
  border-radius: 9999px;
  object-fit: cover;
  display: block;
}
.ieum-floating svg,
.ieum-header-icon svg,
.ieum-header-icon img,
.ieum-header-button svg,
.ieum-send svg {
  width: 26px;
  height: 26px;
}
.ieum-header-icon img {
  width: 20px;
  height: 20px;
  object-fit: contain;
  border-radius: 9999px;
}
.ieum-panel {
  position: absolute;
  right: 0;
  bottom: 0;
  width: min(340px, calc(100vw - 24px));
  height: min(520px, calc(100vh - 24px));
  border-radius: 16px;
  background: #ffffff;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  opacity: 0;
  transform: translateY(20px);
  pointer-events: none;
  transition: opacity .22s ease, transform .22s ease;
}
.ieum-panel.open {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}
.ieum-header {
  min-height: 60px;
  padding: 12px 16px;
  background: ${t};
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.ieum-header-main { display:flex; align-items:center; gap:10px; min-width:0; }
.ieum-header-icon {
  width: 34px; height: 34px; border-radius: 9999px; background: rgba(255,255,255,.16);
  display:inline-flex; align-items:center; justify-content:center; flex:0 0 auto;
}
.ieum-title {
  font-size: 15px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ieum-header-actions { display:flex; align-items:center; gap:6px; }
.ieum-header-button {
  width:30px; height:30px; border:none; border-radius:9999px; background:rgba(255,255,255,.15); color:#fff;
  display:inline-flex; align-items:center; justify-content:center; cursor:pointer;
}
.ieum-header-button:hover { background: rgba(255,255,255,.24); }
.ieum-messages {
  flex:1; padding:16px; background:#f8fafc; overflow-y:auto; display:flex; flex-direction:column; gap:10px;
}
.ieum-banner {
  margin: 16px 16px 0; border:1px solid rgba(37,99,235,.12); border-radius:14px; padding:12px 14px;
  background: linear-gradient(180deg, rgba(255,255,255,.96), rgba(239,246,255,.9));
  box-shadow: 0 4px 16px rgba(15,23,42,.05);
}
.ieum-banner-title { font-size:12px; font-weight:700; color:#1e3a8a; }
.ieum-banner-description { margin-top:4px; font-size:12px; line-height:1.5; color:#475569; white-space:pre-wrap; }
.ieum-starter-questions, .ieum-quick-actions {
  display:flex; flex-wrap:wrap; gap:8px; padding:0 16px 12px; background:#f8fafc;
}
.ieum-starter-question, .ieum-quick-action {
  border:1px solid #dbe4f0; background:#fff; color:#0f172a; padding:10px 12px; cursor:pointer;
  box-shadow:0 2px 8px rgba(15,23,42,.04);
}
.ieum-starter-question {
  width:100%; border-radius:14px; text-align:left; font-size:12px; line-height:1.45;
}
.ieum-quick-action {
  border-radius:9999px; color:#1e3a8a; padding:8px 12px; font-size:12px; font-weight:600; box-shadow:0 1px 3px rgba(15,23,42,.04);
}
.ieum-starter-question:hover, .ieum-quick-action:hover { border-color:#93c5fd; background:#eff6ff; }
.ieum-message { display:flex; width:100%; animation: ieum-message-in .2s ease; }
.ieum-message.user { justify-content:flex-end; }
.ieum-message.assistant, .ieum-message.system { justify-content:flex-start; }
.ieum-bubble {
  max-width:75%; border-radius:16px; padding:12px 14px; font-size:13px; line-height:1.6; white-space:pre-wrap; word-break:break-word;
}
.ieum-message.assistant .ieum-bubble, .ieum-message.system .ieum-bubble {
  background:#fff; color:#0f172a; box-shadow:0 2px 6px rgba(0,0,0,.05);
}
.ieum-message.user .ieum-bubble { background:#2563eb; color:#fff; }
.ieum-outcome-note, .ieum-citations { margin-top:8px; padding-top:8px; border-top:1px dashed #dbe4f0; }
.ieum-outcome-note, .ieum-citations-title, .ieum-citation { font-size:11px; color:#475569; }
.ieum-citations-title { margin-bottom:4px; font-weight:700; }
.ieum-citation { line-height:1.45; margin-bottom:3px; }
.ieum-loading {
  display:none; align-self:flex-start; max-width:75%; margin:0 16px 12px; border-radius:16px; padding:12px 14px;
  background:#fff; color:#64748b; box-shadow:0 2px 6px rgba(0,0,0,.05); font-size:18px; line-height:1;
}
.ieum-loading.active { display:inline-flex; gap:4px; }
.ieum-loading-dot { width:5px; height:5px; border-radius:9999px; background:#94a3b8; animation: ieum-dot 1s infinite ease-in-out; }
.ieum-loading-dot:nth-child(2) { animation-delay:.15s; }
.ieum-loading-dot:nth-child(3) { animation-delay:.3s; }
.ieum-input-wrap {
  min-height:64px; border-top:1px solid #e5e7eb; padding:8px 12px; display:flex; align-items:center; gap:10px; background:#fff;
}
.ieum-input {
  flex:1; min-width:0; height:44px; border-radius:9999px; border:1px solid #e5e7eb; padding:10px 14px; font-size:13px; color:#0f172a; outline:none;
}
.ieum-input::placeholder { color:#94a3b8; }
.ieum-input:focus { border-color:#93c5fd; box-shadow:0 0 0 4px rgba(37,99,235,.08); }
.ieum-send {
  width:42px; height:42px; border:none; border-radius:9999px; background:#2563eb; color:#fff; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; transition:filter .16s ease;
}
.ieum-send:hover { filter: brightness(1.1); }
.ieum-send:disabled, .ieum-floating:disabled { opacity:.65; cursor:default; }
.ieum-footer { border-top:1px solid #eef2f7; padding:8px 12px; background:#f8fafc; font-size:11px; color:#64748b; line-height:1.45; }
@keyframes ieum-dot { 0%,80%,100%{transform:translateY(0);opacity:.45} 40%{transform:translateY(-3px);opacity:1} }
@keyframes ieum-message-in { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
@keyframes ieum-tooltip-in { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
@media (max-width: 640px) {
  .ieum-root { right:8px; left:8px; bottom:8px; }
  .ieum-panel { width:100%; height:min(520px, calc(100vh - 16px)); }
  .ieum-bubble { max-width:84%; }
  .ieum-launcher-tip { width: calc(100vw - 32px); }
}
`}var x=class{constructor(e){s(this,"options");s(this,"api");s(this,"host");s(this,"shadow");s(this,"root");s(this,"launcherWrap");s(this,"launcherTip");s(this,"launcherTipText");s(this,"launcherTipClose");s(this,"floatingButton");s(this,"panel");s(this,"titleNode");s(this,"headerIconNode");s(this,"bannerWrap");s(this,"starterQuestionsWrap");s(this,"quickActionsWrap");s(this,"messagesWrap");s(this,"loadingRow");s(this,"input");s(this,"sendButton");s(this,"footerNotice");s(this,"initialized",!1);s(this,"open",!1);s(this,"sending",!1);s(this,"launcherTipDismissed",!1);s(this,"launcherHoverMessage","");s(this,"launcherTipStorageKey","");s(this,"sessionToken",`widget_${Math.random().toString(36).slice(2,10)}_${Date.now().toString(36)}`);s(this,"config",null);s(this,"chatEndpoint","/chat/messages");s(this,"chatStreamEndpoint","/chat/messages/stream");s(this,"sseEnabled",!1);s(this,"messages",[]);s(this,"lastFailedQuestion",null);this.options=e,this.api=new b(B(e.apiBaseUrl)),this.host=document.createElement("div"),this.host.setAttribute("data-ieumbot-widget-root","true"),this.shadow=this.host.attachShadow({mode:"open"}),this.root=a(document,"div","ieum-root"),this.launcherWrap=a(document,"div","ieum-launcher-wrap"),this.launcherTip=a(document,"div","ieum-launcher-tip"),this.launcherTipText=a(document,"div","ieum-launcher-tip-text"),this.launcherTipClose=a(document,"button","ieum-launcher-tip-close"),this.floatingButton=a(document,"button","ieum-floating"),this.panel=a(document,"div","ieum-panel"),this.titleNode=a(document,"div","ieum-title"),this.headerIconNode=a(document,"div","ieum-header-icon"),this.bannerWrap=a(document,"div","ieum-banner"),this.starterQuestionsWrap=a(document,"div","ieum-starter-questions"),this.quickActionsWrap=a(document,"div","ieum-quick-actions"),this.messagesWrap=a(document,"div","ieum-messages"),this.loadingRow=a(document,"div","ieum-loading"),this.input=a(document,"input","ieum-input"),this.sendButton=a(document,"button","ieum-send"),this.footerNotice=a(document,"div","ieum-footer"),this.launcherTipClose.type="button",this.launcherTipClose.setAttribute("aria-label","\uC548\uB0B4 \uB2EB\uAE30"),this.launcherTipClose.innerHTML=m("close"),this.launcherTip.appendChild(this.launcherTipText),this.launcherTip.appendChild(this.launcherTipClose),this.floatingButton.type="button",this.floatingButton.title=e.launcherLabel??"\uCC57\uBD07 \uC5F4\uAE30",this.floatingButton.setAttribute("aria-label",e.launcherLabel??"\uCC57\uBD07 \uC5F4\uAE30"),this.floatingButton.innerHTML=m("chat"),this.titleNode.textContent=k(null,e),this.loadingRow.innerHTML=`
      <span class="ieum-loading-dot"></span>
      <span class="ieum-loading-dot"></span>
      <span class="ieum-loading-dot"></span>
    `,this.input.placeholder="\uBB34\uC5C7\uC744 \uB3C4\uC640\uB4DC\uB9B4\uAE4C\uC694?",this.sendButton.type="button",this.sendButton.setAttribute("aria-label","\uBA54\uC2DC\uC9C0 \uC804\uC1A1"),this.sendButton.innerHTML=m("send"),this.footerNotice.style.display="none"}async mount(){if(this.initialized)return;this.initialized=!0;let e=document.createElement("style");e.textContent=L(M(this.options.theme?.primaryColor??null)),this.shadow.appendChild(e),this.shadow.appendChild(this.root);let i=a(document,"div","ieum-header"),n=a(document,"div","ieum-header-main"),o=a(document,"div","ieum-header-actions"),r=a(document,"button","ieum-header-button"),l=a(document,"button","ieum-header-button"),u=a(document,"div","ieum-input-wrap");this.headerIconNode.innerHTML=m("heart"),r.type="button",r.title="\uCD5C\uC18C\uD654",r.setAttribute("aria-label","\uCD5C\uC18C\uD654"),r.innerHTML=m("minimize"),l.type="button",l.title="\uB2EB\uAE30",l.setAttribute("aria-label","\uB2EB\uAE30"),l.innerHTML=m("close"),n.appendChild(this.headerIconNode),n.appendChild(this.titleNode),o.appendChild(r),o.appendChild(l),i.appendChild(n),i.appendChild(o),u.appendChild(this.input),u.appendChild(this.sendButton),this.panel.appendChild(i),this.panel.appendChild(this.bannerWrap),this.panel.appendChild(this.messagesWrap),this.panel.appendChild(this.starterQuestionsWrap),this.panel.appendChild(this.quickActionsWrap),this.panel.appendChild(this.loadingRow),this.panel.appendChild(u),this.panel.appendChild(this.footerNotice),this.launcherWrap.appendChild(this.launcherTip),this.launcherWrap.appendChild(this.floatingButton),this.root.appendChild(this.panel),this.root.appendChild(this.launcherWrap),document.body.appendChild(this.host),this.floatingButton.addEventListener("click",()=>this.togglePanel()),this.floatingButton.addEventListener("mouseenter",()=>this.showLauncherTip()),this.floatingButton.addEventListener("focus",()=>this.showLauncherTip()),this.launcherTip.addEventListener("mouseenter",()=>this.showLauncherTip()),this.launcherTipClose.addEventListener("click",d=>{d.stopPropagation(),this.dismissLauncherTip()}),r.addEventListener("click",()=>this.setOpen(!1)),l.addEventListener("click",()=>this.setOpen(!1)),this.sendButton.addEventListener("click",()=>void this.sendCurrentInput()),this.input.addEventListener("keydown",d=>{d.key==="Enter"&&!d.shiftKey&&(d.preventDefault(),this.sendCurrentInput())}),await this.loadConfig(),this.options.openOnLoad&&this.setOpen(!0)}ensureInitialMessage(){this.messages.length>0||(this.pushMessage({id:`assistant_welcome_${Date.now()}`,role:"assistant",text:O(this.config,this.options),timestamp:Date.now()}),this.config?.operatingHours.isAfterHours&&this.config.operatingHours.message&&this.pushMessage({id:`system_after_hours_${Date.now()}`,role:"system",text:this.config.operatingHours.message,timestamp:Date.now()}))}readLauncherTipDismissed(){if(!this.launcherTipStorageKey)return!1;try{return window.localStorage.getItem(this.launcherTipStorageKey)==="1"}catch{return!1}}dismissLauncherTip(){if(this.launcherTipDismissed=!0,this.hideLauncherTip(!0),!!this.launcherTipStorageKey)try{window.localStorage.setItem(this.launcherTipStorageKey,"1")}catch{}}showLauncherTip(){this.open||this.launcherTipDismissed||!this.launcherHoverMessage.trim()||this.launcherTip.classList.add("visible")}hideLauncherTip(e=!1){e&&this.launcherTip.classList.remove("visible")}async loadConfig(){try{this.config=await this.api.getConfig(this.options.chatbotId);let e=this.shadow.querySelector("style");e&&(e.textContent=L(M(this.config.theme?.preset))),this.titleNode.textContent=k(this.config,this.options),this.config.logoUrl?.trim()?this.headerIconNode.innerHTML=`<img src="${this.config.logoUrl}" alt="\uAE30\uAD00 \uB85C\uACE0" />`:this.headerIconNode.innerHTML=m("heart"),this.floatingButton.innerHTML=m(q(this.config)),this.launcherHoverMessage=R(this.config,this.options)??"",this.launcherTipText.textContent=this.launcherHoverMessage,this.launcherTipStorageKey=`ieumbot_launcher_tip_dismissed:${this.options.chatbotId}`,this.launcherTipDismissed=this.readLauncherTipDismissed(),window.matchMedia("(max-width: 640px)").matches&&!this.launcherTipDismissed&&this.showLauncherTip(),this.renderBanner(),this.renderStarterQuestions(),this.config.privacyNotice&&(this.footerNotice.textContent=this.config.privacyNotice,this.footerNotice.style.display="block"),this.renderQuickActions(this.config.quickActions),this.config.runtime?.chatEndpoint&&(this.chatEndpoint=this.config.runtime.chatEndpoint),this.config.runtime?.chatStreamEndpoint&&(this.chatStreamEndpoint=this.config.runtime.chatStreamEndpoint),this.sseEnabled=D(this.config.runtime?.sseEnabled)===!0||this.config.runtime?.streamingMode==="sse_preferred",this.ensureInitialMessage()}catch{this.pushMessage({id:`system_load_error_${Date.now()}`,role:"system",text:"\uCD08\uAE30 \uC124\uC815\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",timestamp:Date.now()})}}renderBanner(){this.bannerWrap.innerHTML="";let e=this.config?.banner?.title?.trim(),i=this.config?.banner?.description?.trim();if(!e&&!i){this.bannerWrap.style.display="none";return}if(this.bannerWrap.style.display="block",e){let n=a(document,"div","ieum-banner-title");n.textContent=e,this.bannerWrap.appendChild(n)}if(i){let n=a(document,"div","ieum-banner-description");n.textContent=i,this.bannerWrap.appendChild(n)}}renderStarterQuestions(){this.starterQuestionsWrap.innerHTML="";let e=this.config?.starterQuestions?.filter(i=>i.trim()).slice(0,4)??[];if(e.length===0){this.starterQuestionsWrap.style.display="none";return}this.starterQuestionsWrap.style.display="flex";for(let i of e){let n=a(document,"button","ieum-starter-question");n.type="button",n.textContent=i,n.addEventListener("click",()=>{this.input.value=i,this.sendCurrentInput()}),this.starterQuestionsWrap.appendChild(n)}}renderQuickActions(e){this.quickActionsWrap.innerHTML="";let i=e.filter(n=>n.displayLocation==="welcome").slice(0,6);if(i.length===0){this.quickActionsWrap.style.display="none";return}this.quickActionsWrap.style.display="flex";for(let n of i){let o=a(document,"button","ieum-quick-action");o.type="button",o.textContent=n.label,o.title=n.label,o.addEventListener("click",()=>{if(n.actionType==="link"&&n.url){window.open(n.url,"_blank","noopener,noreferrer");return}this.input.value=n.payload?.trim()||n.label,this.sendCurrentInput()}),this.quickActionsWrap.appendChild(o)}}setOpen(e){if(this.open=e,e){this.hideLauncherTip(!0),this.ensureInitialMessage(),this.panel.classList.add("open"),this.launcherWrap.style.opacity="0",this.launcherWrap.style.pointerEvents="none",this.input.focus(),this.scrollMessagesToBottom();return}this.panel.classList.remove("open"),this.launcherWrap.style.opacity="1",this.launcherWrap.style.pointerEvents="auto"}togglePanel(){this.setOpen(!this.open)}pushMessage(e){this.messages.push(e),this.renderMessages()}updateMessage(e,i){let n=this.messages.findIndex(o=>o.id===e);n<0||(this.messages[n]={...this.messages[n],...i},this.renderMessages())}removeMessage(e){this.messages=this.messages.filter(i=>i.id!==e),this.renderMessages()}renderMessages(){this.messagesWrap.innerHTML="",this.starterQuestionsWrap.style.display=this.messages.length<=1?this.starterQuestionsWrap.style.display:"none";for(let e of this.messages){let i=a(document,"div",`ieum-message ${e.role}`),n=a(document,"div","ieum-bubble");if(n.textContent=e.text,e.role==="assistant"){let o=N(e.outcome);if(o){let r=a(document,"div","ieum-outcome-note");r.textContent=o,n.appendChild(r)}if(e.citations&&e.citations.length>0){let r=a(document,"div","ieum-citations"),l=a(document,"div","ieum-citations-title");l.textContent="\uCD9C\uCC98",r.appendChild(l);for(let u of e.citations.slice(0,5)){let d=a(document,"div","ieum-citation");d.textContent=$(u),r.appendChild(d)}n.appendChild(r)}}i.appendChild(n),this.messagesWrap.appendChild(i)}if(this.lastFailedQuestion){let e=a(document,"div","ieum-message system"),i=a(document,"button","ieum-quick-action");i.type="button",i.textContent="\uB2E4\uC2DC \uC2DC\uB3C4",i.addEventListener("click",()=>{this.lastFailedQuestion&&(this.input.value=this.lastFailedQuestion,this.sendCurrentInput())}),e.appendChild(i),this.messagesWrap.appendChild(e)}this.scrollMessagesToBottom()}scrollMessagesToBottom(){requestAnimationFrame(()=>{this.messagesWrap.scrollTop=this.messagesWrap.scrollHeight})}setSending(e){this.sending=e,this.sendButton.disabled=e,this.input.disabled=e,this.loadingRow.classList.toggle("active",e)}async sendCurrentInput(){if(this.sending)return;let e=this.input.value.trim();if(e){if(this.lastFailedQuestion=null,this.input.value="",this.pushMessage({id:`user_${Date.now()}`,role:"user",text:e,timestamp:Date.now()}),this.setSending(!0),this.sseEnabled&&await this.trySendWithSse(e)){this.setSending(!1),this.input.focus();return}try{let i=await this.api.sendChat({chatbotId:this.options.chatbotId,question:e,topK:this.options.topK??8,sessionToken:this.sessionToken,sourceUrl:this.options.sourceUrl??window.location.href},this.chatEndpoint);this.handleAssistantResponse(i)}catch{this.lastFailedQuestion=e,this.pushMessage({id:`system_send_error_${Date.now()}`,role:"system",text:"\uC694\uCCAD \uCC98\uB9AC \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",timestamp:Date.now()})}finally{this.setSending(!1),this.input.focus()}}}async trySendWithSse(e){let i=`assistant_stream_${Date.now()}`,n=!1,o="\uC2A4\uD2B8\uB9AC\uBC0D \uC5F0\uACB0 \uC624\uB958\uB85C \uC77C\uBC18 \uBAA8\uB4DC\uB85C \uC804\uD658\uD569\uB2C8\uB2E4.",r="answered",l=[],u="",d=!1;this.pushMessage({id:i,role:"assistant",text:"",timestamp:Date.now()});let y=h=>{let p=h.data??{};if(h.event==="message_delta"){let c=f(p.delta)??"";u+=c,c&&(d=!0),this.updateMessage(i,{text:u});return}if(h.event==="message_complete"){r=f(p.outcome)??r,d=!0,this.updateMessage(i,{outcome:r,text:u||"..."});return}if(h.event==="fallback"||h.event==="escalation"){r=f(p.outcome)??(h.event==="escalation"?"escalate":"insufficient_evidence"),u=f(p.message)??"",d=!0,this.updateMessage(i,{text:u,outcome:r});return}if(h.event==="citations"){l=_(p.items),this.updateMessage(i,{citations:l});return}if(h.event==="error"){n=!0,o=f(p.message)??o;return}if(h.event==="done"){let c=f(p.sessionToken);c&&(this.sessionToken=c)}};try{if(await this.api.streamChat({chatbotId:this.options.chatbotId,question:e,topK:this.options.topK??8,sessionToken:this.sessionToken,sourceUrl:this.options.sourceUrl??window.location.href},y,this.chatStreamEndpoint),n)throw new Error(o);return u.trim()?this.updateMessage(i,{text:u,outcome:r,citations:l}):this.updateMessage(i,{text:"\uC694\uCCAD\uC744 \uCC98\uB9AC\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",outcome:"insufficient_evidence"}),!0}catch{return d?(this.updateMessage(i,{text:u||"\uC751\uB2F5 \uC218\uC2E0 \uC911 \uC5F0\uACB0\uC774 \uC885\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",outcome:r,citations:l}),this.lastFailedQuestion=e,!0):(this.removeMessage(i),!1)}}handleAssistantResponse(e){let i=e.trace?.messages?.sessionToken;i&&typeof i=="string"&&(this.sessionToken=i);let n=e.answer?.text?.trim()||"\uC548\uB0B4 \uAC00\uB2A5\uD55C \uB2F5\uBCC0\uC744 \uC0DD\uC131\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.";this.pushMessage({id:`assistant_${e.requestId}`,role:"assistant",text:n,outcome:e.outcome,citations:Array.isArray(e.citations)?e.citations:[],timestamp:Date.now()})}};var E=new Set;async function W(t){if(!t?.chatbotId)throw new Error("WIDGET_INIT_REQUIRES_CHATBOT_ID");let e=`${t.chatbotId}:${t.apiBaseUrl??""}`;if(E.has(e))return;await new x(t).mount(),E.add(e)}window.IEUMBOTWidget={init:W};var v=document.currentScript;if(v){let t=v.getAttribute("data-chatbot-id");t&&W({chatbotId:t,apiBaseUrl:v.getAttribute("data-api-base-url")??void 0,openOnLoad:v.getAttribute("data-open-on-load")==="true"})}})();
