"use strict";(()=>{var L=Object.defineProperty;var A=(i,e,t)=>e in i?L(i,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):i[e]=t;var o=(i,e,t)=>A(i,typeof e!="symbol"?e+"":e,t);function B(i){return i.endsWith("/")?i.slice(0,-1):i}var b=class{constructor(e){o(this,"baseUrl");this.baseUrl=B(e)}async getConfig(e){let t=await fetch(`${this.baseUrl}/widget/config/${encodeURIComponent(e)}`,{method:"GET",headers:{"Content-Type":"application/json"},credentials:"omit"});if(!t.ok)throw new Error(`WIDGET_CONFIG_FAILED:${t.status}`);return await t.json()}async sendChat(e,t="/chat/messages"){let n=t.startsWith("/")?t:`/${t}`,a=await fetch(`${this.baseUrl}${n}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e),credentials:"omit"});if(!a.ok)throw new Error(`WIDGET_CHAT_FAILED:${a.status}`);return await a.json()}async streamChat(e,t,n="/chat/messages/stream"){let a=n.startsWith("/")?n:`/${n}`,r=await fetch(`${this.baseUrl}${a}`,{method:"POST",headers:{"Content-Type":"application/json",Accept:"text/event-stream"},body:JSON.stringify(e),credentials:"omit"});if(!r.ok||!r.body)throw new Error(`WIDGET_CHAT_STREAM_FAILED:${r.status}`);let l=r.body.getReader(),p=new TextDecoder("utf-8"),d="";for(;;){let{value:v,done:c}=await l.read();if(c)break;d+=p.decode(v,{stream:!0});let u=d.indexOf(`

`);for(;u!==-1;){let h=d.slice(0,u).trim();if(d=d.slice(u+2),u=d.indexOf(`

`),!h)continue;let C="message",w=[];for(let m of h.split(`
`))m.startsWith("event:")?C=m.slice(6).trim():m.startsWith("data:")&&w.push(m.slice(5).trim());if(w.length!==0)try{let m=JSON.parse(w.join(`
`));t({event:C,data:m})}catch{t({event:"error",data:{code:"STREAM_EVENT_PARSE_FAILED",message:"\uC2A4\uD2B8\uB9BC \uC774\uBCA4\uD2B8 \uD30C\uC2F1 \uC2E4\uD328"}})}}}}};function s(i,e,t){let n=i.createElement(e);return t&&(n.className=t),n}function f(i){return i==="heart"?`
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M19.5 12.57 12 20l-7.5-7.43a4.95 4.95 0 0 1 0-7 4.95 4.95 0 0 1 7 0L12 6l.5-.43a4.95 4.95 0 0 1 7 7Z"/>
      </svg>
    `:i==="send"?`
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M22 2 11 13"/>
        <path d="m22 2-7 20-4-9-9-4Z"/>
      </svg>
    `:i==="minimize"?`
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M5 12h14"/>
      </svg>
    `:i==="close"?`
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
  `}function S(i){return!i||i==="answered"?null:i==="insufficient_evidence"?"\uD655\uC778 \uAC00\uB2A5\uD55C \uCC38\uACE0 \uB0B4\uC6A9\uC774 \uBD80\uC871\uD574 \uC77C\uBC18 \uC548\uB0B4\uB85C \uC804\uD658\uD588\uC2B5\uB2C8\uB2E4.":i==="restricted"?"\uC9C1\uC811 \uC548\uB0B4\uAC00 \uC5B4\uB824\uC6B4 \uC9C8\uBB38\uC774\uB77C \uC548\uC804\uD55C \uBC94\uC704\uC5D0\uC11C\uB9CC \uB2F5\uBCC0\uD569\uB2C8\uB2E4.":i==="conflict"?"\uADFC\uAC70 \uD655\uC778\uC774 \uB354 \uD544\uC694\uD55C \uC9C8\uBB38\uC785\uB2C8\uB2E4.":i==="escalate"?"\uCD94\uAC00 \uD655\uC778\uC774 \uD544\uC694\uD55C \uB0B4\uC6A9\uC73C\uB85C \uC0C1\uB2F4 \uC5F0\uACB0\uC774 \uAD8C\uC7A5\uB429\uB2C8\uB2E4.":null}function D(i){let e=i.documentName??"\uCD9C\uCC98",t=i.pageNumber?`p.${i.pageNumber}`:null,n=i.sectionTitle??null,a=i.sourceUrl??null;return[e,t,n,a].filter(Boolean).join(" | ")}function N(i){return i&&i.trim()?i.replace(/\/$/,""):`${window.location.origin}/api`}function g(i){return typeof i=="string"?i:void 0}function _(i){return typeof i=="boolean"?i:void 0}function H(i){return Array.isArray(i)?i:[]}function T(i,e){return e.title?.trim()||i?.institutionName?.trim()||i?.chatbotName?.trim()||"\uAE30\uAD00"}function k(i,e){let t=T(i,e);return t.startsWith("AI \uCC57\uBD07")?t:`AI \uCC57\uBD07 ${t}`}function $(i,e){return e.welcomeMessage?.trim()?e.welcomeMessage.trim():i?.introMessage?.trim()?i.introMessage.trim():`\uC548\uB155\uD558\uC138\uC694
${T(i,e)} AI \uCC57\uBD07\uC785\uB2C8\uB2E4.

\uAD81\uAE08\uD558\uC2E0 \uB0B4\uC6A9\uC744 \uC785\uB825\uD574\uC8FC\uC2DC\uBA74
\uBE60\uB974\uAC8C \uC548\uB0B4\uD574\uB4DC\uB9AC\uACA0\uC2B5\uB2C8\uB2E4.`}function M(i){return i==="forest"?"linear-gradient(135deg, #166534, #0f766e)":i==="sky"?"linear-gradient(135deg, #1d4ed8, #0284c7)":i==="civic"?"linear-gradient(135deg, #1e40af, #0f766e)":i==="sunset"?"linear-gradient(135deg, #b45309, #ea580c)":"linear-gradient(135deg, #2563EB, #22C55E)"}function E(i){return`
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
.ieum-floating {
  width: 56px;
  height: 56px;
  border: none;
  border-radius: 9999px;
  background: ${i};
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
.ieum-floating svg,
.ieum-header-icon svg,
.ieum-header-icon img,
.ieum-header-button svg,
.ieum-send svg {
  width: 22px;
  height: 22px;
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
  background: ${i};
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.ieum-header-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.ieum-header-icon {
  width: 34px;
  height: 34px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.16);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}
.ieum-title {
  font-size: 15px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ieum-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ieum-header-button {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.ieum-header-button:hover {
  background: rgba(255, 255, 255, 0.24);
}
.ieum-messages {
  flex: 1;
  padding: 16px;
  background: #f8fafc;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ieum-banner {
  margin: 16px 16px 0;
  border: 1px solid rgba(37, 99, 235, 0.12);
  border-radius: 14px;
  padding: 12px 14px;
  background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(239,246,255,0.9));
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.05);
}
.ieum-banner-title {
  font-size: 12px;
  font-weight: 700;
  color: #1e3a8a;
}
.ieum-banner-description {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: #475569;
  white-space: pre-wrap;
}
.ieum-starter-questions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 16px 12px;
  background: #f8fafc;
}
.ieum-starter-question {
  width: 100%;
  border: 1px solid #dbe4f0;
  border-radius: 14px;
  background: #ffffff;
  color: #0f172a;
  padding: 10px 12px;
  text-align: left;
  font-size: 12px;
  line-height: 1.45;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
}
.ieum-starter-question:hover {
  border-color: #93c5fd;
  background: #eff6ff;
}
.ieum-message {
  display: flex;
  width: 100%;
  animation: ieum-message-in .2s ease;
}
.ieum-message.user {
  justify-content: flex-end;
}
.ieum-message.assistant,
.ieum-message.system {
  justify-content: flex-start;
}
.ieum-bubble {
  max-width: 75%;
  border-radius: 16px;
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
.ieum-message.assistant .ieum-bubble,
.ieum-message.system .ieum-bubble {
  background: #ffffff;
  color: #0f172a;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}
.ieum-message.user .ieum-bubble {
  background: #2563eb;
  color: #ffffff;
}
.ieum-outcome-note {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed #dbe4f0;
  font-size: 11px;
  color: #64748b;
}
.ieum-citations {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed #dbe4f0;
}
.ieum-citations-title {
  margin-bottom: 4px;
  font-size: 11px;
  color: #475569;
  font-weight: 700;
}
.ieum-citation {
  font-size: 11px;
  color: #475569;
  line-height: 1.45;
  margin-bottom: 3px;
}
.ieum-quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 16px 12px;
  background: #f8fafc;
}
.ieum-quick-action {
  border: 1px solid #dbe4f0;
  border-radius: 9999px;
  background: #ffffff;
  color: #1e3a8a;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
}
.ieum-quick-action:hover {
  border-color: #93c5fd;
  background: #eff6ff;
}
.ieum-loading {
  display: none;
  align-self: flex-start;
  max-width: 75%;
  margin: 0 16px 12px;
  border-radius: 16px;
  padding: 12px 14px;
  background: #ffffff;
  color: #64748b;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
  font-size: 18px;
  line-height: 1;
}
.ieum-loading.active {
  display: inline-flex;
  gap: 4px;
}
.ieum-loading-dot {
  width: 5px;
  height: 5px;
  border-radius: 9999px;
  background: #94a3b8;
  animation: ieum-dot 1s infinite ease-in-out;
}
.ieum-loading-dot:nth-child(2) { animation-delay: .15s; }
.ieum-loading-dot:nth-child(3) { animation-delay: .3s; }
.ieum-input-wrap {
  min-height: 64px;
  border-top: 1px solid #e5e7eb;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  background: #ffffff;
}
.ieum-input {
  flex: 1;
  min-width: 0;
  height: 44px;
  border-radius: 9999px;
  border: 1px solid #e5e7eb;
  padding: 10px 14px;
  font-size: 13px;
  color: #0f172a;
  outline: none;
}
.ieum-input::placeholder {
  color: #94a3b8;
}
.ieum-input:focus {
  border-color: #93c5fd;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.08);
}
.ieum-send {
  width: 42px;
  height: 42px;
  border: none;
  border-radius: 9999px;
  background: #2563eb;
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: filter .16s ease, transform .16s ease;
}
.ieum-send:hover {
  filter: brightness(1.1);
}
.ieum-send:disabled,
.ieum-floating:disabled {
  opacity: .65;
  cursor: default;
}
.ieum-footer {
  border-top: 1px solid #eef2f7;
  padding: 8px 12px;
  background: #f8fafc;
  font-size: 11px;
  color: #64748b;
  line-height: 1.45;
}
@keyframes ieum-dot {
  0%, 80%, 100% { transform: translateY(0); opacity: .45; }
  40% { transform: translateY(-3px); opacity: 1; }
}
@keyframes ieum-message-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (max-width: 640px) {
  .ieum-root {
    right: 8px;
    left: 8px;
    bottom: 8px;
  }
  .ieum-panel {
    width: 100%;
    height: min(520px, calc(100vh - 16px));
  }
  .ieum-bubble {
    max-width: 84%;
  }
}
`}var x=class{constructor(e){o(this,"options");o(this,"api");o(this,"host");o(this,"shadow");o(this,"root");o(this,"floatingButton");o(this,"panel");o(this,"titleNode");o(this,"headerIconNode");o(this,"bannerWrap");o(this,"starterQuestionsWrap");o(this,"quickActionsWrap");o(this,"messagesWrap");o(this,"loadingRow");o(this,"input");o(this,"sendButton");o(this,"footerNotice");o(this,"initialized",!1);o(this,"open",!1);o(this,"sending",!1);o(this,"sessionToken",`widget_${Math.random().toString(36).slice(2,10)}_${Date.now().toString(36)}`);o(this,"config",null);o(this,"chatEndpoint","/chat/messages");o(this,"chatStreamEndpoint","/chat/messages/stream");o(this,"sseEnabled",!1);o(this,"messages",[]);o(this,"lastFailedQuestion",null);this.options=e,this.api=new b(N(e.apiBaseUrl)),this.host=document.createElement("div"),this.host.setAttribute("data-ieumbot-widget-root","true"),this.shadow=this.host.attachShadow({mode:"open"}),this.root=s(document,"div","ieum-root"),this.floatingButton=s(document,"button","ieum-floating"),this.panel=s(document,"div","ieum-panel"),this.titleNode=s(document,"div","ieum-title"),this.headerIconNode=s(document,"div","ieum-header-icon"),this.bannerWrap=s(document,"div","ieum-banner"),this.starterQuestionsWrap=s(document,"div","ieum-starter-questions"),this.quickActionsWrap=s(document,"div","ieum-quick-actions"),this.messagesWrap=s(document,"div","ieum-messages"),this.loadingRow=s(document,"div","ieum-loading"),this.input=s(document,"input","ieum-input"),this.sendButton=s(document,"button","ieum-send"),this.footerNotice=s(document,"div","ieum-footer"),this.floatingButton.type="button",this.floatingButton.title=e.launcherLabel??"\uCC57\uBD07 \uC5F4\uAE30",this.floatingButton.setAttribute("aria-label",e.launcherLabel??"\uCC57\uBD07 \uC5F4\uAE30"),this.floatingButton.innerHTML=f("chat"),this.titleNode.textContent=k(null,e),this.loadingRow.innerHTML=`
      <span class="ieum-loading-dot"></span>
      <span class="ieum-loading-dot"></span>
      <span class="ieum-loading-dot"></span>
    `,this.input.placeholder="\uBB34\uC5C7\uC744 \uB3C4\uC640\uB4DC\uB9B4\uAE4C\uC694?",this.sendButton.type="button",this.sendButton.setAttribute("aria-label","\uBA54\uC2DC\uC9C0 \uC804\uC1A1"),this.sendButton.innerHTML=f("send"),this.footerNotice.style.display="none"}async mount(){if(this.initialized)return;this.initialized=!0;let e=document.createElement("style");e.textContent=E(M(this.options.theme?.primaryColor??null)),this.shadow.appendChild(e),this.shadow.appendChild(this.root);let t=s(document,"div","ieum-header"),n=s(document,"div","ieum-header-main"),a=s(document,"div","ieum-header-actions"),r=s(document,"button","ieum-header-button"),l=s(document,"button","ieum-header-button"),p=s(document,"div","ieum-input-wrap");this.headerIconNode.innerHTML=f("heart"),r.type="button",r.title="\uCD5C\uC18C\uD654",r.setAttribute("aria-label","\uCD5C\uC18C\uD654"),r.innerHTML=f("minimize"),l.type="button",l.title="\uB2EB\uAE30",l.setAttribute("aria-label","\uB2EB\uAE30"),l.innerHTML=f("close"),n.appendChild(this.headerIconNode),n.appendChild(this.titleNode),a.appendChild(r),a.appendChild(l),t.appendChild(n),t.appendChild(a),p.appendChild(this.input),p.appendChild(this.sendButton),this.panel.appendChild(t),this.panel.appendChild(this.bannerWrap),this.panel.appendChild(this.messagesWrap),this.panel.appendChild(this.starterQuestionsWrap),this.panel.appendChild(this.quickActionsWrap),this.panel.appendChild(this.loadingRow),this.panel.appendChild(p),this.panel.appendChild(this.footerNotice),this.root.appendChild(this.panel),this.root.appendChild(this.floatingButton),document.body.appendChild(this.host),this.floatingButton.addEventListener("click",()=>this.togglePanel()),r.addEventListener("click",()=>this.setOpen(!1)),l.addEventListener("click",()=>this.setOpen(!1)),this.sendButton.addEventListener("click",()=>void this.sendCurrentInput()),this.input.addEventListener("keydown",d=>{d.key==="Enter"&&!d.shiftKey&&(d.preventDefault(),this.sendCurrentInput())}),await this.loadConfig(),this.options.openOnLoad&&this.setOpen(!0)}ensureInitialMessage(){this.messages.length>0||(this.pushMessage({id:`assistant_welcome_${Date.now()}`,role:"assistant",text:$(this.config,this.options),timestamp:Date.now()}),this.config?.operatingHours.isAfterHours&&this.config.operatingHours.message&&this.pushMessage({id:`system_after_hours_${Date.now()}`,role:"system",text:this.config.operatingHours.message,timestamp:Date.now()}))}async loadConfig(){try{this.config=await this.api.getConfig(this.options.chatbotId);let e=this.shadow.querySelector("style");e&&(e.textContent=E(M(this.config.theme?.preset))),this.titleNode.textContent=k(this.config,this.options),this.config.logoUrl?.trim()?this.headerIconNode.innerHTML=`<img src="${this.config.logoUrl}" alt="\uAE30\uAD00 \uB85C\uACE0" />`:this.headerIconNode.innerHTML=f("heart"),this.renderBanner(),this.renderStarterQuestions(),this.config.privacyNotice&&(this.footerNotice.textContent=this.config.privacyNotice,this.footerNotice.style.display="block"),this.renderQuickActions(this.config.quickActions),this.config.runtime?.chatEndpoint&&(this.chatEndpoint=this.config.runtime.chatEndpoint),this.config.runtime?.chatStreamEndpoint&&(this.chatStreamEndpoint=this.config.runtime.chatStreamEndpoint),this.sseEnabled=_(this.config.runtime?.sseEnabled)===!0||this.config.runtime?.streamingMode==="sse_preferred",this.ensureInitialMessage()}catch{this.pushMessage({id:`system_load_error_${Date.now()}`,role:"system",text:"\uCD08\uAE30 \uC124\uC815\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",timestamp:Date.now()})}}renderBanner(){this.bannerWrap.innerHTML="";let e=this.config?.banner?.title?.trim(),t=this.config?.banner?.description?.trim();if(!e&&!t){this.bannerWrap.style.display="none";return}if(this.bannerWrap.style.display="block",e){let n=s(document,"div","ieum-banner-title");n.textContent=e,this.bannerWrap.appendChild(n)}if(t){let n=s(document,"div","ieum-banner-description");n.textContent=t,this.bannerWrap.appendChild(n)}}renderStarterQuestions(){this.starterQuestionsWrap.innerHTML="";let e=this.config?.starterQuestions?.filter(t=>t.trim()).slice(0,4)??[];if(e.length===0){this.starterQuestionsWrap.style.display="none";return}this.starterQuestionsWrap.style.display="flex";for(let t of e){let n=s(document,"button","ieum-starter-question");n.type="button",n.textContent=t,n.addEventListener("click",()=>{this.input.value=t,this.sendCurrentInput()}),this.starterQuestionsWrap.appendChild(n)}}renderQuickActions(e){this.quickActionsWrap.innerHTML="";let t=e.filter(n=>n.displayLocation==="welcome").slice(0,6);if(t.length===0){this.quickActionsWrap.style.display="none";return}this.quickActionsWrap.style.display="flex";for(let n of t){let a=s(document,"button","ieum-quick-action");a.type="button",a.textContent=n.label,a.title=n.label,a.addEventListener("click",()=>{if(n.actionType==="link"&&n.url){window.open(n.url,"_blank","noopener,noreferrer");return}this.input.value=n.payload?.trim()||n.label,this.sendCurrentInput()}),this.quickActionsWrap.appendChild(a)}}setOpen(e){if(this.open=e,e){this.ensureInitialMessage(),this.panel.classList.add("open"),this.floatingButton.style.opacity="0",this.floatingButton.style.pointerEvents="none",this.input.focus(),this.scrollMessagesToBottom();return}this.panel.classList.remove("open"),this.floatingButton.style.opacity="1",this.floatingButton.style.pointerEvents="auto"}togglePanel(){this.setOpen(!this.open)}pushMessage(e){this.messages.push(e),this.renderMessages()}updateMessage(e,t){let n=this.messages.findIndex(a=>a.id===e);n<0||(this.messages[n]={...this.messages[n],...t},this.renderMessages())}removeMessage(e){this.messages=this.messages.filter(t=>t.id!==e),this.renderMessages()}renderMessages(){this.messagesWrap.innerHTML="",this.starterQuestionsWrap.style.display=this.messages.length<=1?this.starterQuestionsWrap.style.display:"none";for(let e of this.messages){let t=s(document,"div",`ieum-message ${e.role}`),n=s(document,"div","ieum-bubble");if(n.textContent=e.text,e.role==="assistant"){let a=S(e.outcome);if(a){let r=s(document,"div","ieum-outcome-note");r.textContent=a,n.appendChild(r)}if(e.citations&&e.citations.length>0){let r=s(document,"div","ieum-citations"),l=s(document,"div","ieum-citations-title");l.textContent="\uCD9C\uCC98",r.appendChild(l);for(let p of e.citations.slice(0,5)){let d=s(document,"div","ieum-citation");d.textContent=D(p),r.appendChild(d)}n.appendChild(r)}}t.appendChild(n),this.messagesWrap.appendChild(t)}if(this.lastFailedQuestion){let e=s(document,"div","ieum-message system"),t=s(document,"button","ieum-quick-action");t.type="button",t.textContent="\uB2E4\uC2DC \uC2DC\uB3C4",t.addEventListener("click",()=>{this.lastFailedQuestion&&(this.input.value=this.lastFailedQuestion,this.sendCurrentInput())}),e.appendChild(t),this.messagesWrap.appendChild(e)}this.scrollMessagesToBottom()}scrollMessagesToBottom(){requestAnimationFrame(()=>{this.messagesWrap.scrollTop=this.messagesWrap.scrollHeight})}setSending(e){this.sending=e,this.sendButton.disabled=e,this.input.disabled=e,this.loadingRow.classList.toggle("active",e)}async sendCurrentInput(){if(this.sending)return;let e=this.input.value.trim();if(e){if(this.lastFailedQuestion=null,this.input.value="",this.pushMessage({id:`user_${Date.now()}`,role:"user",text:e,timestamp:Date.now()}),this.setSending(!0),this.sseEnabled&&await this.trySendWithSse(e)){this.setSending(!1),this.input.focus();return}try{let t=await this.api.sendChat({chatbotId:this.options.chatbotId,question:e,topK:this.options.topK??8,sessionToken:this.sessionToken,sourceUrl:this.options.sourceUrl??window.location.href},this.chatEndpoint);this.handleAssistantResponse(t)}catch{this.lastFailedQuestion=e,this.pushMessage({id:`system_send_error_${Date.now()}`,role:"system",text:"\uC694\uCCAD \uCC98\uB9AC \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",timestamp:Date.now()})}finally{this.setSending(!1),this.input.focus()}}}async trySendWithSse(e){let t=`assistant_stream_${Date.now()}`,n=!1,a="\uC2A4\uD2B8\uB9AC\uBC0D \uC5F0\uACB0 \uC624\uB958\uB85C \uC77C\uBC18 \uBAA8\uB4DC\uB85C \uC804\uD658\uD569\uB2C8\uB2E4.",r="answered",l=[],p="",d=!1;this.pushMessage({id:t,role:"assistant",text:"",timestamp:Date.now()});let v=c=>{let u=c.data??{};if(c.event==="message_delta"){let h=g(u.delta)??"";p+=h,h&&(d=!0),this.updateMessage(t,{text:p});return}if(c.event==="message_complete"){r=g(u.outcome)??r,d=!0,this.updateMessage(t,{outcome:r,text:p||"..."});return}if(c.event==="fallback"||c.event==="escalation"){r=g(u.outcome)??(c.event==="escalation"?"escalate":"insufficient_evidence"),p=g(u.message)??"",d=!0,this.updateMessage(t,{text:p,outcome:r});return}if(c.event==="citations"){l=H(u.items),this.updateMessage(t,{citations:l});return}if(c.event==="error"){n=!0,a=g(u.message)??a;return}if(c.event==="done"){let h=g(u.sessionToken);h&&(this.sessionToken=h)}};try{if(await this.api.streamChat({chatbotId:this.options.chatbotId,question:e,topK:this.options.topK??8,sessionToken:this.sessionToken,sourceUrl:this.options.sourceUrl??window.location.href},v,this.chatStreamEndpoint),n)throw new Error(a);return p.trim()?this.updateMessage(t,{text:p,outcome:r,citations:l}):this.updateMessage(t,{text:"\uC694\uCCAD\uC744 \uCC98\uB9AC\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",outcome:"insufficient_evidence"}),!0}catch{return d?(this.updateMessage(t,{text:p||"\uC751\uB2F5 \uC218\uC2E0 \uC911 \uC5F0\uACB0\uC774 \uC885\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",outcome:r,citations:l}),this.lastFailedQuestion=e,!0):(this.removeMessage(t),!1)}}handleAssistantResponse(e){let t=e.trace?.messages?.sessionToken;t&&typeof t=="string"&&(this.sessionToken=t);let n=e.answer?.text?.trim()||"\uC548\uB0B4 \uAC00\uB2A5\uD55C \uB2F5\uBCC0\uC744 \uC0DD\uC131\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.";this.pushMessage({id:`assistant_${e.requestId}`,role:"assistant",text:n,outcome:e.outcome,citations:Array.isArray(e.citations)?e.citations:[],timestamp:Date.now()})}};var W=new Set;async function I(i){if(!i?.chatbotId)throw new Error("WIDGET_INIT_REQUIRES_CHATBOT_ID");let e=`${i.chatbotId}:${i.apiBaseUrl??""}`;if(W.has(e))return;await new x(i).mount(),W.add(e)}window.IEUMBOTWidget={init:I};var y=document.currentScript;if(y){let i=y.getAttribute("data-chatbot-id");i&&I({chatbotId:i,apiBaseUrl:y.getAttribute("data-api-base-url")??void 0,openOnLoad:y.getAttribute("data-open-on-load")==="true"})}})();
