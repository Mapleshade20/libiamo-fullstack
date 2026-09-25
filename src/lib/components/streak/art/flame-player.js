// @ts-nocheck
// Generated scene runtime adapted from tmp/flame-player.js; see ../README.md.
/* Transparent SVG artwork + continuous motion. No raster/runtime dependencies. */
import { grayDisplacement } from '../gray-motion';
import { burnPose } from '../burn-motion';

  const NS = 'http://www.w3.org/2000/svg';
  const STAGES = Object.freeze({
    full: Object.freeze({ label: '完整动画', first: 0, last: 167 }),
    off: Object.freeze({ label: '灰色火焰', first: 12, last: 31 }),
    ignite: Object.freeze({ label: '点燃', first: 32, last: 103 }),
    burn: Object.freeze({ label: '燃烧火焰', first: 104, last: 167 }),
  });
  const DETAILS = [[0, '尚未出现'], [12, '灰焰'], [29, '倾斜蓄力'], [32, '压扁 · 变色'],
    [44, '旋转爆燃'], [61, '火种下坠'], [64, '落地 · 冲击波'],
    [74, '拉伸回弹'], [92, '恢复轮廓 · 火星飞散'], [104, '燃烧飘动']];
  const STATES = { 'gray-static': ['off', false], 'gray-idle': ['off', true],
    'burn-static': ['burn', false], 'burn-idle': ['burn', true] };
  const num = value => Number(value.toFixed(3));
  const ash = fill => ({ '#596975':'#9ca9aa', '#3b4b57':'#899697', '#71818b':'#c4cbca',
    '#4a5660':'#a3abaa', '#394551':'#909b9b', '#58676e':'#c0c7c4' }[fill] ?? fill);
  const pathData = values => `M${values.slice(0, 2).map(num).join(' ')}${Array.from(
    { length: (values.length-2)/6 }, (_, i) => `C${values.slice(2+i*6, 8+i*6).map(num).join(' ')}`).join('')}Z`;
  const mix = (a, b, t) => a+(b-a)*t;
  let serial = 0;
  const decoded = new WeakMap();
  function unpack(data) {
    if (!data?.format) return data;
    if (decoded.has(data)) return decoded.get(data);
    if (data.format !== 2) throw new Error('Unsupported flame scene format.');
    const scene = data.scene;
    const keys = ([times, encoded], width) => {
      const bytes = atob(encoded), previous = new Array(width).fill(0);
      let offset = 0;
      return times.map(time => [time, previous.map((v,i) => {
        let value=0, shift=0, byte;
        do {
          if(offset >= bytes.length || shift>28) throw new Error('Invalid flame scene.');
          byte=bytes.charCodeAt(offset++);value+=(byte&127)*2**shift;shift+=7;
        } while(byte&128);
        previous[i]+=value&1 ? -(value+1)/2 : value/2;
        return previous[i]/10;
      })]);
    };
    const sample = (poses, time) => {
      if(time<=poses[0][0]) return poses[0][1];
      for(let i=1;i<poses.length;i++) if(time<=poses[i][0]) {
        const [a,p]=poses[i-1], [b,q]=poses[i];
        return p.map((v,j)=>mix(v,q[j],(time-a)/(b-a)));
      }
      return poses.at(-1)[1];
    };
    const spline = (values, knots) => {
      const n=values.length/2, span=knots[n];
      const points=Array.from({length:n},(_,i)=>values.slice(i*2,i*2+2));
      let derivatives=points.map(()=>[0,0]);
      for(let pass=0;pass<28;pass++) derivatives=points.map((p,i)=>{
        const prev=(i+n-1)%n,next=(i+1)%n;
        const before=i ? knots[i]-knots[i-1] : span-knots[n-1];
        const after=knots[i+1]-knots[i];
        return [0,1].map(a=>(3*(after/before*(p[a]-points[prev][a])+before/after*(points[next][a]-p[a]))
          -after*derivatives[prev][a]-before*derivatives[next][a])/(2*(before+after)));
      });
      const result=[...points[0]];
      for(let i=0;i<n;i++) {
        const next=(i+1)%n, step=(knots[i+1]-knots[i])/3;
        result.push(...points[i].map((v,a)=>v+derivatives[i][a]*step),
          ...points[next].map((v,a)=>v-derivatives[next][a]*step),...points[next]);
      }
      return result;
    };
    const actors=scene.actors.map(([layer,fill,opacity,first,last,knots,poses])=>({
      layer,fill:ash(fill),opacity,first,last,knots,poses:keys(poses,(knots.length-1)*2),
    }));
    const burnPoses=scene.burn.map((poses,i)=>keys(poses,scene.counts[i]*2));
    const burn=Array.from({length:scene.count},(_,i)=>burnPoses.map((poses,layer)=>
      spline(sample(poses,i),Array.from({length:scene.counts[layer]+1},(_,j)=>j))));
    const draw = frame => {
      const groups=new Map();
      for(const actor of actors) if(Math.floor(frame)>=actor.first && Math.floor(frame)<=actor.last) {
        const id=JSON.stringify([actor.layer,actor.fill,actor.opacity]);
        const d=pathData(spline(sample(actor.poses,frame-actor.first),actor.knots));
        if(!groups.has(id)) groups.set(id,{...actor,d:''});
        groups.get(id).d+=d;
      }
      const order=['shockwave','outer','spark','inner','ember','heart','highlight'];
      const shapes=[...groups.values()].sort((a,b)=>order.indexOf(a.layer)-order.indexOf(b.layer));
      const inner=shapes.filter(p=>p.layer==='inner').map(p=>p.d).join('');
      const [alpha,defs]=scene.paints[Math.min(103,Math.max(0,Math.floor(frame)))] ?? [1,''];
      return `<g opacity="${alpha}">${defs}<defs><clipPath id="scene_c"><path d="${inner}"/></clipPath></defs>`+
        shapes.map(p=>`<path data-layer="${p.layer}" d="${p.d}" fill="${p.fill}" fill-rule="evenodd" opacity="${p.opacity}"${p.layer==='ember'?' clip-path="url(#scene_c)"':''}/>`).join('')+'</g>';
    };
    const burnDraw = index => {
      const paths=burn[(index-104)%burn.length].map(pathData);
      return `<defs><radialGradient id="heat" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="translate(333 301) scale(129 70)"><stop stop-color="#ffb300"/><stop offset="1" stop-color="#ff494e"/></radialGradient><linearGradient id="ember" gradientUnits="userSpaceOnUse" x1="269" y1="274" x2="312" y2="351"><stop stop-color="#ff7920"/><stop offset="1" stop-color="#ffaf00"/></linearGradient><clipPath id="c"><path d="${paths[1]}"/></clipPath></defs>`+
        paths.map((d,i)=>`<path data-layer="${['outer','inner','ember','heart'][i]}" d="${d}" fill="${['#ffd600','url(#heat)','url(#ember)','#fff9f6'][i]}"${i===2?' clip-path="url(#c)"':''}/>`).join('');
    };
    const frames=Array.from({length:168},(_,i)=>({time:Math.round(i/30*1e6)/1e6,
      get paths(){return (this.svg.match(/<path/g)||[]).length;},
      get svg(){return i<104 ? draw(i) : burnDraw(i);}}));
    const result={...data,frames,sampleSVG:draw,motion:{gray:scene.gray,burn,neutral:scene.neutral,fps:30}};
    decoded.set(data,result);
    return result;
  }

  class FlamePlayer extends EventTarget {
    static stages = STAGES;

    constructor(svg, { stage = 'off', motion = 'static', loop = false, speed = 1,
      autoplay = false, data = {} } = {}) {
      super();
      data = unpack(data);
      if (!(svg instanceof SVGSVGElement)) throw new TypeError('FlamePlayer needs an <svg> element.');
      if (!data?.motion) throw new Error('Load the current flame-data.js first.');
      this.svg = svg;
      this.data = data;
      this.namespace = `flame${++serial}_`;
      this.cache = new Map();
      this.playing = false;
      this.destroyed = false;
      this.frame = -1;
      this.time = 0;
      this.raf = 0;
      this.speed = 1;
      this.loop = Boolean(loop);
      this.amount = 0;
      this.velocity = 0;
      this.target = 0;
      this.phase = 0;
      this.omega = 18;
      this.svg.setAttribute('viewBox', `0 0 ${data.width} ${data.height}`);
      this.svg.setAttribute('xmlns', NS);
      this.tick = this.tick.bind(this);
      this.setSpeed(speed);
      this.setStage(stage, { autoplay, motion });
    }

    get state() {
      const steady = this.presentation === 'steady';
      return Object.freeze({
        stage: this.stage, frame: this.frame, time: this.time,
        sourceTime: this.data.sourceStart+this.data.frames[this.frame].time,
        playing: this.playing, loop: this.loop, speed: this.speed,
        presentation: this.presentation, motion: this.target ? 'idle' : 'static',
        motionAmount: this.amount, transitioning: steady && (Math.abs(this.amount-this.target) > .00001 || Math.abs(this.velocity) > .00001),
        detail: steady ? `${STAGES[this.stage].label} · ${this.target ? '微动态' : this.playing ? '平滑停稳中' : '完全静态'}`
          : DETAILS.findLast(([first]) => this.frame >= first)[1],
      });
    }

    emit(type) { this.dispatchEvent(new CustomEvent(type, { detail: this.state })); }
    scoped(markup) { return markup.replaceAll('id="', `id="${this.namespace}`).replaceAll('url(#', `url(#${this.namespace}`); }

    render(index, position = index) {
      if (this.destroyed || (position === this.renderedPosition && index === this.frame && this.svg.firstElementChild?.hasAttribute('data-frame'))) return;
      const interpolating = position !== index && index < 104;
      let group = interpolating ? null : this.cache.get(index);
      if (!group) {
        group = document.createElementNS(NS, 'g');
        group.setAttribute('data-frame', index);
        group.innerHTML = this.scoped(interpolating ? this.data.sampleSVG(position) : this.data.frames[index].svg);
        if (!interpolating) this.cache.set(index, group);
        if (this.cache.size > 8) this.cache.delete(this.cache.keys().next().value);
      }
      this.svg.replaceChildren(group);
      this.renderedPosition = position;
      this.frame = index;
      this.svg.setAttribute('aria-label', `火焰：${this.state.detail}`);
      this.emit('framechange');
    }

    frameAt(time) {
      let low = 0, high = this.data.frames.length-1;
      while (low < high) {
        const middle = Math.ceil((low+high)/2);
        if (this.data.frames[middle].time <= time+1e-7) low = middle;
        else high = middle-1;
      }
      return low;
    }

    setState(state, options = {}) {
      if (state === 'ignite') return this.setStage('ignite', { ...options, autoplay: true });
      if (!STATES[state]) throw new RangeError(`Unknown flame state: ${state}`);
      const [stage, moving] = STATES[state];
      if (stage === this.stage && this.presentation === 'steady') return this.setMotion(moving, options);
      return this.setStage(stage, { ...options, motion: moving ? 'idle' : 'static' });
    }

    setStage(stage, { autoplay = false, loop = this.loop, motion = autoplay ? 'idle' : 'static',
      settle = 'idle' } = {}) {
      if (this.destroyed) return this;
      if (!STAGES[stage]) throw new RangeError(`Unknown stage: ${stage}`);
      if (this.data.idleOnly && !['off','burn'].includes(stage)) throw new Error('This stage requires flame-data.js, not the idle-only bundle.');
      if (!['static', 'idle'].includes(motion) || !['static', 'idle'].includes(settle)) throw new RangeError('Motion must be static or idle.');
      this.pause();
      this.stage = stage;
      this.loop = Boolean(loop);
      this.settle = settle;
      if (stage === 'off' || stage === 'burn') {
        this.mountSteady();
        this.setMotion(autoplay || motion === 'idle');
      } else {
        this.seekFrame(STAGES[stage].first);
        if (autoplay) this.play();
      }
      this.emit('statechange');
      return this;
    }

    mountSteady({ fromIgnition = false } = {}) {
      this.presentation = 'steady';
      this.amount = fromIgnition ? 1 : 0;
      this.velocity = 0;
      this.target = 0;
      this.phase = this.stage === 'burn' && !fromIgnition ? this.data.motion.neutral/30 : 0;
      const group = document.createElementNS(NS, 'g');
      group.setAttribute('data-rig', this.stage);
      if (this.stage === 'off') {
        group.innerHTML = this.data.motion.gray.map(p => `<path data-layer="${p.layer}" fill="${ash(p.fill)}" d="${p.d}"/>`).join('');
        this.grayGeometry = this.data.motion.gray.map(p => ({
          template: p.d.split(/-?\d+(?:\.\d+)?/), values: p.d.match(/-?\d+(?:\.\d+)?/g).map(Number),
        }));
      } else {
        group.innerHTML = this.scoped(`<defs>
          <radialGradient id="heat" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="translate(333 301) scale(129 70)"><stop stop-color="#ffb300"/><stop offset="1" stop-color="#ff494e"/></radialGradient>
          <linearGradient id="ember" gradientUnits="userSpaceOnUse" x1="269" y1="274" x2="312" y2="351"><stop stop-color="#ff7920"/><stop offset="1" stop-color="#ffaf00"/></linearGradient>
          <clipPath id="inner-clip"><path/></clipPath></defs>
          <path data-layer="outer" fill="#ffd600"/><path data-layer="inner" fill="url(#heat)"/>
          <path data-layer="ember" fill="url(#ember)" clip-path="url(#inner-clip)"/>
          <path data-layer="heart" fill="#fff9f6"/>
          <g data-sparks=""><path fill="#ff961a" d="M0 -11Q8 -11 8 0Q6 11 0 11Q-8 9 -8 0Q-8 -11 0 -11Z"/>
          <path fill="#f65338" d="M0 -10Q3 -11 6 -5L9 0L2 10L-8 3Z"/>
          <path fill="#ffb300" d="M0 -9Q7 -9 7 0Q5 9 0 9Q-7 7 -7 0Q-7 -9 0 -9Z"/></g>`);
      }
      this.svg.replaceChildren(group);
      this.rigPaths = [...group.querySelectorAll('path[data-layer]')];
      this.clip = group.querySelector('clipPath path');
      this.sparks = [...group.querySelectorAll('[data-sparks] path')];
      this.renderSteady();
    }

    renderSteady() {
      if (this.stage === 'off') {
        this.grayGeometry.forEach(({ template, values }, j) => {
          let d = template[0];
          for (let i = 0; i < values.length; i += 2) {
            const [x, y] = values.slice(i, i+2);
            const [dx,dy] = grayDisplacement(x,y,this.phase,this.amount);
            d += `${num(x+dx)}${template[i+1]}${num(y+dy)}${template[i+2]}`;
          }
          this.rigPaths[j].setAttribute('d', d);
        });
        this.frame = 18;
      } else {
        const frames = this.data.motion.burn;
        const sample = this.phase*this.data.motion.fps;
        const index = Math.floor(sample);
        const pose = burnPose(frames, sample);
        const neutral = frames[this.data.motion.neutral];
        this.rigPaths.forEach((path, layer) => {
          // Ease in the amplitude lift without disturbing the ignition handoff.
          const gain = 1 + .12 * Math.min(1, this.phase / .4);
          const values = pose[layer].map((v, j) => mix(neutral[layer][j], v, this.amount * gain));
          const geometry = pathData(values);
          path.setAttribute('d', geometry);
          if (layer === 1) this.clip.setAttribute('d', geometry);
        });
        this.sparks.forEach((spark, i) => {
          const life = (this.phase/1.5+i/3)%1;
          // Clear the silhouette before fading; pale, half-hidden specks vanish at masthead scale.
          const fadeIn = Math.min(1, life/.14);
          const fadeOut = Math.min(1, (1-life)/.28);
          const opacity = fadeIn*fadeIn*(3-2*fadeIn)*fadeOut*fadeOut*(3-2*fadeOut)*this.amount;
          const x = 249+i*33+14*Math.sin(life*4+i);
          const y = 153-life*90;
          spark.setAttribute('opacity', num(opacity));
          spark.setAttribute('transform', `translate(${num(x)} ${num(y)}) rotate(${num(life*55)}) scale(${num(1.15-life*.35)})`);
        });
        this.frame = this.amount === 0 ? 104+this.data.motion.neutral : 104+Math.min(63, index%frames.length);
      }
      this.time = this.data.frames[this.frame].time;
      this.svg.setAttribute('aria-label', `火焰：${this.state.detail}`);
      this.emit('framechange');
    }

    setMotion(enabled, { duration = 850 } = {}) {
      if (typeof enabled !== 'boolean') throw new TypeError('Motion requires a boolean.');
      if (!Number.isFinite(duration) || duration < 0) throw new RangeError('Duration must be nonnegative milliseconds.');
      if (!['off', 'burn'].includes(this.stage)) throw new Error('Motion applies to off/burn only.');
      if (this.destroyed) return this;
      if (this.presentation !== 'steady') { this.pause(); this.mountSteady(); }
      // Retarget without resetting geometry, phase or velocity, even mid-transition.
      this.target = Number(enabled);
      this.omega = 16/(Math.max(1, duration)/1000);
      if (duration === 0) { this.amount = this.target; this.velocity = 0; this.renderSteady(); }
      cancelAnimationFrame(this.raf);
      this.playing = enabled || Math.abs(this.amount-this.target) > .00001 || Math.abs(this.velocity) > .00001;
      this.lastClock = performance.now();
      if (this.playing) this.raf = requestAnimationFrame(this.tick);
      this.emit('statechange');
      return this;
    }

    seek(time) {
      if (this.destroyed) return this;
      if (this.data.idleOnly) throw new Error('Timeline inspection requires flame-data.js.');
      if (!Number.isFinite(time)) throw new TypeError('Time must be finite.');
      if (this.presentation === 'steady') this.pause();
      this.presentation = 'timeline';
      this.time = Math.min(Math.max(time, 0), this.data.duration);
      this.render(this.frameAt(this.time));
      this.anchorTime = this.time;
      this.anchorClock = performance.now();
      this.emit('statechange');
      return this;
    }
    seekFrame(index) {
      if (!Number.isInteger(index)) throw new TypeError('Frame must be an integer.');
      return this.seek(this.data.frames[Math.min(Math.max(index, 0), this.data.frames.length-1)].time);
    }
    step(delta = 1) {
      if (!Number.isInteger(delta)) throw new TypeError('Step must be an integer.');
      this.pause();
      return this.seekFrame(this.frame+delta);
    }
    setSpeed(speed) {
      if (!Number.isFinite(speed) || speed <= 0) throw new RangeError('Speed must be positive.');
      this.anchorTime = this.time;
      this.anchorClock = performance.now();
      this.speed = speed;
      if (this.frame >= 0) this.emit('statechange');
      return this;
    }
    setLoop(loop) { this.loop = Boolean(loop); this.emit('statechange'); return this; }

    play() {
      if (this.destroyed || this.playing) return this;
      if (this.presentation === 'steady') return this.setMotion(true);
      const { first, last } = STAGES[this.stage];
      if (this.frame < first || this.frame >= last) this.seekFrame(first);
      this.playing = true;
      this.anchorTime = this.time;
      this.anchorClock = performance.now();
      this.raf = requestAnimationFrame(this.tick);
      this.emit('statechange');
      return this;
    }
    pause() {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.playing = false;
      if (this.frame >= 0) this.emit('statechange');
      return this;
    }

    tick(now) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      if (!this.playing || this.destroyed) return;
      if (this.presentation === 'steady') {
        const dt = Math.max(0, Math.min(.05, (now-this.lastClock)/1000));
        this.lastClock = now;
        this.phase += dt*this.speed;
        // Exact critically damped spring: position and velocity survive reversals.
        const displacement = this.amount-this.target;
        const impulse = this.velocity+this.omega*displacement;
        const decay = Math.exp(-this.omega*dt);
        this.amount = this.target+(displacement+impulse*dt)*decay;
        this.velocity = (this.velocity-this.omega*impulse*dt)*decay;
        if (Math.abs(this.amount-this.target) < .00001 && Math.abs(this.velocity) < .00001) {
          this.amount = this.target;
          this.velocity = 0;
          if (!this.target) this.playing = false;
        }
        this.renderSteady();
        if (this.playing) this.raf = requestAnimationFrame(this.tick);
        else { this.emit('statechange'); this.emit('settled'); }
        return;
      }
      const stage = this.stage;
      const { first, last } = STAGES[stage];
      const start = this.data.frames[first].time;
      const end = this.data.frames[last+1]?.time ?? this.data.duration;
      let time = this.anchorTime+(now-this.anchorClock)/1000*this.speed;
      if (time >= end) {
        if (!this.loop) {
          this.time = this.data.frames[last].time;
          this.render(last);
          this.pause();
          this.emit('ended');
          if (stage === 'ignite' && this.stage === stage && !this.destroyed) {
            this.stage = 'burn';
            this.mountSteady({ fromIgnition: true });
            this.setMotion(this.settle === 'idle');
          }
          return;
        }
        time = start+(time-start)%(end-start);
        this.anchorTime = time;
        this.anchorClock = now;
      }
      this.time = time;
      const index = Math.min(last, Math.max(first, this.frameAt(time)));
      this.render(index, index < 104 ? Math.min(last, time*30) : index);
      this.raf = requestAnimationFrame(this.tick);
    }

    exportSVG() {
      const clone = this.svg.cloneNode(true);
      for (const name of ['id', 'class', 'style']) clone.removeAttribute(name);
      clone.setAttribute('width', this.data.width);
      clone.setAttribute('height', this.data.height);
      return new XMLSerializer().serializeToString(clone);
    }
    destroy() {
      this.pause();
      this.destroyed = true;
      this.cache.clear();
      this.svg.replaceChildren();
    }
  }
export { FlamePlayer };
