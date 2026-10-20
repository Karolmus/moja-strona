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
  if(id.endsWith('-powers')) {
    switch(p.variant) {
      case 'quotient': return (p.a+p.b)-p.b;
      case 'power': return p.a*p.b;
      case 'common-exponent': return ((p.a+1)**(p.b+1)*(p.b+1)**(p.b+1))**(1/(p.b+1));
      case 'common-quotient': return (((p.a+1)*(p.b+1))**(p.b+1)/(p.b+1)**(p.b+1))**(1/(p.b+1));
      case 'zero': return 1;
      case 'negative-base': return (-p.magnitude)**p.exponent;
      case 'minus-outside': return -(p.magnitude**p.exponent);
      default: return p.a+p.b;
    }
  }
  if(id.endsWith('-root')) {
    switch(p.variant) {
      case 'product': return Math.sqrt(p.radicand)*Math.sqrt(p.coefficient**2*p.radicand);
      case 'sum': return (p.coefficient*Math.sqrt(p.radicand)+p.other*Math.sqrt(p.radicand))/Math.sqrt(p.radicand);
      case 'difference': return (p.coefficient*Math.sqrt(p.radicand)-p.other*Math.sqrt(p.radicand))/Math.sqrt(p.radicand);
      case 'cube': return Math.cbrt(p.value**3);
      default: return Math.sqrt(p.coefficient**2*p.radicand)/Math.sqrt(p.radicand);
    }
  }
  if(id.endsWith('-trig-identity')) return p.variant==='complement' ? 0 : p.variant==='scaled' ? p.factor : p.variant==='missing-square' ? 1-p.known : 1;
  if(id.endsWith('-trig-value')) {
    const angle=Number(p.expression.match(/\d+/)[0])*Math.PI/180;
    const value=p.expression.includes('sin') ? Math.sin(angle) :
      p.expression.includes('cos') ? Math.cos(angle) : Math.tan(angle);
    return p.missingRadicand ? (2*value)**2 : value;
  }
  switch(id) {
    case 'eo-percent': return p.variant==='whole' ? (p.number*p.percent/100)/(p.percent/100) : p.variant==='percent' ? (p.number*p.percent/100)/p.number*100 : p.number*p.percent/100;
    case 'eo-fraction': return p.variant==='divide' ? (p.a/p.b)/(p.c/p.d) : p.variant==='multiply' ? p.a/p.b*p.c*p.denominator : (p.a/p.b+(p.variant==='subtract' ? -1 : 1)*p.c/p.d)*p.denominator;
    case 'eo-equivalent': return p.numerator*p.factor;
    case 'eo-divisibility': return Number(Number.isInteger(p.number/p.divisor));
    case 'eo-expression': return p.variant==='square' ? p.x**2+p.b : p.variant==='brackets' ? p.a*(p.x+p.b) : p.a*p.x+p.b;
    case 'eo-equation': return (p.a*p.x+p.b-p.b)/p.a;
    case 'eo-clock': return p.elapsed;
    case 'eo-motion': return p.variant==='time' ? p.speed*p.hours/p.speed : p.variant==='speed' ? p.speed*p.hours/p.hours : p.speed*p.hours;
    case 'eo-triangle': return p.variant==='height' ? 2*(p.base*p.height/2)/p.base : p.variant==='base' ? 2*(p.base*p.height/2)/p.height : p.base*p.height/2;
    case 'eo-trapezoid': return (p.a+p.b)/2*p.h;
    case 'eo-units': return p.value*p.factor;
    case 'eo-volume': return p.a*p.b*p.c;
    case 'eo-counting': return p.a*p.b;
    case 'mp-power-quotient': {
      if(p.variant==='reciprocal') return p.value**(-p.n);
      if(p.variant==='fractional') return Math.pow(p.root**p.degree,1/p.degree);
      if(p.variant==='mixed-bases') return Math.log((p.base**p.factor)**p.n/p.base**p.n)/Math.log(p.base);
      if(p.variant==='negative-product') return Math.log(p.base**p.exponent*p.base**p.divisor)/Math.log(p.base);
      return Math.log(p.base**p.exponent/p.base**p.divisor)/Math.log(p.base);
    }
    case 'mp-log-product': {
      const log=x=>Math.log(x)/Math.log(p.base);
      if(p.variant==='reciprocal') return log(1/p.base**(p.a+1));
      if(p.variant==='fraction-base') return Math.log(p.base**(p.a+1))/Math.log(1/p.base);
      return log(p.base**p.a)+(p.variant==='difference' ? -1 : 1)*log(p.base**p.b);
    }
    case 'mp-log-power': return p.exponent;
    case 'mp-square': return p.variant==='constant' ? p.a**2 : (p.k+p.a)**2-p.k**2-p.a**2;
    case 'mp-difference-squares': return -(p.a*(-p.a));
    case 'mp-percent-change': return p.variant==='original' ? (p.price-p.price*p.percent/100)/(1-p.percent/100) : p.price+(p.variant==='increase' ? 1 : -1)*p.price*p.percent/100;
    case 'mp-function-value': return p.variant==='absolute' ? Math.abs(p.x+p.b) : p.variant==='square' ? p.x**2+p.b : p.variant==='exponential' ? 2**p.x+p.b : p.variant==='rational' ? p.a*p.x/p.x : p.a*p.x+p.b;
    case 'mp-slope': return ((p.y+p.slope*p.dx)-p.y)/((p.x+p.dx)-p.x);
    case 'mp-zero': return -p.b/p.a;
    case 'mp-delta': return p.b**2-4*p.a*p.c;
    case 'mp-viete': {
      const delta=p.b**2-4*p.a*p.c;
      assert(delta > 0,'Viete task has two distinct real roots');
      const x1=(-p.b+Math.sqrt(delta))/(2*p.a), x2=(-p.b-Math.sqrt(delta))/(2*p.a);
      return p.variant==='product' ? x1*x2 : x1+x2;
    }
    case 'mp-arithmetic': return Array.from({length:p.n},(_,i)=>p.a1+i*p.difference).at(-1);
    case 'mp-geometric': return Array.from({length:p.n},(_,i)=>p.a1*p.ratio**i).at(-1);
    case 'mp-sum': return Array.from({length:p.n},(_,i)=>p.first+i*(p.last-p.first)/(p.n-1)).reduce((a,b)=>a+b,0);
    case 'mp-circle': return p.radius**2;
    case 'mp-distance': return Math.hypot(p.dx,p.dy);
    case 'mp-probability': return p.favorable/p.total;
    case 'mr-absolute': return p.variant==='smaller' ? Math.min(p.center-p.radius,p.center+p.radius) : Math.max(p.center-p.radius,p.center+p.radius);
    case 'mr-interval': return p.variant==='length' ? (p.center+p.radius)-(p.center-p.radius) : p.center+(p.variant==='left' ? -p.radius : p.radius);
    case 'mr-composition': return p.variant==='gf' ? p.c*(p.a*p.x+p.b)+p.d : p.a*(p.c*p.x+p.d)+p.b;
    case 'mr-limit': {
      const x=p.a+0.00001;
      const ratio=p.variant==='reciprocal' ? (x-p.a)/(x*x-p.a*p.a) : p.variant==='cube' ? (x**3-p.a**3)/(x-p.a) : (x*x-p.a*p.a)/(x-p.a);
      return ratio;
    }
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
    for(const variant of generator.variants) for(let i=0;i<100;i++) {
      const item=generator.make(random,variant);
      assert(Number.isFinite(item.answer),generator.id);
      assert(Math.abs(item.answer-expected(generator.id,item.parameters))<(generator.id==='mr-limit'?0.0001:1e-6),item.variantId);
      assert.equal(item.variantId,`${generator.id}:${variant}`);
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
    for(const variant of generator.variants) for(const rng of [()=>0,()=>0.999999,...Array(30).fill(random)]) {
      const item=generator.make(rng,variant);
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
test('formula variants rotate before repeating, including focused lessons and subsequent rounds', () => {
  const ctx=vm.createContext({state:{variantUsage:new Map(),currentTask:null},Math:Object.create(Math)});
  ctx.Math.random=seeded(582);
  load(ctx,['rand','choice','nextTaskRecipe']);
  assert(bank.generators.reduce((sum,g)=>sum+g.variants.length,0)>=110);
  for(const level of ['eo','mp','mr']) for(const topic of new Set(bank.generators.filter(g=>g.level===level).map(g=>g.topic))) {
    const pool=bank.generators.filter(g=>g.level===level && g.topic===topic);
    const size=pool.reduce((sum,g)=>sum+g.variants.length,0);
    ctx.state.variantUsage.clear(); ctx.state.currentTask=null;
    for(let round=0;round<3;round++) {
      const visited=new Set();
      for(let i=0;i<size;i++) {
        const recipe=ctx.nextTaskRecipe(pool);
        assert(!visited.has(recipe.key),recipe.key+' repeats before all variants were used');
        if(size>1) assert.notEqual(recipe.key,ctx.state.currentTask?.variantId);
        const item=recipe.generator.make(seeded(i+round),recipe.variant);
        assert.equal(item.variantId,recipe.key);
        visited.add(recipe.key);
        ctx.state.variantUsage.set(recipe.key,(ctx.state.variantUsage.get(recipe.key)||0)+1);
        ctx.state.currentTask=item;
      }
      // Starting another round clears the current problem, not the formula rotation.
      ctx.state.currentTask=null;
    }
    assert([...ctx.state.variantUsage.values()].every(count=>count===3));
  }
});
test('powers include a broad set of bases and distinguish sign, brackets and exponent rules', () => {
  for(const level of ['eo','mp']) {
    const generator=bank.generators.find(g=>g.id===level+'-powers');
    const bases=new Set(), random=seeded(2718);
    for(let i=0;i<500;i++) bases.add(generator.make(random,'product').parameters.base);
    assert(bases.size>=14);
    assert([...bases].some(base=>base.includes('frac')));
    assert([...bases].some(base=>base.includes('{,}')));
    assert([...bases].some(base=>base.includes('(-')));
    const inside=generator.make(()=>0,'negative-base'), outside=generator.make(()=>0,'minus-outside');
    assert.equal(inside.answer,4);
    assert.equal(outside.answer,-4);
    assert.match(inside.tex,/\(-2\)\^\{2\}/);
    assert.match(outside.tex,/-2\^\{2\}/);
    assert.equal(generator.make(()=>0,'zero').answer,1);
  }
});
test('task categories are absent from the training workspace and skip labels are consistent', () => {
  assert(!html.includes('taskTopic') && !html.includes('task-heading') && !html.includes('calculatorIndicator'));
  assert(!/innerText\s*=\s*state\.currentTask\.label/.test(html));
  const tasks=fs.readFileSync('zadania.html','utf8');
  for(const page of [html,tasks]) assert.match(page,/<button\b[^>]*id="skipButton"[^>]*>Na razie pomiń<\/button>/);
  assert.match(html,/training-tasks\.js\?v=20261020-variety/);
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
