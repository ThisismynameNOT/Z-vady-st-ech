import type { PageDoc, Project, Service, ReferenceRecord, CompanySettings, SiteSettings } from './types';
const pages = import.meta.glob('../../content/pages/*.json', { eager: true, import: 'default' }) as Record<string, PageDoc>;
const projects = import.meta.glob('../../content/projects/*.json', { eager: true, import: 'default' }) as Record<string, Project>;
const services = import.meta.glob('../../content/services/*.json', { eager: true, import: 'default' }) as Record<string, Service>;
const references = import.meta.glob('../../content/references/*.json', { eager: true, import: 'default' }) as Record<string, ReferenceRecord>;
import company from '../../content/settings/company/company.json';
import site from '../../content/settings/site/site.json';

const values = <T>(x:Record<string,T>) => Object.values(x);
export function getPage(slug:string): PageDoc { const page=values(pages).find(p=>p.slug===slug); if(!page) throw new Error(`Missing page: ${slug}`); return page; }
export function getProjects(opts:{includeDrafts?:boolean}={}): Project[] { return values(projects).filter(p=>opts.includeDrafts || p.status==='published').sort((a,b)=>(a.homepagePriority??999)-(b.homepagePriority??999)); }
export function getProject(slug:string): Project | undefined { return getProjects().find(p=>p.slug===slug); }
export function getServices(): Service[] { return values(services).sort((a,b)=>(a.order??999)-(b.order??999)); }
export function getReferences(): ReferenceRecord[] { return values(references).sort((a,b)=>(a.order??999)-(b.order??999)); }
export function getCompany(): CompanySettings { return company; }
export function getSite(): SiteSettings { return site; }
