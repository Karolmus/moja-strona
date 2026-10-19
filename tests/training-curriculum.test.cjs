const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const bank = require('../static/training-tasks.js');
const katex = require('../static/lib/katex/katex.min.js');
const html = fs.readFileSync('trening.html','utf8');
function load(ctx,names) {
  for(const name of names) {
    const start = html.indexOf(`function ${name}(`);
    assert(start >= 0,name);
    vm.runInContext(html.slice(start,html.indexOf('\n}',start)+2),ctx);
  }
}
function seeded(seed=29342) {
  return () => {seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed/2**32;};
}
function expected(id,p) {
  if(id.endsWith('-powers')) return p.a+p.b;
  if(id.endsWith('-root')) return Math.sqrt(p.coefficient**2*p.radicand/p.radicand);
  if(id.endsWith('-trig-identity')) return 1;
  if(id.endsWith('-trig-value')) {
    const angle=Number(p.expression.match(/\d+/)[0])*Math.PI/180;
    const value=p.expression.includes('sin') ? Math.sin(angle) :
      p.expression.includes('cos') ? Math.cos(angle) : Math.tan(angle);
    return p.missingRadicand ? (2*value)**2 : value;
  }
  switch(id) {
    case 'eo-percent': return p.number*p.percent/100;
    case 'eo-fraction': return (p.a/p.b+p.c/p.d)*p.denominator;
    case 'eo-equivalent': return p.numerator*p.factor;
    case 'eo-divisibility': return Number(Number.isInteger(p.number/p.divisor));
    case 'eo-expression': return p.a*p.x+p.b;
    case 'eo-equation': return (p.a*p.x+p.b-p.b)/p.a;
    case 'eo-clock': return p.elapsed;
    case 'eo-motion': return p.askTime ? p.speed*p.hours/p.speed : p.speed*p.hours;
    case 'eo-triangle': return p.base*p.height/2;
    case 'eo-trapezoid': return (p.a+p.b)/2*p.h;
    case 'eo-units': return p.value*p.factor;
    case 'eo-volume': return p.a*p.b*p.c;
    case 'eo-counting': return p.a*p.b;
    case 'mp-power-quotient': return p.exponent-p.divisor;
    case 'mp-log-product': return Math.log(p.base**p.a*p.base**p.b)/Math.log(p.base);
    case 'mp-log-power': return p.exponent;
    case 'mp-square': return (1+p.a)**2-1-p.a**2;
    case 'mp-difference-squares': return -(p.a*(-p.a));
    case 'mp-percent-change': return p.price-p.price*p.percent/100;
    case 'mp-function-value': return p.a*p.x+p.b;
    case 'mp-slope': return ((p.y+p.slope*p.dx)-p.y)/((p.x+p.dx)-p.x);
    case 'mp-zero': return -p.b/p.a;
    case 'mp-delta': return p.b**2-4*p.a*p.c;
    case 'mp-viete': {
      const delta=p.b**2-4*p.a*p.c;
      assert(delta > 0,'Viete task has two distinct real roots');
      return (-p.b+Math.sqrt(delta))/(2*p.a)+(-p.b-Math.sqrt(delta))/(2*p.a);
    }
    case 'mp-arithmetic': return Array.from({length:p.n},(_,i)=>p.a1+i*p.difference).at(-1);
    case 'mp-geometric': return Array.from({length:p.n},(_,i)=>p.a1*p.ratio**i).at(-1);
    case 'mp-sum': return Array.from({length:p.n},(_,i)=>p.first+i*(p.last-p.first)/(p.n-1)).reduce((a,b)=>a+b,0);
    case 'mp-circle': return p.radius**2;
    case 'mp-distance': return Math.hypot(p.dx,p.dy);
    case 'mp-probability': return p.favorable/p.total;
    case 'mr-absolute': return Math.max(p.center-p.radius,p.center+p.radius);
    case 'mr-interval': return (p.center+p.radius)-(p.center-p.radius);
    case 'mr-composition': return p.a*(p.c*p.x+p.d)+p.b;
    case 'mr-limit': return 2*p.a;
    case 'mr-limit-infinity': return p.a/p.c;
    case 'mr-derivative': return p.n*p.a;
    case 'mr-tangent': {
      const f=x=>p.a*x*x+p.b*x, dx=0.0001;
      return (f(p.x+dx)-f(p.x-dx))/(2*dx);
    }
    default: throw Error('Missing independent key check: '+id);
  }
}
test('all 45 active formula families have independently checked answers and short arithmetic', () => {
  assert.equal(bank.generators.length,45);
  assert.equal(new Set(bank.generators.map(g=>g.id)).size,45);
  const random=seeded();
  for(const generator of bank.generators) {
    for(let i=0;i<500;i++) {
      const item=generator.make(random);
      assert(Number.isFinite(item.answer),generator.id);
      assert(Math.abs(item.answer-expected(generator.id,item.parameters))<1e-6,generator.id);
      assert.equal(item.calculator,false);
      assert(item.instruction && !/[<>]/.test(item.instruction));
      assert(Math.abs(item.answer)<=(generator.id==='eo-units'?2000:120),generator.id);
      if(generator.topic==='logs') assert(Math.abs(item.answer)<=4);
      if(generator.topic==='fractions') assert(item.parameters.denominator<=6);
    }
  }
});
test('LaTeX renders with local KaTeX, including boundary values, fractions and nested powers', () => {
  const random=seeded(19384);
  for(const generator of bank.generators) {
    for(const rng of [()=>0,()=>0.999999,...Array(30).fill(random)]) {
      const item=generator.make(rng);
      if(!item.tex) {assert.equal(item.answerMode,'yes-no'); continue;}
      const result=katex.renderToString(item.tex,{displayMode:true,output:'htmlAndMathml',throwOnError:true,strict:'error',trust:false});
      assert(result.includes('katex-html') && result.includes('katex-mathml'));
      assert(!result.includes('katex-error'));
    }
  }
  assert(!html.includes('upgradeMathNotation') && !html.includes('math-sup'));
  for(const [,path] of fs.readFileSync('static/lib/katex/katex.min.css','utf8').matchAll(/url\(([^)]+)\)/g)) {
    assert(fs.existsSync('static/lib/katex/'+path),path);
  }
});
test('the renderer separates normal text from formulas and does not trust LaTeX commands', () => {
  const content={children:[],replaceChildren(node){this.children=[node];},appendChild(node){this.children.push(node);}};
  const calls=[];
  const ctx=vm.createContext({problemStartPrompt:{},problemText:content,calculatorIndicator:{},
    document:{createElement:()=>({})},katex:{render(tex,node,options){calls.push(options);node.output=katex.renderToString(tex,options);}}});
  load(ctx,['showTask']);
  ctx.showTask(bank.generators.find(g=>g.id==='mr-derivative').make(()=>0.5));
  assert.equal(content.children[0].className,'training-instruction');
  assert.equal(content.children[1].className,'training-equation');
  assert.equal(calls[0].trust,false);
  assert.equal(calls[0].output,'htmlAndMathml');
  assert.equal(calls[0].strict,'error');
  ctx.showTask(bank.generators.find(g=>g.id==='eo-divisibility').make(()=>0.5));
  assert.equal(content.children.length,1,'Yes/no questions do not get a redundant question mark');
});
test('equivalent fractions, decimal commas, dots and signs are accepted without evaluating code', () => {
  const ctx=vm.createContext({});
  load(ctx,['normalizeAnswer','isCorrectAnswer','formatAnswer','formatAnswerForMode','formatTaskAnswer']);
  for(const text of ['0,5','0.5','1/2','2/4',' 3 / 6 ','1,5/3']) assert(ctx.isCorrectAnswer(ctx.normalizeAnswer(text),0.5),text);
  for(const text of ['−1/2','-2/4','1/-2']) assert.equal(ctx.normalizeAnswer(text),-0.5,text);
  assert.equal(ctx.normalizeAnswer(0),0);
  for(const text of ['',' ','1/0','1/2/3','1//2','1,2,3','NaN','Infinity','1e5','alert(1)','0x10']) {
    assert.equal(ctx.normalizeAnswer(text),null,text);
  }
  assert.equal(ctx.formatTaskAnswer({answer:1/3}),'1/3','Feedback does not present a rounded value that the input rejects');
  assert.equal(ctx.formatTaskAnswer({answer:2/3}),'2/3');
  assert.equal(ctx.formatTaskAnswer({answer:0.5}),'1/2');
  assert.equal(ctx.formatTaskAnswer({answer:1,answerMode:'yes-no'}),'Tak');
  assert.match(html,/\"1\", \"2\", \"3\", \"fraction\"/);
  assert.match(html,/replace\(\/\[\^0-9,.\\-\/\]\/g/);
});
test('every visible topic has exercises; MP lesson numbers match the course and mixed topics are balanced', () => {
  const ctx=vm.createContext({DSSpeedTasks:bank,GENERATORS:bank.generators,state:{level:'eo',topic:'all',reviewTopic:''},Math:Object.create(Math)});
  ctx.Math.random=seeded();
  const start=html.indexOf('const LEVELS =');
  vm.runInContext(html.slice(start,html.indexOf('\n};',start)+3),ctx);
  load(ctx,['rand','choice','generatorPool']);
  for(const level of ['eo','mp','mr']) {
    ctx.state.level=level;
    const lessons=vm.runInContext('LEVELS["'+level+'"].lessons',ctx);
    for(const lesson of lessons) {
      ctx.state.topic=lesson.id;
      assert(ctx.generatorPool().length,level+':'+lesson.id);
    }
    ctx.state.topic='all';
    const counts=new Map();
    for(let i=0;i<12000;i++) {
      const pool=ctx.generatorPool();
      assert(pool.every(g=>g.level===level && g.topic===pool[0].topic));
      counts.set(pool[0].topic,(counts.get(pool[0].topic)||0)+1);
    }
    const average=12000/counts.size;
    for(const value of counts.values()) assert(Math.abs(value-average)<average*0.15);
  }
  assert(vm.runInContext('LEVELS.mp.lessons.find(x=>x.id==="lesson_2").label',ctx).includes('Logarytmy'));
  assert(vm.runInContext('LEVELS.mp.lessons.find(x=>x.id==="lesson_8").label',ctx).includes('Funkcja liniowa'));
});
test('new records are versioned without deleting historical results; old answer callbacks cannot affect a new round', () => {
  const callbacks=[];
  const ctx=vm.createContext({DSSpeedTasks:bank,state:{level:'mp',topic:'lesson_2',difficulty:'mixed',roundSeconds:120,running:true,currentTask:{}},
    setTimeout:fn=>callbacks.push(fn),nextTask:()=>{ctx.advances++;},advances:0});
  load(ctx,['trainingScopeTopic','trainingResultTopic','taskMemoryKey','bestScoreId','advanceAfterAnswer']);
  assert.equal(ctx.trainingResultTopic(),'formulas-v1-lesson_2');
  assert(ctx.bestScoreId().startsWith('formulas-v1:'));
  assert(ctx.taskMemoryKey().startsWith('formulas-v1:'));
  assert.equal((html.match(/topic: trainingResultTopic\(\)/g)||[]).length,3,'Start, save and history use the same version');
  ctx.advanceAfterAnswer(260);
  ctx.state.currentTask={};
  callbacks.shift()();
  assert.equal(ctx.advances,0);
  ctx.advanceAfterAnswer(260);
  callbacks.shift()();
  assert.equal(ctx.advances,1);
});
