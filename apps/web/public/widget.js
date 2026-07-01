"use strict";(()=>{var N=Object.defineProperty;var P=(t,e,i)=>e in t?N(t,e,{enumerable:!0,configurable:!0,writable:!0,value:i}):t[e]=i;var c=(t,e,i)=>P(t,typeof e!="symbol"?e+"":e,i);function Q(t){return t.endsWith("/")?t.slice(0,-1):t}var k=class{constructor(e){c(this,"baseUrl");this.baseUrl=Q(e)}async getConfig(e){let i=await fetch(`${this.baseUrl}/widget/config/${encodeURIComponent(e)}`,{method:"GET",headers:{"Content-Type":"application/json"},credentials:"omit"});if(!i.ok)throw new Error(`WIDGET_CONFIG_FAILED:${i.status}`);return await i.json()}async sendChat(e,i="/chat/messages"){let n=i.startsWith("/")?i:`/${i}`,l=await fetch(`${this.baseUrl}${n}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e),credentials:"omit"});if(!l.ok)throw new Error(`WIDGET_CHAT_FAILED:${l.status}`);return await l.json()}async sendFeedback(e,i){await fetch(`${this.baseUrl}/chat/messages/${encodeURIComponent(e)}/feedback`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({feedback:i}),credentials:"omit"})}async streamChat(e,i,n="/chat/messages/stream"){let l=n.startsWith("/")?n:`/${n}`,r=await fetch(`${this.baseUrl}${l}`,{method:"POST",headers:{"Content-Type":"application/json",Accept:"text/event-stream"},body:JSON.stringify(e),credentials:"omit"});if(!r.ok||!r.body)throw new Error(`WIDGET_CHAT_STREAM_FAILED:${r.status}`);let s=r.body.getReader(),d=new TextDecoder("utf-8"),a="";for(;;){let{value:p,done:u}=await s.read();if(u)break;a+=d.decode(p,{stream:!0});let h=a.indexOf(`

`);for(;h!==-1;){let m=a.slice(0,h).trim();if(a=a.slice(h+2),h=a.indexOf(`

`),!m)continue;let f="message",g=[];for(let w of m.split(`
`))w.startsWith("event:")?f=w.slice(6).trim():w.startsWith("data:")&&g.push(w.slice(5).trim());if(g.length!==0)try{let w=JSON.parse(g.join(`
`));i({event:f,data:w})}catch{i({event:"error",data:{code:"STREAM_EVENT_PARSE_FAILED",message:"\uC2A4\uD2B8\uB9BC \uC774\uBCA4\uD2B8 \uD30C\uC2F1 \uC2E4\uD328"}})}}}}};var O=new Set(["p","br","div","span","h1","h2","h3","h4","h5","h6","strong","em","b","i","u","s","mark","code","pre","ul","ol","li","a","table","thead","tbody","tr","td","th","caption","blockquote","hr","img"]),F={a:new Set(["href","title"]),img:new Set(["src","alt","title","width","height"]),td:new Set(["colspan","rowspan"]),th:new Set(["colspan","rowspan","scope"])},q=/<[a-zA-Z][a-zA-Z0-9]*(\s|>|\/)/;function A(t){return q.test(t)}function M(t){let e=t.trim().toLowerCase();return!(!e||e.startsWith("javascript:")||e.startsWith("data:")||e.startsWith("vbscript:")||e.startsWith("file:"))}function E(t,e){let i=Array.from(t.children);for(let n of i){let l=n.tagName.toLowerCase();if(!O.has(l)){let s=e.createTextNode(n.textContent||"");n.replaceWith(s);continue}let r=F[l]||new Set;for(let s of Array.from(n.attributes))r.has(s.name.toLowerCase())||n.removeAttribute(s.name);if(l==="a"){let s=n.getAttribute("href")||"";M(s)||n.removeAttribute("href"),n.setAttribute("target","_blank"),n.setAttribute("rel","noopener noreferrer")}if(l==="img"){let s=n.getAttribute("src")||"";M(s)||n.removeAttribute("src")}E(n,e)}}function I(t){if(typeof window>"u"||typeof DOMParser>"u")return t.replace(/<[^>]*>/g,"");if(!t)return"";let i=new DOMParser().parseFromString(`<div id="__ieum_root__">${t}</div>`,"text/html"),n=i.getElementById("__ieum_root__");return n?(E(n,i),n.innerHTML):""}var j="/widget-icons/love-chat-icons.png",W="\uC694\uCCAD \uCC98\uB9AC \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",K="\uAC1C\uC778\uC815\uBCF4\uAC00 \uD3EC\uD568\uB41C \uB0B4\uC6A9\uC740 \uC785\uB825\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uAC1C\uC778\uC815\uBCF4\uB97C \uC81C\uC678\uD558\uACE0 \uB2E4\uC2DC \uC785\uB825\uD574 \uC8FC\uC138\uC694.",_="AI \uC774\uC74C\uBD07\uB3C4 \uAC00\uB054 \uC2E4\uC218\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uC911\uC694\uD55C \uC815\uBCF4\uB294 \uAF2D \uB2E4\uC2DC \uD55C\uBC88 \uD655\uC778\uD558\uC138\uC694.",Z=[/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,/\b\d{6}-[1-4]\d{6}\b/,/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/,/\b01[016789][- ]?\d{3,4}[- ]?\d{4}\b/,/\b(?:19|20)\d{2}[-./](?:0[1-9]|1[0-2])[-./](?:0[1-9]|[12]\d|3[01])\b/];function V(t){return t.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function H(t){return`<img class="ieum-launcher-image" src="${V(t.trim())}" alt="" aria-hidden="true" />`}function o(t,e,i){let n=t.createElement(e);return i&&(n.className=i),n}function S(t,e){let i=e||"";A(i)?(t.classList.add("ieum-bubble-rich"),t.innerHTML=I(i)):(t.classList.remove("ieum-bubble-rich"),t.textContent=i)}function b(t,e){return t==="custom"&&e?.trim()?H(e):t==="love-chat"?H(j):t==="heart"?`
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
  `}function G(t){return t&&t.trim()?t.replace(/\/$/,""):`${window.location.origin}/api`}function v(t){return typeof t=="string"?t:void 0}function Y(t){return typeof t=="boolean"?t:void 0}function J(t){return Array.isArray(t)?t:[]}function X(t){return Array.isArray(t)?t:[]}function ee(t){return Array.isArray(t)?t.filter(e=>typeof e=="string"):[]}function te(t){return Z.some(e=>e.test(t))}function $(t){return/^https?:\/\//i.test(t)||/^[\w.-]+\.[a-z]{2,}(?:\/|\?|$)/i.test(t)}function ie(t){if(!t?.trim())return null;try{return new URL(t.trim()).hostname.replace(/^www\./,"")}catch{return null}}function ne(t){return!t||t==="answered"?null:t==="insufficient_evidence"?"\uB4F1\uB85D\uB41C \uC790\uB8CC\uC5D0\uC11C \uAD00\uB828 \uC815\uBCF4\uB97C \uCDA9\uBD84\uD788 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.":t==="restricted"?"\uC548\uC804\uD55C \uC548\uB0B4 \uBC94\uC704\uC5D0\uC11C \uB2F5\uBCC0\uC774 \uC81C\uD55C\uB41C \uC9C8\uBB38\uC785\uB2C8\uB2E4.":t==="conflict"?"\uADFC\uAC70 \uD655\uC778\uC774 \uB354 \uD544\uC694\uD55C \uC9C8\uBB38\uC785\uB2C8\uB2E4.":t==="escalate"?"\uC815\uD655\uD55C \uD655\uC778\uC774 \uD544\uC694\uD55C \uB0B4\uC6A9\uC785\uB2C8\uB2E4.":null}function oe(t,e){let i=e?.trim()||null,n=t.documentName?.trim()||"\uCD9C\uCC98",l=t.pageNumber?`p.${t.pageNumber}`:null,r=t.sectionTitle?.trim()||null,s=i&&i!==n?[i,n]:[n];return l&&s.push(l),r&&r!==n&&!$(r)&&s.push(r),s.join(" | ")}function se(t){let e=t.sectionTitle?.trim();if(e&&!$(e))return e;let i=t.documentName?.trim();if(i)return i;let n=t.sourceTitle?.trim();return n||(ie(t.sourceUrl)??"\uCC38\uC870 \uC790\uB8CC")}function re(t){return t.some(e=>e.sourceUrl?.trim())?"\uCC38\uC870 \uB9C1\uD06C":"\uCC38\uC870 \uC790\uB8CC"}function ae(t){return t?.citationPresentation==="folded"||t?.citationMode==="compact"}function L(t,e){return e.title?.trim()||t?.institutionName?.trim()||t?.chatbotName?.trim()||"\uAE30\uAD00"}function D(t,e){let i=e.title?.trim()||t?.chatbotName?.trim()||L(t,e);return i.startsWith("AI \uCC57\uBD07")?i:`AI \uCC57\uBD07 ${i}`}function le(t,e){if(e.welcomeMessage?.trim())return e.welcomeMessage.trim();if(t?.introMessage?.trim())return t.introMessage.trim();if(t?.welcomeMessage?.trim())return t.welcomeMessage.trim();let i=L(t,e);return i&&i!=="\uAE30\uAD00"?`\uC548\uB155\uD558\uC138\uC694. ${i} AI \uC0C1\uB2F4\uBD07\uC785\uB2C8\uB2E4. \uAD81\uAE08\uD558\uC2E0 \uB0B4\uC6A9\uC744 \uD3B8\uD558\uAC8C \uC785\uB825\uD574\uC8FC\uC138\uC694.`:"\uC548\uB155\uD558\uC138\uC694. \uAD81\uAE08\uD558\uC2E0 \uB0B4\uC6A9\uC744 \uC785\uB825\uD574\uC8FC\uC2DC\uBA74 \uBE60\uB974\uAC8C \uC548\uB0B4\uD574\uB4DC\uB9AC\uACA0\uC2B5\uB2C8\uB2E4."}function R(t){return t==="forest"?"linear-gradient(135deg, #166534, #0f766e)":t==="sky"?"linear-gradient(135deg, #1d4ed8, #0284c7)":t==="civic"?"linear-gradient(135deg, #1e40af, #0f766e)":t==="sunset"?"linear-gradient(135deg, #b45309, #ea580c)":"linear-gradient(135deg, #2563EB, #22C55E)"}function de(t){let e=t?.theme?.launcherIcon;return e==="custom"&&t?.theme?.launcherIconUrl?.trim()?"custom":e==="love-chat"||e==="heart"||e==="shield"||e==="leaf"||e==="spark"?e:"chat"}function ce(t){let e=t.initialLauncherIcon?.trim(),i=t.initialLauncherIconUrl?.trim();return e==="custom"&&i?"custom":e==="love-chat"||e==="heart"||e==="shield"||e==="leaf"||e==="spark"?e:"chat"}function B(t,e){return t==="love-chat"||t==="custom"&&!!e?.trim()}function ue(t,e){let i=t?.launcherHoverMessage?.trim();return i||`${L(t,e)} AI \uC0C1\uB2F4\uBD07\uC785\uB2C8\uB2E4. \uBB34\uC5C7\uC744 \uB3C4\uC640\uB4DC\uB9B4\uAE4C\uC694?`}function pe(t){let e=t.match(/#[0-9a-fA-F]{6,8}|#[0-9a-fA-F]{3}/);return e?e[0]:"#2563eb"}function y(t,e){let i=t.replace("#",""),n=i.length===3?i.split("").map(d=>d+d).join(""):i,l=parseInt(n.slice(0,2),16),r=parseInt(n.slice(2,4),16),s=parseInt(n.slice(4,6),16);return`rgba(${l},${r},${s},${e})`}function U(t){let e=pe(t),i=y(e,.18),n=y(e,.35),l=y(e,.4),r=y(e,.28),s=y(e,.12),d=y(e,.08);return`
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
  background:#fff; box-shadow:0 8px 32px ${s};
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
  background:${t}; color:#fff;
  display:inline-flex; align-items:center; justify-content:center; cursor:pointer;
  box-shadow:0 6px 24px ${n};
  transition:transform .18s ease, box-shadow .18s ease, opacity .18s ease;
}
.ieum-floating.ieum-floating-loading { opacity:0; pointer-events:none; transform:scale(.9); }
.ieum-floating:hover { transform:scale(1.06); box-shadow:0 10px 32px ${l}; }
.ieum-floating.ieum-floating-image { background:transparent; box-shadow:none; padding:0; }
.ieum-floating.ieum-floating-image:hover { box-shadow:none; }
.ieum-floating .ieum-launcher-image {
  width:60px; height:60px; border-radius:9999px;
  object-fit:contain; display:block; background:transparent;
}
.ieum-floating.ieum-floating-image .ieum-launcher-image {
  filter:drop-shadow(0 6px 20px ${r});
}
.ieum-floating svg { width:28px; height:28px; }
.ieum-header-icon svg, .ieum-header-icon img, .ieum-header-button svg { width:20px; height:20px; }
.ieum-send svg { width:20px; height:20px; }
.ieum-header-icon img { object-fit:contain; border-radius:9999px; }
/* \u2500\u2500 \uD328\uB110 \u2500\u2500 */
.ieum-panel {
  position:absolute; right:0; bottom:0;
  width:min(420px, calc(100vw - 16px));
  height:min(680px, calc(100vh - 16px));
  border-radius:20px;
  border:2px solid ${e};
  background:#fff;
  overflow:hidden;
  box-shadow:0 16px 48px ${i}, 0 4px 16px rgba(0,0,0,.06);
  display:flex; flex-direction:column;
  opacity:0; transform:translateY(24px) scale(.97);
  pointer-events:none;
  transition:opacity .24s ease, transform .24s ease;
}
.ieum-panel.open { opacity:1; transform:translateY(0) scale(1); pointer-events:auto; }
/* \u2500\u2500 \uD5E4\uB354 \u2500\u2500 */
.ieum-header {
  min-height:58px; padding:12px 14px;
  background:${t};
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
.ieum-title { font-size:16.5px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
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
  box-shadow:0 2px 8px ${r};
}
/* \u2500\u2500 \uCCAB \uC778\uC0AC\uB9D0(\uD658\uC601 \uBA54\uC2DC\uC9C0) \u2014 \uB354 \uD06C\uACE0 \uB610\uB837\uD558\uAC8C \u2500\u2500 */
.ieum-bubble-welcome {
  font-size:16px; line-height:1.6; font-weight:500; color:#0f172a;
  max-width:92%; padding:13px 16px;
}
/* \u2500\u2500 \uB9AC\uCE58 \uCEE8\uD150\uCE20(FAQ HTML) \u2500\u2500 */
.ieum-bubble-rich { white-space:normal; }
.ieum-bubble-rich p { margin:0 0 6px; }
.ieum-bubble-rich p:last-child { margin-bottom:0; }
.ieum-bubble-rich ul, .ieum-bubble-rich ol { margin:4px 0 6px; padding-left:20px; }
.ieum-bubble-rich li { margin-bottom:3px; }
.ieum-bubble-rich h1, .ieum-bubble-rich h2, .ieum-bubble-rich h3,
.ieum-bubble-rich h4, .ieum-bubble-rich h5, .ieum-bubble-rich h6 {
  margin:6px 0 4px; font-weight:600; font-size:1.05em;
}
.ieum-bubble-rich a { color:#2563eb; text-decoration:underline; }
.ieum-bubble-rich strong, .ieum-bubble-rich b { font-weight:600; }
.ieum-bubble-rich code {
  background:#eef2f7; padding:1px 4px; border-radius:3px; font-size:0.92em;
}
.ieum-bubble-rich pre {
  background:#f1f5f9; padding:8px; border-radius:6px; overflow-x:auto;
  font-size:0.9em; margin:6px 0;
}
.ieum-bubble-rich table {
  border-collapse:collapse; margin:6px 0; font-size:0.95em;
}
.ieum-bubble-rich th, .ieum-bubble-rich td {
  border:1px solid #e5e7eb; padding:4px 8px; text-align:left;
}
.ieum-bubble-rich th { background:#f8fafc; font-weight:600; }
.ieum-bubble-rich blockquote {
  border-left:3px solid #cbd5e1; padding-left:10px; color:#475569; margin:6px 0;
}
.ieum-bubble-rich img { max-width:100%; height:auto; border-radius:4px; }
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
.ieum-input:focus { border-color:${e}; background:#fff; box-shadow:0 0 0 3px ${d}; }
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
  padding:7px 14px 5px;
  background:#fff; font-size:11px; color:#9ca3af; line-height:1.5;
  border-top:1px solid #f3f4f6; text-align:center; flex-shrink:0;
}
.ieum-footer a { color:#6b7280; }
/* \u2500\u2500 \uC81C\uC791\uC0AC \uD45C\uC2DC(Powered by DeepSecu) \u2014 \uC791\uACE0 \uBE44\uBC29\uD574\uC801 \u2500\u2500 */
.ieum-brand {
  padding:0 14px 8px; background:#fff; text-align:center; flex-shrink:0;
}
.ieum-brand-inner {
  display:inline-flex; align-items:center; gap:4px;
  font-size:10.5px; color:#b8bdc7; line-height:1; letter-spacing:.1px;
}
.ieum-brand-logo { flex:0 0 auto; display:block; }
.ieum-brand-name { font-weight:700; font-size:11px; }
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
`}var C=class{constructor(e){c(this,"options");c(this,"api");c(this,"host");c(this,"shadow");c(this,"root");c(this,"launcherWrap");c(this,"launcherTip");c(this,"launcherTipText");c(this,"launcherTipClose");c(this,"floatingButton");c(this,"panel");c(this,"titleNode");c(this,"headerIconNode");c(this,"bannerWrap");c(this,"starterQuestionsWrap");c(this,"quickActionsWrap");c(this,"messagesWrap");c(this,"loadingRow");c(this,"input");c(this,"sendButton");c(this,"footerNotice");c(this,"brandMark");c(this,"initialized",!1);c(this,"open",!1);c(this,"sending",!1);c(this,"launcherTipDismissed",!1);c(this,"launcherHoverMessage","");c(this,"launcherTipStorageKey","");c(this,"sessionToken",`widget_${Math.random().toString(36).slice(2,10)}_${Date.now().toString(36)}`);c(this,"config",null);c(this,"chatEndpoint","/chat/messages");c(this,"chatStreamEndpoint","/chat/messages/stream");c(this,"sseEnabled",!1);c(this,"messages",[]);c(this,"lastFailedQuestion",null);this.options=e,this.api=new k(G(e.apiBaseUrl)),this.host=document.createElement("div"),this.host.setAttribute("data-ieumbot-widget-root","true"),this.host.setAttribute("data-ieumbot-chatbot-id",e.chatbotId),this.shadow=this.host.attachShadow({mode:"open"}),this.root=o(document,"div","ieum-root"),this.launcherWrap=o(document,"div","ieum-launcher-wrap"),this.launcherTip=o(document,"div","ieum-launcher-tip"),this.launcherTipText=o(document,"div","ieum-launcher-tip-text"),this.launcherTipClose=o(document,"button","ieum-launcher-tip-close"),this.floatingButton=o(document,"button","ieum-floating"),this.panel=o(document,"div","ieum-panel"),this.titleNode=o(document,"div","ieum-title"),this.headerIconNode=o(document,"div","ieum-header-icon"),this.bannerWrap=o(document,"div","ieum-banner"),this.starterQuestionsWrap=o(document,"div","ieum-starter-questions"),this.quickActionsWrap=o(document,"div","ieum-quick-actions"),this.messagesWrap=o(document,"div","ieum-messages"),this.loadingRow=o(document,"div","ieum-loading"),this.input=o(document,"input","ieum-input"),this.sendButton=o(document,"button","ieum-send"),this.footerNotice=o(document,"div","ieum-footer"),this.brandMark=o(document,"div","ieum-brand"),this.launcherTipClose.type="button",this.launcherTipClose.setAttribute("aria-label","\uC548\uB0B4 \uB2EB\uAE30"),this.launcherTipClose.innerHTML=b("close"),this.launcherTip.appendChild(this.launcherTipText),this.launcherTip.appendChild(this.launcherTipClose),this.floatingButton.type="button",this.floatingButton.title=(e.initialLauncherLabel?.trim()||e.launcherLabel)??"\uCC57\uBD07 \uC5F4\uAE30",this.floatingButton.setAttribute("aria-label",(e.initialLauncherLabel?.trim()||e.launcherLabel)??"\uCC57\uBD07 \uC5F4\uAE30"),this.floatingButton.classList.add("ieum-floating-loading"),this.floatingButton.replaceChildren();let i=ce(e),n=e.initialLauncherIconUrl?.trim();this.floatingButton.innerHTML=b(i,n),this.floatingButton.classList.toggle("ieum-floating-image",B(i,n)),this.titleNode.textContent=D(null,e),this.loadingRow.innerHTML=`
      <span class="ieum-loading-dot"></span>
      <span class="ieum-loading-dot"></span>
      <span class="ieum-loading-dot"></span>
    `,this.input.placeholder="\uBB34\uC5C7\uC744 \uB3C4\uC640\uB4DC\uB9B4\uAE4C\uC694?",this.sendButton.type="button",this.sendButton.setAttribute("aria-label","\uBA54\uC2DC\uC9C0 \uC804\uC1A1"),this.sendButton.innerHTML=b("send"),this.footerNotice.textContent=_,this.brandMark.innerHTML='<span class="ieum-brand-inner">Powered by <svg class="ieum-brand-logo" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M12 2.2 19.5 5 V11 C19.5 15.8 16.2 19.2 12 21.6 C7.8 19.2 4.5 15.8 4.5 11 V5 Z" fill="#2f6df6"/><path d="M8.3 11.9 11 14.6 15.8 9.4" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg><b class="ieum-brand-name"><span style="color:#1f2937">Deep</span><span style="color:#2f6df6">Secu</span></b></span>'}async mount(){if(this.initialized)return;this.initialized=!0;let e=document.createElement("style");e.textContent=U(R(this.options.theme?.primaryColor??null)),this.shadow.appendChild(e),this.shadow.appendChild(this.root);let i=o(document,"div","ieum-header"),n=o(document,"div","ieum-header-main"),l=o(document,"div","ieum-header-actions"),r=o(document,"button","ieum-header-button"),s=o(document,"button","ieum-header-button"),d=o(document,"div","ieum-input-wrap");this.headerIconNode.innerHTML=b("heart"),r.type="button",r.title="\uCD5C\uC18C\uD654",r.setAttribute("aria-label","\uCD5C\uC18C\uD654"),r.innerHTML=b("minimize"),s.type="button",s.title="\uB2EB\uAE30",s.setAttribute("aria-label","\uB2EB\uAE30"),s.innerHTML=b("close"),n.appendChild(this.headerIconNode),n.appendChild(this.titleNode),l.appendChild(r),l.appendChild(s),i.appendChild(n),i.appendChild(l),d.appendChild(this.input),d.appendChild(this.sendButton),this.panel.appendChild(i),this.panel.appendChild(this.bannerWrap),this.panel.appendChild(this.messagesWrap),this.panel.appendChild(this.starterQuestionsWrap),this.panel.appendChild(this.quickActionsWrap),this.panel.appendChild(this.loadingRow),this.panel.appendChild(d),this.panel.appendChild(this.footerNotice),this.panel.appendChild(this.brandMark),this.launcherWrap.appendChild(this.launcherTip),this.launcherWrap.appendChild(this.floatingButton),this.root.appendChild(this.panel),this.root.appendChild(this.launcherWrap),document.body.appendChild(this.host),this.floatingButton.addEventListener("click",()=>this.togglePanel()),this.floatingButton.addEventListener("mouseenter",()=>this.showLauncherTip()),this.floatingButton.addEventListener("focus",()=>this.showLauncherTip()),this.floatingButton.addEventListener("blur",()=>this.hideLauncherTip()),this.launcherTip.addEventListener("mouseenter",()=>this.showLauncherTip()),this.launcherWrap.addEventListener("mouseleave",()=>{this.launcherTipDismissed&&this.hideLauncherTip()}),this.launcherTipClose.addEventListener("click",a=>{a.stopPropagation(),this.dismissLauncherTip()}),r.addEventListener("click",()=>this.setOpen(!1)),s.addEventListener("click",()=>this.setOpen(!1)),this.sendButton.addEventListener("click",()=>void this.sendCurrentInput()),this.input.addEventListener("keydown",a=>{a.key==="Enter"&&!a.shiftKey&&(a.preventDefault(),this.sendCurrentInput())}),this.ensureInitialMessage(),this.loadConfig(),this.options.openOnLoad&&this.setOpen(!0)}ensureInitialMessage(){this.messages.length>0||(this.pushMessage({id:`assistant_welcome_${Date.now()}`,role:"assistant",text:le(this.config,this.options),timestamp:Date.now()}),this.config?.operatingHours.isAfterHours&&this.config.operatingHours.message&&this.pushMessage({id:`system_after_hours_${Date.now()}`,role:"system",text:this.config.operatingHours.message,timestamp:Date.now()}))}clearInitialWelcomeForDirectQuestion(){if(this.messages.some(i=>i.role==="user"))return;let e=this.messages.filter(i=>!i.id.startsWith("assistant_welcome_"));e.length!==this.messages.length&&(this.messages=e,this.renderMessages())}readLauncherTipDismissed(){return!1}dismissLauncherTip(){this.launcherTipDismissed=!0,this.hideLauncherTip()}showLauncherTip(e={}){this.open||!this.launcherHoverMessage.trim()||e.respectDismissed&&this.launcherTipDismissed||this.launcherTip.classList.add("visible")}hideLauncherTip(){this.launcherTip.classList.remove("visible")}async loadConfig(){try{this.config=await this.api.getConfig(this.options.chatbotId);let e=this.shadow.querySelector("style");e&&(e.textContent=U(R(this.config.theme?.preset))),this.titleNode.textContent=D(this.config,this.options),this.config.logoUrl?.trim()?this.headerIconNode.innerHTML=`<img src="${this.config.logoUrl}" alt="\uAE30\uAD00 \uB85C\uACE0" />`:this.headerIconNode.innerHTML=b("heart");let i=de(this.config),n=this.config.theme?.launcherIconUrl;this.floatingButton.replaceChildren(),this.floatingButton.innerHTML=b(i,n),this.floatingButton.classList.toggle("ieum-floating-image",B(i,n)),this.launcherHoverMessage=ue(this.config,this.options)??"",this.launcherTipText.textContent=this.launcherHoverMessage,this.launcherTipStorageKey=`ieumbot_launcher_tip_dismissed:${this.options.chatbotId}`,this.launcherTipDismissed=this.readLauncherTipDismissed(),this.showLauncherTip({respectDismissed:!0}),this.renderBanner(),this.renderStarterQuestions(),this.footerNotice.textContent=this.config.privacyNotice?.trim()||_,this.renderQuickActions(this.config.quickActions),this.config.runtime?.chatEndpoint&&(this.chatEndpoint=this.config.runtime.chatEndpoint),this.config.runtime?.chatStreamEndpoint&&(this.chatStreamEndpoint=this.config.runtime.chatStreamEndpoint),this.sseEnabled=Y(this.config.runtime?.sseEnabled)===!0||this.config.runtime?.streamingMode==="sse_preferred",this.messages.length===1&&this.messages[0]?.id.startsWith("assistant_welcome_")&&(this.messages=[]),this.ensureInitialMessage()}catch{this.pushMessage({id:`system_load_error_${Date.now()}`,role:"system",text:"\uCD08\uAE30 \uC124\uC815\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",timestamp:Date.now()})}finally{this.floatingButton.classList.remove("ieum-floating-loading")}}renderBanner(){this.bannerWrap.innerHTML="";let e=this.config?.banner?.title?.trim(),i=this.config?.banner?.description?.trim();if(!e&&!i){this.bannerWrap.style.display="none";return}if(this.bannerWrap.style.display="block",e){let n=o(document,"div","ieum-banner-title");n.textContent=e,this.bannerWrap.appendChild(n)}if(i){let n=o(document,"div","ieum-banner-description");n.textContent=i,this.bannerWrap.appendChild(n)}}renderStarterQuestions(){this.starterQuestionsWrap.innerHTML="";let e=this.config?.starterQuestions?.filter(i=>i.trim()).slice(0,4)??[];if(e.length===0){this.starterQuestionsWrap.style.display="none";return}this.starterQuestionsWrap.style.display="flex";for(let i of e){let n=o(document,"button","ieum-starter-question");n.type="button",n.textContent=i,n.addEventListener("click",()=>{this.input.value=i,this.sendCurrentInput()}),this.starterQuestionsWrap.appendChild(n)}}renderQuickActions(e){this.quickActionsWrap.innerHTML="";let i=e.filter(n=>n.displayLocation==="welcome").slice(0,6);if(i.length===0){this.quickActionsWrap.style.display="none";return}this.quickActionsWrap.style.display="flex";for(let n of i){let l=o(document,"button","ieum-quick-action");l.type="button",l.textContent=n.label,l.title=n.label,l.addEventListener("click",()=>{if(n.actionType==="link"&&n.url){window.open(n.url,"_blank","noopener,noreferrer");return}this.input.value=n.payload?.trim()||n.label,this.sendCurrentInput()}),this.quickActionsWrap.appendChild(l)}}createQuickReplyHintsRow(){if(this.messages.some(l=>l.role==="user"))return null;let i=(this.config?.quickReplyHints??[]).filter(l=>l.trim()).slice(0,5);if(i.length===0)return null;let n=o(document,"div","ieum-hints-row");n.dataset.role="hints";for(let l of i){let r=o(document,"button","ieum-hint-btn");r.type="button",r.textContent=l,r.addEventListener("click",()=>{this.input.value=l,this.sendCurrentInput(),n.style.display="none"}),n.appendChild(r)}return n}setOpen(e){if(this.open=e,e){this.hideLauncherTip(),this.ensureInitialMessage(),this.panel.classList.add("open"),this.launcherWrap.style.opacity="0",this.launcherWrap.style.pointerEvents="none",this.input.focus(),this.scrollMessagesToBottom();return}this.panel.classList.remove("open"),this.launcherWrap.style.opacity="1",this.launcherWrap.style.pointerEvents="auto"}togglePanel(){this.setOpen(!this.open)}pushMessage(e){this.messages.push(e),this.renderMessages()}updateMessage(e,i){let n=this.messages.findIndex(l=>l.id===e);n<0||(this.messages[n]={...this.messages[n],...i},this.renderMessages())}removeMessage(e){this.messages=this.messages.filter(i=>i.id!==e),this.renderMessages()}renderMessages(){this.messagesWrap.innerHTML="",this.starterQuestionsWrap.style.display=this.messages.length<=1?this.starterQuestionsWrap.style.display:"none";for(let e of this.messages){let i=o(document,"div",`ieum-message ${e.role}`),n=o(document,"div","ieum-bubble");e.id.startsWith("assistant_welcome_")&&n.classList.add("ieum-bubble-welcome");let l=e.structuredResponse;if(l&&e.role==="assistant")if(l.type==="text"){if(n.textContent=l.content,l.moreLink){let r=o(document,"a","ieum-more-link");r.href=l.moreLink.url,r.target="_blank",r.rel="noopener noreferrer",r.textContent=`\u2192 ${l.moreLink.title}`,n.appendChild(r)}}else if(l.type==="view"){let r=l;n.textContent="";let s=o(document,"div","ieum-view-card"),d=o(document,"div","ieum-view-title");d.textContent=r.title,s.appendChild(d);for(let a of r.content){let p=o(document,"p","ieum-view-content");p.textContent=a,s.appendChild(p)}if(r.moreLink){let a=o(document,"a","ieum-more-link");a.href=r.moreLink.url,a.target="_blank",a.rel="noopener noreferrer",a.textContent=`\u2192 ${r.moreLink.title}`,s.appendChild(a)}n.appendChild(s)}else if(l.type==="list"){let r=l;n.textContent="";let s=o(document,"ul","ieum-list");for(let d of r.items.slice(0,8)){let a=o(document,"li","ieum-list-item"),p=o(document,"div","ieum-list-item-title");p.textContent=d.title,a.appendChild(p);for(let u of d.contents.slice(0,3)){let h=o(document,"p","ieum-list-item-content");h.textContent=u,a.appendChild(h)}if(d.targetLink){let u=o(document,"a","ieum-list-item-link");u.href=d.targetLink,u.target="_blank",u.rel="noopener noreferrer",u.textContent=d.targetLinkLabel||"\uC790\uC138\uD788 \uBCF4\uAE30",a.appendChild(u)}else if(d.sourceLinkPath){let u=o(document,"a","ieum-list-item-link");u.href=d.sourceLinkPath,u.target="_blank",u.rel="noopener noreferrer",u.textContent=d.sourceLinkLabel||"\uCD9C\uCC98 \uBCF4\uAE30",a.appendChild(u)}s.appendChild(a)}if(n.appendChild(s),r.moreLink){let d=o(document,"a","ieum-more-link");d.href=r.moreLink.url,d.target="_blank",d.rel="noopener noreferrer",d.textContent=`\u2192 ${r.moreLink.title}`,n.appendChild(d)}}else S(n,e.text);else S(n,e.text);if(e.role==="assistant"){let r=ne(e.outcome);if(r){let s=o(document,"div","ieum-outcome-note");s.textContent=r,n.appendChild(s)}if(e.id){let s=o(document,"div","ieum-feedback-row");s.dataset.messageId=e.id;let d=o(document,"button","ieum-feedback-btn");d.setAttribute("aria-label","\uB3C4\uC6C0\uC774 \uB410\uC5B4\uC694"),d.textContent="\u{1F44D}";let a=o(document,"button","ieum-feedback-btn");a.setAttribute("aria-label","\uB3C4\uC6C0\uC774 \uC548 \uB410\uC5B4\uC694"),a.textContent="\u{1F44E}";let p=async u=>{let h=s.dataset.messageId;if(h)try{await this.api.sendFeedback(h,u),d.classList.toggle("ieum-feedback-active",u===1),a.classList.toggle("ieum-feedback-active",u===-1),setTimeout(()=>{s.innerHTML='<span class="ieum-feedback-thanks">\uD53C\uB4DC\uBC31 \uAC10\uC0AC\uD569\uB2C8\uB2E4</span>'},800)}catch{}};d.addEventListener("click",()=>{!!(e.followUpQuestions&&e.followUpQuestions.length>0)?(e.id&&this.api.sendFeedback(e.id,1).catch(()=>{}),this.input.value="\uB124",this.sendCurrentInput()):p(1)}),a.addEventListener("click",()=>{p(-1)}),s.appendChild(d),s.appendChild(a),n.appendChild(s)}if(e.citations&&e.citations.length>0){let s=ae(this.config),d=re(e.citations),a=o(document,s?"details":"div",s?"ieum-citations ieum-citations-folded":"ieum-citations"),p=o(document,s?"summary":"div","ieum-citations-title");p.textContent=s?`${d} ${Math.min(e.citations.length,5)}\uAC74`:d,a.appendChild(p);for(let u of e.citations.slice(0,5)){let h=o(document,"div","ieum-citation"),m=u.sourceUrl?.trim();if(m){let f=o(document,"a","ieum-citation-link");f.href=m,f.target="_blank",f.rel="noopener noreferrer",f.textContent=se(u),h.appendChild(f)}else h.textContent=oe(u,this.config?.institutionName);a.appendChild(h)}n.appendChild(a)}if(e.followUpQuestions&&e.followUpQuestions.length>0){let s=o(document,"div","ieum-follow-ups"),d=o(document,"div","ieum-follow-ups-title");d.textContent="\u2726 \uC774\uB7F0 \uC9C8\uBB38\uB4E4\uC740 \uC5B4\uB5A0\uC2E0\uAC00\uC694?",s.appendChild(d);for(let a of e.followUpQuestions.slice(0,3)){let p=o(document,"button","ieum-follow-up-btn");p.type="button";let u=o(document,"span","ieum-follow-up-icon");u.textContent="\u{1F4AC}";let h=o(document,"span","ieum-follow-up-text");h.textContent=a;let m=o(document,"span","ieum-follow-up-arrow");m.textContent="\u2192",p.appendChild(u),p.appendChild(h),p.appendChild(m),p.addEventListener("click",()=>{this.input.value=a,this.sendCurrentInput()}),s.appendChild(p)}n.appendChild(s)}if(e.conditionalActions&&e.conditionalActions.length>0){let s=o(document,"div","ieum-cta-wrap"),d=o(document,"div","ieum-cta-title");d.textContent="\uAD00\uB828 \uC815\uBCF4",s.appendChild(d);for(let a of e.conditionalActions){let p=a.type==="link"?"\u{1F517}":a.type==="video"?"\u{1F3AC}":a.type==="file"?"\u{1F4CE}":"\u{1F4DE}",u=a.type==="contact"&&!a.value.startsWith("tel:")&&!a.value.startsWith("mailto:")?`tel:${a.value}`:a.value,h=o(document,"a","ieum-cta-btn");h.href=u,h.target=a.type==="contact"?"_self":"_blank",h.rel="noopener noreferrer",h.textContent=`${p} ${a.label}`,a.description&&(h.title=a.description),s.appendChild(h)}n.appendChild(s)}}if(i.appendChild(n),this.messagesWrap.appendChild(i),e.id.startsWith("assistant_welcome_")){let r=this.createQuickReplyHintsRow();r&&this.messagesWrap.appendChild(r)}}if(this.lastFailedQuestion){let e=o(document,"div","ieum-message system"),i=o(document,"button","ieum-quick-action");i.type="button",i.textContent="\uB2E4\uC2DC \uC2DC\uB3C4",i.addEventListener("click",()=>{this.lastFailedQuestion&&(this.input.value=this.lastFailedQuestion,this.sendCurrentInput())}),e.appendChild(i),this.messagesWrap.appendChild(e)}this.scrollMessagesToBottom()}scrollMessagesToBottom(){requestAnimationFrame(()=>{this.messagesWrap.scrollTop=this.messagesWrap.scrollHeight})}setSending(e){this.sending=e,this.sendButton.disabled=e,this.input.disabled=e,this.loadingRow.classList.toggle("active",e)}async sendCurrentInput(){if(this.sending)return;let e=this.input.value.trim();if(e){if(te(e)){this.clearInitialWelcomeForDirectQuestion(),this.lastFailedQuestion=null,this.input.value="",this.pushMessage({id:`assistant_privacy_${Date.now()}`,role:"assistant",text:K,outcome:"restricted",timestamp:Date.now()}),this.input.focus();return}if(this.clearInitialWelcomeForDirectQuestion(),this.lastFailedQuestion=null,this.input.value="",this.pushMessage({id:`user_${Date.now()}`,role:"user",text:e,timestamp:Date.now()}),this.setSending(!0),this.sseEnabled&&await this.trySendWithSse(e)){this.setSending(!1),this.input.focus();return}try{let i=await this.api.sendChat({chatbotId:this.options.chatbotId,question:e,topK:this.options.topK??8,sessionToken:this.sessionToken,sourceUrl:this.options.sourceUrl??window.location.href},this.chatEndpoint);this.handleAssistantResponse(i)}catch{this.lastFailedQuestion=e,this.pushMessage({id:`system_send_error_${Date.now()}`,role:"system",text:W,timestamp:Date.now()})}finally{this.setSending(!1),this.input.focus()}}}async trySendWithSse(e){let i=`assistant_stream_${Date.now()}`,n=!1,l="\uC2A4\uD2B8\uB9AC\uBC0D \uC5F0\uACB0 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4. \uC77C\uBC18 \uBAA8\uB4DC\uB85C \uC804\uD658\uD569\uB2C8\uB2E4.",r="answered",s=[],d=[],a=[],p="",u=!1;this.pushMessage({id:i,role:"assistant",text:"",timestamp:Date.now()});let h=m=>{let f=m.data??{};if(m.event==="message_delta"){let g=v(f.delta)??"";p+=g,g&&(u=!0),this.updateMessage(i,{text:p});return}if(m.event==="message_complete"){r=v(f.outcome)??r,u=!0,this.updateMessage(i,{outcome:r,text:p||"..."});return}if(m.event==="fallback"||m.event==="escalation"){r=v(f.outcome)??(m.event==="escalation"?"escalate":"insufficient_evidence"),p=v(f.message)??"",u=!0,this.updateMessage(i,{text:p,outcome:r});return}if(m.event==="citations"){s=J(f.items),this.updateMessage(i,{citations:s});return}if(m.event==="follow_up_questions"){d=ee(f.items).slice(0,3),this.updateMessage(i,{followUpQuestions:d});return}if(m.event==="conditional_actions"){a=X(f.items),this.updateMessage(i,{conditionalActions:a});return}if(m.event==="structured_response"){this.updateMessage(i,{structuredResponse:f});return}if(m.event==="error"){n=!0,l=v(f.message)??l;return}if(m.event==="done"){let g=v(f.sessionToken);g&&(this.sessionToken=g)}};try{if(await this.api.streamChat({chatbotId:this.options.chatbotId,question:e,topK:this.options.topK??8,sessionToken:this.sessionToken,sourceUrl:this.options.sourceUrl??window.location.href},h,this.chatStreamEndpoint),n)throw new Error(l);return p.trim()?this.updateMessage(i,{text:p,outcome:r,citations:s,followUpQuestions:d,conditionalActions:a}):this.updateMessage(i,{text:"\uC694\uCCAD\uC744 \uCC98\uB9AC\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",outcome:"insufficient_evidence"}),!0}catch{return u?(this.updateMessage(i,{text:p||"\uC751\uB2F5 \uC218\uC2E0 \uC911 \uC5F0\uACB0\uC774 \uC885\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",outcome:r,citations:s,followUpQuestions:d,conditionalActions:a}),this.lastFailedQuestion=e,!0):(this.updateMessage(i,{text:W,outcome:"insufficient_evidence"}),this.lastFailedQuestion=e,!0)}}handleAssistantResponse(e){let i=e.trace?.messages?.sessionToken;i&&typeof i=="string"&&(this.sessionToken=i);let n=e.answer?.text?.trim()||"\uC548\uB0B4 \uAC00\uB2A5\uD55C \uB2F5\uBCC0\uC744 \uC0DD\uC131\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.";this.pushMessage({id:`assistant_${e.requestId}`,role:"assistant",text:n,outcome:e.outcome,citations:Array.isArray(e.citations)?e.citations:[],followUpQuestions:Array.isArray(e.followUpQuestions)?e.followUpQuestions.slice(0,3):[],conditionalActions:Array.isArray(e.conditionalActions)?e.conditionalActions:[],structuredResponse:e.structuredResponse??null,timestamp:Date.now()})}};var T=new Set;async function z(t){if(!t?.chatbotId)throw new Error("WIDGET_INIT_REQUIRES_CHATBOT_ID");let e=t.chatbotId,i=Array.from(document.querySelectorAll('[data-ieumbot-widget-root="true"]'));for(let l of i)l.getAttribute("data-ieumbot-chatbot-id")===t.chatbotId&&l.remove();if(T.delete(e),T.has(e))return;await new C(t).mount(),T.add(e)}window.IEUMBOTWidget={init:z};var x=document.currentScript;if(x){let t=x.getAttribute("data-chatbot-id");if(t){let e=x.getAttribute("data-launcher-label")??void 0;z({chatbotId:t,apiBaseUrl:x.getAttribute("data-api-base-url")??void 0,openOnLoad:x.getAttribute("data-open-on-load")==="true",launcherLabel:e,initialLauncherLabel:e,initialLauncherIcon:x.getAttribute("data-launcher-icon")??void 0,initialLauncherIconUrl:x.getAttribute("data-launcher-icon-url")??void 0})}}})();
