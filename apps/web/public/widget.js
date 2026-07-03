"use strict";(()=>{var J=Object.defineProperty;var X=(t,e,i)=>e in t?J(t,e,{enumerable:!0,configurable:!0,writable:!0,value:i}):t[e]=i;var p=(t,e,i)=>X(t,typeof e!="symbol"?e+"":e,i);function ee(t){return t.endsWith("/")?t.slice(0,-1):t}var T=class{constructor(e){p(this,"baseUrl");this.baseUrl=ee(e)}async getConfig(e){let i=await fetch(`${this.baseUrl}/widget/config/${encodeURIComponent(e)}`,{method:"GET",headers:{"Content-Type":"application/json"},credentials:"omit"});if(!i.ok)throw new Error(`WIDGET_CONFIG_FAILED:${i.status}`);return await i.json()}async sendChat(e,i="/chat/messages"){let n=i.startsWith("/")?i:`/${i}`,o=await fetch(`${this.baseUrl}${n}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e),credentials:"omit"});if(!o.ok)throw new Error(`WIDGET_CHAT_FAILED:${o.status}`);return await o.json()}async sendFeedback(e,i){await fetch(`${this.baseUrl}/chat/messages/${encodeURIComponent(e)}/feedback`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({feedback:i}),credentials:"omit"})}async streamChat(e,i,n="/chat/messages/stream"){let o=n.startsWith("/")?n:`/${n}`,s=await fetch(`${this.baseUrl}${o}`,{method:"POST",headers:{"Content-Type":"application/json",Accept:"text/event-stream"},body:JSON.stringify(e),credentials:"omit"});if(!s.ok||!s.body)throw new Error(`WIDGET_CHAT_STREAM_FAILED:${s.status}`);let r=s.body.getReader(),c=new TextDecoder("utf-8"),a="";for(;;){let{value:d,done:u}=await r.read();if(u)break;a+=c.decode(d,{stream:!0});let h=a.indexOf(`

`);for(;h!==-1;){let m=a.slice(0,h).trim();if(a=a.slice(h+2),h=a.indexOf(`

`),!m)continue;let f="message",b=[];for(let x of m.split(`
`))x.startsWith("event:")?f=x.slice(6).trim():x.startsWith("data:")&&b.push(x.slice(5).trim());if(b.length!==0)try{let x=JSON.parse(b.join(`
`));i({event:f,data:x})}catch{i({event:"error",data:{code:"STREAM_EVENT_PARSE_FAILED",message:"\uC2A4\uD2B8\uB9BC \uC774\uBCA4\uD2B8 \uD30C\uC2F1 \uC2E4\uD328"}})}}}}};function te(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function w(t){let e=t;return e=e.replace(/`([^`]+)`/g,(i,n)=>`<code>${n}</code>`),e=e.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,(i,n,o)=>`<a href="${o}">${n}</a>`),e=e.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>"),e=e.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g,"$1<em>$2</em>"),e=e.replace(/(^|[^_])_([^_\n]+)_(?!_)/g,"$1<em>$2</em>"),e}function W(t){let e=t.trim();return e.startsWith("|")&&(e=e.slice(1)),e.endsWith("|")&&(e=e.slice(0,-1)),e.split("|").map(i=>i.trim())}var M=/^\s*\|.*\|\s*$/,ie=/^\s*\|?[\s:-]*-[-\s:|]*\|?\s*$/,_=/^(#{1,6})\s+(.*)$/,$=/^\s*[-*]\s+(.*)$/,H=/^\s*\d+\.\s+(.*)$/,S=/^\s*>\s+(.*)$/;function R(t){return/(^|\n)\s*\|.*\|/.test(t)||/\*\*[^*]+\*\*/.test(t)||/(^|\n)\s*[-*]\s+\S/.test(t)||/(^|\n)\s*\d+\.\s+\S/.test(t)||/(^|\n)#{1,6}\s+\S/.test(t)||/\[[^\]]+\]\([^)]+\)/.test(t)||/(^|\n)>\s+\S/.test(t)}function B(t){let e=te(t.replace(/\r\n/g,`
`)).split(`
`),i=[],n=null,o=()=>{n&&(i.push(`</${n}>`),n=null)},s=0;for(;s<e.length;){let r=e[s];if(M.test(r)&&s+1<e.length&&ie.test(e[s+1])){o();let m=W(r);s+=2;let f=[];for(;s<e.length&&M.test(e[s]);)f.push(W(e[s])),s+=1;let b="<table><thead><tr>"+m.map(x=>`<th>${w(x)}</th>`).join("")+"</tr></thead><tbody>";for(let x of f)b+="<tr>"+x.map(G=>`<td>${w(G)}</td>`).join("")+"</tr>";b+="</tbody></table>",i.push(b);continue}let c=r.match(_);if(c){o(),i.push(`<h${c[1].length}>${w(c[2])}</h${c[1].length}>`),s+=1;continue}let a=r.match($);if(a){n!=="ul"&&(o(),i.push("<ul>"),n="ul"),i.push(`<li>${w(a[1])}</li>`),s+=1;continue}let d=r.match(H);if(d){n!=="ol"&&(o(),i.push("<ol>"),n="ol"),i.push(`<li>${w(d[1])}</li>`),s+=1;continue}let u=r.match(S);if(u){o(),i.push(`<blockquote>${w(u[1])}</blockquote>`),s+=1;continue}if(r.trim()===""){o(),s+=1;continue}o();let h=[r];for(s+=1;s<e.length&&e[s].trim()!==""&&!M.test(e[s])&&!_.test(e[s])&&!$.test(e[s])&&!H.test(e[s])&&!S.test(e[s]);)h.push(e[s]),s+=1;i.push(`<p>${h.map(w).join("<br>")}</p>`)}return o(),i.join("")}var ne=new Set(["p","br","div","span","h1","h2","h3","h4","h5","h6","strong","em","b","i","u","s","mark","code","pre","ul","ol","li","a","table","thead","tbody","tr","td","th","caption","blockquote","hr","img"]),se={a:new Set(["href","title"]),img:new Set(["src","alt","title","width","height"]),td:new Set(["colspan","rowspan"]),th:new Set(["colspan","rowspan","scope"])},oe=/<[a-zA-Z][a-zA-Z0-9]*(\s|>|\/)/;function z(t){return oe.test(t)}function D(t){let e=t.trim().toLowerCase();return!(!e||e.startsWith("javascript:")||e.startsWith("data:")||e.startsWith("vbscript:")||e.startsWith("file:"))}function U(t,e){let i=Array.from(t.children);for(let n of i){let o=n.tagName.toLowerCase();if(!ne.has(o)){let r=e.createTextNode(n.textContent||"");n.replaceWith(r);continue}let s=se[o]||new Set;for(let r of Array.from(n.attributes))s.has(r.name.toLowerCase())||n.removeAttribute(r.name);if(o==="a"){let r=n.getAttribute("href")||"";D(r)||n.removeAttribute("href"),n.setAttribute("target","_blank"),n.setAttribute("rel","noopener noreferrer")}if(o==="img"){let r=n.getAttribute("src")||"";D(r)||n.removeAttribute("src")}U(n,e)}}function A(t){if(typeof window>"u"||typeof DOMParser>"u")return t.replace(/<[^>]*>/g,"");if(!t)return"";let i=new DOMParser().parseFromString(`<div id="__ieum_root__">${t}</div>`,"text/html"),n=i.getElementById("__ieum_root__");return n?(U(n,i),n.innerHTML):""}var re="/widget-icons/love-chat-icons.png",N="\uC694\uCCAD \uCC98\uB9AC \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",ae="\uAC1C\uC778\uC815\uBCF4\uAC00 \uD3EC\uD568\uB41C \uB0B4\uC6A9\uC740 \uC785\uB825\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uAC1C\uC778\uC815\uBCF4\uB97C \uC81C\uC678\uD558\uACE0 \uB2E4\uC2DC \uC785\uB825\uD574 \uC8FC\uC138\uC694.",Q="AI \uC774\uC74C\uBD07\uB3C4 \uAC00\uB054 \uC2E4\uC218\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uC911\uC694\uD55C \uC815\uBCF4\uB294 \uAF2D \uB2E4\uC2DC \uD55C\uBC88 \uD655\uC778\uD558\uC138\uC694.",le=[/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,/\b\d{6}-[1-4]\d{6}\b/,/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/,/\b01[016789][- ]?\d{3,4}[- ]?\d{4}\b/,/\b(?:19|20)\d{2}[-./](?:0[1-9]|1[0-2])[-./](?:0[1-9]|[12]\d|3[01])\b/];function ce(t){return t.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function P(t){return`<img class="ieum-launcher-image" src="${ce(t.trim())}" alt="" aria-hidden="true" />`}function l(t,e,i){let n=t.createElement(e);return i&&(n.className=i),n}function O(t,e){let i=e||"";z(i)?(t.classList.add("ieum-bubble-rich"),t.innerHTML=A(i)):R(i)?(t.classList.add("ieum-bubble-rich"),t.innerHTML=A(B(i))):(t.classList.remove("ieum-bubble-rich"),t.textContent=i)}function v(t,e){return t==="custom"&&e?.trim()?P(e):t==="love-chat"?P(re):t==="heart"?`
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
  `}function de(t){return t&&t.trim()?t.replace(/\/$/,""):`${window.location.origin}/api`}function k(t){return typeof t=="string"?t:void 0}function ue(t){return typeof t=="boolean"?t:void 0}function pe(t){return Array.isArray(t)?t:[]}function he(t){return Array.isArray(t)?t:[]}var g='fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"',Y={doc:`<svg viewBox="0 0 24 24" ${g}><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 16h6"/></svg>`,shield:`<svg viewBox="0 0 24 24" ${g}><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/></svg>`,member:`<svg viewBox="0 0 24 24" ${g}><circle cx="10" cy="8" r="3.2"/><path d="M4 20c0-3.3 2.7-5.6 6-5.6 1.2 0 2.3.3 3.2.8"/><path d="M18 14v6M15 17h6"/></svg>`,cert:`<svg viewBox="0 0 24 24" ${g}><circle cx="12" cy="9" r="5.2"/><path d="M9.7 9l1.6 1.6 3-3.2"/><path d="M8.5 13.2 7 20l5-2.6L17 20l-1.5-6.8"/></svg>`,search:`<svg viewBox="0 0 24 24" ${g}><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.3-4.3"/></svg>`,phone:`<svg viewBox="0 0 24 24" ${g}><path d="M6.6 10.8a12 12 0 0 0 5.6 5.6l1.9-1.9a1 1 0 0 1 1-.24 11 11 0 0 0 3.4.55 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A16 16 0 0 1 3 5a1 1 0 0 1 1-1h3.3a1 1 0 0 1 1 1 11 11 0 0 0 .55 3.4 1 1 0 0 1-.24 1z"/></svg>`,apply:`<svg viewBox="0 0 24 24" ${g}><path d="M5 4h9l4 4v6"/><path d="M14 4v4h4"/><path d="M13 21l-4 1 1-4 6.5-6.5a1.4 1.4 0 0 1 2 2z"/></svg>`,check:`<svg viewBox="0 0 24 24" ${g}><circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>`,info:`<svg viewBox="0 0 24 24" ${g}><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>`,won:`<svg viewBox="0 0 24 24" ${g}><circle cx="12" cy="12" r="8.5"/><path d="M8 9l1.6 6L12 10l2.4 5L16 9"/><path d="M7.4 11.5h9.2"/></svg>`,grid:`<svg viewBox="0 0 24 24" ${g}><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>`,chat:`<svg viewBox="0 0 24 24" ${g}><path d="M4 5h16v11H9l-4 3v-3H4z"/><path d="M8 9h8M8 12h5"/></svg>`,calendar:`<svg viewBox="0 0 24 24" ${g}><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 9h16M8 3v4M16 3v4"/></svg>`,building:`<svg viewBox="0 0 24 24" ${g}><path d="M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16"/><path d="M15 9h3a1 1 0 0 1 1 1v11"/><path d="M8 8h4M8 12h4M8 16h4"/></svg>`};function me(t){let e=t.trim(),i=e.match(/^\[([a-z0-9_-]+)\]\s*(.*)$/i);if(i&&Y[i[1].toLowerCase()])return{iconType:"svg",icon:i[1].toLowerCase(),label:i[2].trim()||e,raw:e};let n=e.search(/\s/);if(n>0){let o=e.slice(0,n);if(!/[0-9A-Za-z가-힣]/.test(o)&&/[←-⯿️‍]|[\u{1F000}-\u{1FAFF}]/u.test(o))return{iconType:"emoji",icon:o,label:e.slice(n+1).trim(),raw:e}}return{iconType:"none",icon:"",label:e,raw:e}}function fe(t){return Array.isArray(t)?t.filter(e=>typeof e=="string"):[]}function ge(t){return le.some(e=>e.test(t))}function Z(t){return/^https?:\/\//i.test(t)||/^[\w.-]+\.[a-z]{2,}(?:\/|\?|$)/i.test(t)}function be(t){if(!t?.trim())return null;try{return new URL(t.trim()).hostname.replace(/^www\./,"")}catch{return null}}function xe(t){return!t||t==="answered"?null:t==="insufficient_evidence"?"\uB4F1\uB85D\uB41C \uC790\uB8CC\uC5D0\uC11C \uAD00\uB828 \uC815\uBCF4\uB97C \uCDA9\uBD84\uD788 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.":t==="restricted"?"\uC548\uC804\uD55C \uC548\uB0B4 \uBC94\uC704\uC5D0\uC11C \uB2F5\uBCC0\uC774 \uC81C\uD55C\uB41C \uC9C8\uBB38\uC785\uB2C8\uB2E4.":t==="conflict"?"\uADFC\uAC70 \uD655\uC778\uC774 \uB354 \uD544\uC694\uD55C \uC9C8\uBB38\uC785\uB2C8\uB2E4.":t==="escalate"?"\uC815\uD655\uD55C \uD655\uC778\uC774 \uD544\uC694\uD55C \uB0B4\uC6A9\uC785\uB2C8\uB2E4.":null}function ve(t,e){let i=e?.trim()||null,n=t.documentName?.trim()||"\uCD9C\uCC98",o=t.pageNumber?`p.${t.pageNumber}`:null,s=t.sectionTitle?.trim()||null,r=i&&i!==n?[i,n]:[n];return o&&r.push(o),s&&s!==n&&!Z(s)&&r.push(s),r.join(" | ")}function we(t){let e=t.sectionTitle?.trim();if(e&&!Z(e))return e;let i=t.documentName?.trim();if(i)return i;let n=t.sourceTitle?.trim();return n||(be(t.sourceUrl)??"\uCC38\uC870 \uC790\uB8CC")}function ye(t){return t.some(e=>e.sourceUrl?.trim())?"\uCC38\uC870 \uB9C1\uD06C":"\uCC38\uC870 \uC790\uB8CC"}function ke(t){return t?.citationPresentation==="folded"||t?.citationMode==="compact"}function E(t,e){return e.title?.trim()||t?.institutionName?.trim()||t?.chatbotName?.trim()||"\uAE30\uAD00"}function j(t,e){let i=e.title?.trim()||t?.chatbotName?.trim()||E(t,e);return i.startsWith("AI \uCC57\uBD07")?i:`AI \uCC57\uBD07 ${i}`}function Ce(t,e){if(e.welcomeMessage?.trim())return e.welcomeMessage.trim();if(t?.introMessage?.trim())return t.introMessage.trim();if(t?.welcomeMessage?.trim())return t.welcomeMessage.trim();let i=E(t,e);return i&&i!=="\uAE30\uAD00"?`\uC548\uB155\uD558\uC138\uC694. ${i} AI \uC0C1\uB2F4\uBD07\uC785\uB2C8\uB2E4. \uAD81\uAE08\uD558\uC2E0 \uB0B4\uC6A9\uC744 \uD3B8\uD558\uAC8C \uC785\uB825\uD574\uC8FC\uC138\uC694.`:"\uC548\uB155\uD558\uC138\uC694. \uAD81\uAE08\uD558\uC2E0 \uB0B4\uC6A9\uC744 \uC785\uB825\uD574\uC8FC\uC2DC\uBA74 \uBE60\uB974\uAC8C \uC548\uB0B4\uD574\uB4DC\uB9AC\uACA0\uC2B5\uB2C8\uB2E4."}function F(t){return t==="forest"?"linear-gradient(135deg, #166534, #0f766e)":t==="sky"?"linear-gradient(135deg, #1d4ed8, #0284c7)":t==="civic"?"linear-gradient(135deg, #1e40af, #0f766e)":t==="sunset"?"linear-gradient(135deg, #b45309, #ea580c)":"linear-gradient(135deg, #2563EB, #22C55E)"}function Te(t){let e=t?.theme?.launcherIcon;return e==="custom"&&t?.theme?.launcherIconUrl?.trim()?"custom":e==="love-chat"||e==="heart"||e==="shield"||e==="leaf"||e==="spark"?e:"chat"}function Le(t){let e=t.initialLauncherIcon?.trim(),i=t.initialLauncherIconUrl?.trim();return e==="custom"&&i?"custom":e==="love-chat"||e==="heart"||e==="shield"||e==="leaf"||e==="spark"?e:"chat"}function q(t,e){return t==="love-chat"||t==="custom"&&!!e?.trim()}function Me(t,e){let i=t?.launcherHoverMessage?.trim();return i||`${E(t,e)} AI \uC0C1\uB2F4\uBD07\uC785\uB2C8\uB2E4. \uBB34\uC5C7\uC744 \uB3C4\uC640\uB4DC\uB9B4\uAE4C\uC694?`}function Ae(t){let e=t.match(/#[0-9a-fA-F]{6,8}|#[0-9a-fA-F]{3}/);return e?e[0]:"#2563eb"}function C(t,e){let i=t.replace("#",""),n=i.length===3?i.split("").map(c=>c+c).join(""):i,o=parseInt(n.slice(0,2),16),s=parseInt(n.slice(2,4),16),r=parseInt(n.slice(4,6),16);return`rgba(${o},${s},${r},${e})`}function V(t){let e=Ae(t),i=C(e,.18),n=C(e,.35),o=C(e,.4),s=C(e,.28),r=C(e,.12),c=C(e,.08);return`
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
  background:#fff; box-shadow:0 8px 32px ${r};
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
.ieum-floating:hover { transform:scale(1.06); box-shadow:0 10px 32px ${o}; }
.ieum-floating.ieum-floating-image { background:transparent; box-shadow:none; padding:0; }
.ieum-floating.ieum-floating-image:hover { box-shadow:none; }
.ieum-floating .ieum-launcher-image {
  width:60px; height:60px; border-radius:9999px;
  object-fit:contain; display:block; background:transparent;
}
.ieum-floating.ieum-floating-image .ieum-launcher-image {
  filter:drop-shadow(0 6px 20px ${s});
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
/* \u2500\u2500 \uB370\uC2A4\uD06C\uD0D1 \uB4DC\uB798\uADF8 \uC774\uB3D9 (\uD5E4\uB354\uB97C \uC7A1\uACE0 \uCC3D\uC744 \uC62E\uAE38 \uC218 \uC788\uC74C) \u2500\u2500 */
.ieum-panel.dragging { transition:none; }
@media (min-width: 641px) {
  .ieum-header { cursor: move; }
  .ieum-header-actions { cursor: default; }
}
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
/* \u2500\u2500 \uBC30\uB108\uD615 \uBE60\uB978\uC9C8\uBB38 \uADF8\uB9AC\uB4DC (\uC774\uBAA8\uC9C0 \uC544\uC774\uCF58 \uCE74\uB4DC) \u2500\u2500 */
.ieum-starter-questions.ieum-starter-banner { display:grid; gap:10px; flex-direction:unset; }
.ieum-starter-question.ieum-starter-card {
  display:flex; flex-direction:column; align-items:center; justify-content:flex-start;
  gap:9px; text-align:center; padding:16px 10px 14px; min-height:94px; width:auto;
  border-radius:16px; background:#fff; border:1px solid #eef0f4;
  box-shadow:0 1px 2px rgba(16,24,40,.04);
  transition:border-color .15s, box-shadow .15s, transform .12s;
}
.ieum-starter-question.ieum-starter-card:hover {
  border-color:${e}; box-shadow:0 6px 16px rgba(16,24,40,.10); transform:translateY(-1px); background:#fff;
}
.ieum-starter-card-icon {
  display:flex; align-items:center; justify-content:center;
  width:42px; height:42px; border-radius:12px;
  background:${c}; color:${e}; font-size:22px; line-height:1; flex:0 0 auto;
}
.ieum-starter-card-icon svg { width:23px; height:23px; display:block; }
.ieum-starter-card-icon-emoji { background:transparent; }
.ieum-starter-card-label { font-size:12.5px; font-weight:600; color:#1f2937; line-height:1.35; word-break:keep-all; }
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
  box-shadow:0 2px 8px ${s};
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
.ieum-input:focus { border-color:${e}; background:#fff; box-shadow:0 0 0 3px ${c}; }
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
`}var L=class{constructor(e){p(this,"options");p(this,"api");p(this,"host");p(this,"shadow");p(this,"root");p(this,"launcherWrap");p(this,"launcherTip");p(this,"launcherTipText");p(this,"launcherTipClose");p(this,"floatingButton");p(this,"panel");p(this,"titleNode");p(this,"headerIconNode");p(this,"bannerWrap");p(this,"starterQuestionsWrap");p(this,"quickActionsWrap");p(this,"messagesWrap");p(this,"loadingRow");p(this,"input");p(this,"sendButton");p(this,"footerNotice");p(this,"brandMark");p(this,"initialized",!1);p(this,"open",!1);p(this,"sending",!1);p(this,"launcherTipDismissed",!1);p(this,"launcherHoverMessage","");p(this,"launcherTipStorageKey","");p(this,"sessionToken",`widget_${Math.random().toString(36).slice(2,10)}_${Date.now().toString(36)}`);p(this,"config",null);p(this,"chatEndpoint","/chat/messages");p(this,"chatStreamEndpoint","/chat/messages/stream");p(this,"sseEnabled",!1);p(this,"messages",[]);p(this,"lastFailedQuestion",null);p(this,"pinMessageIdToTop",null);this.options=e,this.api=new T(de(e.apiBaseUrl)),this.host=document.createElement("div"),this.host.setAttribute("data-ieumbot-widget-root","true"),this.host.setAttribute("data-ieumbot-chatbot-id",e.chatbotId),this.shadow=this.host.attachShadow({mode:"open"}),this.root=l(document,"div","ieum-root"),this.launcherWrap=l(document,"div","ieum-launcher-wrap"),this.launcherTip=l(document,"div","ieum-launcher-tip"),this.launcherTipText=l(document,"div","ieum-launcher-tip-text"),this.launcherTipClose=l(document,"button","ieum-launcher-tip-close"),this.floatingButton=l(document,"button","ieum-floating"),this.panel=l(document,"div","ieum-panel"),this.titleNode=l(document,"div","ieum-title"),this.headerIconNode=l(document,"div","ieum-header-icon"),this.bannerWrap=l(document,"div","ieum-banner"),this.starterQuestionsWrap=l(document,"div","ieum-starter-questions"),this.quickActionsWrap=l(document,"div","ieum-quick-actions"),this.messagesWrap=l(document,"div","ieum-messages"),this.loadingRow=l(document,"div","ieum-loading"),this.input=l(document,"input","ieum-input"),this.sendButton=l(document,"button","ieum-send"),this.footerNotice=l(document,"div","ieum-footer"),this.brandMark=l(document,"div","ieum-brand"),this.launcherTipClose.type="button",this.launcherTipClose.setAttribute("aria-label","\uC548\uB0B4 \uB2EB\uAE30"),this.launcherTipClose.innerHTML=v("close"),this.launcherTip.appendChild(this.launcherTipText),this.launcherTip.appendChild(this.launcherTipClose),this.floatingButton.type="button",this.floatingButton.title=(e.initialLauncherLabel?.trim()||e.launcherLabel)??"\uCC57\uBD07 \uC5F4\uAE30",this.floatingButton.setAttribute("aria-label",(e.initialLauncherLabel?.trim()||e.launcherLabel)??"\uCC57\uBD07 \uC5F4\uAE30"),this.floatingButton.classList.add("ieum-floating-loading"),this.floatingButton.replaceChildren();let i=Le(e),n=e.initialLauncherIconUrl?.trim();this.floatingButton.innerHTML=v(i,n),this.floatingButton.classList.toggle("ieum-floating-image",q(i,n)),this.titleNode.textContent=j(null,e),this.loadingRow.innerHTML=`
      <span class="ieum-loading-dot"></span>
      <span class="ieum-loading-dot"></span>
      <span class="ieum-loading-dot"></span>
    `,this.input.placeholder="\uBB34\uC5C7\uC744 \uB3C4\uC640\uB4DC\uB9B4\uAE4C\uC694?",this.sendButton.type="button",this.sendButton.setAttribute("aria-label","\uBA54\uC2DC\uC9C0 \uC804\uC1A1"),this.sendButton.innerHTML=v("send"),this.footerNotice.textContent=Q,this.brandMark.innerHTML='<span class="ieum-brand-inner">Powered by <svg class="ieum-brand-logo" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M12 2.2 19.5 5 V11 C19.5 15.8 16.2 19.2 12 21.6 C7.8 19.2 4.5 15.8 4.5 11 V5 Z" fill="#2f6df6"/><path d="M8.3 11.9 11 14.6 15.8 9.4" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg><b class="ieum-brand-name"><span style="color:#1f2937">Deep</span><span style="color:#2f6df6">Secu</span></b></span>'}async mount(){if(this.initialized)return;this.initialized=!0;let e=document.createElement("style");e.textContent=V(F(this.options.theme?.primaryColor??null)),this.shadow.appendChild(e),this.shadow.appendChild(this.root);let i=l(document,"div","ieum-header"),n=l(document,"div","ieum-header-main"),o=l(document,"div","ieum-header-actions"),s=l(document,"button","ieum-header-button"),r=l(document,"button","ieum-header-button"),c=l(document,"div","ieum-input-wrap");this.headerIconNode.innerHTML=v("heart"),s.type="button",s.title="\uCD5C\uC18C\uD654",s.setAttribute("aria-label","\uCD5C\uC18C\uD654"),s.innerHTML=v("minimize"),r.type="button",r.title="\uB2EB\uAE30",r.setAttribute("aria-label","\uB2EB\uAE30"),r.innerHTML=v("close"),n.appendChild(this.headerIconNode),n.appendChild(this.titleNode),o.appendChild(s),o.appendChild(r),i.appendChild(n),i.appendChild(o),c.appendChild(this.input),c.appendChild(this.sendButton),this.panel.appendChild(i),this.panel.appendChild(this.bannerWrap),this.panel.appendChild(this.messagesWrap),this.panel.appendChild(this.starterQuestionsWrap),this.panel.appendChild(this.quickActionsWrap),this.panel.appendChild(this.loadingRow),this.panel.appendChild(c),this.panel.appendChild(this.footerNotice),this.panel.appendChild(this.brandMark),this.launcherWrap.appendChild(this.launcherTip),this.launcherWrap.appendChild(this.floatingButton),this.root.appendChild(this.panel),this.root.appendChild(this.launcherWrap),document.body.appendChild(this.host),this.floatingButton.addEventListener("click",()=>this.togglePanel()),this.floatingButton.addEventListener("mouseenter",()=>this.showLauncherTip()),this.floatingButton.addEventListener("focus",()=>this.showLauncherTip()),this.floatingButton.addEventListener("blur",()=>this.hideLauncherTip()),this.launcherTip.addEventListener("mouseenter",()=>this.showLauncherTip()),this.launcherWrap.addEventListener("mouseleave",()=>{this.launcherTipDismissed&&this.hideLauncherTip()}),this.launcherTipClose.addEventListener("click",a=>{a.stopPropagation(),this.dismissLauncherTip()}),s.addEventListener("click",()=>this.setOpen(!1)),r.addEventListener("click",()=>this.setOpen(!1)),this.bindPanelDrag(i),this.sendButton.addEventListener("click",()=>void this.sendCurrentInput()),this.input.addEventListener("keydown",a=>{a.key==="Enter"&&!a.shiftKey&&(a.preventDefault(),this.sendCurrentInput())}),this.ensureInitialMessage(),this.loadConfig(),this.options.openOnLoad&&this.setOpen(!0)}bindPanelDrag(e){let i=!1,n=0,o=0,s=0,r=0,c=d=>{if(!i)return;let u=this.panel.getBoundingClientRect(),h=40,m=Math.min(Math.max(s+(d.clientX-n),h-u.width),window.innerWidth-h),f=Math.min(Math.max(r+(d.clientY-o),0),window.innerHeight-h);this.panel.style.left=`${m}px`,this.panel.style.top=`${f}px`},a=()=>{i&&(i=!1,this.panel.classList.remove("dragging"),document.removeEventListener("mousemove",c),document.removeEventListener("mouseup",a))};e.addEventListener("mousedown",d=>{if(d.button!==0||window.innerWidth<=640||d.target.closest(".ieum-header-button"))return;let u=this.panel.getBoundingClientRect();i=!0,n=d.clientX,o=d.clientY,s=u.left,r=u.top,this.panel.style.position="fixed",this.panel.style.right="auto",this.panel.style.bottom="auto",this.panel.style.left=`${s}px`,this.panel.style.top=`${r}px`,this.panel.classList.add("dragging"),document.addEventListener("mousemove",c),document.addEventListener("mouseup",a),d.preventDefault()})}ensureInitialMessage(){this.messages.length>0||(this.pushMessage({id:`assistant_welcome_${Date.now()}`,role:"assistant",text:Ce(this.config,this.options),timestamp:Date.now()}),this.config?.operatingHours.isAfterHours&&this.config.operatingHours.message&&this.pushMessage({id:`system_after_hours_${Date.now()}`,role:"system",text:this.config.operatingHours.message,timestamp:Date.now()}))}clearInitialWelcomeForDirectQuestion(){if(this.messages.some(i=>i.role==="user"))return;let e=this.messages.filter(i=>!i.id.startsWith("assistant_welcome_"));e.length!==this.messages.length&&(this.messages=e,this.renderMessages())}readLauncherTipDismissed(){return!1}dismissLauncherTip(){this.launcherTipDismissed=!0,this.hideLauncherTip()}showLauncherTip(e={}){this.open||!this.launcherHoverMessage.trim()||e.respectDismissed&&this.launcherTipDismissed||this.launcherTip.classList.add("visible")}hideLauncherTip(){this.launcherTip.classList.remove("visible")}async loadConfig(){try{this.config=await this.api.getConfig(this.options.chatbotId);let e=this.shadow.querySelector("style");e&&(e.textContent=V(F(this.config.theme?.preset))),this.titleNode.textContent=j(this.config,this.options),this.config.logoUrl?.trim()?this.headerIconNode.innerHTML=`<img src="${this.config.logoUrl}" alt="\uAE30\uAD00 \uB85C\uACE0" />`:this.headerIconNode.innerHTML=v("heart");let i=Te(this.config),n=this.config.theme?.launcherIconUrl;this.floatingButton.replaceChildren(),this.floatingButton.innerHTML=v(i,n),this.floatingButton.classList.toggle("ieum-floating-image",q(i,n)),this.launcherHoverMessage=Me(this.config,this.options)??"",this.launcherTipText.textContent=this.launcherHoverMessage,this.launcherTipStorageKey=`ieumbot_launcher_tip_dismissed:${this.options.chatbotId}`,this.launcherTipDismissed=this.readLauncherTipDismissed(),this.showLauncherTip({respectDismissed:!0}),this.renderBanner(),this.renderStarterQuestions(),this.footerNotice.textContent=this.config.privacyNotice?.trim()||Q,this.renderQuickActions(this.config.quickActions),this.config.runtime?.chatEndpoint&&(this.chatEndpoint=this.config.runtime.chatEndpoint),this.config.runtime?.chatStreamEndpoint&&(this.chatStreamEndpoint=this.config.runtime.chatStreamEndpoint),this.sseEnabled=ue(this.config.runtime?.sseEnabled)===!0||this.config.runtime?.streamingMode==="sse_preferred",this.messages.length===1&&this.messages[0]?.id.startsWith("assistant_welcome_")&&(this.messages=[]),this.ensureInitialMessage()}catch{this.pushMessage({id:`system_load_error_${Date.now()}`,role:"system",text:"\uCD08\uAE30 \uC124\uC815\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",timestamp:Date.now()})}finally{this.floatingButton.classList.remove("ieum-floating-loading")}}renderBanner(){this.bannerWrap.innerHTML="";let e=this.config?.banner?.title?.trim(),i=this.config?.banner?.description?.trim();if(!e&&!i){this.bannerWrap.style.display="none";return}if(this.bannerWrap.style.display="block",e){let n=l(document,"div","ieum-banner-title");n.textContent=e,this.bannerWrap.appendChild(n)}if(i){let n=l(document,"div","ieum-banner-description");n.textContent=i,this.bannerWrap.appendChild(n)}}renderStarterQuestions(){this.starterQuestionsWrap.innerHTML="";let e=this.config?.starterQuestions?.filter(s=>s.trim()).slice(0,6)??[];if(e.length===0){this.starterQuestionsWrap.style.display="none";return}let i=e.map(s=>me(s)),n=this.config?.starterQuestionStyle,o=n==="banner"||n!=="list"&&i.some(s=>s.iconType!=="none");if(this.starterQuestionsWrap.classList.toggle("ieum-starter-banner",o),o){let s=i.length,r=s<=3?s:s===4?2:3;this.starterQuestionsWrap.style.display="grid",this.starterQuestionsWrap.style.gridTemplateColumns=`repeat(${r}, 1fr)`}else this.starterQuestionsWrap.style.display="flex",this.starterQuestionsWrap.style.gridTemplateColumns="";for(let{iconType:s,icon:r,label:c,raw:a}of i){let d=l(document,"button","ieum-starter-question");d.type="button";let u=c||a;if(o){if(d.classList.add("ieum-starter-card"),s!=="none"){let m=l(document,"span","ieum-starter-card-icon");s==="svg"?m.innerHTML=Y[r]??"":(m.classList.add("ieum-starter-card-icon-emoji"),m.textContent=r),d.appendChild(m)}let h=l(document,"span","ieum-starter-card-label");h.textContent=c,d.appendChild(h)}else d.textContent=a;d.addEventListener("click",()=>{this.input.value=u,this.sendCurrentInput()}),this.starterQuestionsWrap.appendChild(d)}}renderQuickActions(e){this.quickActionsWrap.innerHTML="";let i=e.filter(n=>n.displayLocation==="welcome").slice(0,6);if(i.length===0){this.quickActionsWrap.style.display="none";return}this.quickActionsWrap.style.display="flex";for(let n of i){let o=l(document,"button","ieum-quick-action");o.type="button",o.textContent=n.label,o.title=n.label,o.addEventListener("click",()=>{if(n.actionType==="link"&&n.url){window.open(n.url,"_blank","noopener,noreferrer");return}this.input.value=n.payload?.trim()||n.label,this.sendCurrentInput()}),this.quickActionsWrap.appendChild(o)}}createQuickReplyHintsRow(){if(this.messages.some(o=>o.role==="user"))return null;let i=(this.config?.quickReplyHints??[]).filter(o=>o.trim()).slice(0,5);if(i.length===0)return null;let n=l(document,"div","ieum-hints-row");n.dataset.role="hints";for(let o of i){let s=l(document,"button","ieum-hint-btn");s.type="button",s.textContent=o,s.addEventListener("click",()=>{this.input.value=o,this.sendCurrentInput(),n.style.display="none"}),n.appendChild(s)}return n}setOpen(e){if(this.open=e,e){this.hideLauncherTip(),this.ensureInitialMessage(),this.panel.classList.add("open"),this.launcherWrap.style.opacity="0",this.launcherWrap.style.pointerEvents="none",this.input.focus(),this.scrollMessagesToBottom();return}this.panel.classList.remove("open"),this.launcherWrap.style.opacity="1",this.launcherWrap.style.pointerEvents="auto"}togglePanel(){this.setOpen(!this.open)}pushMessage(e){this.messages.push(e),this.renderMessages()}updateMessage(e,i){let n=this.messages.findIndex(o=>o.id===e);n<0||(this.messages[n]={...this.messages[n],...i},this.renderMessages())}removeMessage(e){this.messages=this.messages.filter(i=>i.id!==e),this.renderMessages()}renderMessages(){this.messagesWrap.innerHTML="",this.starterQuestionsWrap.style.display=this.messages.length<=1?this.starterQuestionsWrap.style.display:"none";for(let e of this.messages){let i=l(document,"div",`ieum-message ${e.role}`);i.dataset.messageId=e.id;let n=l(document,"div","ieum-bubble");e.id.startsWith("assistant_welcome_")&&n.classList.add("ieum-bubble-welcome");let o=e.structuredResponse;if(o&&e.role==="assistant")if(o.type==="text"){if(n.textContent=o.content,o.moreLink){let s=l(document,"a","ieum-more-link");s.href=o.moreLink.url,s.target="_blank",s.rel="noopener noreferrer",s.textContent=`\u2192 ${o.moreLink.title}`,n.appendChild(s)}}else if(o.type==="view"){let s=o;n.textContent="";let r=l(document,"div","ieum-view-card"),c=l(document,"div","ieum-view-title");c.textContent=s.title,r.appendChild(c);for(let a of s.content){let d=l(document,"p","ieum-view-content");d.textContent=a,r.appendChild(d)}if(s.moreLink){let a=l(document,"a","ieum-more-link");a.href=s.moreLink.url,a.target="_blank",a.rel="noopener noreferrer",a.textContent=`\u2192 ${s.moreLink.title}`,r.appendChild(a)}n.appendChild(r)}else if(o.type==="list"){let s=o;n.textContent="";let r=l(document,"ul","ieum-list");for(let c of s.items.slice(0,8)){let a=l(document,"li","ieum-list-item"),d=l(document,"div","ieum-list-item-title");d.textContent=c.title,a.appendChild(d);for(let u of c.contents.slice(0,3)){let h=l(document,"p","ieum-list-item-content");h.textContent=u,a.appendChild(h)}if(c.targetLink){let u=l(document,"a","ieum-list-item-link");u.href=c.targetLink,u.target="_blank",u.rel="noopener noreferrer",u.textContent=c.targetLinkLabel||"\uC790\uC138\uD788 \uBCF4\uAE30",a.appendChild(u)}else if(c.sourceLinkPath){let u=l(document,"a","ieum-list-item-link");u.href=c.sourceLinkPath,u.target="_blank",u.rel="noopener noreferrer",u.textContent=c.sourceLinkLabel||"\uCD9C\uCC98 \uBCF4\uAE30",a.appendChild(u)}r.appendChild(a)}if(n.appendChild(r),s.moreLink){let c=l(document,"a","ieum-more-link");c.href=s.moreLink.url,c.target="_blank",c.rel="noopener noreferrer",c.textContent=`\u2192 ${s.moreLink.title}`,n.appendChild(c)}}else O(n,e.text);else O(n,e.text);if(e.role==="assistant"){let s=xe(e.outcome);if(s){let r=l(document,"div","ieum-outcome-note");r.textContent=s,n.appendChild(r)}if(e.id){let r=l(document,"div","ieum-feedback-row");r.dataset.messageId=e.id;let c=l(document,"button","ieum-feedback-btn");c.setAttribute("aria-label","\uB3C4\uC6C0\uC774 \uB410\uC5B4\uC694"),c.textContent="\u{1F44D}";let a=l(document,"button","ieum-feedback-btn");a.setAttribute("aria-label","\uB3C4\uC6C0\uC774 \uC548 \uB410\uC5B4\uC694"),a.textContent="\u{1F44E}";let d=async u=>{let h=r.dataset.messageId;if(h)try{await this.api.sendFeedback(h,u),c.classList.toggle("ieum-feedback-active",u===1),a.classList.toggle("ieum-feedback-active",u===-1),setTimeout(()=>{r.innerHTML='<span class="ieum-feedback-thanks">\uD53C\uB4DC\uBC31 \uAC10\uC0AC\uD569\uB2C8\uB2E4</span>'},800)}catch{}};c.addEventListener("click",()=>{!!(e.followUpQuestions&&e.followUpQuestions.length>0)?(e.id&&this.api.sendFeedback(e.id,1).catch(()=>{}),this.input.value="\uB124",this.sendCurrentInput()):d(1)}),a.addEventListener("click",()=>{d(-1)}),r.appendChild(c),r.appendChild(a),n.appendChild(r)}if(e.citations&&e.citations.length>0){let r=ke(this.config),c=ye(e.citations),a=l(document,r?"details":"div",r?"ieum-citations ieum-citations-folded":"ieum-citations"),d=l(document,r?"summary":"div","ieum-citations-title");d.textContent=r?`${c} ${Math.min(e.citations.length,5)}\uAC74`:c,a.appendChild(d);for(let u of e.citations.slice(0,5)){let h=l(document,"div","ieum-citation"),m=u.sourceUrl?.trim();if(m){let f=l(document,"a","ieum-citation-link");f.href=m,f.target="_blank",f.rel="noopener noreferrer",f.textContent=we(u),h.appendChild(f)}else h.textContent=ve(u,this.config?.institutionName);a.appendChild(h)}n.appendChild(a)}if(e.followUpQuestions&&e.followUpQuestions.length>0){let r=l(document,"div","ieum-follow-ups"),c=l(document,"div","ieum-follow-ups-title");c.textContent="\u2726 \uC774\uB7F0 \uC9C8\uBB38\uB4E4\uC740 \uC5B4\uB5A0\uC2E0\uAC00\uC694?",r.appendChild(c);for(let a of e.followUpQuestions.slice(0,3)){let d=l(document,"button","ieum-follow-up-btn");d.type="button";let u=l(document,"span","ieum-follow-up-icon");u.textContent="\u{1F4AC}";let h=l(document,"span","ieum-follow-up-text");h.textContent=a;let m=l(document,"span","ieum-follow-up-arrow");m.textContent="\u2192",d.appendChild(u),d.appendChild(h),d.appendChild(m),d.addEventListener("click",()=>{this.input.value=a,this.sendCurrentInput()}),r.appendChild(d)}n.appendChild(r)}if(e.conditionalActions&&e.conditionalActions.length>0){let r=l(document,"div","ieum-cta-wrap"),c=l(document,"div","ieum-cta-title");c.textContent="\uAD00\uB828 \uC815\uBCF4",r.appendChild(c);for(let a of e.conditionalActions){let d=a.type==="link"?"\u{1F517}":a.type==="video"?"\u{1F3AC}":a.type==="file"?"\u{1F4CE}":"\u{1F4DE}",u=a.type==="contact"&&!a.value.startsWith("tel:")&&!a.value.startsWith("mailto:")?`tel:${a.value}`:a.value,h=l(document,"a","ieum-cta-btn");h.href=u,h.target=a.type==="contact"?"_self":"_blank",h.rel="noopener noreferrer",h.textContent=`${d} ${a.label}`,a.description&&(h.title=a.description),r.appendChild(h)}n.appendChild(r)}}if(i.appendChild(n),this.messagesWrap.appendChild(i),e.id.startsWith("assistant_welcome_")){let s=this.createQuickReplyHintsRow();s&&this.messagesWrap.appendChild(s)}}if(this.lastFailedQuestion){let e=l(document,"div","ieum-message system"),i=l(document,"button","ieum-quick-action");i.type="button",i.textContent="\uB2E4\uC2DC \uC2DC\uB3C4",i.addEventListener("click",()=>{this.lastFailedQuestion&&(this.input.value=this.lastFailedQuestion,this.sendCurrentInput())}),e.appendChild(i),this.messagesWrap.appendChild(e)}this.scrollAfterRender()}scrollMessagesToBottom(){requestAnimationFrame(()=>{this.messagesWrap.scrollTop=this.messagesWrap.scrollHeight})}scrollAfterRender(){let e=this.pinMessageIdToTop;requestAnimationFrame(()=>{if(e){let i=null,n=this.messagesWrap.children;for(let o=0;o<n.length;o+=1){let s=n[o];if(s.dataset&&s.dataset.messageId===e){i=s;break}}if(i){let o=this.messagesWrap.getBoundingClientRect().top,s=i.getBoundingClientRect().top;this.messagesWrap.scrollTop+=s-o-10;return}}this.messagesWrap.scrollTop=this.messagesWrap.scrollHeight})}setSending(e){this.sending=e,this.sendButton.disabled=e,this.input.disabled=e,this.loadingRow.classList.toggle("active",e)}async sendCurrentInput(){if(this.sending)return;let e=this.input.value.trim();if(e){if(this.pinMessageIdToTop=null,ge(e)){this.clearInitialWelcomeForDirectQuestion(),this.lastFailedQuestion=null,this.input.value="",this.pushMessage({id:`assistant_privacy_${Date.now()}`,role:"assistant",text:ae,outcome:"restricted",timestamp:Date.now()}),this.input.focus();return}if(this.clearInitialWelcomeForDirectQuestion(),this.lastFailedQuestion=null,this.input.value="",this.pushMessage({id:`user_${Date.now()}`,role:"user",text:e,timestamp:Date.now()}),this.setSending(!0),this.sseEnabled&&await this.trySendWithSse(e)){this.setSending(!1),this.input.focus();return}try{let i=await this.api.sendChat({chatbotId:this.options.chatbotId,question:e,topK:this.options.topK??8,sessionToken:this.sessionToken,sourceUrl:this.options.sourceUrl??window.location.href},this.chatEndpoint);this.handleAssistantResponse(i)}catch{this.lastFailedQuestion=e,this.pushMessage({id:`system_send_error_${Date.now()}`,role:"system",text:N,timestamp:Date.now()})}finally{this.setSending(!1),this.input.focus()}}}async trySendWithSse(e){let i=`assistant_stream_${Date.now()}`,n=!1,o="\uC2A4\uD2B8\uB9AC\uBC0D \uC5F0\uACB0 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4. \uC77C\uBC18 \uBAA8\uB4DC\uB85C \uC804\uD658\uD569\uB2C8\uB2E4.",s="answered",r=[],c=[],a=[],d="",u=!1;this.pinMessageIdToTop=i,this.pushMessage({id:i,role:"assistant",text:"",timestamp:Date.now()});let h=m=>{let f=m.data??{};if(m.event==="message_delta"){let b=k(f.delta)??"";d+=b,b&&(u=!0),this.updateMessage(i,{text:d});return}if(m.event==="message_complete"){s=k(f.outcome)??s,u=!0,this.updateMessage(i,{outcome:s,text:d||"..."});return}if(m.event==="fallback"||m.event==="escalation"){s=k(f.outcome)??(m.event==="escalation"?"escalate":"insufficient_evidence"),d=k(f.message)??"",u=!0,this.updateMessage(i,{text:d,outcome:s});return}if(m.event==="citations"){r=pe(f.items),this.updateMessage(i,{citations:r});return}if(m.event==="follow_up_questions"){c=fe(f.items).slice(0,3),this.updateMessage(i,{followUpQuestions:c});return}if(m.event==="conditional_actions"){a=he(f.items),this.updateMessage(i,{conditionalActions:a});return}if(m.event==="structured_response"){this.updateMessage(i,{structuredResponse:f});return}if(m.event==="error"){n=!0,o=k(f.message)??o;return}if(m.event==="done"){let b=k(f.sessionToken);b&&(this.sessionToken=b)}};try{if(await this.api.streamChat({chatbotId:this.options.chatbotId,question:e,topK:this.options.topK??8,sessionToken:this.sessionToken,sourceUrl:this.options.sourceUrl??window.location.href},h,this.chatStreamEndpoint),n)throw new Error(o);return d.trim()?this.updateMessage(i,{text:d,outcome:s,citations:r,followUpQuestions:c,conditionalActions:a}):this.updateMessage(i,{text:"\uC694\uCCAD\uC744 \uCC98\uB9AC\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",outcome:"insufficient_evidence"}),!0}catch{return u?(this.updateMessage(i,{text:d||"\uC751\uB2F5 \uC218\uC2E0 \uC911 \uC5F0\uACB0\uC774 \uC885\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",outcome:s,citations:r,followUpQuestions:c,conditionalActions:a}),this.lastFailedQuestion=e,!0):(this.updateMessage(i,{text:N,outcome:"insufficient_evidence"}),this.lastFailedQuestion=e,!0)}}handleAssistantResponse(e){let i=e.trace?.messages?.sessionToken;i&&typeof i=="string"&&(this.sessionToken=i);let n=e.answer?.text?.trim()||"\uC548\uB0B4 \uAC00\uB2A5\uD55C \uB2F5\uBCC0\uC744 \uC0DD\uC131\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",o=`assistant_${e.requestId}`;this.pinMessageIdToTop=o,this.pushMessage({id:o,role:"assistant",text:n,outcome:e.outcome,citations:Array.isArray(e.citations)?e.citations:[],followUpQuestions:Array.isArray(e.followUpQuestions)?e.followUpQuestions.slice(0,3):[],conditionalActions:Array.isArray(e.conditionalActions)?e.conditionalActions:[],structuredResponse:e.structuredResponse??null,timestamp:Date.now()})}};var I=new Set;async function K(t){if(!t?.chatbotId)throw new Error("WIDGET_INIT_REQUIRES_CHATBOT_ID");let e=t.chatbotId,i=Array.from(document.querySelectorAll('[data-ieumbot-widget-root="true"]'));for(let o of i)o.getAttribute("data-ieumbot-chatbot-id")===t.chatbotId&&o.remove();if(I.delete(e),I.has(e))return;await new L(t).mount(),I.add(e)}window.IEUMBOTWidget={init:K};var y=document.currentScript;if(y){let t=y.getAttribute("data-chatbot-id");if(t){let e=y.getAttribute("data-launcher-label")??void 0;K({chatbotId:t,apiBaseUrl:y.getAttribute("data-api-base-url")??void 0,openOnLoad:y.getAttribute("data-open-on-load")==="true",launcherLabel:e,initialLauncherLabel:e,initialLauncherIcon:y.getAttribute("data-launcher-icon")??void 0,initialLauncherIconUrl:y.getAttribute("data-launcher-icon-url")??void 0})}}})();
