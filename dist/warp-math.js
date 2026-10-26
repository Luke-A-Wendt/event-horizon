/* Alcubierre field notes: native MathML and original SVG; no runtime services. */
const v=s=>`<mi>${s}</mi>`,n=s=>`<mn>${s}</mn>`,o=s=>`<mo>${s}</mo>`,t=s=>`<mtext>${s}</mtext>`;
const r=(...parts)=>`<mrow>${parts.join('')}</mrow>`;
const sub=(a,b)=>`<msub>${a}${b}</msub>`,pow=(a,b)=>`<msup>${a}${b}</msup>`;
const frac=(a,b)=>`<mfrac>${a}${b}</mfrac>`,sqrt=a=>`<msqrt><mrow>${a}</mrow></msqrt>`;
const sq=a=>pow(a,n(2)),d=a=>r(v('d'),a),partial=(a,b)=>frac(r(o('∂'),a),r(o('∂'),b));
const bold=s=>`<mi mathvariant="bold">${s}</mi>`,hat=s=>`<mover>${bold(s)}<mo>^</mo></mover>`;
const par=a=>r('<mo stretchy="true">(</mo>',r(a),'<mo stretchy="true">)</mo>');
const bracket=a=>r('<mo stretchy="true">[</mo>',r(a),'<mo stretchy="true">]</mo>');
const norm=a=>r('<mo stretchy="true">∥</mo>',r(a),'<mo stretchy="true">∥</mo>');
const fn=(name,a)=>r(`<mi mathvariant="normal">${name}</mi>`,o('&#x2061;'),par(a));
const eq=(body,label)=>`<div class="warp-equation" aria-label="${label}"><math xmlns="http://www.w3.org/1998/Math/MathML" display="block">${body}</math></div>`;
const rows=(...lines)=>`<mtable columnalign="left" rowspacing=".7em">${lines.map(line=>`<mtr><mtd>${line}</mtd></mtr>`).join('')}</mtable>`;
const link=(url,label)=>`<a href="${url}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`;
const section=(id,title,body,open=false)=>`<details class="warp-section" id="warp-guide-${id}"${open?' open':''}><summary><span>${title}</span><span aria-hidden="true">＋</span></summary><div class="warp-section-body">${body}</div></details>`;
const x=v('x'),y=v('y'),z=v('z'),time=v('t'),c=v('c'),G=v('G'),R=v('R'),sigma=v('σ'),f=v('f'),xi=v('ξ'),rs=sub(v('r'),v('s')),xs=sub(x,v('s')),vs=sub(v('v'),v('s')),beta=sub(v('β'),v('s')),theta=v('Θ');
const shape=(u,k)=>(Math.tanh(k*(u+1))-Math.tanh(k*(u-1)))/(2*Math.tanh(k));
const derivative=(u,k)=>k*((1-Math.tanh(k*(u+1))**2)-(1-Math.tanh(k*(u-1))**2))/(2*Math.tanh(k));
function bubbleDiagram(k=4){
 const point=(u,value,baseline,height)=>[360+u*139,baseline-value*height];
 const curve=(value,baseline,height)=>Array.from({length:241},(_,i)=>{const u=-2.1+i*4.2/240,[px,py]=point(u,value(u),baseline,height);return `${i?'L':'M'}${px.toFixed(2)} ${py.toFixed(2)}`;}).join(' ');
 const fpath=curve(u=>shape(Math.abs(u),k),145,74);
 const expansion=u=>{const rr=Math.sqrt(u*u+.16);return u/rr*derivative(rr,k)/Math.max(k,1);};
 const epath=curve(expansion,278,72);
 const fill=(lo,hi)=>{const a=[];for(let i=0;i<=100;i++){const u=lo+(hi-lo)*i/100,[px,py]=point(u,expansion(u),278,72);a.push(`${i?'L':'M'}${px.toFixed(2)} ${py.toFixed(2)}`);}return `${a.join(' ')} L${point(hi,0,278,72).join(' ')} L${point(lo,0,278,72).join(' ')} Z`;};
 return `<svg class="warp-diagram" font-family="system-ui, sans-serif" viewBox="0 0 720 345" role="img" aria-labelledby="warp-profile-title warp-profile-desc"><title id="warp-profile-title">Alcubierre shape and volume expansion profiles</title><desc id="warp-profile-desc">The shape function is one at the ship and tends to zero outside the bubble. For motion to the right, the volume expansion is positive behind the ship and negative ahead. The lower curve samples a line offset by 0.4 bubble radii from the axis.</desc>
 <rect x="221" y="40" width="278" height="273" fill="#75b8ec" fill-opacity=".032"/>
 <path d="M68 145H658M68 278H658M221 40V313M499 40V313" stroke="#29384a" stroke-dasharray="4 5" fill="none"/>
 <path d="M360 40V313" stroke="#3e5269" stroke-dasharray="3 5"/>
 <text x="35" y="34" fill="#eaf4ff" font-size="14">Shape function f</text><text x="35" y="210" fill="#eaf4ff" font-size="14">Volume expansion Θ</text>
 <text x="69" y="76" fill="#8fa5bc" font-size="11">1</text><text x="69" y="140" fill="#8fa5bc" font-size="11">0</text>
 <path d="${fpath}" stroke="#a9d2ff" stroke-width="2.4" fill="none"/>
 <path d="${fill(-2.1,0)}" fill="#ffbb6e" fill-opacity=".21"/><path d="${fill(0,2.1)}" fill="#7ed8ff" fill-opacity=".21"/><path d="${epath}" stroke="#d2e8fa" stroke-width="1.5" fill="none"/>
 <text x="161" y="241" fill="#ffc583" font-size="12">Expansion · behind</text><text x="455" y="247" fill="#8cddfa" font-size="12">Contraction · ahead</text>
 <text x="273" y="58" fill="#a6b9ca" font-size="11">Nearly uniform interior</text><text x="493" y="34" fill="#8fa5bc" font-size="11">Wall sharpness σR = ${k.toFixed(1)}</text>
 <path d="M327 172H391m-9-5 9 5-9 5" stroke="#e5bd81" stroke-width="1.4" fill="none"/><text x="307" y="191" fill="#e5bd81" font-size="11">Ship motion +x</text>
 <text x="221" y="332" fill="#8fa5bc" font-size="11" text-anchor="middle">−R</text><text x="360" y="332" fill="#c6d8e9" font-size="11" text-anchor="middle">Ship · ξ = 0</text><text x="499" y="332" fill="#8fa5bc" font-size="11" text-anchor="middle">+R</text><text x="639" y="332" fill="#8fa5bc" font-size="11">ξ / R</text></svg>`;
}
function warpScaleDiagram(){
 const px=w=>72+w*56,py=speed=>270-Math.log10(Math.max(1,speed))*59;
 const path=Array.from({length:161},(_,i)=>{const w=1+i*8/160;return `${i?'L':'M'}${px(w).toFixed(2)} ${py(w**(10/3)).toFixed(2)}`;}).join(' ');
 const ticks=[1,10,100,1000].map(speed=>`<path d="M72 ${py(speed)}H632" stroke="#263343"/><text x="60" y="${py(speed)+4}" fill="#8fa5bc" text-anchor="end" font-size="11">${speed.toLocaleString('en-US')}c</text>`).join('');
 const dots=Array.from({length:9},(_,i)=>i+1).map(w=>`<circle cx="${px(w)}" cy="${py(w**(10/3))}" r="3" fill="#a9d2ff"/><text x="${px(w)}" y="291" fill="#a8bbce" text-anchor="middle" font-size="11">${w}</text>`).join('');
 return `<svg class="warp-diagram" font-family="system-ui, sans-serif" viewBox="0 0 720 340" role="img" aria-labelledby="warp-scale-title warp-scale-desc"><title id="warp-scale-title">TNG reference warp factor scale</title><desc id="warp-scale-desc">The blue curve gives factor to the power ten thirds from warp one through nine on a logarithmic speed axis. The interval above nine is deliberately not assigned a unique formula. Warp ten is labelled infinite velocity, not a finite simulated speed.</desc>
 ${ticks}<rect x="576" y="45" width="56" height="225" fill="#d9a96b" fill-opacity=".075"/><path d="M72 45V270H643" stroke="#61788f" fill="none"/>
 <path d="${path}" stroke="#a9d2ff" stroke-width="2.5" fill="none"/>${dots}
 <path d="M632 270V37m-5 8 5-8 5 8" stroke="#e3b578" stroke-width="1.5" stroke-dasharray="4 4" fill="none"/>
 <text x="632" y="291" fill="#e3b578" font-size="11" text-anchor="middle">10</text><text x="635" y="27" fill="#f0cd98" font-size="20" text-anchor="middle">∞</text>
 <text x="81" y="29" fill="#dbeafb" font-size="13">Nominal TNG reference convention</text><text x="93" y="91" fill="#90a7be" font-size="12">v / c = W^(10/3), 1 ≤ W ≤ 9</text>
 <path d="M512 54H604V119" stroke="#a78c6d" fill="none"/><text x="356" y="49" fill="#e3b578" font-size="11">Above 9: no unique canonical formula</text>
 <text x="310" y="320" fill="#9cb2c8" font-size="12">Warp factor W · speed axis is logarithmic</text></svg>`;
}
export function renderWarpGuide(container){
 const dxi=frac(d(xi),d(time)),df=frac(d(f),d(rs));
 const q=bold('q'),nhat=hat('n'),dhat=hat('d'),ehat=hat('e'),kappa=sub(v('κ'),t('lens')),mu=v('μ'),dot=o('·');
 const flightK=v('κ'),flightTau=v('τ'),flightOmega=v('ω'),arc=v('s');
 const phase=r(flightOmega,arc),sinPhase=fn('sin',phase),cosPhase=fn('cos',phase);
 const omegaSquared=sq(flightOmega);
 const aT=r(frac(r(sq(flightTau),arc),omegaSquared),o('+'),frac(r(sq(flightK),sinPhase),pow(flightOmega,n(3))));
 const aN=frac(r(flightK,par(r(n(1),o('−'),cosPhase))),omegaSquared);
 const aB=frac(r(flightK,flightTau,par(r(arc,o('−'),frac(sinPhase,flightOmega)))),omegaSquared);
 const helixRows=rows(
  r(flightOmega,o('='),sqrt(r(sq(flightK),o('+'),sq(flightTau)))),
  r(sub(v('A'),v('T')),o('='),aT),
  r(sub(v('A'),v('N')),o('='),aN),
  r(sub(v('A'),v('B')),o('='),aB),
  r(bold('Δx'),par(arc),o('='),sub(v('A'),v('T')),bold('T'),o('+'),sub(v('A'),v('N')),bold('N'),o('+'),sub(v('A'),v('B')),bold('B'))
 );
 const vectorComponents=rows(
  r(sub(v('g'),r(time,time)),o('='),o('−'),sq(c),o('+'),sq(f),sq(v('v'))),
  r(sub(v('g'),r(time,v('i'))),o('='),o('−'),f,sub(v('v'),v('i')),o(','),sub(v('g'),r(v('i'),v('j'))),o('='),sub(v('δ'),r(v('i'),v('j')))),
  r(theta,o('='),sub(bold('v'),v('s')),dot,bold('∇f'),o('='),v('v'),frac(r(bold('T'),dot,par(r(bold('x'),o('−'),sub(bold('x'),v('s'))))),rs),df)
 );
 const localShift=bracket(r(par(r(n(1),o('−'),f)),v('v'),sub(bold('e'),n(1)),o('+'),bold('ω'),o('×'),bold('ξ')));
 const movingFrameMetric=rows(
  r(bold('x'),o('='),sub(bold('x'),v('s')),par(time),o('+'),bold('Q'),par(time),bold('ξ')),
  r(bold('Ω'),o('='),v('v'),par(r(v('τ'),bold('T'),o('+'),v('κ'),bold('B')))),
  r(sq(d(v('s'))),o('='),o('−'),sq(c),sq(d(time)),o('+'),sq(norm(r(d(bold('ξ')),o('+'),localShift,d(time))))),
  r(bold('ω'),o('='),pow(bold('Q'),v('T')),bold('Ω'))
 );
 const controlRateEquations=rows(
  r(frac(d(v('W')),d(time)),o('='),n('.45'),sub(v('u'),v('W'))),
  r(frac(d(v('κ')),d(time)),o('='),frac(r(n('.08'),sub(v('u'),v('κ'))),sub(v('v'),t('scale')))),
  r(frac(d(v('τ')),d(time)),o('='),frac(r(n('.06'),sub(v('u'),v('τ'))),sub(v('v'),t('scale')))),
  r(sub(v('v'),t('scale')),o('='),fn('max',r(v('v'),o(','),c)),t(' for the Enterprise'))
 );
 const transverse=a=>par(r(a,o('−'),par(r(a,dot,dhat)),dhat));
 const radialOffset=par(r(v('r'),o('−'),n(1)));
 const gridEnvelope=fn('exp',r(o('−'),sq(par(r(n('.70'),v('S'),radialOffset)))));
 const gridFade=bracket(r(n(1),o('−'),fn('smoothstep',r(n(2),o(','),n('2.5'),o(','),v('r')))));
 const gridHeight=fn('h',r(v('X'),o(','),v('Z')));
 const sheetEquations=rows(
  r(v('r'),o('='),sqrt(r(sq(v('X')),o('+'),sq(v('Z'))))),
  r(gridHeight,o('='),o('−'),n('.34'),kappa,v('X'),gridEnvelope,gridFade),
  r(v('Y'),o('='),o('−'),n('.35'),o('+'),gridHeight),
  r(pow(v('X'),o('′')),o('='),v('X'),o('+'),n('.20'),kappa,v('X'),fn('f',v('r')))
 );
 const values=Array.from({length:9},(_,i)=>i+1).map(w=>`<tr><td>${w}</td><td>${(w**(10/3)).toLocaleString('en-US',{maximumFractionDigits:2})}c</td><td>${(w**3).toLocaleString('en-US')}c</td></tr>`).join('');
 container.innerHTML=`<article class="warp-guide">
 <style>
 .warp-guide{color:#a8b9ca;font-size:13px;line-height:1.75}.warp-guide *{box-sizing:border-box}.warp-guide p{margin:12px 0}.warp-guide strong,.warp-guide h3{color:#e9f4ff}.warp-guide h3{font-size:15px;font-weight:500;margin:24px 0 10px}.warp-guide a{color:#a9d2ff;text-decoration:none}.warp-guide a:hover{text-decoration:underline}.warp-guide .warp-intro{border-bottom:1px solid #28374a;padding-bottom:20px}.warp-guide .warp-kicker{color:#9dc5f2;font-size:9px;letter-spacing:2px;text-transform:uppercase}.warp-guide .warp-section{border:1px solid #293849;background:#080c12;border-radius:7px;margin:14px 0}.warp-guide .warp-section>summary{cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:15px;list-style:none;padding:18px;color:#e7f2fc;font-size:14px}.warp-guide summary::-webkit-details-marker{display:none}.warp-guide .warp-section>summary:after{display:none}.warp-guide summary>span:last-child{color:#a9d2ff}.warp-guide details[open]>summary>span:last-child{transform:rotate(45deg)}.warp-guide summary:focus-visible{outline:2px solid #a9d2ff;outline-offset:3px}.warp-guide .warp-section-body{padding:0 18px 20px}.warp-guide .warp-equation{padding:19px 14px;background:#000;color:#fff;border:1px solid #233141;border-radius:6px;margin:17px 0;overflow-x:auto;overflow-y:hidden}.warp-guide math{color:#fff;font-size:18px;min-width:max-content;font-family:"STIX Two Math","Cambria Math",math}.warp-guide .warp-note{background:#101d2b;border-left:2px solid #91bce6;padding:13px 15px;margin:17px 0;font-size:12px}.warp-guide .warp-lore{border-left-color:#ddb278;background:#211b13}.warp-guide .warp-diagram{display:block;width:100%;height:auto;min-width:540px;background:#020509;border:1px solid #29384a;border-radius:7px;font-family:system-ui,sans-serif}.warp-guide .warp-figure-scroll,.warp-guide .warp-table-scroll{overflow-x:auto}.warp-guide figure{margin:18px 0}.warp-guide figcaption,.warp-guide .warp-small{font-size:11px;color:#91a7bc;line-height:1.7;margin:9px 0}.warp-guide table{border-collapse:collapse;width:100%;min-width:330px;font-size:12px}.warp-guide th,.warp-guide td{border:1px solid #29384a;text-align:left;padding:9px 11px}.warp-guide th{color:#e3eff9;font-weight:500;background:#101923}.warp-guide .warp-control{display:flex;align-items:center;gap:12px;font-size:12px;margin:15px 0}.warp-guide input[type=range]{min-width:70px;flex:1;accent-color:#a9d2ff}.warp-guide output{color:#e4f1fd;min-width:42px;font-variant-numeric:tabular-nums}.warp-guide .warp-sources{padding-left:19px;display:grid;gap:9px;font-size:12px}@media(max-width:600px){.warp-guide .warp-section-body{padding:0 12px 16px}.warp-guide .warp-section>summary{padding:16px 12px;font-size:13px}.warp-guide math{font-size:16px}.warp-guide .warp-equation{padding:17px 11px}.warp-guide .warp-control{font-size:11px;gap:8px}}
 </style>
 <div class="warp-intro"><span class="warp-kicker">The warp field · physics and fiction</span><p><strong>Alcubierre geometry and Star Trek warp factors are different models.</strong> One is a prescribed spacetime in general relativity; the other is a fictional speed scale. This explorer connects them visually, with finite controls and explicitly illustrative lensing.</p><p class="warp-small">Conventions: metric signature (−,+,+,+); x, y, z, R in metres; t in seconds; v<sub>s</sub> in m/s; β<sub>s</sub> = v<sub>s</sub>/c. The ship moves along +x in the equations. The live scene rotates this axis with the ship.</p></div>
 ${section('metric','01 · The Alcubierre metric',`
 ${eq(r(sq(d(v('s'))),o('='),o('−'),sq(c),sq(d(time)),o('+'),sq(bracket(r(d(x),o('−'),vs,fn('f',rs),d(time)))),o('+'),sq(d(y)),o('+'),sq(d(z))),'Alcubierre metric with explicit speed of light')}
 ${eq(rows(r(xi,o('='),x,o('−'),r(xs,o('&#x2061;'),par(time)),o(','),rs,o('='),sqrt(r(sq(xi),o('+'),sq(y),o('+'),sq(z)))),r(vs,o('='),frac(d(xs),d(time)),o(','),beta,o('='),frac(vs,c))),'Bubble position, radius, and speed')}
 <p>The prescribed center x<sub>s</sub>(t) carries the ship. Far away f tends to zero, recovering Minkowski spacetime. At the center f = 1 and dx = v<sub>s</sub>dt, giving dτ = dt for this idealized metric. Local light still travels at c; a large coordinate speed is not local motion through a light cone.</p>
 <p class="warp-small">Source: ${link('https://arxiv.org/abs/gr-qc/0009013','Alcubierre (1994), original metric')}.</p>`,true)}
 ${section('shape','02 · Bubble wall, expansion, and the grid',`
 ${eq(r(fn('f',rs),o('='),frac(r(fn('tanh',r(sigma,par(r(rs,o('+'),R)))),o('−'),fn('tanh',r(sigma,par(r(rs,o('−'),R))))),r(n(2),fn('tanh',r(sigma,R))))),'Normalized Alcubierre shape function')}
 ${eq(r(theta,o('='),vs,partial(f,x),o('='),vs,frac(xi,rs),df,o(','),sub(v('ℓ'),t('wall')),o('∼'),frac(n(1),sigma)),'Eulerian volume expansion and wall thickness')}
 <p>R sets the bubble radius; σ controls wall sharpness. At fixed R, increasing σ narrows the wall. For positive v<sub>s</sub>, f′ is negative through the wall: Θ is positive behind the ship and negative ahead.</p>
 <label class="warp-control" for="warpMathSharpness">Wall sharpness σR <input id="warpMathSharpness" type="range" min="1" max="10" step=".1" value="4"><output id="warpMathSharpnessValue" for="warpMathSharpness">4.0</output></label>
 <figure><div class="warp-figure-scroll" id="warpProfileDiagram">${bubbleDiagram()}</div><figcaption>Top: the exact shape function along the axis. Bottom: ΘR/v<sub>s</sub>, divided by σR for display, on a line 0.4R off-axis. Orange is expansion, blue is contraction; the vertical axis is not a spatial height.</figcaption></figure>
 <div class="warp-note">The constant-t spatial metric is γ<sub>ij</sub> = δ<sub>ij</sub>: these slices are intrinsically flat. Curvature resides in how slices fit together through the varying shift. The mesh marks a reference chart sampled along bent rays; its raised and lowered shape illustrates the shift rather than spatial curvature. Neither is a literal spatial embedding or a solid bubble wall.</div>`)}
 ${section('light','03 · Light cones, lensing, and horizons',`
 ${eq(rows(r(frac(d(x),d(time)),o('='),vs,fn('f',rs),o('±'),c),r(dxi,o('='),o('±'),c,o('−'),vs,par(r(n(1),o('−'),fn('f',rs))))),'Axial null rays in fixed and comoving coordinates')}
 ${eq(r(fn('f',sub(rs,v('H'))),o('='),n(1),o('−'),frac(c,vs),o(','),vs,o('>'),c),'Axial forward-ray horizon condition for a constant superluminal bubble')}
 <p>For a constant superluminal bubble, a forward-directed light ray can become stationary relative to its center. This is a causal horizon, not a material shell. It prevents a crew at the center from freely controlling the entire forward wall on demand.</p>
 ${eq(rows(r(frac(r(sq(v('d')),pow(x,v('μ'))),r(v('d'),sq(v('λ')))),o('+'),'<msubsup><mi>Γ</mi><mrow><mi>α</mi><mi>β</mi></mrow><mi>μ</mi></msubsup>',frac(d(pow(x,v('α'))),d(v('λ'))),frac(d(pow(x,v('β'))),d(v('λ'))),o('='),n(0)),r(sub(v('g'),r(v('μ'),v('ν'))),pow(v('k'),v('μ')),pow(v('k'),v('ν')),o('='),n(0))),'Null geodesic equation and null constraint')}
 <p>Accurate images require integrating null geodesics through the time-dependent metric and evaluating photons in the observer’s local frame. Deflection, magnification, aberration, and frequency shifts depend on that frame and the complete ray history. A glowing outline or spatial grid is a visualization aid, not a predicted visible surface.</p>
 <p class="warp-small">Studies: ${link('https://arxiv.org/abs/gr-qc/9907019','Clark, Hiscock & Larson: view from the bridge')}; ${link('https://arxiv.org/abs/1107.5650','Müller & Weiskopf: geodesics and optical effects')}.</p>`)}
 ${section('energy','04 · Stress–energy, not an engine blueprint',`
 ${eq(r(sub(v('ε'),t('Eulerian')),o('='),o('−'),frac(r(pow(c,n(4)),sq(beta)),r(n(32),v('π'),G)),frac(r(sq(y),o('+'),sq(z)),sq(rs)),sq(par(df))),'Eulerian energy density in SI units')}
 ${eq(r(sub(v('E'),t('wall')),o('='),o('−'),frac(r(pow(c,n(4)),sq(beta)),r(n(12),G)),'<msubsup><mo>∫</mo><mn>0</mn><mo>∞</mo></msubsup>',sq(rs),sq(par(df)),d(rs)),'Spatial integral of Eulerian negative energy density')}
 <p>ε is measured in J/m³ and is negative through much of the original bubble wall. The spatial integral is an energy-density diagnostic, not the total ADM mass. In the thin-wall limit its magnitude scales roughly as β<sub>s</sub>²R²σ: faster motion, a larger bubble, or a thinner wall is more demanding.</p>
 <div class="warp-note">Writing down a metric specifies the stress–energy it would require; it does not demonstrate how to create or sustain it. Negative-energy requirements, quantum constraints, causal control, and stability remain unresolved for this superluminal construction. Dilithium and antimatter reactors in Star Trek do not supply a physical derivation of the required stress–energy.</div>
 <p class="warp-small">Review: ${link('https://arxiv.org/abs/2103.05610','Alcubierre & Lobo (2021), Warp drive basics')}.</p>`)}
 ${section('lore','05 · What a Star Trek warp factor means',`
 <p>The explorer uses a <strong>TNG-style 0–10 dial</strong>, even when the ship is the classic Constitution-class Enterprise. This is a deliberate crossover. A factor is a fictional scale label, not an SI speed or a universal parameter of the Alcubierre metric.</p>
 ${eq(rows(r(frac(v('v'),c),o('≈'),pow(v('W'),frac(n(10),n(3))),o(','),n(1),o('≤'),v('W'),o('≤'),n(9),t('  (TNG reference convention)')),r(frac(v('v'),c),o('≈'),pow(v('W'),n(3)),t('  (legacy cubic comparison)'))),'TNG nominal and legacy cubic warp-factor conventions')}
 <figure><div class="warp-figure-scroll">${warpScaleDiagram()}</div><figcaption>Blue values are calculated from the nominal exponent, not measured travel speeds. The shaded 9–10 interval is intentionally left without a unique conversion curve. Warp zero removes the shift and optical deflection. An enabled faint bubble boundary is only a radius guide.</figcaption></figure>
 <div class="warp-table-scroll"><table><thead><tr><th>Factor W</th><th>TNG nominal speed</th><th>Legacy cubic speed</th></tr></thead><tbody><tr><td>0</td><td>Field off</td><td>Field off</td></tr>${values}<tr><td>9 &lt; W &lt; 10</td><td>No unique canonical formula</td><td>Different historical scale</td></tr><tr><td>10</td><td>∞ · theoretical limit</td><td>1,000c in the cubic convention</td></tr></tbody></table></div>
 <p>Michael Okuda’s first-person account describes an exponent near 3⅓ below 9 and a hand-drawn, steepening curve between 9 and 10. Licensed manuals supply reference values, but screen dialogue, journey times, eras, and exceptional technologies do not form a single exact conversion law. The classic cubic comparison is a reference-book convention, not a universal on-screen rule.</p>
 <p>In <em>Voyager</em>’s “Threshold,” warp 10 is explicitly treated as infinite velocity, with extraordinary fictional consequences. It is not an ordinary next cruise setting. The power peaks in the familiar Trek speed-and-power chart represent fictional warp-field transition thresholds; they cannot be converted into the energy density above or used as validated engineering power requirements.</p>
 <div class="warp-note warp-lore">At W = 10 the readout shows the theoretical limit. The live field stays finite so rendering remains well-defined. Above W = 9, any continuous visual ramp is an artistic interpolation, not a newly discovered canonical warp formula. Automatic scene cruises use a slow display trajectory; manual Drive uses the displayed finite SI speed.</div>
 <p class="warp-small">Evidence: ${link('https://www.simonandschuster.com/books/Technical-Manual/Rick-Sternbach/Star-Trek-The-Next-Generation/9780671704278','Sternbach & Okuda, licensed TNG Technical Manual')}; ${link('https://www.calormen.com/star_trek/FAQs/warp_velocities-faq.htm','archived Okuda correspondence (1995), reproduced in Warp Velocities FAQ')}; ${link('https://www.startrek.com/news/threshold-reaching-for-success-with-star-trek','official StarTrek.com discussion of Threshold')}.</p>`)}
 ${section('flight','06 · Planar flight controls',`
 <p>W / S raises or lowers speed; for the Enterprise it changes warp factor at 0.45 per simulation second. A / D raises or lowers signed angular velocity at 0.16 rad/s², limited to ±0.65 rad/s. Releasing a key holds its value. Touch buttons use the same controls. The flight plane is fixed when taking control; there is no torsion input. Stop motion smoothly brakes both forward motion and turning while keeping Drive active.</p>
 ${eq(rows(r(frac(d(bold('x')),d(time)),o('='),v('v'),bold('T')),r(frac(d(bold('T')),d(time)),o('='),v('ω'),bold('N')),r(frac(d(bold('N')),d(time)),o('='),o('−'),v('ω'),bold('T'))),'Planar position and heading equations')}
 <p>The readout shows warp factor and coordinate speed as a multiple of c. Below warp nine the reference scale uses W^(10/3); above nine a bounded interpolation is a simulation choice. Warp ten remains the fictional infinite-speed limit. The bubble radius grows automatically with warp factor while the ship keeps its physical dimensions. The display radius and increasing wall sharpness are visual cues, not consequences of the Alcubierre metric or universal Star Trek canon rules.</p>
 ${eq(r(frac(R,sub(R,t('ship'))),o('='),n('2.4'),o('+'),n('.18'),v('W'),o('+'),n('.025'),sq(v('W')),o(','),n(0),o('≤'),v('W'),o('≤'),n(10)),'Automatic illustrative bubble radius in ship bounding radii')}
 <p>R<sub>ship</sub> is the ship model’s fixed bounding radius. Thus the bubble grows from 2.4 ship radii at W = 0 to 6.7 at W = 10. Warp zero removes optical force and field emission; its radius still defines the reference chart. The field center remains attached to the ship.</p>
 ${eq(rows(r(sq(d(v('s'))),o('='),o('−'),sq(c),sq(d(time)),o('+'),sq(norm(r(d(bold('x')),o('−'),sub(bold('v'),v('s')),par(time),fn('f',rs),d(time)))))),'Alcubierre vector-shift metric for the prescribed planar path')}
 <p>The spherical profile f stays centered on the ship and its shift points along the instantaneous heading. With zero turn rate this reduces to the original straight-line metric. The raised and lowered grid is the restored illustrative contraction/expansion diagram; constant-time spatial slices of this metric are flat. Our ray effect is an optical approximation, not a full time-dependent null-geodesic solution.</p>`)}
 ${section('implementation','07 · What the live scenes demonstrate',`
 <h3>The implemented compact lens</h3>
 <p>The renderer works in bubble-radius coordinates q = (x − x<sub>s</sub>)/R. Let r = |q|, n̂ = q/r, d̂ be the ray direction, ê the travel axis, and μ = n̂·ê. The shape f uses unit radius and dimensionless sharpness S = σR.</p>
 ${eq(rows(r(kappa,o('='),fn('min',r(n(3),o(','),n('.3'),v('W'))),o(','),mu,o('='),nhat,dot,ehat),r(bold('A'),o('='),kappa,pow(f,o('′')),par(v('r')),par(r(n('.24'),o('+'),n('.12'),mu)),transverse(nhat))),'Implemented compact optical deflection, not the geodesic equation')}
 <p>This is an <strong>artistic transverse-deflection law</strong>, not a Christoffel-symbol calculation. The projected radial term vanishes for a ray aimed exactly at the ship center, so no artificial axial bias displaces the ship inside its field. The dimensionless ray path is stepped with an explicit midpoint method and its direction is renormalized. Deflection is cut off beyond 2.5 bubble radii, and the center denominator is bounded for numerical stability. In the shared world pass A/R is added to the approximate black-hole ray force. Close physical-scale views trace the local bubble separately before composing the distant background.</p>
 <h3>One grid switch, two reference charts</h3>
 <p><strong>Grid</strong> enables or disables every reference grid together. A coordinate chart does not emit light by itself; the live view gives its marks virtual emission and samples them along the same approximate bent rays as the ship and sky. Lensing therefore changes the visible lines. The sheet is a diagnostic display, not a predicted material or an exact embedding of the spatial metric.</p>
 ${eq(sheetEquations,'Implemented illustrative raised and lowered sheet and longitudinal grid label')}
 <p>In the isolated warp chart, X points along the travel axis, Y is the drawn height, and Z is lateral; lengths are in bubble radii. The front is blue and the rear orange. The reference sheet rises behind the ship and dips ahead through the wall, illustrating expansion and contraction. This drawn height is a display convention; the exact constant-time spatial metric remains flat. Its coordinate labels also shift, and the observed lines bend along the approximate optical rays. Ray segments cross this same connected sheet throughout the close-up trace; no second grid ray march is used. Outside the compact lens region, the final ray direction continues to the flat reference plane.</p>
 <p>In the wide view of a black-hole scene, the common hole-centered sheet supplies the world reference plane, and the warp field smoothly displaces its line labels near the ship. The local addition to the world-coordinate map is:</p>
 ${eq(r(bold('Δu'),o('='),n('.20'),kappa,R,par(r(q,dot,ehat)),fn('f',norm(q)),ehat),'Warp contribution to the shared black-hole coordinate map')}
 <p>Here q = (x − x<sub>s</sub>)/R and ê follows the ship. The hole and bubble contributions are composed only as display maps and approximate optical forces; they do not define an exact combined metric. W = 0 removes the warp deformation; W = 10 sets κ<sub>lens</sub> = 3 and the finite display radius given above. The grid remains available with the field off.</p>
 <p><strong>Inspecting or riding aboard the warp ship keeps both guides enabled.</strong> The distant black-hole sheet remains visible through the world ray trace. The local bubble trace resolves a second, bounded diagnostic chart at the ship’s physical scale. In combined scenes, its opacity is multiplied by the factor below, and its infinite-plane continuation is disabled. The isolated warp laboratory retains its continuous exterior plane.</p>
 ${eq(r(sub(v('A'),t('local')),o('='),n(1),o('−'),fn('smoothstep',r(n('1.6'),o(','),n('2.5'),o(','),sqrt(r(sq(v('X')),o('+'),sq(v('Z'))))))),'Combined-scene local bubble chart opacity fade')}
 <p>The two charts describe different reference scales and can overlap near the ship. They remain illustrative coordinate displays; neither their combination nor their fade defines the spatial metric. The fade changes only diagnostic opacity, not the physical dimensions of the ship or field.</p>
 ${eq(rows(r(bold('u'),o('='),bold('Q'),par(time),bracket(r(pow(v('X'),o('′')),o(','),v('Z'))),o('+'),frac(bracket(r(sub(x,v('s')),o(','),sub(z,v('s')))),R)),r(sub(v('v'),t('display')),o('='),n('.07'),v('W'),R,t(' per simulation second'))),'World-anchored grid coordinates and finite display travel speed')}
 <p>Q rotates ship-aligned coordinates into the fixed reference plane. The world phase is calculated in double precision on the CPU before being sent to the GPU, keeping metre-scale motion stable. The reference-plane offset and grid-label displacement are visualization choices; the exact constant-time Alcubierre spatial metric remains flat. Grid cells use spacing 0.25R × 2<sup>n</sup>; adjacent levels blend as the camera moves, so far-away lines remain readable without a disconnected outer grid. In the isolated scene the ship advances at the finite display speed above, and tracking follows it while the stationary lines move underneath. This speed is deliberately unrelated to the nominal Trek speed.</p>
 <p><strong>Ship and field:</strong> a finite, moving field surrounds the Enterprise. Toggle stars and nebulas to see the visual distortion, and the grid to inspect the field’s shape. No satellites or accretion disc orbit the ship.</p>
 <p><strong>Black hole and field:</strong> the ship can orbit the hole or follow a prescribed approach-and-return path outside the modeled capture surface. The superposed visual effects are an educational approximation. Simply adding an Alcubierre effect to a black hole does not solve Einstein’s equations for their combined spacetime or establish that a ship can escape an event horizon.</p>
 <p><strong>Camera and scale:</strong> following a ship tracks its position; its 360° view changes the gaze around that position. These are scene cameras, not full relativistic tetrad calculations. Every object uses its absolute reference dimensions. Spacecraft can be much smaller than a pixel beside a supermassive black hole; selectable markers and local tracking cameras make them inspectable without inflating their geometry.</p>
 <div class="warp-note">The metric, shape function, and stress–energy equations describe the ideal mathematical model. The real-time bubble lens, glowing field, mesh, motion, and mixed black-hole scene are finite visual approximations. They are not a numerical-relativity prediction or evidence of a working warp drive.</div>`)}
 ${section('sources','08 · Primary sources and provenance',`
 <ul class="warp-sources"><li>${link('https://arxiv.org/abs/gr-qc/0009013','M. Alcubierre (1994), The warp drive: hyper-fast travel within general relativity')} — original metric; arXiv upload is dated 2000.</li><li>${link('https://arxiv.org/abs/2103.05610','M. Alcubierre & F. S. N. Lobo (2021), Warp drive basics')} — energy conditions and causal limitations.</li><li>${link('https://arxiv.org/abs/gr-qc/9907019','C. Clark, W. A. Hiscock & S. L. Larson (1999), Null geodesics … the view from the bridge')} — photon deflection and frequency shifts.</li><li>${link('https://arxiv.org/abs/1107.5650','T. Müller & D. Weiskopf (2011/2012), Detailed study of null and timelike geodesics')} — optical and observer-dependent effects.</li><li>${link('https://www.simonandschuster.com/books/Technical-Manual/Rick-Sternbach/Star-Trek-The-Next-Generation/9780671704278','Rick Sternbach & Michael Okuda (1991), TNG Technical Manual')} — licensed fictional engineering reference, distinct from screen canon.</li><li>${link('https://www.calormen.com/star_trek/FAQs/warp_velocities-faq.htm','Michael Okuda’s 1995 correspondence, archived by Joshua Bell')} — first-person explanation of the reference curve; this archive is fan maintained.</li><li>${link('https://www.startrek.com/news/threshold-reaching-for-success-with-star-trek','StarTrek.com: Threshold and the Overlooked Message of Reaching for Success')} — official account of the warp-10 episode.</li></ul>
 <p class="warp-small">Equations, diagrams, and explanatory text were independently composed for this explorer. Star Trek concepts are fictional; this project is unaffiliated with the rights holders. Reference links are optional and are the only parts of this guide that need a connection.</p>`)}
 </article>`;
 const control=container.querySelector('#warpMathSharpness');
 control.addEventListener('input',()=>{const k=Number(control.value);container.querySelector('#warpMathSharpnessValue').textContent=k.toFixed(1);container.querySelector('#warpProfileDiagram').innerHTML=bubbleDiagram(k);});
}
