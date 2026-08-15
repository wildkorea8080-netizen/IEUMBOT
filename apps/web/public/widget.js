"use strict";(()=>{var se=Object.defineProperty;var re=(i,e,t)=>e in i?se(i,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):i[e]=t;var m=(i,e,t)=>re(i,typeof e!="symbol"?e+"":e,t);function ae(i){return i.endsWith("/")?i.slice(0,-1):i}var _=class{constructor(e){m(this,"baseUrl");this.baseUrl=ae(e)}async getConfig(e){let t=await fetch(`${this.baseUrl}/widget/config/${encodeURIComponent(e)}`,{method:"GET",headers:{"Content-Type":"application/json"},credentials:"omit"});if(!t.ok)throw new Error(`WIDGET_CONFIG_FAILED:${t.status}`);return await t.json()}async getConsultationSnapshot(e,t){let n=await fetch(`${this.baseUrl}/widget/consultation/${encodeURIComponent(e)}/${encodeURIComponent(t)}`,{method:"GET",headers:{"Content-Type":"application/json"},credentials:"omit"});if(!n.ok)throw new Error(`WIDGET_SNAPSHOT_FAILED:${n.status}`);return await n.json()}async sendChat(e,t="/chat/messages"){let n=t.startsWith("/")?t:`/${t}`,s=await fetch(`${this.baseUrl}${n}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e),credentials:"omit"});if(!s.ok)throw new Error(`WIDGET_CHAT_FAILED:${s.status}`);return await s.json()}async reportBlockedPrivacyInput(e){await fetch(`${this.baseUrl}/widget/security-events`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e),credentials:"omit",keepalive:!0})}async sendFeedback(e,t){await fetch(`${this.baseUrl}/chat/messages/${encodeURIComponent(e)}/feedback`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({feedback:t}),credentials:"omit"})}async streamChat(e,t,n="/chat/messages/stream"){let s=n.startsWith("/")?n:`/${n}`,o=await fetch(`${this.baseUrl}${s}`,{method:"POST",headers:{"Content-Type":"application/json",Accept:"text/event-stream"},body:JSON.stringify(e),credentials:"omit"});if(!o.ok||!o.body)throw new Error(`WIDGET_CHAT_STREAM_FAILED:${o.status}`);let r=o.body.getReader(),a=new TextDecoder("utf-8"),d="";for(;;){let{value:c,done:p}=await r.read();if(p)break;d+=a.decode(c,{stream:!0});let u=d.indexOf(`

`);for(;u!==-1;){let h=d.slice(0,u).trim();if(d=d.slice(u+2),u=d.indexOf(`

`),!h)continue;let f="message",x=[];for(let g of h.split(`
`))g.startsWith("event:")?f=g.slice(6).trim():g.startsWith("data:")&&x.push(g.slice(5).trim());if(x.length!==0)try{let g=JSON.parse(x.join(`
`));t({event:f,data:g})}catch{t({event:"error",data:{code:"STREAM_EVENT_PARSE_FAILED",message:"\uC2A4\uD2B8\uB9BC \uC774\uBCA4\uD2B8 \uD30C\uC2F1 \uC2E4\uD328"}})}}}}};function le(i){return i.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function T(i){let e=i;return e=e.replace(/`([^`]+)`/g,(t,n)=>`<code>${n}</code>`),e=e.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,(t,n,s)=>`<a href="${s}">${n}</a>`),e=e.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>"),e=e.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g,"$1<em>$2</em>"),e=e.replace(/(^|[^_])_([^_\n]+)_(?!_)/g,"$1<em>$2</em>"),e}function D(i){let e=i.trim();return e.startsWith("|")&&(e=e.slice(1)),e.endsWith("|")&&(e=e.slice(0,-1)),e.split("|").map(t=>t.trim())}var S=/^\s*\|.*\|\s*$/,de=/^\s*\|?[\s:-]*-[-\s:|]*\|?\s*$/,N=/^(#{1,6})\s+(.*)$/,U=/^\s*[-*]\s+(.*)$/,O=/^\s*\d+\.\s+(.*)$/,P=/^\s*>\s+(.*)$/;function Q(i){return/(^|\n)\s*\|.*\|/.test(i)||/\*\*[^*]+\*\*/.test(i)||/(^|\n)\s*[-*]\s+\S/.test(i)||/(^|\n)\s*\d+\.\s+\S/.test(i)||/(^|\n)#{1,6}\s+\S/.test(i)||/\[[^\]]+\]\([^)]+\)/.test(i)||/(^|\n)>\s+\S/.test(i)}function j(i){let e=le(i.replace(/\r\n/g,`
`)).split(`
`),t=[],n=null,s=()=>{n&&(t.push(`</${n}>`),n=null)},o=0;for(;o<e.length;){let r=e[o];if(S.test(r)&&o+1<e.length&&de.test(e[o+1])){s();let h=D(r);o+=2;let f=[];for(;o<e.length&&S.test(e[o]);)f.push(D(e[o])),o+=1;let x="<table><thead><tr>"+h.map(g=>`<th>${T(g)}</th>`).join("")+"</tr></thead><tbody>";for(let g of f)x+="<tr>"+g.map(b=>`<td>${T(b)}</td>`).join("")+"</tr>";x+="</tbody></table>",t.push(x);continue}let a=r.match(N);if(a){s(),t.push(`<h${a[1].length}>${T(a[2])}</h${a[1].length}>`),o+=1;continue}let d=r.match(U);if(d){n!=="ul"&&(s(),t.push("<ul>"),n="ul"),t.push(`<li>${T(d[1])}</li>`),o+=1;continue}let c=r.match(O);if(c){n!=="ol"&&(s(),t.push("<ol>"),n="ol"),t.push(`<li>${T(c[1])}</li>`),o+=1;continue}let p=r.match(P);if(p){s(),t.push(`<blockquote>${T(p[1])}</blockquote>`),o+=1;continue}if(r.trim()===""){s(),o+=1;continue}s();let u=[r];for(o+=1;o<e.length&&e[o].trim()!==""&&!S.test(e[o])&&!N.test(e[o])&&!U.test(e[o])&&!O.test(e[o])&&!P.test(e[o]);)u.push(e[o]),o+=1;t.push(`<p>${u.map(T).join("<br>")}</p>`)}return s(),t.join("")}var ce=new Set(["p","br","div","span","section","article","header","footer","small","sub","sup","h1","h2","h3","h4","h5","h6","strong","em","b","i","u","s","mark","code","pre","ul","ol","li","a","table","thead","tbody","tr","td","th","caption","colgroup","col","blockquote","hr","figure","figcaption","img"]),ue={a:new Set(["href","title"]),img:new Set(["src","alt","title","width","height"]),td:new Set(["colspan","rowspan"]),th:new Set(["colspan","rowspan","scope"]),col:new Set(["span"]),colgroup:new Set(["span"])},pe=new Set(["color","background","background-color","margin","margin-top","margin-right","margin-bottom","margin-left","padding","padding-top","padding-right","padding-bottom","padding-left","gap","row-gap","column-gap","border","border-top","border-right","border-bottom","border-left","border-width","border-style","border-color","border-radius","border-collapse","border-spacing","font","font-size","font-weight","font-style","font-family","line-height","letter-spacing","text-align","text-decoration","text-transform","white-space","word-break","overflow-wrap","vertical-align","width","min-width","max-width","height","min-height","max-height","box-sizing","display","flex","flex-direction","flex-wrap","flex-grow","flex-shrink","flex-basis","align-items","align-self","justify-content","justify-items","grid-template-columns","grid-template-rows","grid-gap","list-style","list-style-type","list-style-position","box-shadow","opacity","overflow","overflow-x","overflow-y"]);function he(i){let e=[];for(let t of i.split(";")){let n=t.indexOf(":");if(n<0)continue;let s=t.slice(0,n).trim().toLowerCase(),o=t.slice(n+1).trim();if(!pe.has(s))continue;let r=o.toLowerCase();r.includes("url(")||r.includes("expression")||r.includes("javascript:")||r.includes("@import")||r.includes("</")||r.includes("fixed")||r.includes("absolute")||r.includes("sticky")||e.push(`${s}: ${o}`)}return e.join("; ")}var me=/<[a-zA-Z][a-zA-Z0-9]*(\s|>|\/)/;function F(i){return me.test(i)}function q(i){let e=i.trim().toLowerCase();return!(!e||e.startsWith("javascript:")||e.startsWith("data:")||e.startsWith("vbscript:")||e.startsWith("file:"))}function G(i,e){let t=Array.from(i.children);for(let n of t){let s=n.tagName.toLowerCase();if(!ce.has(s)){let r=e.createTextNode(n.textContent||"");n.replaceWith(r);continue}let o=ue[s]||new Set;for(let r of Array.from(n.attributes)){let a=r.name.toLowerCase();if(a==="style"){let d=he(r.value);d?n.setAttribute("style",d):n.removeAttribute("style");continue}o.has(a)||n.removeAttribute(r.name)}if(s==="a"){let r=n.getAttribute("href")||"";q(r)||n.removeAttribute("href"),n.setAttribute("target","_blank"),n.setAttribute("rel","noopener noreferrer")}if(s==="img"){let r=n.getAttribute("src")||"";q(r)||n.removeAttribute("src")}G(n,e)}}function B(i){if(typeof window>"u"||typeof DOMParser>"u")return i.replace(/<[^>]*>/g,"");if(!i)return"";let t=new DOMParser().parseFromString(`<div id="__ieum_root__">${i}</div>`,"text/html"),n=t.getElementById("__ieum_root__");return n?(G(n,t),n.innerHTML):""}var fe="/widget-icons/love-chat-icons.png",ge=8,be=6,xe=4,K="\uC694\uCCAD \uCC98\uB9AC \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",we="\uAC1C\uC778\uC815\uBCF4\uAC00 \uD3EC\uD568\uB41C \uB0B4\uC6A9\uC740 \uC785\uB825\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uAC1C\uC778\uC815\uBCF4\uB97C \uC81C\uC678\uD558\uACE0 \uB2E4\uC2DC \uC785\uB825\uD574 \uC8FC\uC138\uC694.",V="AI \uC774\uC74C\uBD07\uB3C4 \uAC00\uB054 \uC2E4\uC218\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uC911\uC694\uD55C \uC815\uBCF4\uB294 \uAF2D \uB2E4\uC2DC \uD55C\uBC88 \uD655\uC778\uD558\uC138\uC694.",ve=[{type:"email",pattern:/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/},{type:"rrn",pattern:/\b\d{6}-[1-4]\d{6}\b/},{type:"card",pattern:/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/},{type:"phone",pattern:/\b01[016789][- ]?\d{3,4}[- ]?\d{4}\b/},{type:"birthdate",pattern:/\b(?:19|20)\d{2}[-./](?:0[1-9]|1[0-2])[-./](?:0[1-9]|[12]\d|3[01])\b/}];function ye(i){return i.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function Y(i){return`<img class="ieum-launcher-image" src="${ye(i.trim())}" alt="" aria-hidden="true" />`}function l(i,e,t){let n=i.createElement(e);return t&&(n.className=t),n}function W(i,e){let t=e||"";F(t)?(i.classList.add("ieum-bubble-rich"),i.innerHTML=B(t)):Q(t)?(i.classList.add("ieum-bubble-rich"),i.innerHTML=B(j(t))):(i.classList.remove("ieum-bubble-rich"),i.textContent=t)}function k(i,e){return i==="custom"&&e?.trim()?Y(e):i==="love-chat"?Y(fe):i==="heart"?`
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M19.5 12.57 12 20l-7.5-7.43a4.95 4.95 0 0 1 0-7 4.95 4.95 0 0 1 7 0L12 6l.5-.43a4.95 4.95 0 0 1 7 7Z"/>
      </svg>
    `:i==="shield"?`
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 3 5 6v6c0 5 3.5 7.7 7 9 3.5-1.3 7-4 7-9V6l-7-3Z"/>
        <path d="m9.5 12 1.7 1.7L14.8 10"/>
      </svg>
    `:i==="leaf"?`
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M11 20c5 0 9-4 9-9V4h-7c-5 0-9 4-9 9 0 4 3 7 7 7Z"/>
        <path d="M8 16c2-3 5-5 9-6"/>
      </svg>
    `:i==="spark"?`
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z"/>
        <path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/>
        <path d="m5 14 .8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Z"/>
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
    `:i==="reset"?`
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m3 10.5 9-7 9 7"/>
        <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/>
        <path d="M9.5 21v-6h5v6"/>
      </svg>
    `:`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M7 10h10"/>
      <path d="M7 14h6"/>
      <path d="M21 12a8.96 8.96 0 0 1-2.64 6.36A9 9 0 1 1 21 12Z"/>
      <path d="m15 19 3.5 3.5"/>
    </svg>
  `}function ke(i){return i&&i.trim()?i.replace(/\/$/,""):`${window.location.origin}/api`}function M(i){return typeof i=="string"?i:void 0}function Ce(i){return typeof i=="boolean"?i:void 0}function Te(i){return Array.isArray(i)?i:[]}function Le(i){return Array.isArray(i)?i:[]}var v='fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"',ie={doc:`<svg viewBox="0 0 24 24" ${v}><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 16h6"/></svg>`,shield:`<svg viewBox="0 0 24 24" ${v}><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/></svg>`,member:`<svg viewBox="0 0 24 24" ${v}><circle cx="10" cy="8" r="3.2"/><path d="M4 20c0-3.3 2.7-5.6 6-5.6 1.2 0 2.3.3 3.2.8"/><path d="M18 14v6M15 17h6"/></svg>`,cert:`<svg viewBox="0 0 24 24" ${v}><circle cx="12" cy="9" r="5.2"/><path d="M9.7 9l1.6 1.6 3-3.2"/><path d="M8.5 13.2 7 20l5-2.6L17 20l-1.5-6.8"/></svg>`,search:`<svg viewBox="0 0 24 24" ${v}><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.3-4.3"/></svg>`,phone:`<svg viewBox="0 0 24 24" ${v}><path d="M6.6 10.8a12 12 0 0 0 5.6 5.6l1.9-1.9a1 1 0 0 1 1-.24 11 11 0 0 0 3.4.55 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A16 16 0 0 1 3 5a1 1 0 0 1 1-1h3.3a1 1 0 0 1 1 1 11 11 0 0 0 .55 3.4 1 1 0 0 1-.24 1z"/></svg>`,apply:`<svg viewBox="0 0 24 24" ${v}><path d="M5 4h9l4 4v6"/><path d="M14 4v4h4"/><path d="M13 21l-4 1 1-4 6.5-6.5a1.4 1.4 0 0 1 2 2z"/></svg>`,check:`<svg viewBox="0 0 24 24" ${v}><circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>`,info:`<svg viewBox="0 0 24 24" ${v}><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>`,won:`<svg viewBox="0 0 24 24" ${v}><circle cx="12" cy="12" r="8.5"/><path d="M8 9l1.6 6L12 10l2.4 5L16 9"/><path d="M7.4 11.5h9.2"/></svg>`,grid:`<svg viewBox="0 0 24 24" ${v}><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>`,chat:`<svg viewBox="0 0 24 24" ${v}><path d="M4 5h16v11H9l-4 3v-3H4z"/><path d="M8 9h8M8 12h5"/></svg>`,calendar:`<svg viewBox="0 0 24 24" ${v}><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 9h16M8 3v4M16 3v4"/></svg>`,building:`<svg viewBox="0 0 24 24" ${v}><path d="M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16"/><path d="M15 9h3a1 1 0 0 1 1 1v11"/><path d="M8 8h4M8 12h4M8 16h4"/></svg>`},Me=/^(https?:\/\/|tel:|mailto:|\/)/i;function Ee(i){let e=i.trim(),t="none",n="",s=e,o=e.match(/^\[([a-z0-9_-]+)\]\s*([\s\S]*)$/i);if(o&&ie[o[1].toLowerCase()])t="svg",n=o[1].toLowerCase(),s=o[2].trim();else{let p=e.search(/\s/);if(p>0){let u=e.slice(0,p);!/[0-9A-Za-z가-힣]/.test(u)&&/[←-⯿️‍]|[\u{1F000}-\u{1FAFF}]/u.test(u)&&(t="emoji",n=u,s=e.slice(p+1).trim())}}let r="",a=s.lastIndexOf(" | ");if(a>0){let p=s.slice(a+3).trim();Me.test(p)&&(r=p,s=s.slice(0,a).trim())}let d="",c=s.indexOf(" :: ");return c>0&&(d=s.slice(c+4).trim(),s=s.slice(0,c).trim()),s||(s=e),{iconType:t,icon:n,label:s,description:d,link:r,raw:e}}function Ae(i){return Array.isArray(i)?i.filter(e=>typeof e=="string"):[]}function Ie(i){return ve.filter(({pattern:e})=>e.test(i)).map(({type:e})=>e)}function ne(i){return/^https?:\/\//i.test(i)||/^[\w.-]+\.[a-z]{2,}(?:\/|\?|$)/i.test(i)}function We(i){if(!i?.trim())return null;try{return new URL(i.trim()).hostname.replace(/^www\./,"")}catch{return null}}function _e(i){return!i||i==="answered"?null:i==="insufficient_evidence"?{icon:"\u26A0\uFE0F",text:"\uB4F1\uB85D\uB41C \uC790\uB8CC\uC5D0\uC11C \uAD00\uB828 \uADFC\uAC70\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",tone:"warn"}:i==="restricted"?{icon:"\u{1F512}",text:"\uC548\uC804\uD55C \uC548\uB0B4 \uBC94\uC704\uC5D0\uC11C \uB2F5\uBCC0\uC774 \uC81C\uD55C\uB41C \uC9C8\uBB38\uC785\uB2C8\uB2E4.",tone:"muted"}:i==="conflict"?{icon:"\u2753",text:"\uADFC\uAC70 \uD655\uC778\uC774 \uB354 \uD544\uC694\uD55C \uC9C8\uBB38\uC785\uB2C8\uB2E4.",tone:"warn"}:i==="escalate"?{icon:"\u{1F4DE}",text:"\uC815\uD655\uD55C \uD655\uC778\uC774 \uD544\uC694\uD55C \uB0B4\uC6A9\uC785\uB2C8\uB2E4.",tone:"info"}:null}function $e(i){if((i.extractionMethod??"").toLowerCase()==="seoul_labor")return"\u{1F4AC}";if(i.sourceUrl?.trim())return"\u{1F517}";let e=(i.documentName??"").toLowerCase();return/\.(pdf|hwp|hwpx|docx?|xlsx?|pptx?|txt)$/.test(e)?"\u{1F4CE}":"\u{1F4C4}"}function Se(i){return i.pageNumber?`${i.pageNumber}p`:null}function Be(i,e){let t=e?.trim()||null,n=i.documentName?.trim()||"\uCD9C\uCC98",s=i.pageNumber?`p.${i.pageNumber}`:null,o=i.sectionTitle?.trim()||null,r=t&&t!==n?[t,n]:[n];return s&&r.push(s),o&&o!==n&&!ne(o)&&r.push(o),r.join(" | ")}function Z(i){let e=i.sectionTitle?.trim();if(e&&!ne(e))return e;let t=i.documentName?.trim();if(t)return t;let n=i.sourceTitle?.trim();return n||(We(i.sourceUrl)??"\uCC38\uC870 \uC790\uB8CC")}function He(i){return"\uCC38\uACE0\uD55C \uC790\uB8CC"}function Re(i){let e=i?.citationPresentation;return e==="always"||e==="bottom"||e==="folded"?e:i?.citationMode==="compact"?"folded":"bottom"}function H(i,e){return e.title?.trim()||i?.institutionName?.trim()||i?.chatbotName?.trim()||"\uAE30\uAD00"}function J(i,e){let t=e.title?.trim()||i?.chatbotName?.trim()||H(i,e);return t.startsWith("AI \uCC57\uBD07")?t:`AI \uCC57\uBD07 ${t}`}function ze(i,e){if(e.welcomeMessage?.trim())return e.welcomeMessage.trim();if(i?.introMessage?.trim())return i.introMessage.trim();if(i?.welcomeMessage?.trim())return i.welcomeMessage.trim();let t=H(i,e);return t&&t!=="\uAE30\uAD00"?`\uC548\uB155\uD558\uC138\uC694. ${t} AI \uC0C1\uB2F4\uBD07\uC785\uB2C8\uB2E4. \uAD81\uAE08\uD558\uC2E0 \uB0B4\uC6A9\uC744 \uD3B8\uD558\uAC8C \uC785\uB825\uD574\uC8FC\uC138\uC694.`:"\uC548\uB155\uD558\uC138\uC694. \uAD81\uAE08\uD558\uC2E0 \uB0B4\uC6A9\uC744 \uC785\uB825\uD574\uC8FC\uC2DC\uBA74 \uBE60\uB974\uAC8C \uC548\uB0B4\uD574\uB4DC\uB9AC\uACA0\uC2B5\uB2C8\uB2E4."}function X(i){return i==="forest"?"linear-gradient(135deg, #166534, #0f766e)":i==="sky"?"linear-gradient(135deg, #1d4ed8, #0284c7)":i==="civic"?"linear-gradient(135deg, #1e40af, #0f766e)":i==="sunset"?"linear-gradient(135deg, #b45309, #ea580c)":"linear-gradient(135deg, #2563EB, #22C55E)"}function De(i){let e=i?.theme?.launcherIcon;return e==="custom"&&i?.theme?.launcherIconUrl?.trim()?"custom":e==="love-chat"||e==="heart"||e==="shield"||e==="leaf"||e==="spark"?e:"chat"}function Ne(i){let e=i.initialLauncherIcon?.trim(),t=i.initialLauncherIconUrl?.trim();return e==="custom"&&t?"custom":e==="love-chat"||e==="heart"||e==="shield"||e==="leaf"||e==="spark"?e:"chat"}function ee(i,e){return i==="love-chat"||i==="custom"&&!!e?.trim()}function Ue(i,e){let t=i?.launcherHoverMessage?.trim();return t||`${H(i,e)} AI \uC0C1\uB2F4\uBD07\uC785\uB2C8\uB2E4. \uBB34\uC5C7\uC744 \uB3C4\uC640\uB4DC\uB9B4\uAE4C\uC694?`}function Oe(i){let e=i.match(/#[0-9a-fA-F]{6,8}|#[0-9a-fA-F]{3}/);return e?e[0]:"#2563eb"}function E(i,e){let t=i.replace("#",""),n=t.length===3?t.split("").map(a=>a+a).join(""):t,s=parseInt(n.slice(0,2),16),o=parseInt(n.slice(2,4),16),r=parseInt(n.slice(4,6),16);return`rgba(${s},${o},${r},${e})`}function te(i){let e=Oe(i),t=E(e,.18),n=E(e,.35),s=E(e,.4),o=E(e,.28),r=E(e,.12),a=E(e,.08);return`
:host { all: initial; }
.ieum-root, .ieum-root * {
  box-sizing: border-box;
  /* \uD638\uC2A4\uD2B8 \uD398\uC774\uC9C0\uC5D0 \uC88C\uC6B0\uB418\uC9C0 \uC54A\uB294 \uAE00\uAF34\uB9CC \uC4F4\uB2E4.
     @font-face\uB294 Shadow DOM\uC73C\uB85C \uACA9\uB9AC\uB418\uC9C0 \uC54A\uACE0 \uBB38\uC11C \uC804\uC5ED\uC5D0 \uC801\uC6A9\uB41C\uB2E4. \uADF8\uB798\uC11C \uC608\uC804 \uC2A4\uD0DD\uCC98\uB7FC
     "Pretendard"\xB7"Noto Sans KR" \uAC19\uC740 \uC6F9\uD3F0\uD2B8 \uC774\uB984\uC744 \uC801\uC5B4\uB450\uBA74, \uAC19\uC740 \uC774\uB984\uC744 @font-face\uB85C
     \uC120\uC5B8\uD55C \uD638\uC2A4\uD2B8(\uACF5\uACF5\uAE30\uAD00 \uC0AC\uC774\uD2B8\uC5D0 \uD754\uD558\uB2E4)\uAC00 \uADF8 \uC774\uB984\uC744 \uAC00\uB85C\uCC44 \uC704\uC82F \uAE00\uAF34\uC774 \uC0AC\uC774\uD2B8\uB9C8\uB2E4
     \uB2EC\uB77C\uC9C4\uB2E4. \uC815\uC791 \uC6B0\uB9AC\uB294 \uADF8 \uD3F0\uD2B8\uB97C \uBC30\uD3EC\uD558\uC9C0\uB3C4 \uC54A\uC544 \uC5BB\uB294 \uAC83\uB3C4 \uC5C6\uC5C8\uB2E4.
     system-ui / sans-serif \uAC19\uC740 generic \uD0A4\uC6CC\uB4DC\uB294 @font-face \uC774\uB984\uC73C\uB85C \uC4F8 \uC218 \uC5C6\uC5B4 \uAC00\uB85C\uCC44\uAE30\uAC00
     \uBD88\uAC00\uB2A5\uD558\uACE0, \uD55C\uAE00\uC740 \uBE0C\uB77C\uC6B0\uC800\uAC00 OS \uAE30\uBCF8 \uAE00\uAF34(\uC708\uB3C4\uC6B0 \uB9D1\uC740 \uACE0\uB515, macOS Apple SD Gothic Neo)\uB85C
     \uC54C\uC544\uC11C \uB300\uCCB4\uD55C\uB2E4. */
  font-family: system-ui, -apple-system, sans-serif;
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
  background:${i}; color:#fff;
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
  box-shadow:0 16px 48px ${t}, 0 4px 16px rgba(0,0,0,.06);
  display:flex; flex-direction:column;
  opacity:0; transform:translateY(24px) scale(.97);
  pointer-events:none;
  transition:opacity .24s ease, transform .24s ease;
}
.ieum-panel.open { opacity:1; transform:translateY(0) scale(1); pointer-events:auto; }
/* \u2500\u2500 \uD5E4\uB354 \u2500\u2500 */
.ieum-header {
  min-height:58px; padding:12px 14px;
  background:${i};
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
.ieum-trust-badges { display:flex; flex-wrap:wrap; gap:6px; padding:9px 14px 3px; }
.ieum-trust-badge {
  display:inline-flex; align-items:center; gap:5px;
  font-size:11px; font-weight:600; color:#334155;
  background:#f8fafc; border:1px solid #e2e8f0; border-radius:999px; padding:3px 9px 3px 8px;
}
.ieum-trust-icon { font-size:11px; line-height:1; }
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
  background:${a}; color:${e}; font-size:22px; line-height:1; flex:0 0 auto;
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
  background:${a}; color:${e}; font-size:20px; line-height:1; flex:0 0 auto;
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
/* \u2500\u2500 \uD0D0\uC0C9 \uBA54\uB274 \uCE74\uB4DC \u2500\u2500 */
/* \uBA54\uB274 \uCE74\uB4DC\uB294 \uC77C\uBC18 \uB9D0\uD48D\uC120(max-width:82%)\uACFC \uB2EC\uB9AC \uCC44\uD305\uCC3D \uC804\uCCB4 \uD3ED\uC744 \uC4F4\uB2E4.
   \uBC84\uD2BC\uC774 2\uC5F4\uB85C \uB193\uC77C \uB54C \uAC01 \uCE78\uC774 \uCDA9\uBD84\uD788 \uB113\uC5B4\uC57C \uB77C\uBCA8\uC774 \uC548 \uC798\uB9B0\uB2E4.
   .ieum-bubble \uADDC\uCE59\uC774 \uC774 \uC544\uB798\uC5D0 \uC788\uC5B4 \uAC19\uC740 \uC6B0\uC120\uC21C\uC704\uB85C\uB294 \uBC00\uB9AC\uBBC0\uB85C \uC120\uD0DD\uC790\uB97C \uACB9\uCCD0 \uC4F4\uB2E4. */
.ieum-bubble.ieum-menu-card { max-width: 100%; width: 100%; }
.ieum-menu-card-title { font-size:14.5px; font-weight:700; color:#111827; margin-bottom:4px; }
.ieum-menu-card-desc { font-size:12.5px; color:#64748b; margin-bottom:10px; }
.ieum-menu-card-actions { display:flex; flex-wrap:wrap; gap:6px; }
.ieum-menu-home {
  margin-top:10px; background:none; border:none; padding:0;
  font-size:12px; color:#2563eb; cursor:pointer; font-family:inherit;
}
.ieum-menu-home:hover { text-decoration:underline; }
/* \uD56D\uBAA9\uC774 \uD55C \uCE74\uB4DC\uC5D0 \uB2E4 \uC548 \uB4E4\uC5B4\uAC08 \uB54C \uC88C\uC6B0\uB85C \uB118\uAE30\uB294 \uD398\uC774\uC800 */
.ieum-menu-pager {
  display:flex; align-items:center; justify-content:center; gap:14px; margin-top:10px;
}
.ieum-menu-pager-btn {
  display:flex; align-items:center; justify-content:center;
  width:28px; height:28px; padding:0; border:1px solid #e5e7eb; border-radius:999px;
  background:#fff; color:#374151; font-size:16px; line-height:1; cursor:pointer;
  font-family:inherit;
}
.ieum-menu-pager-btn:hover:not(:disabled) { background:#f3f4f6; border-color:#d1d5db; }
.ieum-menu-pager-btn:disabled { opacity:.35; cursor:default; }
.ieum-menu-pager-status { font-size:12px; color:#6b7280; min-width:38px; text-align:center; }
/* \uBA54\uB274 \uBC84\uD2BC \uBC30\uCE58 \u2014 \uB77C\uBCA8\uC774 \uC9E7\uC73C\uBA74 2\uC5F4, \uAE38\uBA74 1\uC5F4 \uC804\uCCB4\uD3ED(\uC904\uB9C8\uB2E4 \uB4E4\uCB49\uB0A0\uCB49\uD574\uC9C0\uC9C0 \uC54A\uAC8C \uACA9\uC790 \uACE0\uC815) */
.ieum-menu-card-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.ieum-menu-card-list { display:grid; grid-template-columns:1fr; gap:8px; }
.ieum-menu-entry {
  width:100%; justify-content:center; text-align:center;
  padding:12px 10px; border-radius:12px; white-space:normal; line-height:1.35;
}
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
  margin:11px 0 5px; font-weight:700; font-size:1.02em; color:#111827;
}
.ieum-bubble-rich > :first-child { margin-top:0; }
.ieum-bubble-rich a { color:#2563eb; text-decoration:underline; }
.ieum-bubble-rich strong, .ieum-bubble-rich b { font-weight:600; }
.ieum-bubble-rich code {
  background:#eef2f7; padding:1px 4px; border-radius:3px; font-size:0.92em;
}
.ieum-bubble-rich pre {
  background:#f1f5f9; padding:8px; border-radius:6px; overflow-x:auto;
  font-size:0.9em; margin:6px 0;
}
/* \uD45C\uB294 \uC704\uC82F \uD3ED\uC774 \uC881\uC544 width:100%\uB85C \uB450\uBA74 \uCEEC\uB7FC\uC774 \uC9D3\uB20C\uB824 \uD55C\uAE00\uC774 \uAE00\uC790 \uB2E8\uC704\uB85C
   \uC138\uB85C \uBD84\uD574\uB41C\uB2E4. \uB0B4\uC6A9 \uD06C\uAE30\uB300\uB85C \uB450\uACE0(inline-block=shrink-to-fit) \uB118\uCE58\uBA74
   \uAC00\uB85C \uC2A4\uD06C\uB864. \uCEEC\uB7FC\uC774 \uC801\uC740 \uD45C\uB294 \uADF8\uB300\uB85C \uD14C\uB450\uB9AC\uAC00 \uB0B4\uC6A9\uC5D0 \uBD99\uB294\uB2E4. */
.ieum-bubble-rich table {
  display:inline-block; vertical-align:top; max-width:100%;
  overflow-x:auto; -webkit-overflow-scrolling:touch;
  border-collapse:separate; border-spacing:0; margin:8px 0;
  font-size:0.86em; border:1px solid #e5e7eb; border-radius:8px;
}
.ieum-bubble-rich th, .ieum-bubble-rich td {
  border-bottom:1px solid #eef2f7; padding:7px 10px; text-align:left; vertical-align:top;
  word-break:keep-all; overflow-wrap:normal;  /* \uD55C\uAE00 \uB2E8\uC5B4 \uC911\uAC04\uC5D0\uC11C \uB04A\uC9C0 \uC54A\uC74C */
}
.ieum-bubble-rich tbody tr:last-child td { border-bottom:none; }
.ieum-bubble-rich th {
  background:#f8fafc; font-weight:700; color:#374151; white-space:nowrap;
}
.ieum-bubble-rich tbody tr:nth-child(even) td { background:#fafbfc; }
.ieum-bubble-rich blockquote {
  border-left:3px solid #cbd5e1; padding-left:10px; color:#475569; margin:6px 0;
}
.ieum-bubble-rich img { max-width:100%; height:auto; border-radius:4px; }
/* \u2500\u2500 outcome \uC548\uB0B4 \u2500\u2500
   \uB2F5\uBCC0\uC744 \uBABB \uD55C \uC774\uC720\uB294 \uBCF8\uBB38\uB9CC\uD07C \uC911\uC694\uD55C \uC815\uBCF4\uB2E4. \uC608\uC804\uC5D0\uB294 \uBCF8\uBB38 \uC704 \uD68C\uC0C9 \uD55C \uC904\uC774\uB77C
   \uB208\uC5D0 \uB744\uC9C0 \uC54A\uC558\uB2E4. \uC0C1\uD0DC\uBCC4 \uC0C9\uC744 \uC785\uD78C \uBE14\uB85D\uC73C\uB85C \uC62C\uB824 "\uC65C \uC774 \uB2F5\uC774 \uB098\uC654\uB294\uC9C0"\uAC00
   \uBA3C\uC800 \uC77D\uD788\uAC8C \uD55C\uB2E4. */
.ieum-outcome-note {
  display:flex; gap:7px; align-items:flex-start;
  margin-bottom:8px; padding:9px 11px; border-radius:9px;
  font-size:12px; line-height:1.55; font-weight:500;
}
.ieum-outcome-icon { flex-shrink:0; font-size:13px; line-height:1.4; }
.ieum-outcome-warn { background:#fffbeb; border:1px solid #fde68a; color:#92400e; }
.ieum-outcome-info { background:#eff6ff; border:1px solid #bfdbfe; color:#1e40af; }
.ieum-outcome-muted { background:#f8fafc; border:1px solid #e2e8f0; color:#475569; }
/* \uADFC\uAC70 \uC5C6\uC774 \uC9C0\uC5B4\uB0B4\uC9C0 \uC54A\uB294\uB2E4\uB294 \uC6D0\uCE59\uC744 \uC774\uC6A9\uC790\uC5D0\uAC8C \uBCF4\uC774\uAC8C \uD55C\uB2E4 \u2014 \uB2F5\uC744 \uBABB \uBC1B\uC740
   \uC21C\uAC04\uC774 \uC2E0\uB8B0\uB97C \uC5BB\uAC70\uB098 \uC783\uB294 \uC9C0\uC810\uC774\uB77C, \uCE68\uBB35\uBCF4\uB2E4 \uC774\uC720\uB97C \uBC1D\uD788\uB294 \uD3B8\uC774 \uB0AB\uB2E4. */
.ieum-trust-note {
  margin-top:8px; padding:8px 11px; border-radius:8px;
  background:#fefce8; border:1px solid #fef08a;
  font-size:11.5px; line-height:1.55; color:#854d0e;
}
/* \u2500\u2500 citations \u2500\u2500 */
.ieum-citations { margin-top:10px; padding-top:9px; border-top:1px solid #f1f5f9; }
/* '\uD56D\uC0C1 \uD45C\uC2DC' \u2014 \uB2F5\uBCC0\uC5D0 \uACE7\uBC14\uB85C \uC774\uC5B4 \uBD99\uC778\uB2E4. \uAD6C\uBD84\uC120\xB7\uC81C\uBAA9 \uC5C6\uC774 \uCE69\uB9CC. */
.ieum-citations-inline { margin-top:8px; padding-top:0; border-top:none; }
.ieum-citations-title { font-size:11px; font-weight:700; color:#94a3b8; margin-bottom:6px; letter-spacing:-0.1px; }
/* \uADFC\uAC70\uB97C \uCE69\uC73C\uB85C \uBCF4\uC5EC \uC900\uB2E4. \uC608\uC804 \uD68C\uC0C9 \uD14D\uC2A4\uD2B8 \uC904\uC740 \uBCF8\uBB38\uC5D0 \uBB3B\uD600 "\uADFC\uAC70\uAC00 \uC788\uB2E4"\uB294
   \uC2E0\uD638\uAC00 \uC804\uB2EC\uB418\uC9C0 \uC54A\uC558\uB2E4. \uCE69\uC740 \uAC1C\uC218\uAC00 \uD55C\uB208\uC5D0 \uBCF4\uC774\uACE0 \uB204\uB97C \uC218 \uC788\uC5B4 \uBCF4\uC778\uB2E4. */
.ieum-citation-chips { display:flex; flex-wrap:wrap; gap:6px; }
.ieum-citation-chip {
  display:inline-flex; align-items:center; gap:5px; max-width:100%;
  padding:5px 10px; border:1px solid #e2e8f0; border-radius:999px;
  background:#f8fafc; font-size:11.5px; font-weight:600; color:#475569;
  text-decoration:none; cursor:default; line-height:1.35;
  font-family:inherit; text-align:left;
}
a.ieum-citation-chip, button.ieum-citation-chip { cursor:pointer; }
a.ieum-citation-chip:hover, button.ieum-citation-chip:hover {
  background:#eff6ff; border-color:#bfdbfe; color:#1d4ed8;
}
.ieum-citation-chip-icon { flex-shrink:0; font-size:11px; }
.ieum-citation-chip-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:190px; }
.ieum-citation-chip-meta { flex-shrink:0; color:#94a3b8; font-weight:500; }
.ieum-citation-badge { display:inline-block; margin-left:2px; padding:0 6px; font-size:10px; font-weight:600; color:#7c3aed; background:#f5f3ff; border-radius:5px; vertical-align:middle; }
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
.ieum-view-content { font-size:12.5px; color:#374151; line-height:1.65; margin:0 0 4px; }
.ieum-more-link {
  display:inline-flex; align-items:center; gap:4px;
  margin-top:10px; font-size:12px; font-weight:600;
  color:#2563eb; text-decoration:none;
}
.ieum-more-link:hover { text-decoration:underline; }
/* \uAC8C\uC2DC\uD310\uD615 \uBAA9\uB85D \u2014 \uCE74\uB4DC\uAC00 \uC544\uB2C8\uB77C \uC904 \uBAA9\uB85D\uC774\uB2E4. \uD56D\uBAA9\uB9C8\uB2E4 \uD14C\uB450\uB9AC\uB97C \uB450\uB974\uBA74
   \uC704\uC82F \uD3ED\uC5D0\uC11C \uC81C\uBAA9 \uB450 \uC904\uB9CC \uB4E4\uC5B4\uAC00\uB3C4 \uD654\uBA74\uC774 \uCE74\uB4DC\uB85C \uAF49 \uCC2C\uB2E4. \uC587\uC740 \uAD6C\uBD84\uC120\uC73C\uB85C
   \uC5EC\uB7EC \uAC74\uC744 \uD55C\uB208\uC5D0 \uD6D1\uAC8C \uD55C\uB2E4. */
.ieum-list { list-style:none; margin:8px 0 0; padding:0; border-top:1px solid #e5e7eb; }
.ieum-list-item { padding:9px 2px; border-bottom:1px solid #f1f5f9; }
.ieum-list-item-title {
  display:block; font-size:13px; font-weight:600; color:#1d4ed8;
  line-height:1.5; text-decoration:none; word-break:break-word;
}
a.ieum-list-item-title:hover { text-decoration:underline; }
div.ieum-list-item-title { color:#111827; }
.ieum-list-item-meta { margin-top:3px; font-size:11.5px; color:#94a3b8; line-height:1.45; }
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
.ieum-input:focus { border-color:${e}; background:#fff; box-shadow:0 0 0 3px ${a}; }
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
`}var A=class A{constructor(e){m(this,"options");m(this,"api");m(this,"host");m(this,"shadow");m(this,"root");m(this,"launcherWrap");m(this,"launcherTip");m(this,"launcherTipText");m(this,"launcherTipClose");m(this,"floatingButton");m(this,"panel");m(this,"titleNode");m(this,"headerIconNode");m(this,"bannerWrap");m(this,"trustBadgesWrap");m(this,"starterQuestionsWrap");m(this,"quickActionsWrap");m(this,"messagesWrap");m(this,"loadingRow");m(this,"input");m(this,"sendButton");m(this,"footerNotice");m(this,"brandMark");m(this,"initialized",!1);m(this,"open",!1);m(this,"sending",!1);m(this,"launcherTipDismissed",!1);m(this,"launcherHoverMessage","");m(this,"launcherTipStorageKey","");m(this,"sessionToken",`widget_${Math.random().toString(36).slice(2,10)}_${Date.now().toString(36)}`);m(this,"config",null);m(this,"chatEndpoint","/chat/messages");m(this,"chatStreamEndpoint","/chat/messages/stream");m(this,"sseEnabled",!1);m(this,"messages",[]);m(this,"lastFailedQuestion",null);m(this,"pinMessageIdToTop",null);m(this,"menuPages",new Map);this.options=e,this.api=new _(ke(e.apiBaseUrl)),this.host=document.createElement("div"),this.host.setAttribute("data-ieumbot-widget-root","true"),this.host.setAttribute("data-ieumbot-chatbot-id",e.chatbotId),this.shadow=this.host.attachShadow({mode:"open"}),this.root=l(document,"div","ieum-root"),this.launcherWrap=l(document,"div","ieum-launcher-wrap"),this.launcherTip=l(document,"div","ieum-launcher-tip"),this.launcherTipText=l(document,"div","ieum-launcher-tip-text"),this.launcherTipClose=l(document,"button","ieum-launcher-tip-close"),this.floatingButton=l(document,"button","ieum-floating"),this.panel=l(document,"div","ieum-panel"),this.titleNode=l(document,"div","ieum-title"),this.headerIconNode=l(document,"div","ieum-header-icon"),this.bannerWrap=l(document,"div","ieum-banner"),this.trustBadgesWrap=l(document,"div","ieum-trust-badges"),this.starterQuestionsWrap=l(document,"div","ieum-starter-questions"),this.quickActionsWrap=l(document,"div","ieum-quick-actions"),this.messagesWrap=l(document,"div","ieum-messages"),this.loadingRow=l(document,"div","ieum-loading"),this.input=l(document,"input","ieum-input"),this.sendButton=l(document,"button","ieum-send"),this.footerNotice=l(document,"div","ieum-footer"),this.brandMark=l(document,"div","ieum-brand"),this.launcherTipClose.type="button",this.launcherTipClose.setAttribute("aria-label","\uC548\uB0B4 \uB2EB\uAE30"),this.launcherTipClose.innerHTML=k("close"),this.launcherTip.appendChild(this.launcherTipText),this.launcherTip.appendChild(this.launcherTipClose),this.floatingButton.type="button",this.floatingButton.title=(e.initialLauncherLabel?.trim()||e.launcherLabel)??"\uCC57\uBD07 \uC5F4\uAE30",this.floatingButton.setAttribute("aria-label",(e.initialLauncherLabel?.trim()||e.launcherLabel)??"\uCC57\uBD07 \uC5F4\uAE30"),this.floatingButton.classList.add("ieum-floating-loading"),this.floatingButton.replaceChildren();let t=Ne(e),n=e.initialLauncherIconUrl?.trim();this.floatingButton.innerHTML=k(t,n),this.floatingButton.classList.toggle("ieum-floating-image",ee(t,n)),this.titleNode.textContent=J(null,e),this.loadingRow.innerHTML=`
      <span class="ieum-loading-dot"></span>
      <span class="ieum-loading-dot"></span>
      <span class="ieum-loading-dot"></span>
    `,this.input.placeholder="\uBB34\uC5C7\uC744 \uB3C4\uC640\uB4DC\uB9B4\uAE4C\uC694?",this.sendButton.type="button",this.sendButton.setAttribute("aria-label","\uBA54\uC2DC\uC9C0 \uC804\uC1A1"),this.sendButton.innerHTML=k("send"),this.titleNode.id="ieum-title-heading",this.titleNode.setAttribute("role","heading"),this.titleNode.setAttribute("aria-level","2"),this.panel.setAttribute("role","dialog"),this.panel.setAttribute("aria-labelledby","ieum-title-heading"),this.messagesWrap.setAttribute("role","log"),this.messagesWrap.setAttribute("aria-live","polite"),this.messagesWrap.setAttribute("aria-relevant","additions text"),this.input.setAttribute("aria-label","\uC9C8\uBB38 \uC785\uB825"),this.floatingButton.setAttribute("aria-haspopup","dialog"),this.floatingButton.setAttribute("aria-expanded","false"),this.footerNotice.textContent=V,this.brandMark.innerHTML='<span class="ieum-brand-inner">Powered by <svg class="ieum-brand-logo" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M12 2.2 19.5 5 V11 C19.5 15.8 16.2 19.2 12 21.6 C7.8 19.2 4.5 15.8 4.5 11 V5 Z" fill="#2f6df6"/><path d="M8.3 11.9 11 14.6 15.8 9.4" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg><b class="ieum-brand-name"><span style="color:#1f2937">Deep</span><span style="color:#2f6df6">Secu</span></b></span>'}async mount(){if(this.initialized)return;this.initialized=!0;let e=document.createElement("style");e.textContent=te(X(this.options.theme?.primaryColor??null)),this.shadow.appendChild(e),this.shadow.appendChild(this.root);let t=l(document,"div","ieum-header"),n=l(document,"div","ieum-header-main"),s=l(document,"div","ieum-header-actions"),o=l(document,"button","ieum-header-button"),r=l(document,"button","ieum-header-button"),a=l(document,"button","ieum-header-button"),d=l(document,"div","ieum-input-wrap");this.headerIconNode.innerHTML=k("heart"),o.type="button",o.title="\uCC98\uC74C\uC73C\uB85C",o.setAttribute("aria-label","\uCC98\uC74C \uD654\uBA74\uC73C\uB85C (\uB300\uD654 \uC0C8\uB85C \uC2DC\uC791)"),o.innerHTML=k("reset"),r.type="button",r.title="\uCD5C\uC18C\uD654",r.setAttribute("aria-label","\uCD5C\uC18C\uD654"),r.innerHTML=k("minimize"),a.type="button",a.title="\uB2EB\uAE30",a.setAttribute("aria-label","\uB2EB\uAE30"),a.innerHTML=k("close"),n.appendChild(this.headerIconNode),n.appendChild(this.titleNode),s.appendChild(o),s.appendChild(r),s.appendChild(a),t.appendChild(n),t.appendChild(s),d.appendChild(this.input),d.appendChild(this.sendButton),this.panel.appendChild(t),this.panel.appendChild(this.bannerWrap),this.panel.appendChild(this.trustBadgesWrap),this.panel.appendChild(this.messagesWrap),this.panel.appendChild(this.starterQuestionsWrap),this.panel.appendChild(this.quickActionsWrap),this.panel.appendChild(this.loadingRow),this.panel.appendChild(d),this.panel.appendChild(this.footerNotice),this.panel.appendChild(this.brandMark),this.launcherWrap.appendChild(this.launcherTip),this.launcherWrap.appendChild(this.floatingButton),this.root.appendChild(this.panel),this.root.appendChild(this.launcherWrap),document.body.appendChild(this.host),this.floatingButton.addEventListener("click",()=>this.togglePanel()),this.floatingButton.addEventListener("mouseenter",()=>this.showLauncherTip()),this.floatingButton.addEventListener("focus",()=>this.showLauncherTip()),this.floatingButton.addEventListener("blur",()=>this.hideLauncherTip()),this.launcherTip.addEventListener("mouseenter",()=>this.showLauncherTip()),this.launcherWrap.addEventListener("mouseleave",()=>{this.launcherTipDismissed&&this.hideLauncherTip()}),this.launcherTipClose.addEventListener("click",c=>{c.stopPropagation(),this.dismissLauncherTip()}),o.addEventListener("click",()=>this.resetConversation()),r.addEventListener("click",()=>this.setOpen(!1)),a.addEventListener("click",()=>this.setOpen(!1)),this.panel.addEventListener("keydown",c=>{c.key==="Escape"&&this.open&&(c.stopPropagation(),this.setOpen(!1))}),this.bindPanelDrag(t),this.sendButton.addEventListener("click",()=>void this.sendCurrentInput()),this.input.addEventListener("keydown",c=>{c.key==="Enter"&&!c.shiftKey&&(c.preventDefault(),this.sendCurrentInput())}),this.ensureInitialMessage(),this.loadConfig(),this.options.openOnLoad&&this.setOpen(!0)}bindPanelDrag(e){let t=!1,n=0,s=0,o=0,r=0,a=c=>{if(!t)return;let p=this.panel.getBoundingClientRect(),u=40,h=Math.min(Math.max(o+(c.clientX-n),u-p.width),window.innerWidth-u),f=Math.min(Math.max(r+(c.clientY-s),0),window.innerHeight-u);this.panel.style.left=`${h}px`,this.panel.style.top=`${f}px`},d=()=>{t&&(t=!1,this.panel.classList.remove("dragging"),document.removeEventListener("mousemove",a),document.removeEventListener("mouseup",d))};e.addEventListener("mousedown",c=>{if(c.button!==0||window.innerWidth<=640||c.target.closest(".ieum-header-button"))return;let p=this.panel.getBoundingClientRect();t=!0,n=c.clientX,s=c.clientY,o=p.left,r=p.top,this.panel.style.position="fixed",this.panel.style.right="auto",this.panel.style.bottom="auto",this.panel.style.left=`${o}px`,this.panel.style.top=`${r}px`,this.panel.classList.add("dragging"),document.addEventListener("mousemove",a),document.addEventListener("mouseup",d),c.preventDefault()})}ensureInitialMessage(){this.messages.length>0||(this.pushMessage({id:`assistant_welcome_${Date.now()}`,role:"assistant",text:ze(this.config,this.options),timestamp:Date.now()}),this.config?.operatingHours.isAfterHours&&this.config.operatingHours.message&&this.pushMessage({id:`system_after_hours_${Date.now()}`,role:"system",text:this.config.operatingHours.message,timestamp:Date.now()}))}clearInitialWelcomeForDirectQuestion(){}resetConversation(){this.messages=[],this.sessionToken=`widget_${Math.random().toString(36).slice(2,10)}_${Date.now().toString(36)}`,this.ensureInitialMessage(),this.renderMessages(),this.renderStarterQuestions(),this.input.value="",this.messagesWrap.scrollTop=0,this.input.focus()}readLauncherTipDismissed(){return!1}dismissLauncherTip(){this.launcherTipDismissed=!0,this.hideLauncherTip()}showLauncherTip(e={}){this.open||!this.launcherHoverMessage.trim()||e.respectDismissed&&this.launcherTipDismissed||this.launcherTip.classList.add("visible")}hideLauncherTip(){this.launcherTip.classList.remove("visible")}async loadConfig(){try{this.config=await this.api.getConfig(this.options.chatbotId);let e=this.shadow.querySelector("style");e&&(e.textContent=te(X(this.config.theme?.preset))),this.titleNode.textContent=J(this.config,this.options),this.config.logoUrl?.trim()?this.headerIconNode.innerHTML=`<img src="${this.config.logoUrl}" alt="\uAE30\uAD00 \uB85C\uACE0" />`:this.headerIconNode.innerHTML=k("heart");let t=De(this.config),n=this.config.theme?.launcherIconUrl;this.floatingButton.replaceChildren(),this.floatingButton.innerHTML=k(t,n),this.floatingButton.classList.toggle("ieum-floating-image",ee(t,n)),this.launcherHoverMessage=Ue(this.config,this.options)??"",this.launcherTipText.textContent=this.launcherHoverMessage,this.launcherTipStorageKey=`ieumbot_launcher_tip_dismissed:${this.options.chatbotId}`,this.launcherTipDismissed=this.readLauncherTipDismissed(),this.showLauncherTip({respectDismissed:!0}),this.renderBanner(),this.renderTrustBadges(),this.renderStarterQuestions(),this.footerNotice.textContent=this.config.privacyNotice?.trim()||V,this.renderQuickActions(this.config.quickActions),this.config.runtime?.chatEndpoint&&(this.chatEndpoint=this.config.runtime.chatEndpoint),this.config.runtime?.chatStreamEndpoint&&(this.chatStreamEndpoint=this.config.runtime.chatStreamEndpoint),this.sseEnabled=Ce(this.config.runtime?.sseEnabled)===!0||this.config.runtime?.streamingMode==="sse_preferred",this.messages.length===1&&this.messages[0]?.id.startsWith("assistant_welcome_")&&(this.messages=[]),this.ensureInitialMessage()}catch{this.pushMessage({id:`system_load_error_${Date.now()}`,role:"system",text:"\uCD08\uAE30 \uC124\uC815\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",timestamp:Date.now()})}finally{this.floatingButton.classList.remove("ieum-floating-loading")}}async openConsultationSnapshot(e,t){let n=this.shadow.activeElement,s=l(document,"div","ieum-snapshot-overlay"),o=l(document,"div","ieum-snapshot-card");o.setAttribute("role","dialog"),o.setAttribute("aria-modal","true"),s.appendChild(o);let r=()=>{s.remove(),document.removeEventListener("keydown",a),n?.focus?.()},a=h=>{h.key==="Escape"&&r()};s.addEventListener("click",h=>{h.target===s&&r()}),document.addEventListener("keydown",a);let d=l(document,"div","ieum-snapshot-header"),c=l(document,"div","ieum-snapshot-title");c.textContent=Z(t);let p=l(document,"button","ieum-snapshot-close");p.type="button",p.setAttribute("aria-label","\uB2EB\uAE30"),p.textContent="\u2715",p.addEventListener("click",r),d.appendChild(c),d.appendChild(p),o.appendChild(d);let u=l(document,"div","ieum-snapshot-body");u.textContent="\uC0C1\uB2F4 \uB0B4\uC6A9\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\u2026",o.appendChild(u),this.root.appendChild(s),p.focus();try{let h=await this.api.getConsultationSnapshot(this.options.chatbotId,e);u.innerHTML="";let f=h.category?.trim();if(f){let w=l(document,"span","ieum-snapshot-badge");w.textContent=f,u.appendChild(w)}let x=[["\uC9C8\uBB38",h.question?.trim()||"(\uB0B4\uC6A9 \uC5C6\uC74C)"],["\uC804\uBB38\uAC00 \uB2F5\uBCC0",h.answer?.trim()||"(\uB0B4\uC6A9 \uC5C6\uC74C)"]];for(let[w,C]of x){let y=l(document,"div","ieum-snapshot-label");y.textContent=w;let I=l(document,"div","ieum-snapshot-text");I.textContent=C,u.appendChild(y),u.appendChild(I)}let g=l(document,"div","ieum-snapshot-source"),b=h.boardLabel?.trim()||"\uC0C1\uB2F4\uAC8C\uC2DC\uD310";g.textContent=h.receiptNo?`\uCD9C\uCC98: ${b} \xB7 ${h.receiptNo}`:`\uCD9C\uCC98: ${b}`,u.appendChild(g)}catch{u.textContent="\uC0C1\uB2F4 \uB0B4\uC6A9\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694."}}renderBanner(){this.bannerWrap.innerHTML="";let e=this.config?.banner?.title?.trim(),t=this.config?.banner?.description?.trim();if(!e&&!t){this.bannerWrap.style.display="none";return}if(this.bannerWrap.style.display="block",e){let n=l(document,"div","ieum-banner-title");n.textContent=e,this.bannerWrap.appendChild(n)}if(t){let n=l(document,"div","ieum-banner-description");n.textContent=t,this.bannerWrap.appendChild(n)}}renderTrustBadges(){this.trustBadgesWrap.innerHTML="";let e=(this.config?.trustBadges??[]).filter(t=>t&&t.label?.trim());if(e.length===0){this.trustBadgesWrap.style.display="none";return}this.trustBadgesWrap.style.display="flex";for(let t of e.slice(0,4)){let n=l(document,"span","ieum-trust-badge"),s=(t.icon??"").trim();if(s){let r=l(document,"span","ieum-trust-icon");r.textContent=s,n.appendChild(r)}let o=l(document,"span");o.textContent=t.label.trim(),n.appendChild(o),this.trustBadgesWrap.appendChild(n)}}renderStarterQuestions(){this.starterQuestionsWrap.innerHTML="";let e=this.config?.starterQuestions?.filter(a=>a.trim()).slice(0,6)??[];if(e.length===0){this.starterQuestionsWrap.style.display="none";return}let t=e.map(a=>Ee(a)),n=this.config?.starterQuestionStyle,s=t.some(a=>a.description),o=!s&&(n==="banner"||n!=="list"&&t.some(a=>a.iconType!=="none"));if(this.starterQuestionsWrap.classList.toggle("ieum-starter-rich",s),this.starterQuestionsWrap.classList.toggle("ieum-starter-banner",o),o||s){let a=t.length,d=a<=3?a:a===4?2:3;this.starterQuestionsWrap.style.display="grid",this.starterQuestionsWrap.style.gridTemplateColumns=`repeat(${d}, 1fr)`}else this.starterQuestionsWrap.style.display="flex",this.starterQuestionsWrap.style.gridTemplateColumns="";let r=(a,d,c)=>{if(a==="none")return null;let p=l(document,"span",c);return a==="svg"?p.innerHTML=ie[d]??"":(p.style.background="transparent",p.textContent=d),p};for(let{iconType:a,icon:d,label:c,description:p,link:u,raw:h}of t){let f=l(document,"button","ieum-starter-question");f.type="button";let x=c||h;if(u&&f.classList.add("ieum-starter-link"),s){f.classList.add("ieum-starter-rich-card");let g=r(a,d,"ieum-starter-rich-icon");g&&f.appendChild(g);let b=l(document,"span","ieum-starter-rich-body"),w=l(document,"span","ieum-starter-rich-title");if(w.textContent=c,b.appendChild(w),p){let C=l(document,"span","ieum-starter-rich-desc");C.textContent=p,b.appendChild(C)}f.appendChild(b)}else if(o){f.classList.add("ieum-starter-card");let g=r(a,d,"ieum-starter-card-icon");g&&f.appendChild(g);let b=l(document,"span","ieum-starter-card-label");b.textContent=c,f.appendChild(b)}else f.textContent=c;f.addEventListener("click",()=>{if(u){/^(tel:|mailto:)/i.test(u)?window.location.href=u:window.open(u,"_blank","noopener,noreferrer");return}this.input.value=x,this.sendCurrentInput()}),this.starterQuestionsWrap.appendChild(f)}}renderQuickActions(e){if(this.quickActionsWrap.innerHTML="",e.some(s=>s.actionType==="category"&&e.some(o=>o.parentId===s.id))){this.quickActionsWrap.style.display="none";return}let n=e.filter(s=>s.displayLocation==="welcome").slice(0,6);if(n.length===0){this.quickActionsWrap.style.display="none";return}this.quickActionsWrap.style.display="flex";for(let s of n){let o=l(document,"button","ieum-quick-action");o.type="button",o.textContent=s.label,o.title=s.label,o.addEventListener("click",()=>{this.handleMenuAction(s)}),this.quickActionsWrap.appendChild(o)}}async handleMenuAction(e){if(e.actionType==="link"&&e.url){window.open(e.url,"_blank","noopener,noreferrer");return}if(e.actionType==="category"){let t=Date.now();this.pushMessage({id:`user_menu_${e.id}_${t}`,role:"user",text:`# ${e.label}`,timestamp:t}),this.pushMenuCard(e.id);return}this.input.value=e.payload?.trim()||e.label,await this.sendCurrentInput()}pushMenuCard(e){this.menuPages.set(e,0);let t=Date.now();this.pushMessage({id:`menu_card_${e}_${t}`,role:"assistant",text:"",timestamp:t,menuCategoryId:e})}pushRootMenuCard(){this.pushMenuCard(A.MENU_ROOT)}fillMenuCard(e,t){let n=this.config?.quickActions??[],s=t===A.MENU_ROOT,o=s?n.filter(b=>b.actionType==="category"&&!b.parentId&&n.some(w=>w.parentId===b.id)):n.filter(b=>b.parentId===t),r=s?null:n.find(b=>b.id===t);if(o.length===0||!s&&!r){let b=l(document,"div","ieum-menu-card-desc");b.textContent="\uC774 \uBA54\uB274\uB294 \uB354 \uC774\uC0C1 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",e.appendChild(b);return}let a=l(document,"div","ieum-menu-card-title");a.textContent=s?"\uBB34\uC5C7\uC744 \uB3C4\uC640\uB4DC\uB9B4\uAE4C\uC694?":r.label,e.appendChild(a);let d=s?"\uC544\uB798\uC5D0\uC11C \uC6D0\uD558\uC2DC\uB294 \uD56D\uBAA9\uC744 \uC120\uD0DD\uD558\uAC70\uB098, \uC790\uC720\uB86D\uAC8C \uC9C8\uBB38\uD574 \uC8FC\uC138\uC694.":r.description;if(d){let b=l(document,"div","ieum-menu-card-desc");b.textContent=d,e.appendChild(b)}let c=o.every(b=>b.label.trim().length<=ge),p=c?be:xe,u=Math.max(1,Math.ceil(o.length/p)),h=Math.min(this.menuPages.get(t)??0,u-1);this.menuPages.set(t,h);let f=l(document,"div",`ieum-menu-card-actions ${c?"ieum-menu-card-grid":"ieum-menu-card-list"}`);for(let b of o.slice(h*p,(h+1)*p)){let w=l(document,"button","ieum-quick-action ieum-menu-entry");w.type="button",w.textContent=b.label,w.title=b.label,w.addEventListener("click",()=>{this.handleMenuAction(b)}),f.appendChild(w)}if(e.appendChild(f),u>1&&e.appendChild(this.createMenuPager(e,t,h,u)),s)return;let x=r.parentId||A.MENU_ROOT,g=l(document,"button","ieum-menu-home");g.type="button",g.textContent="\u2191 \uC0C1\uC704\uBA54\uB274",g.addEventListener("click",()=>{this.pushMenuCard(x)}),e.appendChild(g)}createMenuPager(e,t,n,s){let o=l(document,"div","ieum-menu-pager"),r=p=>{this.menuPages.set(t,p),e.innerHTML="",this.fillMenuCard(e,t)},a=l(document,"button","ieum-menu-pager-btn");a.type="button",a.textContent="\u2039",a.setAttribute("aria-label","\uC774\uC804 \uD56D\uBAA9 \uBCF4\uAE30"),a.disabled=n<=0,a.addEventListener("click",()=>r(n-1));let d=l(document,"span","ieum-menu-pager-status");d.textContent=`${n+1} / ${s}`;let c=l(document,"button","ieum-menu-pager-btn");return c.type="button",c.textContent="\u203A",c.setAttribute("aria-label","\uB2E4\uC74C \uD56D\uBAA9 \uBCF4\uAE30"),c.disabled=n>=s-1,c.addEventListener("click",()=>r(n+1)),o.appendChild(a),o.appendChild(d),o.appendChild(c),o}createQuickReplyHintsRow(){if(this.messages.some(s=>s.role==="user"))return null;let t=(this.config?.quickReplyHints??[]).filter(s=>s.trim()).slice(0,5);if(t.length===0)return null;let n=l(document,"div","ieum-hints-row");n.dataset.role="hints";for(let s of t){let o=l(document,"button","ieum-hint-btn");o.type="button",o.textContent=s,o.addEventListener("click",()=>{this.input.value=s,this.sendCurrentInput(),n.style.display="none"}),n.appendChild(o)}return n}setOpen(e){if(this.open=e,this.floatingButton.setAttribute("aria-expanded",e?"true":"false"),e){this.hideLauncherTip(),this.ensureInitialMessage(),this.panel.classList.add("open"),this.launcherWrap.style.opacity="0",this.launcherWrap.style.pointerEvents="none",this.input.focus(),this.scrollMessagesToBottom();return}this.panel.classList.remove("open"),this.launcherWrap.style.opacity="1",this.launcherWrap.style.pointerEvents="auto";try{this.floatingButton.focus()}catch{}}togglePanel(){this.setOpen(!this.open)}pushMessage(e){this.messages.push(e),this.renderMessages()}updateMessage(e,t){let n=this.messages.findIndex(s=>s.id===e);n<0||(this.messages[n]={...this.messages[n],...t},this.renderMessages())}removeMessage(e){this.messages=this.messages.filter(t=>t.id!==e),this.renderMessages()}renderMessages(){this.messagesWrap.innerHTML="",this.starterQuestionsWrap.style.display=this.messages.length<=1?this.starterQuestionsWrap.style.display:"none";for(let e of this.messages){let t=l(document,"div",`ieum-message ${e.role}`);t.dataset.messageId=e.id;let n=l(document,"div","ieum-bubble");if(e.id.startsWith("assistant_welcome_")&&n.classList.add("ieum-bubble-welcome"),e.menuCategoryId){n.classList.add("ieum-menu-card"),this.fillMenuCard(n,e.menuCategoryId),t.appendChild(n),this.messagesWrap.appendChild(t);continue}let s=e.structuredResponse;if(s&&e.role==="assistant")if(s.type==="text"){if(W(n,s.content),s.moreLink){let o=l(document,"a","ieum-more-link");o.href=s.moreLink.url,o.target="_blank",o.rel="noopener noreferrer",o.textContent=`\u2192 ${s.moreLink.title}`,n.appendChild(o)}}else if(s.type==="view"){let o=s;n.textContent="";let r=l(document,"div","ieum-view-card"),a=l(document,"div","ieum-view-title");a.textContent=o.title,r.appendChild(a);for(let d of o.content){let c=l(document,"div","ieum-view-content");W(c,d),r.appendChild(c)}if(o.moreLink){let d=l(document,"a","ieum-more-link");d.href=o.moreLink.url,d.target="_blank",d.rel="noopener noreferrer",d.textContent=`\u2192 ${o.moreLink.title}`,r.appendChild(d)}n.appendChild(r)}else if(s.type==="list"){let o=s;e.text?.trim()&&W(n,e.text);let r=l(document,"ul","ieum-list");for(let a of o.items.slice(0,8)){let d=l(document,"li","ieum-list-item"),c=a.targetLink||a.sourceLinkPath,p=l(document,c?"a":"div","ieum-list-item-title");if(p.textContent=a.title,c){let h=p;h.href=c,h.target="_blank",h.rel="noopener noreferrer"}d.appendChild(p);let u=a.contents.slice(0,3).map(h=>h.trim()).filter(Boolean).map(h=>h.length>60?`${h.slice(0,60)}\u2026`:h);if(u.length>0){let h=l(document,"div","ieum-list-item-meta");h.textContent=u.join(" \xB7 "),d.appendChild(h)}r.appendChild(d)}if(n.appendChild(r),o.moreLink){let a=l(document,"a","ieum-more-link");a.href=o.moreLink.url,a.target="_blank",a.rel="noopener noreferrer",a.textContent=`\u2192 ${o.moreLink.title}`,n.appendChild(a)}}else W(n,e.text);else W(n,e.text);if(e.role==="assistant"){let o=_e(e.outcome);if(o){let r=l(document,"div",`ieum-outcome-note ieum-outcome-${o.tone}`),a=l(document,"span","ieum-outcome-icon");a.textContent=o.icon;let d=l(document,"span");d.textContent=o.text,r.appendChild(a),r.appendChild(d),n.insertBefore(r,n.firstChild)}if(e.outcome==="insufficient_evidence"){let r=l(document,"div","ieum-trust-note");r.textContent="\uADFC\uAC70\uAC00 \uC5C6\uC744 \uB54C \uADF8\uB7F4\uB4EF\uD55C \uB2F5\uC744 \uC9C0\uC5B4\uB0B4\uC9C0 \uC54A\uB294 \uAC83\uC774 \uC774 \uCC57\uBD07\uC758 \uAE30\uBCF8 \uB3D9\uC791\uC785\uB2C8\uB2E4.",n.appendChild(r)}if(e.id){let r=l(document,"div","ieum-feedback-row");r.dataset.messageId=e.id;let a=l(document,"button","ieum-feedback-btn");a.setAttribute("aria-label","\uB3C4\uC6C0\uC774 \uB410\uC5B4\uC694"),a.textContent="\u{1F44D}";let d=l(document,"button","ieum-feedback-btn");d.setAttribute("aria-label","\uB3C4\uC6C0\uC774 \uC548 \uB410\uC5B4\uC694"),d.textContent="\u{1F44E}";let c=async p=>{let u=r.dataset.messageId;if(u)try{await this.api.sendFeedback(u,p),a.classList.toggle("ieum-feedback-active",p===1),d.classList.toggle("ieum-feedback-active",p===-1),setTimeout(()=>{r.innerHTML='<span class="ieum-feedback-thanks">\uD53C\uB4DC\uBC31 \uAC10\uC0AC\uD569\uB2C8\uB2E4</span>'},800)}catch{}};a.addEventListener("click",()=>{!!(e.followUpQuestions&&e.followUpQuestions.length>0)?(e.id&&this.api.sendFeedback(e.id,1).catch(()=>{}),this.input.value="\uB124",this.sendCurrentInput()):c(1)}),d.addEventListener("click",()=>{c(-1)}),r.appendChild(a),r.appendChild(d),n.appendChild(r)}if(e.citations&&e.citations.length>0){let r=Re(this.config),a=r==="folded",d=He(e.citations),c=l(document,a?"details":"div",a?"ieum-citations ieum-citations-folded":r==="always"?"ieum-citations ieum-citations-inline":"ieum-citations");if(r!=="always"){let u=l(document,a?"summary":"div","ieum-citations-title");u.textContent=a?`${d} ${Math.min(e.citations.length,5)}\uAC74`:d,c.appendChild(u)}let p=l(document,"div","ieum-citation-chips");c.appendChild(p);for(let u of e.citations.slice(0,5)){let h=u.sourceUrl?.trim(),f=(u.extractionMethod??"").toLowerCase()==="seoul_labor"&&!!u.chunkId?.trim(),g=l(document,f?"button":h?"a":"span","ieum-citation-chip"),b=l(document,"span","ieum-citation-chip-icon");b.textContent=$e(u);let w=l(document,"span","ieum-citation-chip-name");w.textContent=Z(u),g.appendChild(b),g.appendChild(w);let C=Se(u);if(C){let y=l(document,"span","ieum-citation-chip-meta");y.textContent=`\xB7 ${C}`,g.appendChild(y)}if(f){let y=u.chunkId;g.type="button",g.addEventListener("click",()=>{this.openConsultationSnapshot(y,u)});let I=u.category?.trim();if(I){let z=l(document,"span","ieum-citation-badge");z.textContent=I,g.appendChild(z)}}else if(h){let y=g;y.href=h,y.target="_blank",y.rel="noopener noreferrer"}else g.title=Be(u,this.config?.institutionName);p.appendChild(g)}n.appendChild(c)}if(e.followUpQuestions&&e.followUpQuestions.length>0){let r=l(document,"div","ieum-follow-ups"),a=l(document,"div","ieum-follow-ups-title");a.textContent="\u2726 \uC774\uB7F0 \uC9C8\uBB38\uB4E4\uC740 \uC5B4\uB5A0\uC2E0\uAC00\uC694?",r.appendChild(a);for(let d of e.followUpQuestions.slice(0,3)){let c=l(document,"button","ieum-follow-up-btn");c.type="button";let p=l(document,"span","ieum-follow-up-icon");p.textContent="\u{1F4AC}";let u=l(document,"span","ieum-follow-up-text");u.textContent=d;let h=l(document,"span","ieum-follow-up-arrow");h.textContent="\u2192",c.appendChild(p),c.appendChild(u),c.appendChild(h),c.addEventListener("click",()=>{this.input.value=d,this.sendCurrentInput()}),r.appendChild(c)}n.appendChild(r)}if(e.conditionalActions&&e.conditionalActions.length>0){let r=l(document,"div","ieum-cta-wrap"),a=l(document,"div","ieum-cta-title");a.textContent="\uAD00\uB828 \uC815\uBCF4",r.appendChild(a);for(let d of e.conditionalActions){let c=d.type==="link"?"\u{1F517}":d.type==="video"?"\u{1F3AC}":d.type==="file"?"\u{1F4CE}":"\u{1F4DE}",p=d.type==="contact"&&!d.value.startsWith("tel:")&&!d.value.startsWith("mailto:")?`tel:${d.value}`:d.value,u=l(document,"a","ieum-cta-btn");u.href=p,u.target=d.type==="contact"?"_self":"_blank",u.rel="noopener noreferrer",u.textContent=`${c} ${d.label}`,d.description&&(u.title=d.description),r.appendChild(u)}n.appendChild(r)}}if(t.appendChild(n),this.messagesWrap.appendChild(t),e.id.startsWith("assistant_welcome_")){let o=this.createQuickReplyHintsRow();o&&this.messagesWrap.appendChild(o)}}if(this.lastFailedQuestion){let e=l(document,"div","ieum-message system"),t=l(document,"button","ieum-quick-action");t.type="button",t.textContent="\uB2E4\uC2DC \uC2DC\uB3C4",t.addEventListener("click",()=>{this.lastFailedQuestion&&(this.input.value=this.lastFailedQuestion,this.sendCurrentInput())}),e.appendChild(t),this.messagesWrap.appendChild(e)}this.scrollAfterRender()}scrollMessagesToBottom(){requestAnimationFrame(()=>{this.messagesWrap.scrollTop=this.messagesWrap.scrollHeight})}scrollAfterRender(){let e=this.pinMessageIdToTop;requestAnimationFrame(()=>{if(e){let t=null,n=this.messagesWrap.children;for(let s=0;s<n.length;s+=1){let o=n[s];if(o.dataset&&o.dataset.messageId===e){t=o;break}}if(t){let s=this.messagesWrap.getBoundingClientRect().top,o=t.getBoundingClientRect().top;this.messagesWrap.scrollTop+=o-s-10;return}}this.messagesWrap.scrollTop=this.messagesWrap.scrollHeight})}setSending(e){this.sending=e,this.sendButton.disabled=e,this.input.disabled=e,this.loadingRow.classList.toggle("active",e)}findMenuCategoryByLabel(e){let t=e.trim().toLowerCase();if(!t)return null;let n=this.config?.quickActions??[];return n.find(s=>s.actionType==="category"&&s.label.trim().toLowerCase()===t&&n.some(o=>o.parentId===s.id))??null}async sendCurrentInput(){if(this.sending)return;let e=this.input.value.trim();if(!e)return;let t=this.findMenuCategoryByLabel(e);if(t){this.input.value="",this.clearInitialWelcomeForDirectQuestion(),await this.handleMenuAction(t),this.input.focus();return}this.pinMessageIdToTop=null;let n=Ie(e);if(n.length>0){this.clearInitialWelcomeForDirectQuestion(),this.lastFailedQuestion=null,this.input.value="",this.pushMessage({id:`assistant_privacy_${Date.now()}`,role:"assistant",text:we,outcome:"restricted",timestamp:Date.now()}),this.api.reportBlockedPrivacyInput({chatbotId:this.options.chatbotId,sessionToken:this.sessionToken,detectedTypes:n}).catch(()=>{}),this.input.focus();return}if(this.clearInitialWelcomeForDirectQuestion(),this.lastFailedQuestion=null,this.input.value="",this.pushMessage({id:`user_${Date.now()}`,role:"user",text:e,timestamp:Date.now()}),this.setSending(!0),this.sseEnabled&&await this.trySendWithSse(e)){this.setSending(!1),this.input.focus();return}try{let s=await this.api.sendChat({chatbotId:this.options.chatbotId,question:e,topK:this.options.topK??8,sessionToken:this.sessionToken,sourceUrl:this.options.sourceUrl??window.location.href},this.chatEndpoint);this.handleAssistantResponse(s)}catch{this.lastFailedQuestion=e,this.pushMessage({id:`system_send_error_${Date.now()}`,role:"system",text:K,timestamp:Date.now()})}finally{this.setSending(!1),this.input.focus()}}async trySendWithSse(e){let t=`assistant_stream_${Date.now()}`,n=!1,s="\uC2A4\uD2B8\uB9AC\uBC0D \uC5F0\uACB0 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4. \uC77C\uBC18 \uBAA8\uB4DC\uB85C \uC804\uD658\uD569\uB2C8\uB2E4.",o="answered",r=[],a=[],d=[],c="",p=!1;this.pinMessageIdToTop=t,this.pushMessage({id:t,role:"assistant",text:"",timestamp:Date.now()});let u=h=>{let f=h.data??{};if(h.event==="message_delta"){let x=M(f.delta)??"";c+=x,x&&(p=!0),this.updateMessage(t,{text:c});return}if(h.event==="message_complete"){o=M(f.outcome)??o,p=!0,this.updateMessage(t,{outcome:o,text:c||"..."});return}if(h.event==="fallback"||h.event==="escalation"){o=M(f.outcome)??(h.event==="escalation"?"escalate":"insufficient_evidence"),c=M(f.message)??"",p=!0,this.updateMessage(t,{text:c,outcome:o});return}if(h.event==="citations"){r=Te(f.items),this.updateMessage(t,{citations:r});return}if(h.event==="follow_up_questions"){a=Ae(f.items).slice(0,3),this.updateMessage(t,{followUpQuestions:a});return}if(h.event==="conditional_actions"){d=Le(f.items),this.updateMessage(t,{conditionalActions:d});return}if(h.event==="structured_response"){this.updateMessage(t,{structuredResponse:f});return}if(h.event==="error"){n=!0,s=M(f.message)??s;return}if(h.event==="done"){let x=M(f.sessionToken);x&&(this.sessionToken=x)}};try{if(await this.api.streamChat({chatbotId:this.options.chatbotId,question:e,topK:this.options.topK??8,sessionToken:this.sessionToken,sourceUrl:this.options.sourceUrl??window.location.href},u,this.chatStreamEndpoint),n)throw new Error(s);return c.trim()?this.updateMessage(t,{text:c,outcome:o,citations:r,followUpQuestions:a,conditionalActions:d}):this.updateMessage(t,{text:"\uC694\uCCAD\uC744 \uCC98\uB9AC\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",outcome:"insufficient_evidence"}),!0}catch{return p?(this.updateMessage(t,{text:c||"\uC751\uB2F5 \uC218\uC2E0 \uC911 \uC5F0\uACB0\uC774 \uC885\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",outcome:o,citations:r,followUpQuestions:a,conditionalActions:d}),this.lastFailedQuestion=e,!0):(this.updateMessage(t,{text:K,outcome:"insufficient_evidence"}),this.lastFailedQuestion=e,!0)}}handleAssistantResponse(e){let t=e.trace?.messages?.sessionToken;t&&typeof t=="string"&&(this.sessionToken=t);let n=e.answer?.text?.trim()||"\uC548\uB0B4 \uAC00\uB2A5\uD55C \uB2F5\uBCC0\uC744 \uC0DD\uC131\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",s=`assistant_${e.requestId}`;this.pinMessageIdToTop=s,this.pushMessage({id:s,role:"assistant",text:n,outcome:e.outcome,citations:Array.isArray(e.citations)?e.citations:[],followUpQuestions:Array.isArray(e.followUpQuestions)?e.followUpQuestions.slice(0,3):[],conditionalActions:Array.isArray(e.conditionalActions)?e.conditionalActions:[],structuredResponse:e.structuredResponse??null,timestamp:Date.now()})}};m(A,"MENU_ROOT","__root__");var $=A;var R=new Set;async function oe(i){if(!i?.chatbotId)throw new Error("WIDGET_INIT_REQUIRES_CHATBOT_ID");let e=i.chatbotId,t=Array.from(document.querySelectorAll('[data-ieumbot-widget-root="true"]'));for(let s of t)s.getAttribute("data-ieumbot-chatbot-id")===i.chatbotId&&s.remove();if(R.delete(e),R.has(e))return;await new $(i).mount(),R.add(e)}window.IEUMBOTWidget={init:oe};var L=document.currentScript;if(L){let i=L.getAttribute("data-chatbot-id");if(i){let e=L.getAttribute("data-launcher-label")??void 0;oe({chatbotId:i,apiBaseUrl:L.getAttribute("data-api-base-url")??void 0,openOnLoad:L.getAttribute("data-open-on-load")==="true",launcherLabel:e,initialLauncherLabel:e,initialLauncherIcon:L.getAttribute("data-launcher-icon")??void 0,initialLauncherIconUrl:L.getAttribute("data-launcher-icon-url")??void 0})}}})();
