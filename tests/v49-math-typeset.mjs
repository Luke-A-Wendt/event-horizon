import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {notebookMathLayout,renderNotebookEquation,parseNotebookMath} from '../dist/math-typeset.js';
import {renderMathGuide,renderWormholeGuide} from '../dist/math.js';
import {renderWarpGuide} from '../dist/warp-math.js';
import {renderRelativityGuide} from '../dist/relativity-math.js';

// A root rule spans the complete radicand, including a stacked fraction. Its
// height grows with that argument rather than relying on a mobile math glyph.
const fraction='<mfrac><mrow><mn>2</mn><mi>G</mi><mi>M</mi></mrow><mrow><mi>r</mi><msup><mi>c</mi><mn>2</mn></msup></mrow></mfrac>';
const argument='<mrow><mn>1</mn><mo>−</mo>'+fraction+'</mrow>';
const radicand=notebookMathLayout(argument),root=notebookMathLayout('<msqrt>'+argument+'</msqrt>');
assert(root.w>radicand.w+.6);assert(root.a>radicand.a);assert(root.d>=radicand.d);
const rootPath=root.svg.match(/<path d="([^"]+)"/)[1];
const ruleEnd=Number(rootPath.match(/H([\d.]+)/)[1]);assert(ruleEnd>radicand.w+.6);
const grouped=notebookMathLayout('<mrow><mo>(</mo>'+fraction+'<mo>)</mo></mrow>');
assert(grouped.svg.includes('C'),'Scalable fences use continuous vector paths');assert(grouped.a>notebookMathLayout(fraction).a);
const cube=notebookMathLayout('<mroot>'+argument+'<mn>3</mn></mroot>');assert(cube.svg.includes('>3</text>'));assert(cube.w>=root.w);
const tensor=notebookMathLayout('<msubsup><mi>Γ</mi><mrow><mi>α</mi><mi>β</mi></mrow><mi>μ</mi></msubsup>');assert(tensor.a>.8&&tensor.d>.4);
const functionText=notebookMathLayout('<mi>cosh</mi>').svg;assert(functionText.includes('font-style="normal"'),'Named functions are upright, not italic prose');
assert(renderNotebookEquation('<mi>x</mi>','a < b').includes('aria-label="a &lt; b"'));
assert.equal(parseNotebookMath('<mrow><mi>x</mi><mo>&lt;</mo><mn>1</mn></mrow>').children[0].children[1].children[0].text,'<');
assert.throws(()=>parseNotebookMath('<msqrt><mi>x</mi>'),/Unclosed/);

// Every notebook renders without DOM APIs, canvas font probes, a font network
// request, or a layout observer. Retained MathML supplies its semantic tree.
const container={innerHTML:'',querySelector(){return {addEventListener(){}};}};let count=0;
for(const render of [renderMathGuide,renderWormholeGuide,renderWarpGuide,renderRelativityGuide]){
 render(container);const html=container.innerHTML,formulas=[...html.matchAll(/<span class="math-semantic"><math\b[^>]*>([\s\S]*?)<\/math><\/span>/g)];
 assert(formulas.length>0);assert.equal(formulas.length,(html.match(/class="math-typeset"/g)||[]).length);
 for(const [,source]of formulas){const b=notebookMathLayout(source);for(const n of [b.w,b.a,b.d])assert(Number.isFinite(n)&&n>=0);assert(b.w>0&&b.a+b.d>0);assert(!/NaN|Infinity|undefined/.test(b.svg));count++;}
 assert(!/<svg class="math-typeset"(?![^>]*aria-hidden="true")/.test(html));
}
assert(count>=106,'All original notebook equations remain covered');
const css=await readFile(new URL('../dist/style.css',import.meta.url),'utf8');assert(css.includes('.math-formula .math-semantic'));assert(css.includes('.math-formula .math-typeset{font-size:16px}'));
console.log('PASS: '+count+' locally typeset equations; complete radical bars, stretched fences, stacked fractions/tensor scripts, upright functions, responsive SVG and retained semantic MathML.');
