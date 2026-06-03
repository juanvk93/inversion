/* ============================================================
   calculator.js — Calculadora de conversión libras ⇄ kilos.
   ============================================================ */

import { el, num, lbToKg, kgToLb, fmtNum } from '../utils.js';

export async function calculator() {
  const node = el('<div></div>');

  const card = el(`
    <div class="card">
      <div class="field">
        <label>Libras (lb)</label>
        <input class="input" type="number" inputmode="decimal" step="0.5" min="0" id="lb" placeholder="0">
      </div>
      <div class="center muted" style="font-size:22px;margin:4px 0">⇅</div>
      <div class="field" style="margin-bottom:0">
        <label>Kilogramos (kg)</label>
        <input class="input" type="number" inputmode="decimal" step="0.5" min="0" id="kg" placeholder="0">
      </div>
    </div>`);

  const lb = card.querySelector('#lb');
  const kg = card.querySelector('#kg');

  // Conversión bidireccional, evitando bucles de eventos.
  let lock = false;
  lb.oninput = () => {
    if (lock) return;
    lock = true;
    kg.value = lb.value === '' ? '' : fmtNum(lbToKg(num(lb.value)));
    lock = false;
  };
  kg.oninput = () => {
    if (lock) return;
    lock = true;
    lb.value = kg.value === '' ? '' : fmtNum(kgToLb(num(kg.value)));
    lock = false;
  };

  node.appendChild(card);

  // Tabla de referencia rápida
  node.appendChild(el('<div class="section-title">Referencia rápida</div>'));
  const ref = el('<div class="card"><table class="sets-table"><thead><tr><th>Libras</th><th>Kilos</th></tr></thead><tbody></tbody></table></div>');
  const tbody = ref.querySelector('tbody');
  [2.5, 5, 10, 25, 35, 45].forEach((v) => {
    tbody.appendChild(el(`<tr><td>${v} lb</td><td>${fmtNum(lbToKg(v))} kg</td></tr>`));
  });
  node.appendChild(ref);

  node.appendChild(el('<p class="faint center mt" style="font-size:13px">1 lb = 0,45359237 kg</p>'));

  return { title: 'Calculadora lb ⇄ kg', back: '#/settings', node };
}
