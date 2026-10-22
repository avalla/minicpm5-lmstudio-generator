/** MiniCPM5 function/param streaming parser, adapted from the architecture in
 * avalla/pi feat/minicpm5-inband-tools (not a verbatim copy).
 * No tool is executed by this component. */
export type ToolDefinition = { name: string; parameters?: { properties?: Record<string, { type?: string }> } };
export type ParsedEvent = { kind: 'text'; text: string } | {kind: 'call'; name: string; args: Record<string, unknown>} | {kind: 'invalid'; reason: string};
const OPEN = '<function';
const CLOSE = '</function>';
function unescapeXml(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (whole, entity: string) => {
    const named: Record<string, string> = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
    if (named[entity]) return named[entity];
    if (entity[0] !== '#') return whole;
    const hex = entity[1] === 'x';
    const code = parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    try { return String.fromCodePoint(code); } catch { return whole; }
  });
}
function parseBlock(block: string, tools: Map<string, ToolDefinition>): ParsedEvent {
  const normalized = block.replaceAll('Ġ',' ').replace(/<functionname=/g,'<function name=').replace(/<paramname=/g,'<param name=');
  const m = /^<function\s+name=["']([^"']+)["']\s*>/.exec(normalized);
  if (!m) return {kind:'invalid',reason:'Invalid function header'};
  const name = m[1];
  const tool = tools.get(name);
  if (!tool) return {kind:'invalid',reason:`Tool not declared: ${name}`};
  const body = normalized.slice(m[0].length,-CLOSE.length);
  const args: Record<string,unknown> = {};
  const rx = /<param\s+name=["']([^"']+)["']\s*>([\s\S]*?)<\/param>/g;
  let cursor = 0;
  for (const p of body.matchAll(rx)) {
    const start = p.index ?? 0;
    if (body.slice(cursor,start).trim()) return {kind:'invalid',reason:'Unexpected content inside function'};
    const key = p[1];
    if (Object.prototype.hasOwnProperty.call(args,key)) return {kind:'invalid',reason:`Duplicate argument: ${key}`};
    if (!Object.prototype.hasOwnProperty.call(tool.parameters?.properties ?? {},key)) return {kind:'invalid',reason:`Unknown argument: ${key}`};
    const payload = p[2];
    const cdata = payload.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
    const raw = cdata ? cdata[1] : unescapeXml(payload);
    const type = tool.parameters?.properties?.[key]?.type;
    if (type === 'string') args[key] = raw;
    else {
      try { args[key] = JSON.parse(raw); } catch { return {kind:'invalid',reason:`Invalid JSON value for ${key}`}; }
    }
    cursor = start+p[0].length;
  }
  if (body.slice(cursor).trim()) return {kind:'invalid',reason:'Malformed parameter body'};
  return {kind:'call',name,args};
}
export class MiniCPM5Parser {
  private buffer = '';
  private tools: Map<string,ToolDefinition>;
  constructor(tools: ToolDefinition[]) { this.tools = new Map(tools.map(t=>[t.name,t])); }
  feed(chunk: string, final=false): ParsedEvent[] {
    this.buffer += chunk;
    const events: ParsedEvent[] = [];
    while (this.buffer.length) {
      const start = this.buffer.indexOf(OPEN);
      if (start < 0) {
        // Keep possible partial opening tag for next chunk.
        let keep = 0;
        if (!final) for(let i=1;i<OPEN.length;i++) if(this.buffer.endsWith(OPEN.slice(0,i))) keep=i;
        const text = this.buffer.slice(0,this.buffer.length-keep);
        if(text) events.push({kind:'text',text});
        this.buffer = this.buffer.slice(this.buffer.length-keep);
        break;
      }
      if (start>0) { events.push({kind:'text',text:this.buffer.slice(0,start)}); this.buffer=this.buffer.slice(start); }
      const close = this.buffer.indexOf(CLOSE);
      if (close<0) {
        if (final) { events.push({kind:'invalid',reason:'Unterminated function'}); this.buffer=''; }
        break;
      }
      const block = this.buffer.slice(0,close+CLOSE.length);
      this.buffer=this.buffer.slice(close+CLOSE.length);
      events.push(parseBlock(block,this.tools));
    }
    return events;
  }
  finish(): ParsedEvent[] {return this.feed('',true);}
}
