"use strict";(()=>{var D=Object.defineProperty;var R=(t,e,i)=>e in t?D(t,e,{enumerable:!0,configurable:!0,writable:!0,value:i}):t[e]=i;var c=(t,e,i)=>R(t,typeof e!="symbol"?e+"":e,i);function B(t){return t.endsWith("/")?t.slice(0,-1):t}var w=class{constructor(e){c(this,"baseUrl");this.baseUrl=B(e)}async getConfig(e){let i=await fetch(`${this.baseUrl}/widget/config/${encodeURIComponent(e)}`,{method:"GET",headers:{"Content-Type":"application/json"},credentials:"omit"});if(!i.ok)throw new Error(`WIDGET_CONFIG_FAILED:${i.status}`);return await i.json()}async sendChat(e,i="/chat/messages"){let n=i.startsWith("/")?i:`/${i}`,l=await fetch(`${this.baseUrl}${n}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e),credentials:"omit"});if(!l.ok)throw new Error(`WIDGET_CHAT_FAILED:${l.status}`);return await l.json()}async sendFeedback(e,i){await fetch(`${this.baseUrl}/chat/messages/${encodeURIComponent(e)}/feedback`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({feedback:i}),credentials:"omit"})}async streamChat(e,i,n="/chat/messages/stream"){let l=n.startsWith("/")?n:`/${n}`,r=await fetch(`${this.baseUrl}${l}`,{method:"POST",headers:{"Content-Type":"application/json",Accept:"text/event-stream"},body:JSON.stringify(e),credentials:"omit"});if(!r.ok||!r.body)throw new Error(`WIDGET_CHAT_STREAM_FAILED:${r.status}`);let a=r.body.getReader(),d=new TextDecoder("utf-8"),s="";for(;;){let{value:h,done:p}=await a.read();if(p)break;s+=d.decode(h,{stream:!0});let u=s.indexOf(`

`);for(;u!==-1;){let m=s.slice(0,u).trim();if(s=s.slice(u+2),u=s.indexOf(`

`),!m)continue;let f="message",k=[];for(let x of m.split(`
`))x.startsWith("event:")?f=x.slice(6).trim():x.startsWith("data:")&&k.push(x.slice(5).trim());if(k.length!==0)try{let x=JSON.parse(k.join(`
`));i({event:f,data:x})}catch{i({event:"error",data:{code:"STREAM_EVENT_PARSE_FAILED",message:"\uC2A4\uD2B8\uB9BC \uC774\uBCA4\uD2B8 \uD30C\uC2F1 \uC2E4\uD328"}})}}}}};var U="/widget-icons/love-chat-icons.png",L="\uC694\uCCAD \uCC98\uB9AC \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",N="\uAC1C\uC778\uC815\uBCF4\uAC00 \uD3EC\uD568\uB41C \uB0B4\uC6A9\uC740 \uC785\uB825\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uAC1C\uC778\uC815\uBCF4\uB97C \uC81C\uC678\uD558\uACE0 \uB2E4\uC2DC \uC785\uB825\uD574 \uC8FC\uC138\uC694.",M="AI \uC774\uC74C\uBD07\uB3C4 \uAC00\uB054 \uC2E4\uC218\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uC911\uC694\uD55C \uC815\uBCF4\uB294 \uAF2D \uB2E4\uC2DC \uD55C\uBC88 \uD655\uC778\uD558\uC138\uC694.",z=[/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,/\b\d{6}-[1-4]\d{6}\b/,/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/,/\b01[016789][- ]?\d{3,4}[- ]?\d{4}\b/,/\b(?:19|20)\d{2}[-./](?:0[1-9]|1[0-2])[-./](?:0[1-9]|[12]\d|3[01])\b/];function Q(t){return t.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function E(t){return`<img class="ieum-launcher-image" src="${Q(t.trim())}" alt="" aria-hidden="true" />`}function o(t,e,i){let n=t.createElement(e);return i&&(n.className=i),n}function g(t,e){return t==="custom"&&e?.trim()?E(e):t==="love-chat"?E(U):t==="heart"?`
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
  `}function $(t){return t&&t.trim()?t.replace(/\/$/,""):`${window.location.origin}/api`}function v(t){return typeof t=="string"?t:void 0}function P(t){return typeof t=="boolean"?t:void 0}function O(t){return Array.isArray(t)?t:[]}function q(t){return Array.isArray(t)?t.filter(e=>typeof e=="string"):[]}function j(t){return z.some(e=>e.test(t))}function H(t){return/^https?:\/\//i.test(t)||/^[\w.-]+\.[a-z]{2,}(?:\/|\?|$)/i.test(t)}function F(t){if(!t?.trim())return null;try{return new URL(t.trim()).hostname.replace(/^www\./,"")}catch{return null}}function K(t){return!t||t==="answered"?null:t==="insufficient_evidence"?"\uB4F1\uB85D\uB41C \uC790\uB8CC\uC5D0\uC11C \uAD00\uB828 \uC815\uBCF4\uB97C \uCDA9\uBD84\uD788 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.":t==="restricted"?"\uC548\uC804\uD55C \uC548\uB0B4 \uBC94\uC704\uC5D0\uC11C \uB2F5\uBCC0\uC774 \uC81C\uD55C\uB41C \uC9C8\uBB38\uC785\uB2C8\uB2E4.":t==="conflict"?"\uADFC\uAC70 \uD655\uC778\uC774 \uB354 \uD544\uC694\uD55C \uC9C8\uBB38\uC785\uB2C8\uB2E4.":t==="escalate"?"\uC815\uD655\uD55C \uD655\uC778\uC774 \uD544\uC694\uD55C \uB0B4\uC6A9\uC785\uB2C8\uB2E4.":null}function Y(t,e){let i=e?.trim()||null,n=t.documentName?.trim()||"\uCD9C\uCC98",l=t.pageNumber?`p.${t.pageNumber}`:null,r=t.sectionTitle?.trim()||null,a=i&&i!==n?[i,n]:[n];return l&&a.push(l),r&&r!==n&&!H(r)&&a.push(r),a.join(" | ")}function Z(t){let e=t.sectionTitle?.trim();if(e&&!H(e))return e;let i=t.documentName?.trim();if(i)return i;let n=t.sourceTitle?.trim();return n||(F(t.sourceUrl)??"\uCC38\uC870 \uC790\uB8CC")}function G(t){return t.some(e=>e.sourceUrl?.trim())?"\uCC38\uC870 \uB9C1\uD06C":"\uCC38\uC870 \uC790\uB8CC"}function V(t){return t?.citationPresentation==="folded"||t?.citationMode==="compact"}function C(t,e){return e.title?.trim()||t?.institutionName?.trim()||t?.chatbotName?.trim()||"\uAE30\uAD00"}function I(t,e){let i=e.title?.trim()||t?.chatbotName?.trim()||C(t,e);return i.startsWith("AI \uCC57\uBD07")?i:`AI \uCC57\uBD07 ${i}`}function J(t,e){if(e.welcomeMessage?.trim())return e.welcomeMessage.trim();if(t?.introMessage?.trim())return t.introMessage.trim();if(t?.welcomeMessage?.trim())return t.welcomeMessage.trim();let i=C(t,e);return i&&i!=="\uAE30\uAD00"?`\uC548\uB155\uD558\uC138\uC694. ${i} AI \uC0C1\uB2F4\uBD07\uC785\uB2C8\uB2E4. \uAD81\uAE08\uD558\uC2E0 \uB0B4\uC6A9\uC744 \uD3B8\uD558\uAC8C \uC785\uB825\uD574\uC8FC\uC138\uC694.`:"\uC548\uB155\uD558\uC138\uC694. \uAD81\uAE08\uD558\uC2E0 \uB0B4\uC6A9\uC744 \uC785\uB825\uD574\uC8FC\uC2DC\uBA74 \uBE60\uB974\uAC8C \uC548\uB0B4\uD574\uB4DC\uB9AC\uACA0\uC2B5\uB2C8\uB2E4."}function A(t){return t==="forest"?"linear-gradient(135deg, #166534, #0f766e)":t==="sky"?"linear-gradient(135deg, #1d4ed8, #0284c7)":t==="civic"?"linear-gradient(135deg, #1e40af, #0f766e)":t==="sunset"?"linear-gradient(135deg, #b45309, #ea580c)":"linear-gradient(135deg, #2563EB, #22C55E)"}function X(t){let e=t?.theme?.launcherIcon;return e==="custom"&&t?.theme?.launcherIconUrl?.trim()?"custom":e==="love-chat"||e==="heart"||e==="shield"||e==="leaf"||e==="spark"?e:"chat"}function ee(t){let e=t.initialLauncherIcon?.trim(),i=t.initialLauncherIconUrl?.trim();return e==="custom"&&i?"custom":e==="love-chat"||e==="heart"||e==="shield"||e==="leaf"||e==="spark"?e:"chat"}function W(t,e){return t==="love-chat"||t==="custom"&&!!e?.trim()}function te(t,e){let i=t?.launcherHoverMessage?.trim();return i||`${C(t,e)} AI \uC0C1\uB2F4\uBD07\uC785\uB2C8\uB2E4. \uBB34\uC5C7\uC744 \uB3C4\uC640\uB4DC\uB9B4\uAE4C\uC694?`}function _(t){return`
:host { all: initial; }
.ieum-root, .ieum-root * {
  box-sizing: border-box;
  font-family: "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", -apple-system, Arial, sans-serif;
  letter-spacing: -0.01em;
}
.ieum-root {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 2147480000;
  color: #111827;
}
/* \u2500\u2500 \uB7F0\uCC98 \uB798\uD37C \u2500\u2500 */
.ieum-launcher-wrap {
  position:absolute; right:0; bottom:0;
  display:flex; flex-direction:column; align-items:flex-end; gap:12px;
}
/* \u2500\u2500 \uD234\uD301 \uB9D0\uD48D\uC120 \u2500\u2500 */
.ieum-launcher-tip {
  width:min(300px, calc(100vw - 48px));
  border:1px solid #e8edf5; border-radius:16px;
  background:#fff; box-shadow:0 8px 32px rgba(37,99,235,.12);
  padding:12px 14px 12px 16px; display:none; align-items:flex-start; gap:10px;
}
.ieum-launcher-tip.visible { display:flex; animation:ieum-tooltip-in .18s ease; }
.ieum-launcher-tip-text { flex:1; font-size:13px; line-height:1.6; color:#111827; white-space:pre-wrap; word-break:keep-all; }
.ieum-launcher-tip-close {
  width:22px; height:22px; border:none; border-radius:9999px;
  background:#f3f4f6; color:#6b7280;
  display:inline-flex; align-items:center; justify-content:center; cursor:pointer; flex:0 0 auto;
}
.ieum-launcher-tip-close svg { width:13px; height:13px; }
/* \u2500\u2500 \uD50C\uB85C\uD305 \uBC84\uD2BC \u2500\u2500 */
.ieum-floating {
  width:60px; height:60px; border:none; border-radius:9999px;
  background:#2563eb; color:#fff;
  display:inline-flex; align-items:center; justify-content:center; cursor:pointer;
  box-shadow:0 6px 24px rgba(37,99,235,.35);
  transition:transform .18s ease, box-shadow .18s ease, opacity .18s ease;
}
.ieum-floating.ieum-floating-loading { opacity:0; pointer-events:none; transform:scale(.9); }
.ieum-floating:hover { transform:scale(1.06); box-shadow:0 10px 32px rgba(37,99,235,.4); }
.ieum-floating.ieum-floating-image { background:transparent; box-shadow:none; padding:0; }
.ieum-floating.ieum-floating-image:hover { box-shadow:none; }
.ieum-floating .ieum-launcher-image {
  width:60px; height:60px; border-radius:9999px;
  object-fit:contain; display:block; background:transparent;
}
.ieum-floating.ieum-floating-image .ieum-launcher-image {
  filter:drop-shadow(0 6px 20px rgba(37,99,235,.28));
}
.ieum-floating svg { width:28px; height:28px; }
.ieum-header-icon svg, .ieum-header-icon img, .ieum-header-button svg { width:20px; height:20px; }
.ieum-send svg { width:20px; height:20px; }
.ieum-header-icon img { object-fit:contain; border-radius:9999px; }
/* \u2500\u2500 \uD328\uB110 \u2500\u2500 */
.ieum-panel {
  position:absolute; right:0; bottom:0;
  width:min(380px, calc(100vw - 16px));
  height:min(600px, calc(100vh - 16px));
  border-radius:20px;
  border:2px solid #2563eb;
  background:#fff;
  overflow:hidden;
  box-shadow:0 16px 48px rgba(37,99,235,.18), 0 4px 16px rgba(0,0,0,.06);
  display:flex; flex-direction:column;
  opacity:0; transform:translateY(24px) scale(.97);
  pointer-events:none;
  transition:opacity .24s ease, transform .24s ease;
}
.ieum-panel.open { opacity:1; transform:translateY(0) scale(1); pointer-events:auto; }
/* \u2500\u2500 \uD5E4\uB354 \u2500\u2500 */
.ieum-header {
  min-height:58px; padding:12px 14px;
  background:#2563eb;
  color:#fff;
  display:flex; align-items:center; justify-content:space-between;
  flex-shrink:0;
}
.ieum-header-main { display:flex; align-items:center; gap:10px; min-width:0; }
.ieum-header-icon {
  width:36px; height:36px; border-radius:9999px;
  background:rgba(255,255,255,.2);
  display:inline-flex; align-items:center; justify-content:center; flex:0 0 auto;
}
.ieum-title { font-size:15px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ieum-header-actions { display:flex; align-items:center; gap:4px; }
.ieum-header-button {
  width:32px; height:32px; border:none; border-radius:9999px;
  background:rgba(255,255,255,.15); color:#fff;
  display:inline-flex; align-items:center; justify-content:center; cursor:pointer;
  transition:background .15s;
}
.ieum-header-button:hover { background:rgba(255,255,255,.28); }
/* \u2500\u2500 \uBA54\uC2DC\uC9C0 \uC601\uC5ED \u2500\u2500 */
.ieum-messages {
  flex:1; padding:16px 14px; background:#fff;
  overflow-y:auto; display:flex; flex-direction:column; gap:12px;
  scroll-behavior:smooth;
}
.ieum-messages::-webkit-scrollbar { width:4px; }
.ieum-messages::-webkit-scrollbar-thumb { background:#e2e8f0; border-radius:4px; }
/* \u2500\u2500 \uBC30\uB108 \u2500\u2500 */
.ieum-banner {
  margin:0 0 4px; border:1px solid #dbeafe; border-radius:12px; padding:10px 12px;
  background:linear-gradient(135deg, #eff6ff, #fff);
}
.ieum-banner-title { font-size:11px; font-weight:700; color:#1e40af; }
.ieum-banner-description { margin-top:3px; font-size:11px; line-height:1.5; color:#475569; white-space:pre-wrap; }
/* \u2500\u2500 \uC2A4\uD0C0\uD130 \uC9C8\uBB38 \u2500\u2500 */
.ieum-starter-questions {
  display:flex; flex-direction:column; gap:8px; padding:0 0 12px; background:#fff;
}
.ieum-quick-actions { display:flex; flex-wrap:wrap; gap:6px; padding:0 0 8px; background:#fff; }
.ieum-starter-question {
  width:100%; border:1px solid #e5e7eb; border-radius:12px;
  background:#fff; color:#111827; padding:11px 14px;
  cursor:pointer; font-size:13px; line-height:1.45;
  text-align:left; transition:border-color .15s, background .15s;
  display:block;
}
.ieum-starter-question:hover { border-color:#93c5fd; background:#f0f7ff; }
.ieum-quick-action {
  border:1px solid #dbeafe; border-radius:9999px;
  background:#eff6ff; color:#1d4ed8; padding:7px 14px;
  font-size:12px; font-weight:600; cursor:pointer;
  transition:background .15s;
}
.ieum-quick-action:hover { background:#dbeafe; }
/* \u2500\u2500 \uD78C\uD2B8 \uBC84\uD2BC \u2500\u2500 */
.ieum-hints-row { display:flex; flex-wrap:wrap; gap:6px; padding:4px 0 8px; }
.ieum-hint-btn {
  background:#eff6ff; border:1px solid #bfdbfe; border-radius:20px;
  padding:6px 14px; font-size:12px; cursor:pointer; color:#1d4ed8;
  transition:background .15s; white-space:nowrap;
}
.ieum-hint-btn:hover { background:#dbeafe; }
/* \u2500\u2500 \uBA54\uC2DC\uC9C0 \uBC84\uBE14 \u2500\u2500 */
.ieum-message { display:flex; width:100%; animation:ieum-message-in .2s ease; }
.ieum-message.user { justify-content:flex-end; }
.ieum-message.assistant, .ieum-message.system { justify-content:flex-start; }
.ieum-bubble {
  max-width:82%; border-radius:18px; padding:11px 14px;
  font-size:13.5px; line-height:1.65; white-space:pre-wrap; word-break:break-word;
}
.ieum-message.assistant .ieum-bubble, .ieum-message.system .ieum-bubble {
  background:#f8fafc; color:#111827;
  border:1px solid #f1f5f9;
  border-radius:4px 18px 18px 18px;
}
.ieum-message.user .ieum-bubble {
  background:#2563eb; color:#fff;
  border-radius:18px 18px 4px 18px;
  box-shadow:0 2px 8px rgba(37,99,235,.25);
}
/* \u2500\u2500 outcome \uB178\uD2B8 \u2500\u2500 */
.ieum-outcome-note { margin-top:6px; font-size:11.5px; color:#6b7280; }
/* \u2500\u2500 citations \u2500\u2500 */
.ieum-citations { margin-top:8px; padding-top:8px; border-top:1px solid #f1f5f9; }
.ieum-citations-title { font-size:11px; font-weight:700; color:#6b7280; margin-bottom:5px; }
.ieum-citation { font-size:11px; color:#6b7280; line-height:1.45; margin-bottom:3px; }
.ieum-citation-link { color:#2563eb; text-decoration:none; font-weight:600; overflow-wrap:anywhere; }
.ieum-citation-link:hover { text-decoration:underline; }
.ieum-citations-folded summary { cursor:pointer; font-size:11px; font-weight:700; color:#6b7280; list-style:none; }
.ieum-citations-folded summary::-webkit-details-marker { display:none; }
.ieum-citations-folded summary::after { content:" \uD3BC\uCE58\uAE30"; font-weight:400; color:#94a3b8; }
.ieum-citations-folded[open] summary { margin-bottom:4px; }
.ieum-citations-folded[open] summary::after { content:" \uC811\uAE30"; }
/* \u2500\u2500 \uC774\uC5B4\uBCFC \uC9C8\uBB38 (Planee \uC2A4\uD0C0\uC77C: \uCE74\uB4DC + \uC544\uC774\uCF58 + \uD654\uC0B4\uD45C) \u2500\u2500 */
.ieum-follow-ups { display:flex; flex-direction:column; gap:6px; margin-top:10px; }
.ieum-follow-ups-title { font-size:11px; font-weight:700; color:#6b7280; margin-bottom:4px; }
.ieum-follow-up-btn {
  appearance:none; display:flex; align-items:center; gap:8px;
  border:1px solid #e5e7eb; border-radius:10px;
  background:#fff; color:#111827;
  padding:9px 12px; font-size:12.5px; line-height:1.4;
  text-align:left; cursor:pointer; width:100%;
  transition:border-color .15s, background .15s;
}
.ieum-follow-up-btn:hover { border-color:#93c5fd; background:#f0f7ff; color:#1d4ed8; }
.ieum-follow-up-icon { font-size:13px; flex-shrink:0; opacity:.6; }
.ieum-follow-up-text { flex:1; }
.ieum-follow-up-arrow { font-size:12px; color:#9ca3af; flex-shrink:0; }
/* \u2500\u2500 CTA \uBC84\uD2BC \u2500\u2500 */
.ieum-cta-wrap { display:flex; flex-direction:column; gap:6px; margin-top:10px; }
.ieum-cta-title { font-size:11px; font-weight:700; color:#6b7280; margin-bottom:4px; }
.ieum-cta-btn {
  display:inline-flex; align-items:center; gap:7px;
  padding:8px 13px; border-radius:10px;
  border:1px solid #dbeafe; background:#eff6ff;
  color:#1d4ed8; font-size:12.5px; font-weight:500;
  text-decoration:none; cursor:pointer;
  transition:background .15s;
}
.ieum-cta-btn:hover { background:#dbeafe; }
/* \u2500\u2500 Tools API \uAD6C\uC870\uD654 \uC751\uB2F5 \u2500\u2500 */
.ieum-view-card { margin-top:6px; }
.ieum-view-title { font-size:14px; font-weight:700; color:#111827; margin-bottom:8px; }
.ieum-view-content { font-size:12.5px; color:#374151; line-height:1.65; margin-bottom:4px; }
.ieum-more-link {
  display:inline-flex; align-items:center; gap:4px;
  margin-top:10px; font-size:12px; font-weight:600;
  color:#2563eb; text-decoration:none;
}
.ieum-more-link:hover { text-decoration:underline; }
.ieum-list { list-style:none; margin:6px 0 0; padding:0; display:flex; flex-direction:column; gap:8px; }
.ieum-list-item { border:1px solid #e5e7eb; border-radius:12px; padding:11px 13px; background:#fff; }
.ieum-list-item-title { font-size:13px; font-weight:600; color:#111827; margin-bottom:5px; }
.ieum-list-item-content { font-size:12px; color:#6b7280; line-height:1.55; }
.ieum-list-item-link { display:inline-block; margin-top:6px; font-size:11.5px; color:#2563eb; text-decoration:none; }
.ieum-list-item-link:hover { text-decoration:underline; }
/* \u2500\u2500 \uD53C\uB4DC\uBC31 \u2500\u2500 */
.ieum-feedback-row { display:flex; gap:4px; margin-top:8px; opacity:.55; transition:opacity .2s; }
.ieum-feedback-row:hover { opacity:1; }
.ieum-feedback-btn {
  background:none; border:none; cursor:pointer;
  font-size:14px; padding:3px 5px; border-radius:6px; line-height:1;
  transition:background .15s;
}
.ieum-feedback-btn:hover { background:rgba(0,0,0,.06); }
.ieum-feedback-active { opacity:1 !important; }
.ieum-feedback-thanks { font-size:11px; color:#9ca3af; padding:3px 4px; }
/* \u2500\u2500 \uD0C0\uC774\uD551 \uC778\uB514\uCF00\uC774\uD130 \u2500\u2500 */
.ieum-loading {
  display:none; align-self:flex-start;
  border-radius:4px 18px 18px 18px; padding:12px 16px;
  background:#f8fafc; border:1px solid #f1f5f9;
}
.ieum-loading.active { display:inline-flex; gap:5px; align-items:center; }
.ieum-loading-dot {
  width:6px; height:6px; border-radius:9999px;
  background:#2563eb; opacity:.4;
  animation:ieum-dot 1.2s infinite ease-in-out;
}
.ieum-loading-dot:nth-child(2) { animation-delay:.2s; }
.ieum-loading-dot:nth-child(3) { animation-delay:.4s; }
/* \u2500\u2500 \uC785\uB825 \uC601\uC5ED \u2500\u2500 */
.ieum-input-wrap {
  padding:10px 12px 10px;
  display:flex; align-items:center; gap:8px;
  background:#fff;
  border-top:1px solid #f3f4f6;
  flex-shrink:0;
}
.ieum-input {
  flex:1; min-width:0; height:46px;
  border-radius:24px; border:1.5px solid #e5e7eb;
  padding:10px 16px; font-size:13.5px; color:#111827; outline:none;
  background:#f9fafb;
  transition:border-color .15s, background .15s;
}
.ieum-input::placeholder { color:#9ca3af; }
.ieum-input:focus { border-color:#2563eb; background:#fff; box-shadow:0 0 0 3px rgba(37,99,235,.08); }
.ieum-send {
  width:44px; height:44px; flex-shrink:0;
  border:none; border-radius:9999px;
  background:#2563eb; color:#fff;
  display:inline-flex; align-items:center; justify-content:center;
  cursor:pointer; transition:background .15s, transform .12s;
}
.ieum-send:hover { background:#1d4ed8; transform:scale(1.06); }
.ieum-send:disabled { opacity:.5; cursor:default; transform:none; }
.ieum-floating:disabled { opacity:.5; cursor:default; }
/* \u2500\u2500 \uBA74\uCC45 \uD478\uD130 \u2500\u2500 */
.ieum-footer {
  padding:7px 14px 9px;
  background:#fff; font-size:11px; color:#9ca3af; line-height:1.5;
  border-top:1px solid #f3f4f6; text-align:center; flex-shrink:0;
}
.ieum-footer a { color:#6b7280; }
/* \u2500\u2500 \uC560\uB2C8\uBA54\uC774\uC158 \u2500\u2500 */
@keyframes ieum-dot {
  0%,80%,100% { transform:translateY(0); opacity:.35; }
  40% { transform:translateY(-4px); opacity:1; }
}
@keyframes ieum-message-in {
  from { opacity:0; transform:translateY(10px); }
  to   { opacity:1; transform:translateY(0); }
}
@keyframes ieum-tooltip-in {
  from { opacity:0; transform:translateY(8px); }
  to   { opacity:1; transform:translateY(0); }
}
@media (max-width: 640px) {
  .ieum-root { right:8px; left:8px; bottom:8px; }
  .ieum-panel { width:100%; height:min(92vh, calc(100vh - 16px)); border-radius:20px; }
  .ieum-bubble { max-width:88%; }
  .ieum-launcher-tip { width:calc(100vw - 32px); }
}
.ieum-feedback-btn:hover { background:rgba(0,0,0,0.06); }
.ieum-feedback-active { opacity:1 !important; }
.ieum-feedback-thanks { font-size:11px; color:#888; }
`}var y=class{constructor(e){c(this,"options");c(this,"api");c(this,"host");c(this,"shadow");c(this,"root");c(this,"launcherWrap");c(this,"launcherTip");c(this,"launcherTipText");c(this,"launcherTipClose");c(this,"floatingButton");c(this,"panel");c(this,"titleNode");c(this,"headerIconNode");c(this,"bannerWrap");c(this,"starterQuestionsWrap");c(this,"quickActionsWrap");c(this,"messagesWrap");c(this,"loadingRow");c(this,"input");c(this,"sendButton");c(this,"footerNotice");c(this,"initialized",!1);c(this,"open",!1);c(this,"sending",!1);c(this,"launcherTipDismissed",!1);c(this,"launcherHoverMessage","");c(this,"launcherTipStorageKey","");c(this,"sessionToken",`widget_${Math.random().toString(36).slice(2,10)}_${Date.now().toString(36)}`);c(this,"config",null);c(this,"chatEndpoint","/chat/messages");c(this,"chatStreamEndpoint","/chat/messages/stream");c(this,"sseEnabled",!1);c(this,"messages",[]);c(this,"lastFailedQuestion",null);this.options=e,this.api=new w($(e.apiBaseUrl)),this.host=document.createElement("div"),this.host.setAttribute("data-ieumbot-widget-root","true"),this.host.setAttribute("data-ieumbot-chatbot-id",e.chatbotId),this.shadow=this.host.attachShadow({mode:"open"}),this.root=o(document,"div","ieum-root"),this.launcherWrap=o(document,"div","ieum-launcher-wrap"),this.launcherTip=o(document,"div","ieum-launcher-tip"),this.launcherTipText=o(document,"div","ieum-launcher-tip-text"),this.launcherTipClose=o(document,"button","ieum-launcher-tip-close"),this.floatingButton=o(document,"button","ieum-floating"),this.panel=o(document,"div","ieum-panel"),this.titleNode=o(document,"div","ieum-title"),this.headerIconNode=o(document,"div","ieum-header-icon"),this.bannerWrap=o(document,"div","ieum-banner"),this.starterQuestionsWrap=o(document,"div","ieum-starter-questions"),this.quickActionsWrap=o(document,"div","ieum-quick-actions"),this.messagesWrap=o(document,"div","ieum-messages"),this.loadingRow=o(document,"div","ieum-loading"),this.input=o(document,"input","ieum-input"),this.sendButton=o(document,"button","ieum-send"),this.footerNotice=o(document,"div","ieum-footer"),this.launcherTipClose.type="button",this.launcherTipClose.setAttribute("aria-label","\uC548\uB0B4 \uB2EB\uAE30"),this.launcherTipClose.innerHTML=g("close"),this.launcherTip.appendChild(this.launcherTipText),this.launcherTip.appendChild(this.launcherTipClose),this.floatingButton.type="button",this.floatingButton.title=(e.initialLauncherLabel?.trim()||e.launcherLabel)??"\uCC57\uBD07 \uC5F4\uAE30",this.floatingButton.setAttribute("aria-label",(e.initialLauncherLabel?.trim()||e.launcherLabel)??"\uCC57\uBD07 \uC5F4\uAE30"),this.floatingButton.classList.add("ieum-floating-loading"),this.floatingButton.replaceChildren();let i=ee(e),n=e.initialLauncherIconUrl?.trim();this.floatingButton.innerHTML=g(i,n),this.floatingButton.classList.toggle("ieum-floating-image",W(i,n)),this.titleNode.textContent=I(null,e),this.loadingRow.innerHTML=`
      <span class="ieum-loading-dot"></span>
      <span class="ieum-loading-dot"></span>
      <span class="ieum-loading-dot"></span>
    `,this.input.placeholder="\uBB34\uC5C7\uC744 \uB3C4\uC640\uB4DC\uB9B4\uAE4C\uC694?",this.sendButton.type="button",this.sendButton.setAttribute("aria-label","\uBA54\uC2DC\uC9C0 \uC804\uC1A1"),this.sendButton.innerHTML=g("send"),this.footerNotice.textContent=M}async mount(){if(this.initialized)return;this.initialized=!0;let e=document.createElement("style");e.textContent=_(A(this.options.theme?.primaryColor??null)),this.shadow.appendChild(e),this.shadow.appendChild(this.root);let i=o(document,"div","ieum-header"),n=o(document,"div","ieum-header-main"),l=o(document,"div","ieum-header-actions"),r=o(document,"button","ieum-header-button"),a=o(document,"button","ieum-header-button"),d=o(document,"div","ieum-input-wrap");this.headerIconNode.innerHTML=g("heart"),r.type="button",r.title="\uCD5C\uC18C\uD654",r.setAttribute("aria-label","\uCD5C\uC18C\uD654"),r.innerHTML=g("minimize"),a.type="button",a.title="\uB2EB\uAE30",a.setAttribute("aria-label","\uB2EB\uAE30"),a.innerHTML=g("close"),n.appendChild(this.headerIconNode),n.appendChild(this.titleNode),l.appendChild(r),l.appendChild(a),i.appendChild(n),i.appendChild(l),d.appendChild(this.input),d.appendChild(this.sendButton),this.panel.appendChild(i),this.panel.appendChild(this.bannerWrap),this.panel.appendChild(this.messagesWrap),this.panel.appendChild(this.starterQuestionsWrap),this.panel.appendChild(this.quickActionsWrap),this.panel.appendChild(this.loadingRow),this.panel.appendChild(d),this.panel.appendChild(this.footerNotice),this.launcherWrap.appendChild(this.launcherTip),this.launcherWrap.appendChild(this.floatingButton),this.root.appendChild(this.panel),this.root.appendChild(this.launcherWrap),document.body.appendChild(this.host),this.floatingButton.addEventListener("click",()=>this.togglePanel()),this.floatingButton.addEventListener("mouseenter",()=>this.showLauncherTip()),this.floatingButton.addEventListener("focus",()=>this.showLauncherTip()),this.floatingButton.addEventListener("blur",()=>this.hideLauncherTip()),this.launcherTip.addEventListener("mouseenter",()=>this.showLauncherTip()),this.launcherWrap.addEventListener("mouseleave",()=>this.hideLauncherTip()),this.launcherTipClose.addEventListener("click",s=>{s.stopPropagation(),this.dismissLauncherTip()}),r.addEventListener("click",()=>this.setOpen(!1)),a.addEventListener("click",()=>this.setOpen(!1)),this.sendButton.addEventListener("click",()=>void this.sendCurrentInput()),this.input.addEventListener("keydown",s=>{s.key==="Enter"&&!s.shiftKey&&(s.preventDefault(),this.sendCurrentInput())}),this.ensureInitialMessage(),this.loadConfig(),this.options.openOnLoad&&this.setOpen(!0)}ensureInitialMessage(){this.messages.length>0||(this.pushMessage({id:`assistant_welcome_${Date.now()}`,role:"assistant",text:J(this.config,this.options),timestamp:Date.now()}),this.config?.operatingHours.isAfterHours&&this.config.operatingHours.message&&this.pushMessage({id:`system_after_hours_${Date.now()}`,role:"system",text:this.config.operatingHours.message,timestamp:Date.now()}))}clearInitialWelcomeForDirectQuestion(){if(this.messages.some(i=>i.role==="user"))return;let e=this.messages.filter(i=>!i.id.startsWith("assistant_welcome_"));e.length!==this.messages.length&&(this.messages=e,this.renderMessages())}readLauncherTipDismissed(){if(!this.launcherTipStorageKey)return!1;try{return window.localStorage.getItem(this.launcherTipStorageKey)==="1"}catch{return!1}}dismissLauncherTip(){if(this.launcherTipDismissed=!0,this.hideLauncherTip(),!!this.launcherTipStorageKey)try{window.localStorage.setItem(this.launcherTipStorageKey,"1")}catch{}}showLauncherTip(e={}){this.open||!this.launcherHoverMessage.trim()||e.respectDismissed&&this.launcherTipDismissed||this.launcherTip.classList.add("visible")}hideLauncherTip(){this.launcherTip.classList.remove("visible")}async loadConfig(){try{this.config=await this.api.getConfig(this.options.chatbotId);let e=this.shadow.querySelector("style");e&&(e.textContent=_(A(this.config.theme?.preset))),this.titleNode.textContent=I(this.config,this.options),this.config.logoUrl?.trim()?this.headerIconNode.innerHTML=`<img src="${this.config.logoUrl}" alt="\uAE30\uAD00 \uB85C\uACE0" />`:this.headerIconNode.innerHTML=g("heart");let i=X(this.config),n=this.config.theme?.launcherIconUrl;this.floatingButton.replaceChildren(),this.floatingButton.innerHTML=g(i,n),this.floatingButton.classList.toggle("ieum-floating-image",W(i,n)),this.launcherHoverMessage=te(this.config,this.options)??"",this.launcherTipText.textContent=this.launcherHoverMessage,this.launcherTipStorageKey=`ieumbot_launcher_tip_dismissed:${this.options.chatbotId}`,this.launcherTipDismissed=this.readLauncherTipDismissed(),window.matchMedia("(max-width: 640px)").matches&&!this.launcherTipDismissed&&this.showLauncherTip({respectDismissed:!0}),this.renderBanner(),this.renderStarterQuestions(),this.footerNotice.textContent=this.config.privacyNotice?.trim()||M,this.renderQuickActions(this.config.quickActions),this.config.runtime?.chatEndpoint&&(this.chatEndpoint=this.config.runtime.chatEndpoint),this.config.runtime?.chatStreamEndpoint&&(this.chatStreamEndpoint=this.config.runtime.chatStreamEndpoint),this.sseEnabled=P(this.config.runtime?.sseEnabled)===!0||this.config.runtime?.streamingMode==="sse_preferred",this.messages.length===1&&this.messages[0]?.id.startsWith("assistant_welcome_")&&(this.messages=[]),this.ensureInitialMessage()}catch{this.pushMessage({id:`system_load_error_${Date.now()}`,role:"system",text:"\uCD08\uAE30 \uC124\uC815\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",timestamp:Date.now()})}finally{this.floatingButton.classList.remove("ieum-floating-loading")}}renderBanner(){this.bannerWrap.innerHTML="";let e=this.config?.banner?.title?.trim(),i=this.config?.banner?.description?.trim();if(!e&&!i){this.bannerWrap.style.display="none";return}if(this.bannerWrap.style.display="block",e){let n=o(document,"div","ieum-banner-title");n.textContent=e,this.bannerWrap.appendChild(n)}if(i){let n=o(document,"div","ieum-banner-description");n.textContent=i,this.bannerWrap.appendChild(n)}}renderStarterQuestions(){this.starterQuestionsWrap.innerHTML="";let e=this.config?.starterQuestions?.filter(i=>i.trim()).slice(0,4)??[];if(e.length===0){this.starterQuestionsWrap.style.display="none";return}this.starterQuestionsWrap.style.display="flex";for(let i of e){let n=o(document,"button","ieum-starter-question");n.type="button",n.textContent=i,n.addEventListener("click",()=>{this.input.value=i,this.sendCurrentInput()}),this.starterQuestionsWrap.appendChild(n)}}renderQuickActions(e){this.quickActionsWrap.innerHTML="";let i=e.filter(n=>n.displayLocation==="welcome").slice(0,6);if(i.length===0){this.quickActionsWrap.style.display="none";return}this.quickActionsWrap.style.display="flex";for(let n of i){let l=o(document,"button","ieum-quick-action");l.type="button",l.textContent=n.label,l.title=n.label,l.addEventListener("click",()=>{if(n.actionType==="link"&&n.url){window.open(n.url,"_blank","noopener,noreferrer");return}this.input.value=n.payload?.trim()||n.label,this.sendCurrentInput()}),this.quickActionsWrap.appendChild(l)}}createQuickReplyHintsRow(){if(this.messages.some(l=>l.role==="user"))return null;let i=(this.config?.quickReplyHints??[]).filter(l=>l.trim()).slice(0,5);if(i.length===0)return null;let n=o(document,"div","ieum-hints-row");n.dataset.role="hints";for(let l of i){let r=o(document,"button","ieum-hint-btn");r.type="button",r.textContent=l,r.addEventListener("click",()=>{this.input.value=l,this.sendCurrentInput(),n.style.display="none"}),n.appendChild(r)}return n}setOpen(e){if(this.open=e,e){this.hideLauncherTip(),this.ensureInitialMessage(),this.panel.classList.add("open"),this.launcherWrap.style.opacity="0",this.launcherWrap.style.pointerEvents="none",this.input.focus(),this.scrollMessagesToBottom();return}this.panel.classList.remove("open"),this.launcherWrap.style.opacity="1",this.launcherWrap.style.pointerEvents="auto"}togglePanel(){this.setOpen(!this.open)}pushMessage(e){this.messages.push(e),this.renderMessages()}updateMessage(e,i){let n=this.messages.findIndex(l=>l.id===e);n<0||(this.messages[n]={...this.messages[n],...i},this.renderMessages())}removeMessage(e){this.messages=this.messages.filter(i=>i.id!==e),this.renderMessages()}renderMessages(){this.messagesWrap.innerHTML="",this.starterQuestionsWrap.style.display=this.messages.length<=1?this.starterQuestionsWrap.style.display:"none";for(let e of this.messages){let i=o(document,"div",`ieum-message ${e.role}`),n=o(document,"div","ieum-bubble"),l=e.structuredResponse;if(l&&e.role==="assistant")if(l.type==="text"){if(n.textContent=l.content,l.moreLink){let r=o(document,"a","ieum-more-link");r.href=l.moreLink.url,r.target="_blank",r.rel="noopener noreferrer",r.textContent=`\u2192 ${l.moreLink.title}`,n.appendChild(r)}}else if(l.type==="view"){let r=l;n.textContent="";let a=o(document,"div","ieum-view-card"),d=o(document,"div","ieum-view-title");d.textContent=r.title,a.appendChild(d);for(let s of r.content){let h=o(document,"p","ieum-view-content");h.textContent=s,a.appendChild(h)}if(r.moreLink){let s=o(document,"a","ieum-more-link");s.href=r.moreLink.url,s.target="_blank",s.rel="noopener noreferrer",s.textContent=`\u2192 ${r.moreLink.title}`,a.appendChild(s)}n.appendChild(a)}else if(l.type==="list"){let r=l;n.textContent="";let a=o(document,"ul","ieum-list");for(let d of r.items.slice(0,8)){let s=o(document,"li","ieum-list-item"),h=o(document,"div","ieum-list-item-title");h.textContent=d.title,s.appendChild(h);for(let p of d.contents.slice(0,3)){let u=o(document,"p","ieum-list-item-content");u.textContent=p,s.appendChild(u)}if(d.targetLink){let p=o(document,"a","ieum-list-item-link");p.href=d.targetLink,p.target="_blank",p.rel="noopener noreferrer",p.textContent=d.targetLinkLabel||"\uC790\uC138\uD788 \uBCF4\uAE30",s.appendChild(p)}else if(d.sourceLinkPath){let p=o(document,"a","ieum-list-item-link");p.href=d.sourceLinkPath,p.target="_blank",p.rel="noopener noreferrer",p.textContent=d.sourceLinkLabel||"\uCD9C\uCC98 \uBCF4\uAE30",s.appendChild(p)}a.appendChild(s)}if(n.appendChild(a),r.moreLink){let d=o(document,"a","ieum-more-link");d.href=r.moreLink.url,d.target="_blank",d.rel="noopener noreferrer",d.textContent=`\u2192 ${r.moreLink.title}`,n.appendChild(d)}}else n.textContent=e.text;else n.textContent=e.text;if(e.role==="assistant"){let r=K(e.outcome);if(r){let a=o(document,"div","ieum-outcome-note");a.textContent=r,n.appendChild(a)}if(e.id){let a=o(document,"div","ieum-feedback-row");a.dataset.messageId=e.id;let d=o(document,"button","ieum-feedback-btn");d.setAttribute("aria-label","\uB3C4\uC6C0\uC774 \uB410\uC5B4\uC694"),d.textContent="\u{1F44D}";let s=o(document,"button","ieum-feedback-btn");s.setAttribute("aria-label","\uB3C4\uC6C0\uC774 \uC548 \uB410\uC5B4\uC694"),s.textContent="\u{1F44E}";let h=async p=>{let u=a.dataset.messageId;if(u)try{await this.api.sendFeedback(u,p),d.classList.toggle("ieum-feedback-active",p===1),s.classList.toggle("ieum-feedback-active",p===-1),setTimeout(()=>{a.innerHTML='<span class="ieum-feedback-thanks">\uD53C\uB4DC\uBC31 \uAC10\uC0AC\uD569\uB2C8\uB2E4</span>'},800)}catch{}};d.addEventListener("click",()=>{h(1)}),s.addEventListener("click",()=>{h(-1)}),a.appendChild(d),a.appendChild(s),n.appendChild(a)}if(e.citations&&e.citations.length>0){let a=V(this.config),d=G(e.citations),s=o(document,a?"details":"div",a?"ieum-citations ieum-citations-folded":"ieum-citations"),h=o(document,a?"summary":"div","ieum-citations-title");h.textContent=a?`${d} ${Math.min(e.citations.length,5)}\uAC74`:d,s.appendChild(h);for(let p of e.citations.slice(0,5)){let u=o(document,"div","ieum-citation"),m=p.sourceUrl?.trim();if(m){let f=o(document,"a","ieum-citation-link");f.href=m,f.target="_blank",f.rel="noopener noreferrer",f.textContent=Z(p),u.appendChild(f)}else u.textContent=Y(p,this.config?.institutionName);s.appendChild(u)}n.appendChild(s)}if(e.followUpQuestions&&e.followUpQuestions.length>0){let a=o(document,"div","ieum-follow-ups"),d=o(document,"div","ieum-follow-ups-title");d.textContent="\u2726 \uC774\uB7F0 \uC9C8\uBB38\uB4E4\uC740 \uC5B4\uB5A0\uC2E0\uAC00\uC694?",a.appendChild(d);for(let s of e.followUpQuestions.slice(0,3)){let h=o(document,"button","ieum-follow-up-btn");h.type="button";let p=o(document,"span","ieum-follow-up-icon");p.textContent="\u{1F4AC}";let u=o(document,"span","ieum-follow-up-text");u.textContent=s;let m=o(document,"span","ieum-follow-up-arrow");m.textContent="\u2192",h.appendChild(p),h.appendChild(u),h.appendChild(m),h.addEventListener("click",()=>{this.input.value=s,this.sendCurrentInput()}),a.appendChild(h)}n.appendChild(a)}if(e.conditionalActions&&e.conditionalActions.length>0){let a=o(document,"div","ieum-cta-wrap"),d=o(document,"div","ieum-cta-title");d.textContent="\uAD00\uB828 \uC815\uBCF4",a.appendChild(d);for(let s of e.conditionalActions){let h=s.type==="link"?"\u{1F517}":s.type==="video"?"\u{1F3AC}":s.type==="file"?"\u{1F4CE}":"\u{1F4DE}",p=s.type==="contact"&&!s.value.startsWith("tel:")&&!s.value.startsWith("mailto:")?`tel:${s.value}`:s.value,u=o(document,"a","ieum-cta-btn");u.href=p,u.target=s.type==="contact"?"_self":"_blank",u.rel="noopener noreferrer",u.textContent=`${h} ${s.label}`,s.description&&(u.title=s.description),a.appendChild(u)}n.appendChild(a)}}if(i.appendChild(n),this.messagesWrap.appendChild(i),e.id.startsWith("assistant_welcome_")){let r=this.createQuickReplyHintsRow();r&&this.messagesWrap.appendChild(r)}}if(this.lastFailedQuestion){let e=o(document,"div","ieum-message system"),i=o(document,"button","ieum-quick-action");i.type="button",i.textContent="\uB2E4\uC2DC \uC2DC\uB3C4",i.addEventListener("click",()=>{this.lastFailedQuestion&&(this.input.value=this.lastFailedQuestion,this.sendCurrentInput())}),e.appendChild(i),this.messagesWrap.appendChild(e)}this.scrollMessagesToBottom()}scrollMessagesToBottom(){requestAnimationFrame(()=>{this.messagesWrap.scrollTop=this.messagesWrap.scrollHeight})}setSending(e){this.sending=e,this.sendButton.disabled=e,this.input.disabled=e,this.loadingRow.classList.toggle("active",e)}async sendCurrentInput(){if(this.sending)return;let e=this.input.value.trim();if(e){if(j(e)){this.clearInitialWelcomeForDirectQuestion(),this.lastFailedQuestion=null,this.input.value="",this.pushMessage({id:`assistant_privacy_${Date.now()}`,role:"assistant",text:N,outcome:"restricted",timestamp:Date.now()}),this.input.focus();return}if(this.clearInitialWelcomeForDirectQuestion(),this.lastFailedQuestion=null,this.input.value="",this.pushMessage({id:`user_${Date.now()}`,role:"user",text:e,timestamp:Date.now()}),this.setSending(!0),this.sseEnabled&&await this.trySendWithSse(e)){this.setSending(!1),this.input.focus();return}try{let i=await this.api.sendChat({chatbotId:this.options.chatbotId,question:e,topK:this.options.topK??8,sessionToken:this.sessionToken,sourceUrl:this.options.sourceUrl??window.location.href},this.chatEndpoint);this.handleAssistantResponse(i)}catch{this.lastFailedQuestion=e,this.pushMessage({id:`system_send_error_${Date.now()}`,role:"system",text:L,timestamp:Date.now()})}finally{this.setSending(!1),this.input.focus()}}}async trySendWithSse(e){let i=`assistant_stream_${Date.now()}`,n=!1,l="\uC2A4\uD2B8\uB9AC\uBC0D \uC5F0\uACB0 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4. \uC77C\uBC18 \uBAA8\uB4DC\uB85C \uC804\uD658\uD569\uB2C8\uB2E4.",r="answered",a=[],d=[],s="",h=!1;this.pushMessage({id:i,role:"assistant",text:"",timestamp:Date.now()});let p=u=>{let m=u.data??{};if(u.event==="message_delta"){let f=v(m.delta)??"";s+=f,f&&(h=!0),this.updateMessage(i,{text:s});return}if(u.event==="message_complete"){r=v(m.outcome)??r,h=!0,this.updateMessage(i,{outcome:r,text:s||"..."});return}if(u.event==="fallback"||u.event==="escalation"){r=v(m.outcome)??(u.event==="escalation"?"escalate":"insufficient_evidence"),s=v(m.message)??"",h=!0,this.updateMessage(i,{text:s,outcome:r});return}if(u.event==="citations"){a=O(m.items),this.updateMessage(i,{citations:a});return}if(u.event==="follow_up_questions"){d=q(m.items).slice(0,3),this.updateMessage(i,{followUpQuestions:d});return}if(u.event==="error"){n=!0,l=v(m.message)??l;return}if(u.event==="done"){let f=v(m.sessionToken);f&&(this.sessionToken=f)}};try{if(await this.api.streamChat({chatbotId:this.options.chatbotId,question:e,topK:this.options.topK??8,sessionToken:this.sessionToken,sourceUrl:this.options.sourceUrl??window.location.href},p,this.chatStreamEndpoint),n)throw new Error(l);return s.trim()?this.updateMessage(i,{text:s,outcome:r,citations:a,followUpQuestions:d}):this.updateMessage(i,{text:"\uC694\uCCAD\uC744 \uCC98\uB9AC\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",outcome:"insufficient_evidence"}),!0}catch{return h?(this.updateMessage(i,{text:s||"\uC751\uB2F5 \uC218\uC2E0 \uC911 \uC5F0\uACB0\uC774 \uC885\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",outcome:r,citations:a,followUpQuestions:d}),this.lastFailedQuestion=e,!0):(this.updateMessage(i,{text:L,outcome:"insufficient_evidence"}),this.lastFailedQuestion=e,!0)}}handleAssistantResponse(e){let i=e.trace?.messages?.sessionToken;i&&typeof i=="string"&&(this.sessionToken=i);let n=e.answer?.text?.trim()||"\uC548\uB0B4 \uAC00\uB2A5\uD55C \uB2F5\uBCC0\uC744 \uC0DD\uC131\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.";this.pushMessage({id:`assistant_${e.requestId}`,role:"assistant",text:n,outcome:e.outcome,citations:Array.isArray(e.citations)?e.citations:[],followUpQuestions:Array.isArray(e.followUpQuestions)?e.followUpQuestions.slice(0,3):[],conditionalActions:Array.isArray(e.conditionalActions)?e.conditionalActions:[],structuredResponse:e.structuredResponse??null,timestamp:Date.now()})}};var T=new Set;async function S(t){if(!t?.chatbotId)throw new Error("WIDGET_INIT_REQUIRES_CHATBOT_ID");let e=t.chatbotId,i=Array.from(document.querySelectorAll('[data-ieumbot-widget-root="true"]'));for(let l of i)l.getAttribute("data-ieumbot-chatbot-id")===t.chatbotId&&l.remove();if(T.delete(e),T.has(e))return;await new y(t).mount(),T.add(e)}window.IEUMBOTWidget={init:S};var b=document.currentScript;if(b){let t=b.getAttribute("data-chatbot-id");if(t){let e=b.getAttribute("data-launcher-label")??void 0;S({chatbotId:t,apiBaseUrl:b.getAttribute("data-api-base-url")??void 0,openOnLoad:b.getAttribute("data-open-on-load")==="true",launcherLabel:e,initialLauncherLabel:e,initialLauncherIcon:b.getAttribute("data-launcher-icon")??void 0,initialLauncherIconUrl:b.getAttribute("data-launcher-icon-url")??void 0})}}})();
