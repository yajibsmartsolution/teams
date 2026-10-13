/** Shared progressive monthly energy readings for the optional TMO preview pages.
 * Not a replacement for the existing Analyzer/TMO reporting packages.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireLocalAuth } from './middleware.js';
import { readJson, writeJson, appendAudit } from './store.js';

const router = Router();
const allowed = new Set(['SUPER_ADMIN', 'DEVELOPER', 'CTO', 'TA_CTO', 'TMO', 'ANALYZER']);
const gate = (req: Request, res: Response, next: NextFunction) => {
  const user = res.locals.kedcoUser as { roles?: string[], primary_role?: string };
  const roles = (user.roles || [user.primary_role || '']).map(r => r.toUpperCase());
  if (!roles.some(role => allowed.has(role))) return res.status(403).json({ error: 'Progressive Energy access is limited to approved KEDCO roles.' });
  next();
};
router.use(requireLocalAuth, gate);

type EnergyReading = {
  day: number; feeder: string; voltage: '11' | '33'; group: 'MD' | 'REGIONAL';
  mwh: number; source: string; updatedAt: string;
};
type MonthRecord = {
  month: string; records: Record<string, EnergyReading>;
  updatedAt: string; updatedBy?: string;
};
const validMonth = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && +value.slice(0,4) >= 2020 && +value.slice(0,4) <= 2100;
const daysIn = (ym: string) => new Date(Date.UTC(+ym.slice(0,4), +ym.slice(5,7), 0)).getUTCDate();
const monthFile = (ym: string) => `energy/months/${ym}.json`;
const emptyMonth = (ym: string): MonthRecord => ({ month: ym, records: {}, updatedAt: '' });
const cleanText = (v: unknown, limit = 120) => String(v ?? '').trim().slice(0,limit);
const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function parseReading(value: any, ym: string): EnergyReading | null {
  if (!value || typeof value !== 'object') return null;
  const day = Number(value.day), mwh = Number(value.mwh);
  const feeder = cleanText(value.feeder), voltage = String(value.voltage||''), group = String(value.group||'');
  if (!Number.isInteger(day) || day < 1 || day > daysIn(ym) || !feeder || !['11','33'].includes(voltage)
      || !['MD','REGIONAL'].includes(group) || !Number.isFinite(mwh) || mwh < 0 || mwh > 1e8) return null;
  return { day, feeder, voltage: voltage as '11'|'33', group: group as 'MD'|'REGIONAL',
    mwh, source: cleanText(value.source || 'Progressive Analyzer', 180), updatedAt: new Date().toISOString() };
}
function key(r: EnergyReading) { return `${r.day}|${norm(r.feeder)}|${r.voltage}`; }
const active = new Map<string, Promise<unknown>>();
function serial<T>(month: string, handler: () => Promise<T>): Promise<T> {
  const previous = active.get(month) || Promise.resolve();
  const next = previous.catch(() => undefined).then(handler);
  const tracked = next.then(() => undefined, () => undefined);
  active.set(month, tracked);
  void tracked.then(() => { if (active.get(month) === tracked) active.delete(month); });
  return next;
}
router.param('ym', (req, res, next, value) => {
  if (!validMonth(String(value))) return res.status(400).json({ error:'Valid YYYY-MM reporting month required.' });
  next();
});
router.get('/months/:ym', (req, res) => {
  const month = String(req.params.ym);
  const data = readJson<MonthRecord | null>(monthFile(month), null);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ exists: Boolean(data), data: data || emptyMonth(month) });
});
router.post('/months/:ym/merge', async (req, res, next) => {
  try {
    const ym = String(req.params.ym), incoming = req.body?.records;
    if (!Array.isArray(incoming) || incoming.length > 5000 || !incoming.length)
      return res.status(400).json({ error:'Submit 1 to 5000 readings.' });
    const records = incoming.map(r => parseReading(r, ym));
    if (records.some(r => !r)) return res.status(400).json({ error:'Invalid day, feeder, voltage, group, or MWh value.' });
    const saved = await serial(ym, async () => {
      const data = readJson<MonthRecord>(monthFile(ym), emptyMonth(ym));
      const items = Object.values(data.records||{});
      const mapped = Object.fromEntries(items.filter(x => parseReading(x, ym)).map(x => [key(x), x]));
      for (const r of records as EnergyReading[]) mapped[key(r)] = r;
      const updated: MonthRecord = { month: ym, records: mapped, updatedAt: new Date().toISOString(), updatedBy: res.locals.kedcoUser.id };
      await writeJson(monthFile(ym), updated);
      appendAudit({type:'TMO_PROGRESSIVE_MONTH_MERGED', user_id:res.locals.kedcoUser.id,month:ym,count:records.length});
      return updated;
    });
    res.json({ok:true,count:Object.keys(saved.records).length,updatedAt:saved.updatedAt});
  } catch (error) { next(error); }
});
router.post('/months/:ym/classify', async (req,res,next) => {
  try {
    const ym=String(req.params.ym), feeder=cleanText(req.body?.feeder), group=String(req.body?.group||'');
    if (!feeder || !['MD','REGIONAL'].includes(group)) return res.status(400).json({error:'Valid feeder and group required.'});
    const changed=await serial(ym, async () => {
      const data=readJson<MonthRecord>(monthFile(ym),emptyMonth(ym)); let n=0;
      for (const r of Object.values(data.records||{})) if (norm(r.feeder)===norm(feeder)) {r.group=group as 'MD'|'REGIONAL';r.updatedAt=new Date().toISOString();n++;}
      data.updatedAt=new Date().toISOString();data.updatedBy=res.locals.kedcoUser.id;
      await writeJson(monthFile(ym),data);return n;
    });
    appendAudit({type:'TMO_PROGRESSIVE_CLASSIFICATION',user_id:res.locals.kedcoUser.id,month:ym,feeder,group,changed});
    res.json({ok:true,changed});
  }catch(error){next(error);}
});
router.delete('/months/:ym',async (req,res,next)=>{
  try {
    const ym=String(req.params.ym);
    await serial(ym,()=>writeJson(monthFile(ym),emptyMonth(ym)));
    appendAudit({type:'TMO_PROGRESSIVE_MONTH_CLEARED',user_id:res.locals.kedcoUser.id,month:ym});
    res.json({ok:true});
  }catch(error){next(error);}
});
export default router;
