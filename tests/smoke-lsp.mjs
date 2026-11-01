import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn, execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

if (!process.argv[2]) {
  console.error('Usage: node tests/smoke-lsp.mjs USERDIR [lsp_addon ...]');
  process.exit(2);
}
const root = path.resolve(process.argv[2]);
const arch = process.env.LSP_TEST_ARCH || 'x86_64-linux';
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const only = new Set(process.argv.slice(3));
const addons = manifest.addons.filter(addon => addon.id.startsWith('lsp_') && (!only.size || only.has(addon.id)));
assert.ok(addons.length > 0, 'No language servers selected');
const helpers = JSON.parse(execFileSync('lua', ['tests/helper-commands.lua', root, arch, ...addons.map(addon => addon.id)], {encoding:'utf8'}));
const workspaceRoot = process.env.LSP_TEST_WORKDIR || fs.mkdtempSync(path.join(os.tmpdir(), 'lsp-smoke-'));
fs.mkdirSync(workspaceRoot, {recursive:true});

const profiles = {
  lsp_bash: ['example.sh', 'shellscript', 'greet() { echo hello; }\ngreet\n'],
  lsp_c: ['example.c', 'c', 'int add(int a, int b) { return a + b; }\n'],
  lsp_clojure: ['example.clj', 'clojure', '(ns example)\n(defn greet [name] name)\n'],
  lsp_css: ['example.css', 'css', '.hello { color: red; }\n'],
  lsp_d: ['example.d', 'd', 'module example;\nint answer() { return 42; }\n'],
  lsp_emmet: ['example.html', 'html', 'ul>li*3'],
  lsp_go: ['example.go', 'go', 'package example\n\nfunc Add(a, b int) int { return a + b }\n'],
  lsp_haxe: ['Main.hx', 'haxe', 'class Main { static function main() { trace("hello"); } }\n'],
  lsp_html: ['example.html', 'html', '<html><body><h1>Hello</h1></body></html>\n'],
  lsp_json: ['package.json', 'json', '{"name":"lsp-smoke","version":"1.0.0"}\n'],
  lsp_java: ['Main.java', 'java', 'public class Main { public static int answer() { return 42; } }\n'],
  lsp_lua: ['example.lua', 'lua', 'local function greet(name)\n  return "Hello " .. name\nend\nreturn greet("Lua")\n'],
  lsp_php: ['example.php', 'php', '<?php\nfunction greet(string $name): string { return $name; }\n'],
  lsp_python: ['example.py', 'python', 'def greet(name: str) -> str:\n    return name\n'],
  lsp_quicklintjs: ['example.js', 'javascript', 'let value = ;\n'],
  lsp_rust: ['lib.rs', 'rust', 'pub fn add(a: i32, b: i32) -> i32 { a + b }\n'],
  lsp_tex: ['example.tex', 'latex', '\\documentclass{article}\n\\begin{document}\n\\section{Hello}\nHello\n\\end{document}\n'],
  lsp_typescript: ['example.ts', 'typescript', 'function greet(name: string): string { return name; }\nconst message = greet("world");\n'],
  lsp_yaml: ['example.yaml', 'yaml', 'greeting: hello\nnested:\n  value: 42\n'],
  lsp_zig: ['example.zig', 'zig', 'pub fn add(a: i32, b: i32) i32 { return a + b; }\n'],
};

