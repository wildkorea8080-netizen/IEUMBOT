"use strict";(()=>{var ne=Object.defineProperty;var oe=(t,e,i)=>e in t?ne(t,e,{enumerable:!0,configurable:!0,writable:!0,value:i}):t[e]=i;var h=(t,e,i)=>oe(t,typeof e!="symbol"?e+"":e,i);function se(t){return t.endsWith("/")?t.slice(0,-1):t}var E=class{constructor(e){h(this,"baseUrl");this.baseUrl=se(e)}async getConfig(e){let i=await fetch(`${this.baseUrl}/widget/config/${encodeURIComponent(e)}`,{method:"GET",headers:{"Content-Type":"application/json"},credentials:"omit"});if(!i.ok)throw new Error(`WIDGET_CONFIG_FAILED:${i.status}`);return await i.json()}async getConsultationSnapshot(e,i){let n=await fetch(`${this.baseUrl}/widget/consultation/${encodeURIComponent(e)}/${encodeURIComponent(i)}`,{method:"GET",headers:{"Content-Type":"application/json"},credentials:"omit"});if(!n.ok)throw new Error(`WIDGET_SNAPSHOT_FAILED:${n.status}`);return await n.json()}async sendChat(e,i="/chat/messages"){let n=i.startsWith("/")?i:`/${i}`,s=await fetch(`${this.baseUrl}${n}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e),credentials:"omit"});if(!s.ok)throw new Error(`WIDGET_CHAT_FAILED:${s.status}`);return await s.json()}async sendFeedback(e,i){await fetch(`${this.baseUrl}/chat/messages/${encodeURIComponent(e)}/feedback`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({feedback:i}),credentials:"omit"})}async streamChat(e,i,n="/chat/messages/stream"){let s=n.startsWith("/")?n:`/${n}`,o=await fetch(`${this.baseUrl}${s}`,{method:"POST",headers:{"Content-Type":"application/json",Accept:"text/event-stream"},body:JSON.stringify(e),credentials:"omit"});if(!o.ok||!o.body)throw new Error(`WIDGET_CHAT_STREAM_FAILED:${o.status}`);let a=o.body.getReader(),r=new TextDecoder("utf-8"),d="";for(;;){let{value:u,done:c}=await a.read();if(c)break;d+=r.decode(u,{stream:!0});let p=d.indexOf(`

`);for(;p!==-1;){let m=d.slice(0,p).trim();if(d=d.slice(p+2),p=d.indexOf(`

`),!m)continue;let f="message",g=[];for(let b of m.split(`
`))b.startsWith("event:")?f=b.slice(6).trim():b.startsWith("data:")&&g.push(b.slice(5).trim());if(g.length!==0)try{let b=JSON.parse(g.join(`
`));i({event:f,data:b})}catch{i({event:"error",data:{code:"STREAM_EVENT_PARSE_FAILED",message:"\uC2A4\uD2B8\uB9BC \uC774\uBCA4\uD2B8 \uD30C\uC2F1 \uC2E4\uD328"}})}}}}};function re(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function k(t){let e=t;return e=e.replace(/`([^`]+)`/g,(i,n)=>`<code>${n}</code>`),e=e.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,(i,n,s)=>`<a href="${s}">${n}</a>`),e=e.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>"),e=e.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g,"$1<em>$2</em>"),e=e.replace(/(^|[^_])_([^_\n]+)_(?!_)/g,"$1<em>$2</em>"),e}function B(t){let e=t.trim();return e.startsWith("|")&&(e=e.slice(1)),e.endsWith("|")&&(e=e.slice(0,-1)),e.split("|").map(i=>i.trim())}var I=/^\s*\|.*\|\s*$/,ae=/^\s*\|?[\s:-]*-[-\s:|]*\|?\s*$/,z=/^(#{1,6})\s+(.*)$/,D=/^\s*[-*]\s+(.*)$/,N=/^\s*\d+\.\s+(.*)$/,U=/^\s*>\s+(.*)$/;function Q(t){return/(^|\n)\s*\|.*\|/.test(t)||/\*\*[^*]+\*\*/.test(t)||/(^|\n)\s*[-*]\s+\S/.test(t)||/(^|\n)\s*\d+\.\s+\S/.test(t)||/(^|\n)#{1,6}\s+\S/.test(t)||/\[[^\]]+\]\([^)]+\)/.test(t)||/(^|\n)>\s+\S/.test(t)}function P(t){let e=re(t.replace(/\r\n/g,`
`)).split(`
`),i=[],n=null,s=()=>{n&&(i.push(`</${n}>`),n=null)},o=0;for(;o<e.length;){let a=e[o];if(I.test(a)&&o+1<e.length&&ae.test(e[o+1])){s();let m=B(a);o+=2;let f=[];for(;o<e.length&&I.test(e[o]);)f.push(B(e[o])),o+=1;let g="<table><thead><tr>"+m.map(b=>`<th>${k(b)}</th>`).join("")+"</tr></thead><tbody>";for(let b of f)g+="<tr>"+b.map(x=>`<td>${k(x)}</td>`).join("")+"</tr>";g+="</tbody></table>",i.push(g);continue}let r=a.match(z);if(r){s(),i.push(`<h${r[1].length}>${k(r[2])}</h${r[1].length}>`),o+=1;continue}let d=a.match(D);if(d){n!=="ul"&&(s(),i.push("<ul>"),n="ul"),i.push(`<li>${k(d[1])}</li>`),o+=1;continue}let u=a.match(N);if(u){n!=="ol"&&(s(),i.push("<ol>"),n="ol"),i.push(`<li>${k(u[1])}</li>`),o+=1;continue}let c=a.match(U);if(c){s(),i.push(`<blockquote>${k(c[1])}</blockquote>`),o+=1;continue}if(a.trim()===""){s(),o+=1;continue}s();let p=[a];for(o+=1;o<e.length&&e[o].trim()!==""&&!I.test(e[o])&&!z.test(e[o])&&!D.test(e[o])&&!N.test(e[o])&&!U.test(e[o]);)p.push(e[o]),o+=1;i.push(`<p>${p.map(k).join("<br>")}</p>`)}return s(),i.join("")}var le=new Set(["p","br","div","span","h1","h2","h3","h4","h5","h6","strong","em","b","i","u","s","mark","code","pre","ul","ol","li","a","table","thead","tbody","tr","td","th","caption","blockquote","hr","img"]),de={a:new Set(["href","title"]),img:new Set(["src","alt","title","width","height"]),td:new Set(["colspan","rowspan"]),th:new Set(["colspan","rowspan","scope"])},ce=/<[a-zA-Z][a-zA-Z0-9]*(\s|>|\/)/;function j(t){return ce.test(t)}function O(t){let e=t.trim().toLowerCase();return!(!e||e.startsWith("javascript:")||e.startsWith("data:")||e.startsWith("vbscript:")||e.startsWith("file:"))}function q(t,e){let i=Array.from(t.children);for(let n of i){let s=n.tagName.toLowerCase();if(!le.has(s)){let a=e.createTextNode(n.textContent||"");n.replaceWith(a);continue}let o=de[s]||new Set;for(let a of Array.from(n.attributes))o.has(a.name.toLowerCase())||n.removeAttribute(a.name);if(s==="a"){let a=n.getAttribute("href")||"";O(a)||n.removeAttribute("href"),n.setAttribute("target","_blank"),n.setAttribute("rel","noopener noreferrer")}if(s==="img"){let a=n.getAttribute("src")||"";O(a)||n.removeAttribute("src")}q(n,e)}}function W(t){if(typeof window>"u"||typeof DOMParser>"u")return t.replace(/<[^>]*>/g,"");if(!t)return"";let i=new DOMParser().parseFromString(`<div id="__ieum_root__">${t}</div>`,"text/html"),n=i.getElementById("__ieum_root__");return n?(q(n,i),n.innerHTML):""}var ue="/widget-icons/love-chat-icons.png",F="\uC694\uCCAD \uCC98\uB9AC \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",pe="\uAC1C\uC778\uC815\uBCF4\uAC00 \uD3EC\uD568\uB41C \uB0B4\uC6A9\uC740 \uC785\uB825\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uAC1C\uC778\uC815\uBCF4\uB97C \uC81C\uC678\uD558\uACE0 \uB2E4\uC2DC \uC785\uB825\uD574 \uC8FC\uC138\uC694.",K="AI \uC774\uC74C\uBD07\uB3C4 \uAC00\uB054 \uC2E4\uC218\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uC911\uC694\uD55C \uC815\uBCF4\uB294 \uAF2D \uB2E4\uC2DC \uD55C\uBC88 \uD655\uC778\uD558\uC138\uC694.",he=[/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,/\b\d{6}-[1-4]\d{6}\b/,/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/,/\b01[016789][- ]?\d{3,4}[- ]?\d{4}\b/,/\b(?:19|20)\d{2}[-./](?:0[1-9]|1[0-2])[-./](?:0[1-9]|[12]\d|3[01])\b/];function me(t){return t.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function G(t){return`<img class="ieum-launcher-image" src="${me(t.trim())}" alt="" aria-hidden="true" />`}function l(t,e,i){let n=t.createElement(e);return i&&(n.className=i),n}function V(t,e){let i=e||"";j(i)?(t.classList.add("ieum-bubble-rich"),t.innerHTML=W(i)):Q(i)?(t.classList.add("ieum-bubble-rich"),t.innerHTML=W(P(i))):(t.classList.remove("ieum-bubble-rich"),t.textContent=i)}function y(t,e){return t==="custom"&&e?.trim()?G(e):t==="love-chat"?G(ue):t==="heart"?`
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
    `:t==="reset"?`
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
        <path d="M3 3v5h5"/>
      </svg>
    `:`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M7 10h10"/>
      <path d="M7 14h6"/>
      <path d="M21 12a8.96 8.96 0 0 1-2.64 6.36A9 9 0 1 1 21 12Z"/>
      <path d="m15 19 3.5 3.5"/>
    </svg>
  `}function fe(t){return t&&t.trim()?t.replace(/\/$/,""):`${window.location.origin}/api`}function L(t){return typeof t=="string"?t:void 0}function ge(t){return typeof t=="boolean"?t:void 0}function be(t){return Array.isArray(t)?t:[]}function xe(t){return Array.isArray(t)?t:[]}var v='fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"',ee={doc:`<svg viewBox="0 0 24 24" ${v}><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 16h6"/></svg>`,shield:`<svg viewBox="0 0 24 24" ${v}><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/></svg>`,member:`<svg viewBox="0 0 24 24" ${v}><circle cx="10" cy="8" r="3.2"/><path d="M4 20c0-3.3 2.7-5.6 6-5.6 1.2 0 2.3.3 3.2.8"/><path d="M18 14v6M15 17h6"/></svg>`,cert:`<svg viewBox="0 0 24 24" ${v}><circle cx="12" cy="9" r="5.2"/><path d="M9.7 9l1.6 1.6 3-3.2"/><path d="M8.5 13.2 7 20l5-2.6L17 20l-1.5-6.8"/></svg>`,search:`<svg viewBox="0 0 24 24" ${v}><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.3-4.3"/></svg>`,phone:`<svg viewBox="0 0 24 24" ${v}><path d="M6.6 10.8a12 12 0 0 0 5.6 5.6l1.9-1.9a1 1 0 0 1 1-.24 11 11 0 0 0 3.4.55 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A16 16 0 0 1 3 5a1 1 0 0 1 1-1h3.3a1 1 0 0 1 1 1 11 11 0 0 0 .55 3.4 1 1 0 0 1-.24 1z"/></svg>`,apply:`<svg viewBox="0 0 24 24" ${v}><path d="M5 4h9l4 4v6"/><path d="M14 4v4h4"/><path d="M13 21l-4 1 1-4 6.5-6.5a1.4 1.4 0 0 1 2 2z"/></svg>`,check:`<svg viewBox="0 0 24 24" ${v}><circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>`,info:`<svg viewBox="0 0 24 24" ${v}><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>`,won:`<svg viewBox="0 0 24 24" ${v}><circle cx="12" cy="12" r="8.5"/><path d="M8 9l1.6 6L12 10l2.4 5L16 9"/><path d="M7.4 11.5h9.2"/></svg>`,grid:`<svg viewBox="0 0 24 24" ${v}><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>`,chat:`<svg viewBox="0 0 24 24" ${v}><path d="M4 5h16v11H9l-4 3v-3H4z"/><path d="M8 9h8M8 12h5"/></svg>`,calendar:`<svg viewBox="0 0 24 24" ${v}><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 9h16M8 3v4M16 3v4"/></svg>`,building:`<svg viewBox="0 0 24 24" ${v}><path d="M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16"/><path d="M15 9h3a1 1 0 0 1 1 1v11"/><path d="M8 8h4M8 12h4M8 16h4"/></svg>`},ve=/^(https?:\/\/|tel:|mailto:|\/)/i;function we(t){let e=t.trim(),i="none",n="",s=e,o=e.match(/^\[([a-z0-9_-]+)\]\s*([\s\S]*)$/i);if(o&&ee[o[1].toLowerCase()])i="svg",n=o[1].toLowerCase(),s=o[2].trim();else{let c=e.search(/\s/);if(c>0){let p=e.slice(0,c);!/[0-9A-Za-z가-힣]/.test(p)&&/[←-⯿️‍]|[\u{1F000}-\u{1FAFF}]/u.test(p)&&(i="emoji",n=p,s=e.slice(c+1).trim())}}let a="",r=s.lastIndexOf(" | ");if(r>0){let c=s.slice(r+3).trim();ve.test(c)&&(a=c,s=s.slice(0,r).trim())}let d="",u=s.indexOf(" :: ");return u>0&&(d=s.slice(u+4).trim(),s=s.slice(0,u).trim()),s||(s=e),{iconType:i,icon:n,label:s,description:d,link:a,raw:e}}function ye(t){return Array.isArray(t)?t.filter(e=>typeof e=="string"):[]}function ke(t){return he.some(e=>e.test(t))}function te(t){return/^https?:\/\//i.test(t)||/^[\w.-]+\.[a-z]{2,}(?:\/|\?|$)/i.test(t)}function Ce(t){if(!t?.trim())return null;try{return new URL(t.trim()).hostname.replace(/^www\./,"")}catch{return null}}function Le(t){return!t||t==="answered"?null:t==="insufficient_evidence"?"\uB4F1\uB85D\uB41C \uC790\uB8CC\uC5D0\uC11C \uAD00\uB828 \uC815\uBCF4\uB97C \uCDA9\uBD84\uD788 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.":t==="restricted"?"\uC548\uC804\uD55C \uC548\uB0B4 \uBC94\uC704\uC5D0\uC11C \uB2F5\uBCC0\uC774 \uC81C\uD55C\uB41C \uC9C8\uBB38\uC785\uB2C8\uB2E4.":t==="conflict"?"\uADFC\uAC70 \uD655\uC778\uC774 \uB354 \uD544\uC694\uD55C \uC9C8\uBB38\uC785\uB2C8\uB2E4.":t==="escalate"?"\uC815\uD655\uD55C \uD655\uC778\uC774 \uD544\uC694\uD55C \uB0B4\uC6A9\uC785\uB2C8\uB2E4.":null}function Te(t,e){let i=e?.trim()||null,n=t.documentName?.trim()||"\uCD9C\uCC98",s=t.pageNumber?`p.${t.pageNumber}`:null,o=t.sectionTitle?.trim()||null,a=i&&i!==n?[i,n]:[n];return s&&a.push(s),o&&o!==n&&!te(o)&&a.push(o),a.join(" | ")}function _(t){let e=t.sectionTitle?.trim();if(e&&!te(e))return e;let i=t.documentName?.trim();if(i)return i;let n=t.sourceTitle?.trim();return n||(Ce(t.sourceUrl)??"\uCC38\uC870 \uC790\uB8CC")}function Me(t){return t.some(e=>e.sourceUrl?.trim())?"\uCC38\uC870 \uB9C1\uD06C":"\uCC38\uC870 \uC790\uB8CC"}function Ee(t){return t?.citationPresentation==="folded"||t?.citationMode==="compact"}function $(t,e){return e.title?.trim()||t?.institutionName?.trim()||t?.chatbotName?.trim()||"\uAE30\uAD00"}function Y(t,e){let i=e.title?.trim()||t?.chatbotName?.trim()||$(t,e);return i.startsWith("AI \uCC57\uBD07")?i:`AI \uCC57\uBD07 ${i}`}function Ae(t,e){if(e.welcomeMessage?.trim())return e.welcomeMessage.trim();if(t?.introMessage?.trim())return t.introMessage.trim();if(t?.welcomeMessage?.trim())return t.welcomeMessage.trim();let i=$(t,e);return i&&i!=="\uAE30\uAD00"?`\uC548\uB155\uD558\uC138\uC694. ${i} AI \uC0C1\uB2F4\uBD07\uC785\uB2C8\uB2E4. \uAD81\uAE08\uD558\uC2E0 \uB0B4\uC6A9\uC744 \uD3B8\uD558\uAC8C \uC785\uB825\uD574\uC8FC\uC138\uC694.`:"\uC548\uB155\uD558\uC138\uC694. \uAD81\uAE08\uD558\uC2E0 \uB0B4\uC6A9\uC744 \uC785\uB825\uD574\uC8FC\uC2DC\uBA74 \uBE60\uB974\uAC8C \uC548\uB0B4\uD574\uB4DC\uB9AC\uACA0\uC2B5\uB2C8\uB2E4."}function Z(t){return t==="forest"?"linear-gradient(135deg, #166534, #0f766e)":t==="sky"?"linear-gradient(135deg, #1d4ed8, #0284c7)":t==="civic"?"linear-gradient(135deg, #1e40af, #0f766e)":t==="sunset"?"linear-gradient(135deg, #b45309, #ea580c)":"linear-gradient(135deg, #2563EB, #22C55E)"}function Ie(t){let e=t?.theme?.launcherIcon;return e==="custom"&&t?.theme?.launcherIconUrl?.trim()?"custom":e==="love-chat"||e==="heart"||e==="shield"||e==="leaf"||e==="spark"?e:"chat"}function We(t){let e=t.initialLauncherIcon?.trim(),i=t.initialLauncherIconUrl?.trim();return e==="custom"&&i?"custom":e==="love-chat"||e==="heart"||e==="shield"||e==="leaf"||e==="spark"?e:"chat"}function J(t,e){return t==="love-chat"||t==="custom"&&!!e?.trim()}function _e(t,e){let i=t?.launcherHoverMessage?.trim();return i||`${$(t,e)} AI \uC0C1\uB2F4\uBD07\uC785\uB2C8\uB2E4. \uBB34\uC5C7\uC744 \uB3C4\uC640\uB4DC\uB9B4\uAE4C\uC694?`}function $e(t){let e=t.match(/#[0-9a-fA-F]{6,8}|#[0-9a-fA-F]{3}/);return e?e[0]:"#2563eb"}function T(t,e){let i=t.replace("#",""),n=i.length===3?i.split("").map(r=>r+r).join(""):i,s=parseInt(n.slice(0,2),16),o=parseInt(n.slice(2,4),16),a=parseInt(n.slice(4,6),16);return`rgba(${s},${o},${a},${e})`}function X(t){let e=$e(t),i=T(e,.18),n=T(e,.35),s=T(e,.4),o=T(e,.28),a=T(e,.12),r=T(e,.08);return`
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
  background:#fff; box-shadow:0 8px 32px ${a};
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
.ieum-floating:hover { transform:scale(1.06); box-shadow:0 10px 32px ${s}; }
.ieum-floating.ieum-floating-image { background:transparent; box-shadow:none; padding:0; }
.ieum-floating.ieum-floating-image:hover { box-shadow:none; }
.ieum-floating .ieum-launcher-image {
  width:60px; height:60px; border-radius:9999px;
  object-fit:contain; display:block; background:transparent;
}
.ieum-floating.ieum-floating-image .ieum-launcher-image {
  filter:drop-shadow(0 6px 20px ${o});
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
  position:relative;
  display:flex; flex-direction:column; align-items:center; justify-content:flex-start;
  gap:9px; text-align:center; padding:16px 10px 14px; min-height:94px; width:auto;
  border-radius:16px; background:#fff; border:1px solid #eef0f4;
  box-shadow:0 1px 2px rgba(16,24,40,.04);
  transition:border-color .15s, box-shadow .15s, transform .12s;
}
.ieum-starter-card.ieum-starter-link::after {
  content:"\u2197"; position:absolute; top:7px; right:9px; font-size:11px; color:#64748b;
}
.ieum-starter-question.ieum-starter-link:not(.ieum-starter-card):not(.ieum-starter-rich-card)::after {
  content:" \u2197"; color:#64748b; font-size:12px;
}
.ieum-starter-question.ieum-starter-card:hover {
  border-color:${e}; box-shadow:0 6px 16px rgba(16,24,40,.10); transform:translateY(-1px); background:#fff;
}
.ieum-starter-card-icon {
  display:flex; align-items:center; justify-content:center;
  width:42px; height:42px; border-radius:12px;
  background:${r}; color:${e}; font-size:22px; line-height:1; flex:0 0 auto;
}
.ieum-starter-card-icon svg { width:23px; height:23px; display:block; }
.ieum-starter-card-icon-emoji { background:transparent; }
.ieum-starter-card-label { font-size:12.5px; font-weight:600; color:#1f2937; line-height:1.35; word-break:keep-all; }
/* \u2500\u2500 \uB9AC\uCE58 \uCE74\uB4DC (\uC544\uC774\uCF58 + \uC81C\uBAA9 + \uC124\uBA85) \u2014 \uBC30\uB108\uC640 \uB3D9\uC77C \uADF8\uB9AC\uB4DC, \uC138\uB85C \uC911\uC559\uC815\uB82C \u2500\u2500 */
.ieum-starter-questions.ieum-starter-rich { gap:8px; }
.ieum-starter-question.ieum-starter-rich-card {
  position:relative; display:flex; flex-direction:column; align-items:center; justify-content:flex-start;
  gap:7px; width:auto; text-align:center; padding:14px 10px 12px; border-radius:14px;
  background:#fff; border:1px solid #eef0f4; box-shadow:0 1px 2px rgba(16,24,40,.04);
  transition:border-color .15s, box-shadow .15s, transform .12s;
}
.ieum-starter-question.ieum-starter-rich-card:hover {
  border-color:${e}; box-shadow:0 6px 16px rgba(16,24,40,.10); transform:translateY(-1px);
}
.ieum-starter-rich-icon {
  display:flex; align-items:center; justify-content:center;
  width:38px; height:38px; border-radius:10px;
  background:${r}; color:${e}; font-size:20px; line-height:1; flex:0 0 auto;
}
.ieum-starter-rich-icon svg { width:21px; height:21px; display:block; }
.ieum-starter-rich-body { min-width:0; width:100%; display:flex; flex-direction:column; align-items:center; }
.ieum-starter-rich-title { font-size:12.5px; font-weight:700; color:#1f2937; line-height:1.35; word-break:keep-all; }
.ieum-starter-rich-desc {
  margin-top:3px; font-size:11px; line-height:1.5; color:#64748b; white-space:pre-line; word-break:keep-all;
  display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:3; overflow:hidden;
}
.ieum-starter-rich-card.ieum-starter-link::after {
  content:"\u2197"; position:absolute; top:8px; right:10px; font-size:11px; color:#64748b;
}
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
  box-shadow:0 2px 8px ${o};
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
.ieum-citation-snapshot { background:none; border:none; padding:0; margin:0; font:inherit; font-weight:600; color:#2563eb; cursor:pointer; text-align:left; }
.ieum-citation-snapshot:hover { text-decoration:underline; }
.ieum-citation-badge { display:inline-block; margin-left:6px; padding:0 6px; font-size:10px; font-weight:600; color:#7c3aed; background:#f5f3ff; border-radius:5px; vertical-align:middle; }
.ieum-snapshot-overlay { position:fixed; inset:0; z-index:2147483647; background:rgba(15,23,42,0.45); display:flex; align-items:center; justify-content:center; padding:16px; }
.ieum-snapshot-card { background:#fff; border-radius:14px; width:100%; max-width:420px; max-height:80vh; display:flex; flex-direction:column; box-shadow:0 20px 60px rgba(0,0,0,.28); overflow:hidden; }
.ieum-snapshot-header { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; padding:16px 18px 10px; border-bottom:1px solid #f1f5f9; }
.ieum-snapshot-title { font-size:14px; font-weight:700; color:#111827; line-height:1.4; }
.ieum-snapshot-close { flex-shrink:0; background:none; border:none; font-size:16px; color:#9ca3af; cursor:pointer; padding:2px 4px; line-height:1; }
.ieum-snapshot-close:hover { color:#374151; }
.ieum-snapshot-body { padding:14px 18px 18px; overflow-y:auto; font-size:13px; color:#334155; line-height:1.65; }
.ieum-snapshot-badge { display:inline-block; margin-bottom:10px; padding:1px 8px; font-size:11px; font-weight:600; color:#7c3aed; background:#f5f3ff; border-radius:6px; }
.ieum-snapshot-label { font-size:11px; font-weight:700; color:#64748b; margin:12px 0 3px; }
.ieum-snapshot-label:first-of-type { margin-top:0; }
.ieum-snapshot-text { white-space:pre-wrap; word-break:break-word; color:#1f2937; }
.ieum-snapshot-source { margin-top:14px; padding-top:10px; border-top:1px solid #f1f5f9; font-size:11px; color:#94a3b8; }
.ieum-citations-folded summary { cursor:pointer; font-size:11px; font-weight:700; color:#6b7280; list-style:none; }
.ieum-citations-folded summary::-webkit-details-marker { display:none; }
.ieum-citations-folded summary::after { content:" \uD3BC\uCE58\uAE30"; font-weight:400; color:#64748b; }
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
.ieum-follow-up-arrow { font-size:12px; color:#6b7280; flex-shrink:0; }
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
.ieum-feedback-thanks { font-size:11px; color:#6b7280; padding:3px 4px; }
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
.ieum-input::placeholder { color:#6b7280; }
.ieum-input:focus { border-color:${e}; background:#fff; box-shadow:0 0 0 3px ${r}; }
/* \u2500\u2500 \uC6F9\uC811\uADFC\uC131(KWCAG): \uD0A4\uBCF4\uB4DC \uD3EC\uCEE4\uC2A4 \uD45C\uC2DC \u2500\u2500 */
.ieum-panel :focus-visible, .ieum-floating:focus-visible, .ieum-launcher-tip-close:focus-visible {
  outline:2px solid ${e}; outline-offset:2px; border-radius:6px;
}
.ieum-header-button:focus-visible { outline:2px solid #fff; outline-offset:2px; }
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
  background:#fff; font-size:11px; color:#6b7280; line-height:1.5;
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
`}var A=class{constructor(e){h(this,"options");h(this,"api");h(this,"host");h(this,"shadow");h(this,"root");h(this,"launcherWrap");h(this,"launcherTip");h(this,"launcherTipText");h(this,"launcherTipClose");h(this,"floatingButton");h(this,"panel");h(this,"titleNode");h(this,"headerIconNode");h(this,"bannerWrap");h(this,"starterQuestionsWrap");h(this,"quickActionsWrap");h(this,"messagesWrap");h(this,"loadingRow");h(this,"input");h(this,"sendButton");h(this,"footerNotice");h(this,"brandMark");h(this,"initialized",!1);h(this,"open",!1);h(this,"sending",!1);h(this,"launcherTipDismissed",!1);h(this,"launcherHoverMessage","");h(this,"launcherTipStorageKey","");h(this,"sessionToken",`widget_${Math.random().toString(36).slice(2,10)}_${Date.now().toString(36)}`);h(this,"config",null);h(this,"chatEndpoint","/chat/messages");h(this,"chatStreamEndpoint","/chat/messages/stream");h(this,"sseEnabled",!1);h(this,"messages",[]);h(this,"lastFailedQuestion",null);h(this,"pinMessageIdToTop",null);this.options=e,this.api=new E(fe(e.apiBaseUrl)),this.host=document.createElement("div"),this.host.setAttribute("data-ieumbot-widget-root","true"),this.host.setAttribute("data-ieumbot-chatbot-id",e.chatbotId),this.shadow=this.host.attachShadow({mode:"open"}),this.root=l(document,"div","ieum-root"),this.launcherWrap=l(document,"div","ieum-launcher-wrap"),this.launcherTip=l(document,"div","ieum-launcher-tip"),this.launcherTipText=l(document,"div","ieum-launcher-tip-text"),this.launcherTipClose=l(document,"button","ieum-launcher-tip-close"),this.floatingButton=l(document,"button","ieum-floating"),this.panel=l(document,"div","ieum-panel"),this.titleNode=l(document,"div","ieum-title"),this.headerIconNode=l(document,"div","ieum-header-icon"),this.bannerWrap=l(document,"div","ieum-banner"),this.starterQuestionsWrap=l(document,"div","ieum-starter-questions"),this.quickActionsWrap=l(document,"div","ieum-quick-actions"),this.messagesWrap=l(document,"div","ieum-messages"),this.loadingRow=l(document,"div","ieum-loading"),this.input=l(document,"input","ieum-input"),this.sendButton=l(document,"button","ieum-send"),this.footerNotice=l(document,"div","ieum-footer"),this.brandMark=l(document,"div","ieum-brand"),this.launcherTipClose.type="button",this.launcherTipClose.setAttribute("aria-label","\uC548\uB0B4 \uB2EB\uAE30"),this.launcherTipClose.innerHTML=y("close"),this.launcherTip.appendChild(this.launcherTipText),this.launcherTip.appendChild(this.launcherTipClose),this.floatingButton.type="button",this.floatingButton.title=(e.initialLauncherLabel?.trim()||e.launcherLabel)??"\uCC57\uBD07 \uC5F4\uAE30",this.floatingButton.setAttribute("aria-label",(e.initialLauncherLabel?.trim()||e.launcherLabel)??"\uCC57\uBD07 \uC5F4\uAE30"),this.floatingButton.classList.add("ieum-floating-loading"),this.floatingButton.replaceChildren();let i=We(e),n=e.initialLauncherIconUrl?.trim();this.floatingButton.innerHTML=y(i,n),this.floatingButton.classList.toggle("ieum-floating-image",J(i,n)),this.titleNode.textContent=Y(null,e),this.loadingRow.innerHTML=`
      <span class="ieum-loading-dot"></span>
      <span class="ieum-loading-dot"></span>
      <span class="ieum-loading-dot"></span>
    `,this.input.placeholder="\uBB34\uC5C7\uC744 \uB3C4\uC640\uB4DC\uB9B4\uAE4C\uC694?",this.sendButton.type="button",this.sendButton.setAttribute("aria-label","\uBA54\uC2DC\uC9C0 \uC804\uC1A1"),this.sendButton.innerHTML=y("send"),this.titleNode.id="ieum-title-heading",this.titleNode.setAttribute("role","heading"),this.titleNode.setAttribute("aria-level","2"),this.panel.setAttribute("role","dialog"),this.panel.setAttribute("aria-labelledby","ieum-title-heading"),this.messagesWrap.setAttribute("role","log"),this.messagesWrap.setAttribute("aria-live","polite"),this.messagesWrap.setAttribute("aria-relevant","additions text"),this.input.setAttribute("aria-label","\uC9C8\uBB38 \uC785\uB825"),this.floatingButton.setAttribute("aria-haspopup","dialog"),this.floatingButton.setAttribute("aria-expanded","false"),this.footerNotice.textContent=K,this.brandMark.innerHTML='<span class="ieum-brand-inner">Powered by <svg class="ieum-brand-logo" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M12 2.2 19.5 5 V11 C19.5 15.8 16.2 19.2 12 21.6 C7.8 19.2 4.5 15.8 4.5 11 V5 Z" fill="#2f6df6"/><path d="M8.3 11.9 11 14.6 15.8 9.4" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg><b class="ieum-brand-name"><span style="color:#1f2937">Deep</span><span style="color:#2f6df6">Secu</span></b></span>'}async mount(){if(this.initialized)return;this.initialized=!0;let e=document.createElement("style");e.textContent=X(Z(this.options.theme?.primaryColor??null)),this.shadow.appendChild(e),this.shadow.appendChild(this.root);let i=l(document,"div","ieum-header"),n=l(document,"div","ieum-header-main"),s=l(document,"div","ieum-header-actions"),o=l(document,"button","ieum-header-button"),a=l(document,"button","ieum-header-button"),r=l(document,"button","ieum-header-button"),d=l(document,"div","ieum-input-wrap");this.headerIconNode.innerHTML=y("heart"),o.type="button",o.title="\uB300\uD654 \uC0C8\uB85C \uC2DC\uC791",o.setAttribute("aria-label","\uB300\uD654 \uC0C8\uB85C \uC2DC\uC791"),o.innerHTML=y("reset"),a.type="button",a.title="\uCD5C\uC18C\uD654",a.setAttribute("aria-label","\uCD5C\uC18C\uD654"),a.innerHTML=y("minimize"),r.type="button",r.title="\uB2EB\uAE30",r.setAttribute("aria-label","\uB2EB\uAE30"),r.innerHTML=y("close"),n.appendChild(this.headerIconNode),n.appendChild(this.titleNode),s.appendChild(o),s.appendChild(a),s.appendChild(r),i.appendChild(n),i.appendChild(s),d.appendChild(this.input),d.appendChild(this.sendButton),this.panel.appendChild(i),this.panel.appendChild(this.bannerWrap),this.panel.appendChild(this.messagesWrap),this.panel.appendChild(this.starterQuestionsWrap),this.panel.appendChild(this.quickActionsWrap),this.panel.appendChild(this.loadingRow),this.panel.appendChild(d),this.panel.appendChild(this.footerNotice),this.panel.appendChild(this.brandMark),this.launcherWrap.appendChild(this.launcherTip),this.launcherWrap.appendChild(this.floatingButton),this.root.appendChild(this.panel),this.root.appendChild(this.launcherWrap),document.body.appendChild(this.host),this.floatingButton.addEventListener("click",()=>this.togglePanel()),this.floatingButton.addEventListener("mouseenter",()=>this.showLauncherTip()),this.floatingButton.addEventListener("focus",()=>this.showLauncherTip()),this.floatingButton.addEventListener("blur",()=>this.hideLauncherTip()),this.launcherTip.addEventListener("mouseenter",()=>this.showLauncherTip()),this.launcherWrap.addEventListener("mouseleave",()=>{this.launcherTipDismissed&&this.hideLauncherTip()}),this.launcherTipClose.addEventListener("click",u=>{u.stopPropagation(),this.dismissLauncherTip()}),o.addEventListener("click",()=>this.resetConversation()),a.addEventListener("click",()=>this.setOpen(!1)),r.addEventListener("click",()=>this.setOpen(!1)),this.panel.addEventListener("keydown",u=>{u.key==="Escape"&&this.open&&(u.stopPropagation(),this.setOpen(!1))}),this.bindPanelDrag(i),this.sendButton.addEventListener("click",()=>void this.sendCurrentInput()),this.input.addEventListener("keydown",u=>{u.key==="Enter"&&!u.shiftKey&&(u.preventDefault(),this.sendCurrentInput())}),this.ensureInitialMessage(),this.loadConfig(),this.options.openOnLoad&&this.setOpen(!0)}bindPanelDrag(e){let i=!1,n=0,s=0,o=0,a=0,r=u=>{if(!i)return;let c=this.panel.getBoundingClientRect(),p=40,m=Math.min(Math.max(o+(u.clientX-n),p-c.width),window.innerWidth-p),f=Math.min(Math.max(a+(u.clientY-s),0),window.innerHeight-p);this.panel.style.left=`${m}px`,this.panel.style.top=`${f}px`},d=()=>{i&&(i=!1,this.panel.classList.remove("dragging"),document.removeEventListener("mousemove",r),document.removeEventListener("mouseup",d))};e.addEventListener("mousedown",u=>{if(u.button!==0||window.innerWidth<=640||u.target.closest(".ieum-header-button"))return;let c=this.panel.getBoundingClientRect();i=!0,n=u.clientX,s=u.clientY,o=c.left,a=c.top,this.panel.style.position="fixed",this.panel.style.right="auto",this.panel.style.bottom="auto",this.panel.style.left=`${o}px`,this.panel.style.top=`${a}px`,this.panel.classList.add("dragging"),document.addEventListener("mousemove",r),document.addEventListener("mouseup",d),u.preventDefault()})}ensureInitialMessage(){this.messages.length>0||(this.pushMessage({id:`assistant_welcome_${Date.now()}`,role:"assistant",text:Ae(this.config,this.options),timestamp:Date.now()}),this.config?.operatingHours.isAfterHours&&this.config.operatingHours.message&&this.pushMessage({id:`system_after_hours_${Date.now()}`,role:"system",text:this.config.operatingHours.message,timestamp:Date.now()}))}clearInitialWelcomeForDirectQuestion(){}resetConversation(){this.messages=[],this.sessionToken=`widget_${Math.random().toString(36).slice(2,10)}_${Date.now().toString(36)}`,this.ensureInitialMessage(),this.renderMessages(),this.renderStarterQuestions(),this.input.value="",this.messagesWrap.scrollTop=0,this.input.focus()}readLauncherTipDismissed(){return!1}dismissLauncherTip(){this.launcherTipDismissed=!0,this.hideLauncherTip()}showLauncherTip(e={}){this.open||!this.launcherHoverMessage.trim()||e.respectDismissed&&this.launcherTipDismissed||this.launcherTip.classList.add("visible")}hideLauncherTip(){this.launcherTip.classList.remove("visible")}async loadConfig(){try{this.config=await this.api.getConfig(this.options.chatbotId);let e=this.shadow.querySelector("style");e&&(e.textContent=X(Z(this.config.theme?.preset))),this.titleNode.textContent=Y(this.config,this.options),this.config.logoUrl?.trim()?this.headerIconNode.innerHTML=`<img src="${this.config.logoUrl}" alt="\uAE30\uAD00 \uB85C\uACE0" />`:this.headerIconNode.innerHTML=y("heart");let i=Ie(this.config),n=this.config.theme?.launcherIconUrl;this.floatingButton.replaceChildren(),this.floatingButton.innerHTML=y(i,n),this.floatingButton.classList.toggle("ieum-floating-image",J(i,n)),this.launcherHoverMessage=_e(this.config,this.options)??"",this.launcherTipText.textContent=this.launcherHoverMessage,this.launcherTipStorageKey=`ieumbot_launcher_tip_dismissed:${this.options.chatbotId}`,this.launcherTipDismissed=this.readLauncherTipDismissed(),this.showLauncherTip({respectDismissed:!0}),this.renderBanner(),this.renderStarterQuestions(),this.footerNotice.textContent=this.config.privacyNotice?.trim()||K,this.renderQuickActions(this.config.quickActions),this.config.runtime?.chatEndpoint&&(this.chatEndpoint=this.config.runtime.chatEndpoint),this.config.runtime?.chatStreamEndpoint&&(this.chatStreamEndpoint=this.config.runtime.chatStreamEndpoint),this.sseEnabled=ge(this.config.runtime?.sseEnabled)===!0||this.config.runtime?.streamingMode==="sse_preferred",this.messages.length===1&&this.messages[0]?.id.startsWith("assistant_welcome_")&&(this.messages=[]),this.ensureInitialMessage()}catch{this.pushMessage({id:`system_load_error_${Date.now()}`,role:"system",text:"\uCD08\uAE30 \uC124\uC815\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",timestamp:Date.now()})}finally{this.floatingButton.classList.remove("ieum-floating-loading")}}async openConsultationSnapshot(e,i){let n=this.shadow.activeElement,s=l(document,"div","ieum-snapshot-overlay"),o=l(document,"div","ieum-snapshot-card");o.setAttribute("role","dialog"),o.setAttribute("aria-modal","true"),s.appendChild(o);let a=()=>{s.remove(),document.removeEventListener("keydown",r),n?.focus?.()},r=m=>{m.key==="Escape"&&a()};s.addEventListener("click",m=>{m.target===s&&a()}),document.addEventListener("keydown",r);let d=l(document,"div","ieum-snapshot-header"),u=l(document,"div","ieum-snapshot-title");u.textContent=_(i);let c=l(document,"button","ieum-snapshot-close");c.type="button",c.setAttribute("aria-label","\uB2EB\uAE30"),c.textContent="\u2715",c.addEventListener("click",a),d.appendChild(u),d.appendChild(c),o.appendChild(d);let p=l(document,"div","ieum-snapshot-body");p.textContent="\uC0C1\uB2F4 \uB0B4\uC6A9\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\u2026",o.appendChild(p),this.root.appendChild(s),c.focus();try{let m=await this.api.getConsultationSnapshot(this.options.chatbotId,e);p.innerHTML="";let f=m.category?.trim();if(f){let w=l(document,"span","ieum-snapshot-badge");w.textContent=f,p.appendChild(w)}let g=[["\uC9C8\uBB38",m.question?.trim()||"(\uB0B4\uC6A9 \uC5C6\uC74C)"],["\uC804\uBB38\uAC00 \uB2F5\uBCC0",m.answer?.trim()||"(\uB0B4\uC6A9 \uC5C6\uC74C)"]];for(let[w,M]of g){let H=l(document,"div","ieum-snapshot-label");H.textContent=w;let R=l(document,"div","ieum-snapshot-text");R.textContent=M,p.appendChild(H),p.appendChild(R)}let b=l(document,"div","ieum-snapshot-source"),x=m.boardLabel?.trim()||"\uC0C1\uB2F4\uAC8C\uC2DC\uD310";b.textContent=m.receiptNo?`\uCD9C\uCC98: ${x} \xB7 ${m.receiptNo}`:`\uCD9C\uCC98: ${x}`,p.appendChild(b)}catch{p.textContent="\uC0C1\uB2F4 \uB0B4\uC6A9\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694."}}renderBanner(){this.bannerWrap.innerHTML="";let e=this.config?.banner?.title?.trim(),i=this.config?.banner?.description?.trim();if(!e&&!i){this.bannerWrap.style.display="none";return}if(this.bannerWrap.style.display="block",e){let n=l(document,"div","ieum-banner-title");n.textContent=e,this.bannerWrap.appendChild(n)}if(i){let n=l(document,"div","ieum-banner-description");n.textContent=i,this.bannerWrap.appendChild(n)}}renderStarterQuestions(){this.starterQuestionsWrap.innerHTML="";let e=this.config?.starterQuestions?.filter(r=>r.trim()).slice(0,6)??[];if(e.length===0){this.starterQuestionsWrap.style.display="none";return}let i=e.map(r=>we(r)),n=this.config?.starterQuestionStyle,s=i.some(r=>r.description),o=!s&&(n==="banner"||n!=="list"&&i.some(r=>r.iconType!=="none"));if(this.starterQuestionsWrap.classList.toggle("ieum-starter-rich",s),this.starterQuestionsWrap.classList.toggle("ieum-starter-banner",o),o||s){let r=i.length,d=r<=3?r:r===4?2:3;this.starterQuestionsWrap.style.display="grid",this.starterQuestionsWrap.style.gridTemplateColumns=`repeat(${d}, 1fr)`}else this.starterQuestionsWrap.style.display="flex",this.starterQuestionsWrap.style.gridTemplateColumns="";let a=(r,d,u)=>{if(r==="none")return null;let c=l(document,"span",u);return r==="svg"?c.innerHTML=ee[d]??"":(c.style.background="transparent",c.textContent=d),c};for(let{iconType:r,icon:d,label:u,description:c,link:p,raw:m}of i){let f=l(document,"button","ieum-starter-question");f.type="button";let g=u||m;if(p&&f.classList.add("ieum-starter-link"),s){f.classList.add("ieum-starter-rich-card");let b=a(r,d,"ieum-starter-rich-icon");b&&f.appendChild(b);let x=l(document,"span","ieum-starter-rich-body"),w=l(document,"span","ieum-starter-rich-title");if(w.textContent=u,x.appendChild(w),c){let M=l(document,"span","ieum-starter-rich-desc");M.textContent=c,x.appendChild(M)}f.appendChild(x)}else if(o){f.classList.add("ieum-starter-card");let b=a(r,d,"ieum-starter-card-icon");b&&f.appendChild(b);let x=l(document,"span","ieum-starter-card-label");x.textContent=u,f.appendChild(x)}else f.textContent=u;f.addEventListener("click",()=>{if(p){/^(tel:|mailto:)/i.test(p)?window.location.href=p:window.open(p,"_blank","noopener,noreferrer");return}this.input.value=g,this.sendCurrentInput()}),this.starterQuestionsWrap.appendChild(f)}}renderQuickActions(e){this.quickActionsWrap.innerHTML="";let i=e.filter(n=>n.displayLocation==="welcome").slice(0,6);if(i.length===0){this.quickActionsWrap.style.display="none";return}this.quickActionsWrap.style.display="flex";for(let n of i){let s=l(document,"button","ieum-quick-action");s.type="button",s.textContent=n.label,s.title=n.label,s.addEventListener("click",()=>{if(n.actionType==="link"&&n.url){window.open(n.url,"_blank","noopener,noreferrer");return}this.input.value=n.payload?.trim()||n.label,this.sendCurrentInput()}),this.quickActionsWrap.appendChild(s)}}createQuickReplyHintsRow(){if(this.messages.some(s=>s.role==="user"))return null;let i=(this.config?.quickReplyHints??[]).filter(s=>s.trim()).slice(0,5);if(i.length===0)return null;let n=l(document,"div","ieum-hints-row");n.dataset.role="hints";for(let s of i){let o=l(document,"button","ieum-hint-btn");o.type="button",o.textContent=s,o.addEventListener("click",()=>{this.input.value=s,this.sendCurrentInput(),n.style.display="none"}),n.appendChild(o)}return n}setOpen(e){if(this.open=e,this.floatingButton.setAttribute("aria-expanded",e?"true":"false"),e){this.hideLauncherTip(),this.ensureInitialMessage(),this.panel.classList.add("open"),this.launcherWrap.style.opacity="0",this.launcherWrap.style.pointerEvents="none",this.input.focus(),this.scrollMessagesToBottom();return}this.panel.classList.remove("open"),this.launcherWrap.style.opacity="1",this.launcherWrap.style.pointerEvents="auto";try{this.floatingButton.focus()}catch{}}togglePanel(){this.setOpen(!this.open)}pushMessage(e){this.messages.push(e),this.renderMessages()}updateMessage(e,i){let n=this.messages.findIndex(s=>s.id===e);n<0||(this.messages[n]={...this.messages[n],...i},this.renderMessages())}removeMessage(e){this.messages=this.messages.filter(i=>i.id!==e),this.renderMessages()}renderMessages(){this.messagesWrap.innerHTML="",this.starterQuestionsWrap.style.display=this.messages.length<=1?this.starterQuestionsWrap.style.display:"none";for(let e of this.messages){let i=l(document,"div",`ieum-message ${e.role}`);i.dataset.messageId=e.id;let n=l(document,"div","ieum-bubble");e.id.startsWith("assistant_welcome_")&&n.classList.add("ieum-bubble-welcome");let s=e.structuredResponse;if(s&&e.role==="assistant")if(s.type==="text"){if(n.textContent=s.content,s.moreLink){let o=l(document,"a","ieum-more-link");o.href=s.moreLink.url,o.target="_blank",o.rel="noopener noreferrer",o.textContent=`\u2192 ${s.moreLink.title}`,n.appendChild(o)}}else if(s.type==="view"){let o=s;n.textContent="";let a=l(document,"div","ieum-view-card"),r=l(document,"div","ieum-view-title");r.textContent=o.title,a.appendChild(r);for(let d of o.content){let u=l(document,"p","ieum-view-content");u.textContent=d,a.appendChild(u)}if(o.moreLink){let d=l(document,"a","ieum-more-link");d.href=o.moreLink.url,d.target="_blank",d.rel="noopener noreferrer",d.textContent=`\u2192 ${o.moreLink.title}`,a.appendChild(d)}n.appendChild(a)}else if(s.type==="list"){let o=s;n.textContent="";let a=l(document,"ul","ieum-list");for(let r of o.items.slice(0,8)){let d=l(document,"li","ieum-list-item"),u=l(document,"div","ieum-list-item-title");u.textContent=r.title,d.appendChild(u);for(let c of r.contents.slice(0,3)){let p=l(document,"p","ieum-list-item-content");p.textContent=c,d.appendChild(p)}if(r.targetLink){let c=l(document,"a","ieum-list-item-link");c.href=r.targetLink,c.target="_blank",c.rel="noopener noreferrer",c.textContent=r.targetLinkLabel||"\uC790\uC138\uD788 \uBCF4\uAE30",d.appendChild(c)}else if(r.sourceLinkPath){let c=l(document,"a","ieum-list-item-link");c.href=r.sourceLinkPath,c.target="_blank",c.rel="noopener noreferrer",c.textContent=r.sourceLinkLabel||"\uCD9C\uCC98 \uBCF4\uAE30",d.appendChild(c)}a.appendChild(d)}if(n.appendChild(a),o.moreLink){let r=l(document,"a","ieum-more-link");r.href=o.moreLink.url,r.target="_blank",r.rel="noopener noreferrer",r.textContent=`\u2192 ${o.moreLink.title}`,n.appendChild(r)}}else V(n,e.text);else V(n,e.text);if(e.role==="assistant"){let o=Le(e.outcome);if(o){let a=l(document,"div","ieum-outcome-note");a.textContent=o,n.appendChild(a)}if(e.id){let a=l(document,"div","ieum-feedback-row");a.dataset.messageId=e.id;let r=l(document,"button","ieum-feedback-btn");r.setAttribute("aria-label","\uB3C4\uC6C0\uC774 \uB410\uC5B4\uC694"),r.textContent="\u{1F44D}";let d=l(document,"button","ieum-feedback-btn");d.setAttribute("aria-label","\uB3C4\uC6C0\uC774 \uC548 \uB410\uC5B4\uC694"),d.textContent="\u{1F44E}";let u=async c=>{let p=a.dataset.messageId;if(p)try{await this.api.sendFeedback(p,c),r.classList.toggle("ieum-feedback-active",c===1),d.classList.toggle("ieum-feedback-active",c===-1),setTimeout(()=>{a.innerHTML='<span class="ieum-feedback-thanks">\uD53C\uB4DC\uBC31 \uAC10\uC0AC\uD569\uB2C8\uB2E4</span>'},800)}catch{}};r.addEventListener("click",()=>{!!(e.followUpQuestions&&e.followUpQuestions.length>0)?(e.id&&this.api.sendFeedback(e.id,1).catch(()=>{}),this.input.value="\uB124",this.sendCurrentInput()):u(1)}),d.addEventListener("click",()=>{u(-1)}),a.appendChild(r),a.appendChild(d),n.appendChild(a)}if(e.citations&&e.citations.length>0){let a=Ee(this.config),r=Me(e.citations),d=l(document,a?"details":"div",a?"ieum-citations ieum-citations-folded":"ieum-citations"),u=l(document,a?"summary":"div","ieum-citations-title");u.textContent=a?`${r} ${Math.min(e.citations.length,5)}\uAC74`:r,d.appendChild(u);for(let c of e.citations.slice(0,5)){let p=l(document,"div","ieum-citation"),m=c.sourceUrl?.trim();if((c.extractionMethod??"").toLowerCase()==="seoul_labor"&&!!c.chunkId?.trim()){let g=c.chunkId,b=l(document,"button","ieum-citation-link ieum-citation-snapshot");b.type="button",b.textContent=_(c),b.addEventListener("click",()=>{this.openConsultationSnapshot(g,c)}),p.appendChild(b);let x=c.category?.trim();if(x){let w=l(document,"span","ieum-citation-badge");w.textContent=x,p.appendChild(w)}}else if(m){let g=l(document,"a","ieum-citation-link");g.href=m,g.target="_blank",g.rel="noopener noreferrer",g.textContent=_(c),p.appendChild(g)}else p.textContent=Te(c,this.config?.institutionName);d.appendChild(p)}n.appendChild(d)}if(e.followUpQuestions&&e.followUpQuestions.length>0){let a=l(document,"div","ieum-follow-ups"),r=l(document,"div","ieum-follow-ups-title");r.textContent="\u2726 \uC774\uB7F0 \uC9C8\uBB38\uB4E4\uC740 \uC5B4\uB5A0\uC2E0\uAC00\uC694?",a.appendChild(r);for(let d of e.followUpQuestions.slice(0,3)){let u=l(document,"button","ieum-follow-up-btn");u.type="button";let c=l(document,"span","ieum-follow-up-icon");c.textContent="\u{1F4AC}";let p=l(document,"span","ieum-follow-up-text");p.textContent=d;let m=l(document,"span","ieum-follow-up-arrow");m.textContent="\u2192",u.appendChild(c),u.appendChild(p),u.appendChild(m),u.addEventListener("click",()=>{this.input.value=d,this.sendCurrentInput()}),a.appendChild(u)}n.appendChild(a)}if(e.conditionalActions&&e.conditionalActions.length>0){let a=l(document,"div","ieum-cta-wrap"),r=l(document,"div","ieum-cta-title");r.textContent="\uAD00\uB828 \uC815\uBCF4",a.appendChild(r);for(let d of e.conditionalActions){let u=d.type==="link"?"\u{1F517}":d.type==="video"?"\u{1F3AC}":d.type==="file"?"\u{1F4CE}":"\u{1F4DE}",c=d.type==="contact"&&!d.value.startsWith("tel:")&&!d.value.startsWith("mailto:")?`tel:${d.value}`:d.value,p=l(document,"a","ieum-cta-btn");p.href=c,p.target=d.type==="contact"?"_self":"_blank",p.rel="noopener noreferrer",p.textContent=`${u} ${d.label}`,d.description&&(p.title=d.description),a.appendChild(p)}n.appendChild(a)}}if(i.appendChild(n),this.messagesWrap.appendChild(i),e.id.startsWith("assistant_welcome_")){let o=this.createQuickReplyHintsRow();o&&this.messagesWrap.appendChild(o)}}if(this.lastFailedQuestion){let e=l(document,"div","ieum-message system"),i=l(document,"button","ieum-quick-action");i.type="button",i.textContent="\uB2E4\uC2DC \uC2DC\uB3C4",i.addEventListener("click",()=>{this.lastFailedQuestion&&(this.input.value=this.lastFailedQuestion,this.sendCurrentInput())}),e.appendChild(i),this.messagesWrap.appendChild(e)}this.scrollAfterRender()}scrollMessagesToBottom(){requestAnimationFrame(()=>{this.messagesWrap.scrollTop=this.messagesWrap.scrollHeight})}scrollAfterRender(){let e=this.pinMessageIdToTop;requestAnimationFrame(()=>{if(e){let i=null,n=this.messagesWrap.children;for(let s=0;s<n.length;s+=1){let o=n[s];if(o.dataset&&o.dataset.messageId===e){i=o;break}}if(i){let s=this.messagesWrap.getBoundingClientRect().top,o=i.getBoundingClientRect().top;this.messagesWrap.scrollTop+=o-s-10;return}}this.messagesWrap.scrollTop=this.messagesWrap.scrollHeight})}setSending(e){this.sending=e,this.sendButton.disabled=e,this.input.disabled=e,this.loadingRow.classList.toggle("active",e)}async sendCurrentInput(){if(this.sending)return;let e=this.input.value.trim();if(e){if(this.pinMessageIdToTop=null,ke(e)){this.clearInitialWelcomeForDirectQuestion(),this.lastFailedQuestion=null,this.input.value="",this.pushMessage({id:`assistant_privacy_${Date.now()}`,role:"assistant",text:pe,outcome:"restricted",timestamp:Date.now()}),this.input.focus();return}if(this.clearInitialWelcomeForDirectQuestion(),this.lastFailedQuestion=null,this.input.value="",this.pushMessage({id:`user_${Date.now()}`,role:"user",text:e,timestamp:Date.now()}),this.setSending(!0),this.sseEnabled&&await this.trySendWithSse(e)){this.setSending(!1),this.input.focus();return}try{let i=await this.api.sendChat({chatbotId:this.options.chatbotId,question:e,topK:this.options.topK??8,sessionToken:this.sessionToken,sourceUrl:this.options.sourceUrl??window.location.href},this.chatEndpoint);this.handleAssistantResponse(i)}catch{this.lastFailedQuestion=e,this.pushMessage({id:`system_send_error_${Date.now()}`,role:"system",text:F,timestamp:Date.now()})}finally{this.setSending(!1),this.input.focus()}}}async trySendWithSse(e){let i=`assistant_stream_${Date.now()}`,n=!1,s="\uC2A4\uD2B8\uB9AC\uBC0D \uC5F0\uACB0 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4. \uC77C\uBC18 \uBAA8\uB4DC\uB85C \uC804\uD658\uD569\uB2C8\uB2E4.",o="answered",a=[],r=[],d=[],u="",c=!1;this.pinMessageIdToTop=i,this.pushMessage({id:i,role:"assistant",text:"",timestamp:Date.now()});let p=m=>{let f=m.data??{};if(m.event==="message_delta"){let g=L(f.delta)??"";u+=g,g&&(c=!0),this.updateMessage(i,{text:u});return}if(m.event==="message_complete"){o=L(f.outcome)??o,c=!0,this.updateMessage(i,{outcome:o,text:u||"..."});return}if(m.event==="fallback"||m.event==="escalation"){o=L(f.outcome)??(m.event==="escalation"?"escalate":"insufficient_evidence"),u=L(f.message)??"",c=!0,this.updateMessage(i,{text:u,outcome:o});return}if(m.event==="citations"){a=be(f.items),this.updateMessage(i,{citations:a});return}if(m.event==="follow_up_questions"){r=ye(f.items).slice(0,3),this.updateMessage(i,{followUpQuestions:r});return}if(m.event==="conditional_actions"){d=xe(f.items),this.updateMessage(i,{conditionalActions:d});return}if(m.event==="structured_response"){this.updateMessage(i,{structuredResponse:f});return}if(m.event==="error"){n=!0,s=L(f.message)??s;return}if(m.event==="done"){let g=L(f.sessionToken);g&&(this.sessionToken=g)}};try{if(await this.api.streamChat({chatbotId:this.options.chatbotId,question:e,topK:this.options.topK??8,sessionToken:this.sessionToken,sourceUrl:this.options.sourceUrl??window.location.href},p,this.chatStreamEndpoint),n)throw new Error(s);return u.trim()?this.updateMessage(i,{text:u,outcome:o,citations:a,followUpQuestions:r,conditionalActions:d}):this.updateMessage(i,{text:"\uC694\uCCAD\uC744 \uCC98\uB9AC\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",outcome:"insufficient_evidence"}),!0}catch{return c?(this.updateMessage(i,{text:u||"\uC751\uB2F5 \uC218\uC2E0 \uC911 \uC5F0\uACB0\uC774 \uC885\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",outcome:o,citations:a,followUpQuestions:r,conditionalActions:d}),this.lastFailedQuestion=e,!0):(this.updateMessage(i,{text:F,outcome:"insufficient_evidence"}),this.lastFailedQuestion=e,!0)}}handleAssistantResponse(e){let i=e.trace?.messages?.sessionToken;i&&typeof i=="string"&&(this.sessionToken=i);let n=e.answer?.text?.trim()||"\uC548\uB0B4 \uAC00\uB2A5\uD55C \uB2F5\uBCC0\uC744 \uC0DD\uC131\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",s=`assistant_${e.requestId}`;this.pinMessageIdToTop=s,this.pushMessage({id:s,role:"assistant",text:n,outcome:e.outcome,citations:Array.isArray(e.citations)?e.citations:[],followUpQuestions:Array.isArray(e.followUpQuestions)?e.followUpQuestions.slice(0,3):[],conditionalActions:Array.isArray(e.conditionalActions)?e.conditionalActions:[],structuredResponse:e.structuredResponse??null,timestamp:Date.now()})}};var S=new Set;async function ie(t){if(!t?.chatbotId)throw new Error("WIDGET_INIT_REQUIRES_CHATBOT_ID");let e=t.chatbotId,i=Array.from(document.querySelectorAll('[data-ieumbot-widget-root="true"]'));for(let s of i)s.getAttribute("data-ieumbot-chatbot-id")===t.chatbotId&&s.remove();if(S.delete(e),S.has(e))return;await new A(t).mount(),S.add(e)}window.IEUMBOTWidget={init:ie};var C=document.currentScript;if(C){let t=C.getAttribute("data-chatbot-id");if(t){let e=C.getAttribute("data-launcher-label")??void 0;ie({chatbotId:t,apiBaseUrl:C.getAttribute("data-api-base-url")??void 0,openOnLoad:C.getAttribute("data-open-on-load")==="true",launcherLabel:e,initialLauncherLabel:e,initialLauncherIcon:C.getAttribute("data-launcher-icon")??void 0,initialLauncherIconUrl:C.getAttribute("data-launcher-icon-url")??void 0})}}})();
