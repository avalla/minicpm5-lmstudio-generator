import {test} from 'node:test';
import {deepStrictEqual,strictEqual} from 'node:assert';
import {MiniCPM5Parser} from '../src/parser.ts';
const tools=[{name:'auth_whoami',parameters:{properties:{}}},{name:'read',parameters:{properties:{path:{type:'string'},count:{type:'number'}}}}];
test('auth_whoami can stream one character at a time',()=>{
 const p=new MiniCPM5Parser(tools);
 const output=[];
 for(const c of '<function name="auth_whoami"></function>') output.push(...p.feed(c));
 output.push(...p.finish());
 deepStrictEqual(output,[{kind:'call',name:'auth_whoami',args:{}}]);
});
test('multiple calls and typed params',()=>{
 const p=new MiniCPM5Parser(tools);
 const result=p.feed('<function name="read"><param name="path">a &amp; b</param><param name="count">2</param></function><function name="auth_whoami"></function>',true);
 deepStrictEqual(result,[{kind:'call',name:'read',args:{path:'a & b',count:2}},{kind:'call',name:'auth_whoami',args:{}}]);
});
test('unknown tool is rejected',()=>{
 const result=new MiniCPM5Parser(tools).feed('<function name="delete_all"></function>',true);
 strictEqual(result[0].kind,'invalid');
});
test('unterminated tool cannot execute',()=>{
 const p=new MiniCPM5Parser(tools); p.feed('<function name="auth_whoami">');
 strictEqual(p.finish()[0].kind,'invalid');
});