class Client {
  constructor(command, cwd, env) {
    this.pending = new Map();
    this.notifications = [];
    this.sequence = 0;
    this.buffer = Buffer.alloc(0);
    this.stderr = '';
    this.child = spawn(command[0], command.slice(1), {cwd, env, detached:true, stdio:['pipe','pipe','pipe']});
    this.closed = new Promise(resolve => this.child.once('close', (code, signal) => {this.exit = {code,signal}; resolve();}));
    this.child.once('error', error => this.fail(error));
    this.child.once('exit', code => this.fail(new Error('Server exited before response: ' + code)));
    this.child.stderr.on('data', data => {this.stderr = (this.stderr + data).slice(-65536);});
    this.child.stdin.on('error', error => this.fail(error));
    this.child.stdout.on('data', data => {
      this.buffer = Buffer.concat([this.buffer, data]);
      try {
        while (true) {
          const end = this.buffer.indexOf('\r\n\r\n');
          if (end < 0) break;
          const match = /Content-Length:\s*(\d+)/i.exec(this.buffer.subarray(0,end).toString());
          if (!match) throw new Error('Invalid LSP frame');
          const length = Number(match[1]);
          if (this.buffer.length < end + 4 + length) break;
          const message = JSON.parse(this.buffer.subarray(end+4,end+4+length));
          this.buffer = this.buffer.subarray(end+4+length);
          this.receive(message);
        }
      } catch(error) {this.fail(error);}
    });
  }
  fail(error) {
    for (const request of this.pending.values()) {clearTimeout(request.timer); request.reject(error);}
    this.pending.clear();
  }
  send(message) {
    const body = Buffer.from(JSON.stringify({jsonrpc:'2.0',...message}));
    this.child.stdin.write(Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`),body]));
  }
  receive(message) {
    if (message.method && message.id !== undefined) {
      let result = null;
      if (message.method === 'workspace/configuration') result = message.params.items.map(() => ({}));
      if (message.method === 'workspace/workspaceFolders') result = this.workspaceFolders;
      if (message.method === 'workspace/applyEdit') result = {applied:false};
      this.send({id:message.id,result});
    } else if (message.id !== undefined) {
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    } else this.notifications.push(message);
  }
  request(method, params, timeout = 45000) {
    return new Promise((resolve,reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => {this.pending.delete(id); reject(new Error(method + ' timed out'));},timeout);
      this.pending.set(id,{resolve,reject,timer});
      this.send({id,method,params});
    });
  }
  async close() {
    if (this.exit) return;
    try {await this.request('shutdown',null,4000); this.send({method:'exit'});} catch {}
    const exited = await Promise.race([this.closed.then(() => true),delay(1500).then(() => false)]);
    if (!exited) {try {process.kill(-this.child.pid,'SIGKILL');} catch {} await this.closed;}
    this.fail(new Error('Client closed'));
  }
}

async function check(helper) {
  const label = helper.id + (helper.id === 'lsp_python' ? '/' + helper.key : '');
  const directory = path.join(workspaceRoot,label.replace('/','-'));
  fs.mkdirSync(directory,{recursive:true});
  let [filename,language,text] = profiles[helper.id];
  if (helper.key === 'ruff') text = 'import os\n\nx=1\n';
  fs.writeFileSync(path.join(directory,filename),text);
  if (helper.id === 'lsp_go') fs.writeFileSync(path.join(directory,'go.mod'),'module example.com/smoke\n\ngo 1.27.0\n');
  if (helper.id === 'lsp_rust') fs.writeFileSync(path.join(directory,'Cargo.toml'),'[package]\nname="lsp_smoke"\nversion="0.1.0"\nedition="2021"\n[lib]\npath="lib.rs"\n');
  if (helper.id === 'lsp_typescript') fs.writeFileSync(path.join(directory,'tsconfig.json'),'{}\n');
  if (helper.id === 'lsp_haxe') fs.writeFileSync(path.join(directory,'build.hxml'),'-cp .\n-main Main\n--interp\n');
  if (helper.id === 'lsp_clojure') {
    fs.mkdirSync(path.join(directory,'.lsp'),{recursive:true});
    fs.writeFileSync(path.join(directory,'.lsp/config.edn'),'{:source-paths ["."] :project-specs []}\n');
  }
  for (const item of helper.command.slice(0,2)) {
    if (path.isAbsolute(item)) assert.ok(fs.existsSync(item),'Missing packaged executable or entrypoint: '+item);
  }
  const env = {...process.env,...helper.env};
  let command = helper.command;
  if (process.env.LSP_TEST_QEMU) command = [process.env.LSP_TEST_QEMU,'-L',process.env.LSP_TEST_SYSROOT || '/usr/aarch64-linux-gnu',...command];
  const client = new Client(command,directory,env);
  const uri = pathToFileURL(path.join(directory,filename)).href;
  const workspaceFolders = [{uri:pathToFileURL(directory).href,name:'smoke'}];
  client.workspaceFolders = workspaceFolders;
  try {
    const initialized = await client.request('initialize',{
      processId:process.pid,clientInfo:{name:'pragtical-package-smoke'},rootUri:workspaceFolders[0].uri,
      workspaceFolders,initializationOptions:helper.init_options || {},
      capabilities:{workspace:{configuration:true,workspaceFolders:true},textDocument:{documentSymbol:{hierarchicalDocumentSymbolSupport:true},completion:{completionItem:{snippetSupport:true}},hover:{contentFormat:['plaintext']},diagnostic:{}},window:{workDoneProgress:true}}
    },90000);
    assert.ok(initialized?.capabilities,'No initialize capabilities');
    client.send({method:'initialized',params:{}});
    if (helper.settings) client.send({method:'workspace/didChangeConfiguration',params:{settings:helper.settings}});
    client.send({method:'textDocument/didOpen',params:{textDocument:{uri,languageId:language,version:1,text}}});
    await delay(500);
    let method = 'textDocument/documentSymbol';
    let result;
    if (helper.id === 'lsp_quicklintjs') {
      method = 'textDocument/publishDiagnostics';
      for (let attempt=0;attempt<100;attempt++) {
        result = client.notifications.find(message => message.method===method && message.params.uri===uri && message.params.diagnostics.length)?.params.diagnostics;
        if (result) break;
        await delay(100);
      }
    } else if (helper.id === 'lsp_emmet') {
      method = 'textDocument/completion';
      const response = await client.request(method,{textDocument:{uri},position:{line:0,character:text.length},context:{triggerKind:1}});
      result = Array.isArray(response) ? response : response?.items;
    } else if (helper.key === 'ruff') {
      method = 'textDocument/diagnostic';
      result = (await client.request(method,{textDocument:{uri}}))?.items;
      assert.ok(result?.some(item => item.code==='F401'),'Ruff did not diagnose unused import');
    } else {
      for (let attempt=0;attempt<40;attempt++) {
        result = await client.request(method,{textDocument:{uri}});
        if (Array.isArray(result) && result.length>0) break;
        await delay(250);
      }
    }
    assert.ok(Array.isArray(result) && result.length>0,method+' returned no results');
    let schemaStore;
    if (helper.id === 'lsp_json' && process.env.LSP_TEST_SCHEMASTORE === '1') {
      for (let attempt=0;attempt<80;attempt++) {
        const status = await client.request('json/languageStatus',uri);
        schemaStore = status.schemas.some(schema => /schemastore.*package/.test(schema));
        if (schemaStore) break;
        await delay(250);
      }
      assert.ok(schemaStore, 'SchemaStore did not associate package.json');
    }
    return {id:label,status:'pass',request:method,results:result.length,serverInfo:initialized.serverInfo,schemaStore};
  } finally {
    await client.close();
    fs.writeFileSync(path.join(directory,'stderr.log'),client.stderr);
    fs.writeFileSync(path.join(directory,'notifications.json'),JSON.stringify(client.notifications,null,2));
  }
}

const results = [];
for (const helper of helpers) {
  const started = Date.now();
  try {
    const result = await check(helper);
    results.push({...result,elapsedMs:Date.now()-started});
    console.log('PASS '+result.id+' '+result.request+' ('+result.results+' results)');
  } catch(error) {
    const id = helper.id + (helper.id==='lsp_python'?'/'+helper.key:'');
    results.push({id,status:'fail',error:error.message,elapsedMs:Date.now()-started});
    console.error('FAIL '+id+': '+error.message);
  }
}
const report = path.join(workspaceRoot,'report'+(only.size?'-selected':'')+'.json');
fs.writeFileSync(report,JSON.stringify({arch,results},null,2)+'\n');
console.log('Report: '+report);
if (results.some(result=>result.status!=='pass')) process.exitCode=1;
