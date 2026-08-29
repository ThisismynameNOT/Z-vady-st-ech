export function money(value?:number,currency='CZK'){ if(value===undefined||value===null)return ''; return new Intl.NumberFormat('cs-CZ',{style:'currency',currency,maximumFractionDigits:value%1?2:0}).format(value); }
export function telHref(phone:string){ return `tel:${phone.replace(/[^+\d]/g,'')}`; }
export function safeHref(href:string){ if(!href)return '#'; if(href.startsWith('/')||href.startsWith('#')||href.startsWith('tel:')||href.startsWith('mailto:')) return href; try{const u=new URL(href); return ['http:','https:'].includes(u.protocol)?href:'#';}catch{return '#';}}
export function cloudinaryTransform(src:string,width:number){ if(!src.includes('res.cloudinary.com')||!src.includes('/upload/')) return src; return src.replace('/upload/',`/upload/f_auto,q_auto,w_${width},c_limit/`); }
